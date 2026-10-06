"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BadgeCheck, Check, Flag, Users } from "lucide-react";
import { fill, type Dictionary, type Locale } from "@/i18n";
import { confirmKnowledge } from "@/lib/api/safety";
import { getDeviceId } from "@/lib/device";
import { CategoryIcon } from "@/components/safety/CategoryIcon";
import type { KnowledgeEntry } from "@/lib/safety/types";
import { cn } from "@/components/ui/cn";

function KnowledgeItem({ entry, locale, dict }: { entry: KnowledgeEntry; locale: Locale; dict: Dictionary }) {
  const [state, setState] = useState<"idle" | "confirmed" | "disputed">("idle");
  const confirm = useMutation({
    mutationFn: () => confirmKnowledge(entry.id, getDeviceId()),
    onSuccess: () => setState("confirmed"),
  });

  const time =
    entry.fromBlock === entry.toBlock
      ? dict.timeBlocks[entry.fromBlock]
      : `${dict.timeBlocks[entry.fromBlock]} → ${dict.timeBlocks[entry.toBlock]}`;

  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex items-start gap-3">
        <CategoryIcon category={entry.category} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {dict.categories[entry.category]}
            <span className="text-ink-3"> · {time}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            <span>{dict.report.days[entry.days]}</span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden />
              {fill(locale, dict.area.confirmations, { n: entry.confirmationsBucket })}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                entry.status === "corroborated" ? "bg-positive-soft text-positive" : "bg-surface-2",
              )}
            >
              {entry.status === "corroborated" && <BadgeCheck className="size-3.5" aria-hidden />}
              {entry.status === "corroborated" ? dict.area.corroborated : dict.area.unverified}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        {state === "confirmed" ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-positive-soft px-3 text-xs font-medium text-positive">
            <Check className="size-4" aria-hidden />
            {dict.area.confirmed}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={confirm.isPending || state === "disputed"}
              onClick={() => confirm.mutate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Users className="size-3.5" aria-hidden />
              {dict.area.confirm}
            </button>
            <button
              type="button"
              disabled={state === "disputed"}
              onClick={() => setState("disputed")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-60"
            >
              <Flag className="size-3.5" aria-hidden />
              {state === "disputed" ? dict.area.confirmed : dict.area.dispute}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function KnowledgeList({
  entries,
  locale,
  dict,
}: {
  entries: KnowledgeEntry[];
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <KnowledgeItem key={entry.id} entry={entry} locale={locale} dict={dict} />
      ))}
    </ul>
  );
}
