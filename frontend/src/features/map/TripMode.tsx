"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Flag, Loader2, LocateOff, Navigation, ShieldCheck, Square, Volume2, VolumeX } from "lucide-react";
import { fill, type Dictionary, type Locale } from "@/i18n";
import { fetchMapCells } from "@/lib/api/safety";
import { scoreToBand } from "@/lib/safety/bands";
import { lineLength, remainingRoute } from "@/lib/safety/reroute";
import { metres, type RouteOption, type TravelMode } from "@/lib/safety/route-risk";
import { findSaferRoute, type SaferRoute } from "./safer-route";
import { arrivalWatcher, bearingDeg, cellsAhead, nextAlert, quietZone, type TripAlert } from "@/lib/safety/trip-alerts";
import { BandBadge } from "@/components/safety/BandBadge";
import { Button } from "@/components/ui/Button";

type LngLat = [lng: number, lat: number];

/** Seconds between two alerts, so one busy stretch doesn't talk non-stop. */
const COOLDOWN_MS = 30_000;

/** Recorded lines in public/audio/trip/<clip>-<locale>.mp3 (made from real voice recordings). */
export type TripClip = "alert-high" | "alert-very_high" | "arrived";
const TRIP_CLIPS: TripClip[] = ["alert-high", "alert-very_high", "arrived"];

/**
 * Plays an alert in the best way this device allows:
 * the recorded clip for that message → the phone's own voice → a tone.
 * Most phones have no Bangla speech voice (iPhones none at all), hence the recordings.
 * Must be created inside a tap: browsers only allow sound after a user gesture.
 */
export class Announcer {
  private ctx: AudioContext | null = null;
  private clips = new Map<TripClip, HTMLAudioElement>();
  private playing: HTMLAudioElement | null = null;
  private voice: SpeechSynthesisVoice | null = null;

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
    for (const clip of TRIP_CLIPS) {
      const audio = new Audio(`/audio/trip/${clip}-${locale}.mp3`);
      audio.preload = "auto";
      // Counted as available at once (an alert can come seconds after the tap, before it has
      // downloaded — play() then simply waits); dropped only if the file is missing.
      this.clips.set(clip, audio);
      audio.addEventListener("error", () => this.clips.delete(clip), { once: true });
      // Start-and-stop silently while still inside the tap, so iOS lets it play later.
      // (If a real alert claimed this clip meanwhile, leave it playing.)
      audio.muted = true;
      void audio
        .play()
        .then(() => {
          if (this.playing === audio) return;
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => undefined)
        .finally(() => {
          audio.muted = false;
        });
    }
  }

  /** True when alerts can be heard as words (a recording or a voice), not just a tone. */
  get hasVoice() {
    return this.clips.size > 0 || this.voice !== null;
  }

  private pickVoice() {
    const lang = this.locale === "bn" ? "bn" : "en";
    this.voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
  }

  /** A soft two-note chime with a buzz, for notices that aren't danger alerts. */
  chime(muted: boolean) {
    navigator.vibrate?.([120, 80, 120]);
    if (!muted) this.tone();
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

  announce(text: string, muted: boolean, clip?: TripClip) {
    navigator.vibrate?.([200, 100, 200]);
    if (muted) return;
    const recording = clip && this.clips.get(clip);
    if (recording) {
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      this.clips.forEach((a) => a !== recording && a.pause());
      this.playing = recording;
      recording.muted = false;
      recording.currentTime = 0;
      void recording.play().catch(() => this.speakOrTone(text));
      return;
    }
    this.speakOrTone(text);
  }

  private speakOrTone(text: string) {
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

/** One GPS fix during a trip. `trip` is the same for every fix of one trip. */
export interface TripFix {
  lngLat: LngLat;
  /** Metres (GPS accuracy radius). */
  accuracy: number;
  /** Direction of travel in degrees (0 = north), null until known. */
  heading: number | null;
  trip: string;
}

/** Below this movement between fixes, the direction is GPS noise. */
const HEADING_MIN_M = 8;

/** How often a trip looks for a safer way (right at the start, then at this interval). */
const REROUTE_EVERY_MS = 90_000;

export function TripMode({
  locale,
  dict,
  route,
  announcer,
  onStop,
  onArrive,
  onPosition,
  routeInfo,
  onSuggest,
  onSwitch,
}: {
  locale: Locale;
  dict: Dictionary;
  /** Selected route, to look ahead along it. Null = look around the person. */
  route: LngLat[] | null;
  announcer: Announcer;
  onStop: () => void;
  /** Called a few seconds after the person reaches the route's end (the trip ends itself). */
  onArrive: () => void;
  /** Every GPS fix (for the moving dot on the map); null once the trip ends. */
  onPosition?: (fix: TripFix | null) => void;
  /** The route being travelled (with its duration) and how — used to look for a safer way. */
  routeInfo?: { duration: number; mode: TravelMode } | null;
  /** A safer route is being offered (preview it on the map), or the offer is gone (null). */
  onSuggest?: (route: RouteOption | null) => void;
  /** The person chose the safer route. */
  onSwitch?: (route: RouteOption) => void;
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

  // Arrival check for the selected route (a fresh one if the route changes mid-trip).
  const [arrived, setArrived] = useState(false);
  const arrival = useRef<((p: LngLat) => boolean) | null>(null);
  useEffect(() => {
    arrival.current = route && route.length > 1 ? arrivalWatcher(route) : null;
  }, [route]);

  // The moving dot: each fix goes to the map; the trip's id lets the map tell trips apart.
  const tripId = useId();
  const onPositionRef = useRef(onPosition);
  useEffect(() => {
    onPositionRef.current = onPosition;
  });
  useEffect(() => () => onPositionRef.current?.(null), []);
  const lastFix = useRef<{ at: LngLat; heading: number | null } | null>(null);

  // GPS: stays on this device; only compared with the area data already downloaded.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const here: LngLat = [pos.coords.longitude, pos.coords.latitude];
        setGps("ok");
        setPosition(here);
        if (arrival.current?.(here)) setArrived(true);

        // Phones report a heading only while moving; otherwise work it out from the last fix.
        const prev = lastFix.current;
        let heading = Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;
        if (heading === null) {
          heading = prev && metres(prev.at, here) >= HEADING_MIN_M ? bearingDeg(prev.at, here) : (prev?.heading ?? null);
        }
        if (!prev || metres(prev.at, here) >= HEADING_MIN_M) lastFix.current = { at: here, heading };
        else lastFix.current = { at: prev.at, heading };
        onPositionRef.current?.({ lngLat: here, accuracy: pos.coords.accuracy, heading, trip: tripId });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGps("denied");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tripId]);

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

  // Reaching the destination ends the trip: say so, show it briefly, then hand back.
  // (`arrived` is set from the GPS callback above.)
  const latest = useRef({ onArrive, muted });
  useEffect(() => {
    latest.current = { onArrive, muted };
  });
  useEffect(() => {
    if (!arrived) return;
    announcer.announce(t.tripArrived, latest.current.muted, "arrived");
    const id = setTimeout(() => latest.current.onArrive(), 4000); // long enough for the spoken line
    return () => clearTimeout(id);
  }, [arrived, announcer, t]);

  useEffect(() => {
    if (!position || !lookup || arrived) return;
    const found = nextAlert(cellsAhead(position, route), lookup, announced.current);
    if (!found || Date.now() - lastAt.current < COOLDOWN_MS) return;
    quietZone(found.cell).forEach((c) => announced.current.add(c));
    lastAt.current = Date.now();
    setAlert(found);
    const level = found.band as "high" | "very_high";
    announcer.announce(fill(locale, t.tripSpeech, { level: t.tripLevel[level] }), muted, `alert-${level}`);
  }, [position, lookup, route, announcer, muted, locale, t, arrived]);

  // ---------- safer way: when a high-report area lies ahead (at this hour), offer a way round ----------
  const [offer, setOffer] = useState<SaferRoute | null>(null);
  const [switched, setSwitched] = useState(false);
  const declined = useRef(new Set<string>()); // hotspot cells the person chose to drive through anyway
  const lastCheck = useRef(0);
  const checking = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const suggestRef = useRef(onSuggest);
  useEffect(() => {
    suggestRef.current = onSuggest;
  });
  useEffect(() => () => suggestRef.current?.(null), []);

  useEffect(() => {
    if (!position || !lookup || !route || route.length < 2 || !routeInfo || offer || arrived || checking.current) return;
    if (Date.now() - lastCheck.current < REROUTE_EVERY_MS) return;
    lastCheck.current = Date.now();
    checking.current = true;
    const rest = remainingRoute(position, route);
    const restShare = lineLength(rest) / Math.max(1, lineLength(route));
    void findSaferRoute({
      from: position,
      to: route[route.length - 1],
      mode: routeInfo.mode,
      current: rest,
      currentDuration: routeInfo.duration * restShare,
      lookup,
    })
      .then((found) => {
        if (!live.current || !found || declined.current.has(found.hotspot.cell)) return;
        setOffer(found);
        suggestRef.current?.(found.choice.route);
        announcer.chime(latest.current.muted);
      })
      .catch(() => undefined)
      .finally(() => {
        checking.current = false;
      });
  }, [position, lookup, route, routeInfo, offer, arrived, announcer]);

  const takeOffer = () => {
    if (!offer) return;
    onSwitch?.(offer.choice.route);
    suggestRef.current?.(null);
    setOffer(null);
    setSwitched(true);
    lastCheck.current = Date.now();
  };
  const keepRoute = () => {
    if (!offer) return;
    declined.current.add(offer.hotspot.cell);
    suggestRef.current?.(null);
    setOffer(null);
  };

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
        {arrived ? (
          <p className="flex items-center gap-2 rounded-xl bg-positive-soft p-3 font-semibold text-positive">
            <Flag className="size-4 shrink-0" aria-hidden />
            {t.tripArrived}
          </p>
        ) : gps === "denied" ? (
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

      {offer && !arrived && (
        <div className="mt-3 rounded-xl border border-positive/40 bg-positive-soft p-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-semibold text-positive">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            {t.saferTitle}
          </p>
          <p className="mt-1 leading-snug text-ink-2">
            {fill(locale, t.saferBody, {
              level: dict.bands[scoreToBand(offer.hotspot.score)],
              extra:
                offer.choice.extraSeconds >= 60
                  ? fill(locale, t.saferExtraMore, { n: Math.round(offer.choice.extraSeconds / 60) })
                  : t.saferExtraSame,
            })}
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button type="button" className="flex-1" onClick={takeOffer}>
              {t.saferTake}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={keepRoute}>
              {t.saferKeep}
            </Button>
          </div>
        </div>
      )}
      {switched && !offer && !arrived && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-positive">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t.saferSwitched}
        </p>
      )}

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
