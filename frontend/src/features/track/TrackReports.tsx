"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileSearch, Loader2, RefreshCw, ShieldCheck, Trash2, Undo2, Video, X } from "lucide-react";
import { fill, type Dictionary, type Locale } from "@/i18n";
import { REPORTS_GO_TO_SERVER } from "@/lib/api/safety";
import { TrackError, trackReports, withdrawReport, type TrackedReport, type TrackStatus } from "@/lib/api/track";
import { getDeviceId } from "@/lib/device";
import { forgetMyReport, normalizeCode, saveMyReport, useMyReports, type MyReport } from "@/lib/my-reports";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { CategoryIcon } from "@/components/safety/CategoryIcon";

const STATUS_STYLE: Record<TrackStatus, string> = {
  pending: "bg-ral-2/15 text-ral-3",
  verified: "bg-positive-soft text-positive",
  rejected: "bg-ral-4/10 text-ral-4",
  duplicate: "bg-surface-2 text-ink-2",
  withdrawn: "bg-surface-2 text-ink-3",
};

function errorCode(error: unknown): keyof Dictionary["track"]["errors"] {
  const code = error instanceof TrackError ? error.code : "invalid";
  return code === "rate_limited" || code === "network" || code === "not_found" || code === "already_decided"
    ? code
    : "invalid";
}

/** Received → Review → Decision, with the current step highlighted. */
function Timeline({ status, dict }: { status: TrackStatus; dict: Dictionary }) {
  const t = dict.track;
  const done = status === "pending" ? 1 : 3;
  const labels = [t.steps.received, t.steps.review, status === "pending" ? t.steps.decision : t.status[status]];
  return (
    <ol className="mt-4 flex items-center gap-1.5" aria-label={t.status[status]}>
      {labels.map((label, i) => {
        const reached = i < done;
        const current = status === "pending" ? i === 1 : i === 2;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1.5 rounded-full",
                !(reached || current)
                  ? "bg-line"
                  : status === "withdrawn"
                    ? "bg-ink-3"
                    : status === "rejected" && i === 2
                      ? "bg-ral-4"
                      : "bg-brand",
                current && status === "pending" && "animate-pulse",
              )}
            />
            <span className={cn("truncate text-[11px]", current ? "font-semibold text-ink" : "text-ink-3")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ReportCard({
  entry,
  report,
  missing,
  locale,
  dict,
}: {
  entry: MyReport;
  report: TrackedReport | undefined;
  missing: boolean;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.track;
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const withdraw = useMutation({
    mutationFn: () => withdrawReport(entry.code, getDeviceId()),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["track"] });
    },
  });
  const day = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const category = report?.category ?? entry.category;

  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex items-start gap-3">
        {category ? (
          <CategoryIcon category={category} size="sm" className="mt-0.5" />
        ) : (
          <span className="mt-0.5 grid size-7 place-items-center rounded-lg bg-surface-2 text-ink-3">
            <FileSearch className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug">{category ? dict.categories[category] : t.unknownDetails}</p>
          {entry.place && <p className="truncate text-xs text-ink-3">{entry.place}</p>}
          <p className="mt-0.5 font-mono text-xs tracking-wider text-ink-3">{entry.code}</p>
        </div>
        {report && (
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[report.status])}>
            {report.status === "verified" && <Check className="-mt-0.5 mr-1 inline size-3.5" aria-hidden />}
            {t.status[report.status]}
          </span>
        )}
      </div>

      {missing && <p className="mt-3 text-sm text-ral-4">{t.notFound}</p>}

      {report && (
        <>
          <Timeline status={report.status} dict={dict} />
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{t.statusBody[report.status]}</p>
          {report.reason && (
            <p className="mt-1 text-sm text-ink-2">{fill(locale, t.reasonLabel, { reason: t.reasons[report.reason] })}</p>
          )}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
            <span>{fill(locale, t.sent, { date: day.format(new Date(report.submitted_at)) })}</span>
            {report.date && <span>{fill(locale, t.happened, { date: day.format(new Date(`${report.date}T12:00:00`)) })}</span>}
            {report.video && (
              <span className="inline-flex items-center gap-1">
                <Video className="size-3.5" aria-hidden />
                {fill(locale, t.videoLabel, { state: t.video[report.video] })}
              </span>
            )}
          </p>
        </>
      )}

      {/* ---------- actions ---------- */}
      {confirming ? (
        <div className="mt-4 rounded-xl bg-ral-4/5 p-3">
          <p className="text-sm text-ink-2">{t.withdrawConfirm}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="md"
              className="bg-ral-4 text-white hover:opacity-90"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              {withdraw.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {withdraw.isPending ? t.withdrawing : t.withdrawYes}
            </Button>
            <Button size="md" variant="ghost" onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap justify-end gap-1">
          {report?.status === "pending" && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-ral-4 hover:bg-ral-4/10"
            >
              <Undo2 className="size-3.5" aria-hidden />
              {t.withdraw}
            </button>
          )}
          <button
            type="button"
            onClick={() => forgetMyReport(entry.code)}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {t.remove}
          </button>
        </div>
      )}
      {withdraw.error && (
        <p role="alert" className="mt-2 text-sm text-ral-4">
          {t.errors[errorCode(withdraw.error)]}
        </p>
      )}
    </li>
  );
}

/** The "My reports" page: this phone's reports with their status, and adding one by code. */
export function TrackReports({ locale, dict, initialCode }: { locale: Locale; dict: Dictionary; initialCode: string }) {
  const t = dict.track;
  const mine = useMyReports();
  const codes = mine.map((r) => r.code);
  const status = useQuery({
    queryKey: ["track", codes],
    queryFn: () => trackReports(codes),
    enabled: REPORTS_GO_TO_SERVER && codes.length > 0,
    refetchOnWindowFocus: true,
  });
  const byCode = new Map((status.data ?? []).map((r) => [r.code, r]));

  const [input, setInput] = useState(initialCode);
  const [inputError, setInputError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: async (code: string) => {
      const [found] = await trackReports([code]);
      if (!found) throw new TrackError("unknown_code");
      return found;
    },
    onSuccess: (found) => {
      saveMyReport({ code: found.code });
      setInput("");
    },
    onError: (error) =>
      setInputError(error instanceof TrackError && error.code === "unknown_code" ? t.notFound : t.errors[errorCode(error)]),
  });

  function submitCode(e: FormEvent) {
    e.preventDefault();
    setInputError(null);
    const code = normalizeCode(input);
    if (!code) {
      setInputError(t.invalidCode);
      return;
    }
    add.mutate(code);
  }

  return (
    // minmax(0, …): a long place name must truncate, not widen the column past the phone screen.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight">{t.listTitle}</h2>
          {codes.length > 0 && REPORTS_GO_TO_SERVER && (
            <button
              type="button"
              onClick={() => void status.refetch()}
              disabled={status.isFetching}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", status.isFetching && "animate-spin")} aria-hidden />
              {t.refresh}
            </button>
          )}
        </div>

        {!REPORTS_GO_TO_SERVER && <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">{t.demo}</p>}

        {status.isError && (
          <p role="alert" className="mt-4 rounded-2xl bg-ral-4/10 p-3 text-sm text-ral-4">
            {t.errors[errorCode(status.error)]}
          </p>
        )}

        {mine.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-line p-5 text-center">
            <p className="text-sm leading-relaxed text-ink-2">{t.empty}</p>
            <ButtonLink href={`/${locale}/report`} variant="outline" className="mt-4">
              {t.reportNow}
            </ButtonLink>
          </div>
        ) : status.isLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.loading}
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {mine.map((entry) => (
              <ReportCard
                key={entry.code}
                entry={entry}
                report={byCode.get(entry.code)}
                missing={status.isSuccess && !byCode.has(entry.code)}
                locale={locale}
                dict={dict}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-5">
        <section className="rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-semibold">{t.addTitle}</h2>
          <p className="mt-1 text-sm text-ink-2">{t.addHint}</p>
          <form onSubmit={submitCode} className="mt-4 flex gap-2">
            <label className="sr-only" htmlFor="track-code">
              {t.addTitle}
            </label>
            <input
              id="track-code"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInputError(null);
              }}
              placeholder={t.addPlaceholder}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 font-mono text-sm uppercase tracking-wider outline-none focus:border-ink-3"
            />
            <Button type="submit" disabled={add.isPending || !input.trim() || !REPORTS_GO_TO_SERVER}>
              {add.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {add.isPending ? t.adding : t.add}
            </Button>
          </form>
          {inputError && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-ral-4">
              <X className="mt-0.5 size-4 shrink-0" aria-hidden />
              {inputError}
            </p>
          )}
        </section>
        <section className="rounded-3xl bg-surface-2 p-5 text-sm leading-relaxed text-ink-2">
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {t.privacy}
          </p>
        </section>
      </div>
    </div>
  );
}
