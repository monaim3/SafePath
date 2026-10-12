"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Share2 } from "lucide-react";
import { fill, type Dictionary, type Locale } from "@/i18n";
import { cn } from "@/components/ui/cn";

/** The tracking code, shown once after a report is sent: copy, share, and what it's for. */
export function TrackingCodeCard({ code, locale, dict }: { code: string; locale: Locale; dict: Dictionary }) {
  const t = dict.track;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the code is on screen to write down */
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-accent/40 bg-accent-soft/40 p-5 text-left">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="size-4 text-accent" aria-hidden />
        {t.codeTitle}
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <output
          aria-label={t.codeTitle}
          className="select-all rounded-xl border border-line bg-surface px-4 py-2.5 font-mono text-xl font-bold tracking-[0.12em] sm:text-2xl"
        >
          {code}
        </output>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
            copied ? "border-positive bg-positive-soft text-positive" : "border-line bg-surface hover:border-ink-3",
          )}
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? t.copied : t.copy}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => navigator.share({ text: fill(locale, t.shareText, { code }) }).catch(() => {})}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:border-ink-3"
          >
            <Share2 className="size-4" aria-hidden />
            {t.share}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.codeBody}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">{t.codeWarn}</p>
    </section>
  );
}
