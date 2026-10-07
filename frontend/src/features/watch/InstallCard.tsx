"use client";

import { useState } from "react";
import { CheckCircle2, Download, Share, Smartphone } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { promptInstall } from "@/lib/pwa";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useInstallState } from "./hooks";

/** "Install as an app": the browser's own dialog where offered, step-by-step text elsewhere (iPhone). */
export function InstallCard({ dict, className }: { dict: Dictionary; className?: string }) {
  const t = dict.watch;
  const { offer, standalone, ios } = useInstallState();
  const [busy, setBusy] = useState(false);
  const done = standalone || offer === "installed";

  return (
    <section className={cn("rounded-3xl border border-line bg-surface p-5 sm:p-6", className)}>
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          {done ? <CheckCircle2 className="size-6" aria-hidden /> : <Smartphone className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold tracking-tight">{done ? t.installed : t.installTitle}</h2>
          {!done && <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.installBody}</p>}

          {!done &&
            (offer === "prompt" ? (
              <Button
                type="button"
                variant="accent"
                className="mt-4"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void promptInstall().finally(() => setBusy(false));
                }}
              >
                <Download className="size-4" aria-hidden />
                {t.installButton}
              </Button>
            ) : (
              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm leading-relaxed text-ink-2">
                <Share className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {ios ? t.installIos : t.installManual}
              </p>
            ))}
        </div>
      </div>
    </section>
  );
}
