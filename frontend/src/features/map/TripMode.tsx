"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, LocateOff, Navigation, ShieldCheck, Square, Volume2, VolumeX } from "lucide-react";
import { fill, type Dictionary, type Locale } from "@/i18n";
import { fetchMapCells } from "@/lib/api/safety";
import { cellsAhead, nextAlert, quietZone, type TripAlert } from "@/lib/safety/trip-alerts";
import { BandBadge } from "@/components/safety/BandBadge";
import { Button } from "@/components/ui/Button";

type LngLat = [lng: number, lat: number];

/** Seconds between two alerts, so one busy stretch doesn't talk non-stop. */
const COOLDOWN_MS = 30_000;

/**
 * Plays an alert in the best way this device allows:
 * a recorded clip (public/audio/trip-alert-<locale>.mp3, if present) → the phone's voice → a tone.
 * Must be created inside a tap: browsers only allow sound after a user gesture.
 */
export class Announcer {
  private ctx: AudioContext | null = null;
  private clip: HTMLAudioElement | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  hasVoice = false;

  constructor(private locale: Locale) {
    try {
      this.ctx = new AudioContext();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    if ("speechSynthesis" in window) {
      speechSynthesis.speak(new SpeechSynthesisUtterance("")); // unlocks speech on iOS
      this.pickVoice();
      speechSynthesis.addEventListener("voiceschanged", () => this.pickVoice());
    }
    const src = `/audio/trip-alert-${locale}.mp3`;
    void fetch(src, { method: "HEAD" })
      .then((res) => {
        if (res.ok) this.clip = new Audio(src);
      })
      .catch(() => undefined);
  }

  private pickVoice() {
    const lang = this.locale === "bn" ? "bn" : "en";
    this.voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
    this.hasVoice = this.voice !== null;
  }

  private tone() {
    const ctx = this.ctx;
    if (!ctx) return;
    // Two soft rising notes — noticeable, not alarming.
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.22;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.21);
    });
  }

  announce(text: string, muted: boolean) {
    navigator.vibrate?.([200, 100, 200]);
    if (muted) return;
    if (this.clip) {
      this.clip.currentTime = 0;
      void this.clip.play().catch(() => this.tone());
      return;
    }
    if (this.voice) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.rate = 0.95;
      speechSynthesis.speak(u);
      return;
    }
    this.tone();
  }

  close() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    void this.ctx?.close().catch(() => undefined);
  }
}

type GpsState = "waiting" | "ok" | "denied";

export function TripMode({
  locale,
  dict,
  route,
  announcer,
  onStop,
}: {
  locale: Locale;
  dict: Dictionary;
  /** Selected route, to look ahead along it. Null = look around the person. */
  route: LngLat[] | null;
  announcer: Announcer;
  onStop: () => void;
}) {
  const t = dict.route;
  const [hour, setHour] = useState(() => new Date().getHours());
  // Client-only component (created by a tap), so navigator is available here.
  const [gps, setGps] = useState<GpsState>(() => (navigator.geolocation ? "waiting" : "denied"));
  const [position, setPosition] = useState<LngLat | null>(null);
  const [alert, setAlert] = useState<TripAlert | null>(null);
  const [muted, setMuted] = useState(false);
  const announced = useRef(new Set<string>());
  const lastAt = useRef(0);

  // Alerts follow the clock, not the map's time slider.
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data: cells, isError } = useQuery({
    queryKey: ["map-cells", hour, 10],
    queryFn: () => fetchMapCells({ hour, res: 10 }),
    refetchInterval: 10 * 60_000,
  });
  const lookup = useMemo(() => {
    if (!cells) return null;
    const scores = new Map(cells.map((c) => [c.h3, c.score]));
    return (h3: string) => scores.get(h3);
  }, [cells]);

  // GPS: stays on this device; only compared with the area data already downloaded.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGps("ok");
        setPosition([pos.coords.longitude, pos.coords.latitude]);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGps("denied");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Keep the screen on: browsers pause GPS when the phone locks.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => undefined);
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => () => announcer.close(), [announcer]);

  // Voices can load after the trip starts (Chrome fetches them lazily).
  const [hasVoice, setHasVoice] = useState(true);
  useEffect(() => {
    const update = () => setHasVoice(announcer.hasVoice);
    const id = setTimeout(update, 1500);
    if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      clearTimeout(id);
      if ("speechSynthesis" in window) speechSynthesis.removeEventListener("voiceschanged", update);
    };
  }, [announcer]);

  useEffect(() => {
    if (!position || !lookup) return;
    const found = nextAlert(cellsAhead(position, route), lookup, announced.current);
    if (!found || Date.now() - lastAt.current < COOLDOWN_MS) return;
    quietZone(found.cell).forEach((c) => announced.current.add(c));
    lastAt.current = Date.now();
    setAlert(found);
    announcer.announce(fill(locale, t.tripSpeech, { level: t.tripLevel[found.band as "high" | "very_high"] }), muted);
  }, [position, lookup, route, announcer, muted, locale, t]);

  return (
    <section className="mb-4 rounded-2xl border border-accent bg-surface p-4 shadow-sm" aria-live="assertive">
      <div className="flex items-center gap-2">
        <span className="relative grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent/40 [animation-duration:2s]" />
          <Navigation className="relative size-4" aria-hidden />
        </span>
        <p className="text-sm font-semibold">{t.tripActive}</p>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-pressed={muted}
          title={muted ? t.tripUnmute : t.tripMute}
          className="ml-auto grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
          <span className="sr-only">{muted ? t.tripUnmute : t.tripMute}</span>
        </button>
      </div>

      <div className="mt-3 text-sm">
        {gps === "denied" ? (
          <p className="flex items-start gap-2 text-ral-4">
            <LocateOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t.tripGpsDenied}
          </p>
        ) : gps === "waiting" ? (
          <p className="flex items-center gap-2 text-ink-3">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.tripWaitingGps}
          </p>
        ) : isError ? (
          <p className="text-ink-3">{t.tripNoData}</p>
        ) : alert ? (
          <div className="flex items-start gap-2 rounded-xl bg-ral-4/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ral-4" aria-hidden />
            <span className="flex-1 leading-snug">
              {fill(locale, t.tripSpeech, { level: t.tripLevel[alert.band as "high" | "very_high"] })}
            </span>
            <BandBadge band={alert.band} label={dict.bands[alert.band]} />
          </div>
        ) : (
          <p className="flex items-center gap-2 text-positive">
            <ShieldCheck className="size-4" aria-hidden />
            {t.tripClear}
          </p>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-ink-3">
        <li>{t.tripKeepOpen}</li>
        {!hasVoice && <li>{t.tripNoVoice}</li>}
        <li>{t.tripPrivacy}</li>
      </ul>

      <Button type="button" variant="outline" className="mt-3 w-full" onClick={onStop}>
        <Square className="size-3.5" aria-hidden />
        {t.tripStop}
      </Button>
    </section>
  );
}
