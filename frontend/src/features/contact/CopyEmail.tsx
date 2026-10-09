"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyEmail({ email, label, doneLabel }: { email: string; label: string; doneLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(email).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
    >
      {copied ? <Check className="size-4 text-positive" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? doneLabel : label}
    </button>
  );
}
