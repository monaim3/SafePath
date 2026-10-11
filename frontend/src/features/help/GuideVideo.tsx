"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Maximize, Pause, Play, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { formatNumber } from "@/i18n";
import { LogoMark } from "@/components/ui/Logo";
import { cn } from "@/components/ui/cn";

/**
 * "How SafePath works", hosted on the SafePath Cloudinary account used only for site media (not the
 * report-evidence account). Cloudinary re-encodes it on request: `q_auto:good` keeps it sharp at a
 * fraction of the size (1080p ≈ 18 MB, 720p ≈ 11 MB instead of 84 MB). Nothing loads until it's opened.
 */
const CLOUD = "https://res.cloudinary.com/jagmoajb/video/upload";
const ASSET = "v1791746422/safepath-final-v5";
const SRC_1080 = `${CLOUD}/q_auto:good,c_limit,h_1080/${ASSET}.mp4`;
const SRC_720 = `${CLOUD}/q_auto:good,c_limit,h_720/${ASSET}.mp4`;
/** Poster: the SafePath title card near the end of the video. */
const POSTER = `${CLOUD}/so_98,q_auto,f_auto,c_limit,w_1280/${ASSET}.jpg`;

/** 1080p on computers and tablets; 720p on phones (already sharp on a small screen, and lighter on mobile data). */
function pickSource(playerWidth: number): string {
  return playerWidth >= 600 ? SRC_1080 : SRC_720;
}

type State = "loading" | "ready" | "playing" | "paused" | "ended" | "error";

const clock = (locale: Locale, s: number) => {
  const t = Math.max(0, Math.floor(s || 0));
  const mm = Math.floor(t / 60);
  const ss = t % 60;
  return `${formatNumber(locale, mm)}:${ss < 10 ? formatNumber(locale, 0) : ""}${formatNumber(locale, ss)}`;
};

/** Our own player in SafePath colours (no outside branding or suggestions). */
function BrandPlayer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.help;
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<State>("loading");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showBar, setShowBar] = useState(true);
  const hideTimer = useRef(0);

  // choose the size once we know how wide the player is
  useEffect(() => {
    setSrc(pickSource(frameRef.current?.clientWidth ?? 800));
  }, []);

  // opened by a tap, so starting with sound is allowed
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    v.play().catch(() => setState("ready"));
  }, [src]);

  const playing = state === "playing";

  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v || state === "error") return;
    if (state === "ended") v.currentTime = 0;
    if (v.paused || v.ended) void v.play().catch(() => undefined);
    else v.pause();
  }, [state]);

  const seekTo = (s: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = s;
    setTime(s);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const wake = () => {
    setShowBar(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowBar(false), 2500);
  };
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // keyboard: space / k = play-pause, ←/→ = 5 s, m = mute
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") seekTo(Math.min(duration, time + 5));
      else if (e.key === "ArrowLeft") seekTo(Math.max(0, time - 5));
      else if (e.key === "m") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const progress = duration ? (time / duration) * 100 : 0;
  const showCover = state === "loading" || state === "ready" || state === "paused" || state === "ended" || state === "error";

  return (
    <div
      ref={frameRef}
      className="group relative aspect-video w-full overflow-hidden rounded-2xl bg-black"
      onMouseMove={wake}
      onTouchStart={wake}
    >
      {src && (
        <video
          ref={videoRef}
          src={src}
          poster={POSTER}
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-contain"
          onClick={toggle}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            setState((s) => (s === "loading" ? "ready" : s));
          }}
          onPlaying={() => setState("playing")}
          onPause={(e) => !e.currentTarget.ended && setState("paused")}
          onEnded={() => setState("ended")}
          onWaiting={() => setState("loading")}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onProgress={(e) => {
            const v = e.currentTarget;
            if (v.buffered.length && v.duration) setLoaded(v.buffered.end(v.buffered.length - 1) / v.duration);
          }}
          onError={() => setState("error")}
        />
      )}

      {/* big centre button / spinner while not playing */}
      {showCover && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25">
          {state === "error" ? (
            <p className="pointer-events-auto max-w-sm rounded-2xl bg-black/75 px-5 py-4 text-center text-sm text-white">{t.failed}</p>
          ) : state === "loading" ? (
            <span className="-mt-10 grid size-14 place-items-center rounded-2xl bg-black/50 text-white sm:mt-0 sm:size-20 sm:rounded-3xl">
              <Loader2 className="size-7 animate-spin sm:size-9" aria-hidden />
            </span>
          ) : (
            <button
              type="button"
              onClick={toggle}
              aria-label={state === "ended" ? t.replay : t.play}
              className="pointer-events-auto -mt-10 grid size-14 place-items-center rounded-2xl bg-brand text-white shadow-[0_0_50px_rgba(34,197,94,0.45)] ring-4 ring-white/15 transition-transform hover:scale-105 active:scale-95 sm:mt-0 sm:size-24 sm:rounded-3xl"
            >
              {state === "ended" ? (
                <RotateCcw className="size-7 sm:size-10" aria-hidden />
              ) : (
                <Play className="ml-1 size-7 fill-current sm:size-10" aria-hidden />
              )}
            </button>
          )}
        </div>
      )}

      {/* control bar (the fade lets taps through to the big button; only the controls catch them) */}
      {state !== "error" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300 sm:px-4 [&>*]:pointer-events-auto",
            playing && !showBar ? "opacity-0 group-hover:opacity-100" : "opacity-100",
          )}
        >
          <div className="relative h-5">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/20" />
            <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/30" style={{ width: `${loaded * 100}%` }} />
            <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-brand" style={{ width: `${progress}%` }} />
            <div
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-[#22c55e]"
              style={{ left: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={time}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label={t.videoTitle}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-white sm:gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? t.pause : state === "ended" ? t.replay : t.play}
              className="grid size-10 place-items-center rounded-full bg-brand shadow-soft"
            >
              {playing ? <Pause className="size-4 fill-current" aria-hidden /> : <Play className="ml-0.5 size-4 fill-current" aria-hidden />}
            </button>
            <button type="button" onClick={toggleMute} aria-label={muted ? t.unmute : t.mute} className="grid size-9 place-items-center rounded-full hover:bg-white/10">
              {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                const level = Number(e.target.value);
                setVolume(level);
                if (!v) return;
                v.volume = level;
                v.muted = level === 0;
                setMuted(v.muted);
              }}
              aria-label={muted ? t.unmute : t.mute}
              className="hidden h-1 w-20 cursor-pointer accent-[#22c55e] sm:block"
            />
            <span className="text-xs tabular-nums text-white/85 sm:text-sm">
              {clock(locale, time)} / {clock(locale, duration)}
            </span>
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else if (frameRef.current?.requestFullscreen) void frameRef.current.requestFullscreen();
                // iPhone Safari: only the video element itself can go full screen
                else (videoRef.current as HTMLVideoElement & { webkitEnterFullscreen?: () => void })?.webkitEnterFullscreen?.();
              }}
              aria-label={t.fullscreen}
              className="ml-auto grid size-9 place-items-center rounded-full hover:bg-white/10"
            >
              <Maximize className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The guide video in a pop-up window. */
export function GuideVideoModal({ locale, dict, onClose }: { locale: Locale; dict: Dictionary; onClose: () => void }) {
  const t = dict.help;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-4xl animate-[guide-in_0.25s_ease-out] rounded-[1.75rem] bg-gradient-to-br from-[#22c55e]/70 via-[#0ea5e9]/50 to-[#1a73e8]/70 p-[1.5px] shadow-[0_30px_120px_rgba(0,0,0,0.7)]">
        <div className="rounded-[1.7rem] bg-surface p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-3 px-1">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white p-1">
              <LogoMark className="size-full" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate font-display text-base font-bold sm:text-lg">
                {t.videoTitle}
              </h2>
              <p className="truncate text-xs text-ink-3">{t.videoSub}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-5" aria-hidden />
              <span className="sr-only">{t.close}</span>
            </button>
          </div>
          <BrandPlayer locale={locale} dict={dict} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Button that opens the guide video.
 * - "hero": large outline button (home page, next to "open the map")
 * - "pill": small chip (report page)
 */
export function GuideVideoButton({
  locale,
  dict,
  variant = "hero",
  label,
  className,
}: {
  locale: Locale;
  dict: Dictionary;
  variant?: "hero" | "pill";
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          variant === "hero"
            ? "inline-flex h-12 items-center gap-2.5 rounded-full border border-line bg-surface/60 pl-2 pr-5 text-base font-semibold backdrop-blur transition-colors hover:border-ink-3"
            : "inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent-soft py-1.5 pl-1.5 pr-4 text-sm font-semibold text-accent transition-colors hover:border-accent",
          className,
        )}
      >
        <span
          className={cn(
            "grid place-items-center rounded-full bg-brand text-white",
            variant === "hero" ? "size-9 shadow-[0_0_20px_rgba(34,197,94,0.45)]" : "size-7",
          )}
        >
          <Play className={cn("ml-0.5 fill-current", variant === "hero" ? "size-4" : "size-3.5")} aria-hidden />
        </span>
        {label ?? dict.help.howItWorks}
      </button>
      {open && <GuideVideoModal locale={locale} dict={dict} onClose={() => setOpen(false)} />}
    </>
  );
}
