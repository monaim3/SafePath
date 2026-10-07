"use client";

import { useRef, useState } from "react";
import { Film, Info, X } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Button } from "@/components/ui/Button";

/** Client-side cap; the server allows a little more, so a file that passes here is never refused for size. */
export const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

function sizeLabel(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Optional CCTV/phone footage. Nothing is uploaded until the report itself is accepted. */
export function VideoPicker({
  dict,
  file,
  onChange,
}: {
  dict: Dictionary;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const t = dict.report.video;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(next: File | undefined) {
    if (!next) return;
    if (!next.type.startsWith("video/")) return setError(t.notVideo);
    if (next.size > MAX_VIDEO_BYTES) return setError(t.tooLarge);
    setError(null);
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
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-ral-4">
          {error}
        </p>
      )}
    </div>
  );
}
