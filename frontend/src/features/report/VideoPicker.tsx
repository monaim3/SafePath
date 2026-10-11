"use client";

import { useRef, useState } from "react";
import { Film, Info, Link2, X } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

/** Client-side cap; the server allows a little more, so a file that passes here is never refused for size. */
export const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

/** Same list as the server (services/video.py LINK_HOSTS); anything else is refused there too. */
const LINK_HOSTS = [
  "youtube.com", "youtu.be", "drive.google.com", "facebook.com", "fb.watch", "instagram.com",
  "tiktok.com", "vimeo.com", "dropbox.com", "onedrive.live.com", "1drv.ms", "streamable.com",
];

/** A link to footage on a known video host (for clips too large to upload). */
export function isVideoLink(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function sizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Optional CCTV/phone footage: a file (uploaded only once the report is accepted), or, for a clip
 * too large for that, a link to where the reporter put it. One or the other, never both.
 */
export function VideoPicker({
  dict,
  file,
  onChange,
  link,
  onLinkChange,
}: {
  dict: Dictionary;
  file: File | null;
  onChange: (file: File | null) => void;
  link: string;
  onLinkChange: (link: string) => void;
}) {
  const t = dict.report.video;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkTouched, setLinkTouched] = useState(false);
  const linkInvalid = linkTouched && link.trim() !== "" && !isVideoLink(link);

  function pick(next: File | undefined) {
    if (!next) return;
    if (!next.type.startsWith("video/")) return setError(t.notVideo);
    if (next.size > MAX_VIDEO_BYTES) return setError(t.tooLarge);
    setError(null);
    onLinkChange("");
    onChange(next);
  }

  return (
    <div>
      <p className="font-display text-2xl font-bold tracking-tight">{t.label}</p>
      <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t.hint}
      </p>

      <input
        ref={input}
        type="file"
        accept="video/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = ""; // picking the same file again still fires onChange
        }}
      />

      {file ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Film className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{file.name}</span>
            <span className="block text-xs text-ink-3">{sizeLabel(file.size)}</span>
          </span>
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            <X className="size-4" aria-hidden />
            {t.remove}
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-surface p-4 text-left transition-colors hover:border-ink-3"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
              <Film className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-semibold">{t.choose}</span>
              <span className="block text-xs text-ink-3">{t.limit}</span>
            </span>
          </button>

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-ral-4">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3 text-xs text-ink-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            {t.or}
            <span className="h-px flex-1 bg-line" />
          </div>

          <label className="mt-4 block">
            <span className="block text-sm font-semibold">{t.linkLabel}</span>
            <span className="mt-1 block text-xs leading-relaxed text-ink-3">{t.linkHint}</span>
            <span
              className={cn(
                "mt-3 flex items-center gap-2 rounded-2xl border bg-surface px-3 focus-within:border-ink-3",
                linkInvalid ? "border-ral-4" : "border-line",
              )}
            >
              <Link2 className="size-4 shrink-0 text-ink-3" aria-hidden />
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                maxLength={500}
                placeholder="https://youtu.be/…"
                value={link}
                onChange={(e) => onLinkChange(e.target.value)}
                onBlur={() => setLinkTouched(true)}
                aria-invalid={linkInvalid}
                className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {link && (
                <button
                  type="button"
                  onClick={() => {
                    onLinkChange("");
                    setLinkTouched(false);
                  }}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-3 hover:text-ink-2"
                  aria-label={t.remove}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </span>
          </label>
          {linkInvalid && (
            <p role="alert" className="mt-2 text-sm font-medium text-ral-4">
              {t.linkInvalid}
            </p>
          )}
        </>
      )}
    </div>
  );
}
