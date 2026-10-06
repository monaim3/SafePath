"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CircleSlash,
  Copy,
  ExternalLink,
  Flag,
  Loader2,
  LogOut,
  MessageSquareQuote,
  ShieldCheck,
  Users,
} from "lucide-react";
import { fill, formatHour, formatNumber, type Dictionary, type Locale } from "@/i18n";
import {
  decide,
  fetchMe,
  fetchQueue,
  fetchStats,
  getToken,
  login,
  logout,
  ModError,
  resolveFlag,
  type AreaFlag,
  type Decision,
  type QueueReport,
  type RejectReason,
} from "@/lib/api/moderation";
import { CategoryIcon } from "@/components/safety/CategoryIcon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

type Tab = "flagged" | "pending" | "alerts";
const REASONS: RejectReason[] = ["fake", "wrong_place", "spam", "offensive", "other"];

// ---------- login ----------
function LoginForm({ dict, onSuccess }: { dict: Dictionary; onSuccess: (name: string) => void }) {
  const t = dict.mod;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({ mutationFn: () => login(username.trim(), password), onSuccess });

  const error =
    mutation.error instanceof ModError ? (mutation.error.status === 429 ? t.rateLimited : t.invalid) : null;

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="mx-auto mt-6 max-w-sm space-y-4 rounded-3xl border border-line bg-surface p-6 shadow-soft"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
        <ShieldCheck className="size-6" aria-hidden />
      </span>
      {(["username", "password"] as const).map((field) => (
        <label key={field} className="block">
          <span className="text-sm font-medium text-ink-2">{t[field]}</span>
          <input
            type={field === "password" ? "password" : "text"}
            autoComplete={field === "password" ? "current-password" : "username"}
            value={field === "password" ? password : username}
            onChange={(e) => (field === "password" ? setPassword(e.target.value) : setUsername(e.target.value))}
            required
            className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="text-sm font-medium text-ral-4">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {mutation.isPending ? t.signingIn : t.signIn}
      </Button>
    </form>
  );
}

// ---------- report card ----------
function trustLevel(trust: number): "low" | "normal" | "high" {
  if (trust < 0.65) return "low";
  if (trust > 1.05) return "high";
  return "normal";
}

function ReportCard({
  report,
  locale,
  dict,
  busy,
  onDecide,
}: {
  report: QueueReport;
  locale: Locale;
  dict: Dictionary;
  busy: boolean;
  onDecide: (decision: Decision, reason?: RejectReason) => void;
}) {
  const t = dict.mod;
  const [rejecting, setRejecting] = useState(false);
  const n = (v: number) => formatNumber(locale, v);
  const dateFmt = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const when =
    report.hour !== null ? formatHour(locale, dict, report.hour) : dict.timeBlocks[report.block];
  const trust = trustLevel(report.reporter_trust);

  return (
    <li className="rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <CategoryIcon category={report.category} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{dict.categories[report.category]}</h3>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
              {dict.report.kind[report.kind].title}
            </span>
            {report.is_demo && (
              <span className="rounded-full bg-[#fde68a] px-2 py-0.5 text-[11px] font-semibold text-[#3a2a12]">
                {t.demoTag}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-2">
            {report.date ? new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { day: "numeric", month: "short" }).format(new Date(report.date)) + " · " : ""}
            {report.kind === "incident" ? when : `${dict.report.days[report.days as keyof Dictionary["report"]["days"]] ?? ""} · ${when}`}
            {report.relation && ` · ${dict.report.relation[report.relation as keyof Dictionary["report"]["relation"]]}`}
          </p>
        </div>
        <time className="shrink-0 text-xs text-ink-3" dateTime={report.created_at}>
          {dateFmt.format(new Date(report.created_at))}
        </time>
      </div>

      {report.description && (
        <p className="mt-3 flex gap-2 rounded-2xl bg-surface-2 p-3 text-sm leading-relaxed">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
          {report.description}
        </p>
      )}

      {report.flags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {report.flags.map((f) => (
            <li key={f} className="inline-flex items-center gap-1 rounded-full bg-ral-2/20 px-2.5 py-1 text-xs font-medium text-[#8a5a00]">
              <Flag className="size-3" aria-hidden />
              {t.flags[f as keyof typeof t.flags] ?? f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>
          {t.reporter}:{" "}
          <span className={cn("font-semibold", trust === "low" ? "text-ral-4" : trust === "high" ? "text-positive" : "text-ink-2")}>
            {t.trust[trust]}
          </span>{" "}
          · {fill(locale, t.reporterHistory, { n: report.reporter_reports, r: report.reporter_rejected })}
        </span>
        {report.corroborations > 0 && (
          <span className="inline-flex items-center gap-1 text-positive">
            <Users className="size-3.5" aria-hidden />
            {fill(locale, t.corroborations, { n: report.corroborations })}
          </span>
        )}
        <Link
          href={`/${locale}/area/${report.h3}`}
          target="_blank"
          className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
        >
          {t.viewArea}
          <ExternalLink className="size-3" aria-hidden />
        </Link>
        <span className="sr-only">{n(report.weight)}</span>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {rejecting ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink-2">{t.rejectAs}</span>
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => onDecide("reject", r)}
                className="h-8 rounded-full border border-ral-4/40 px-3 text-xs font-medium text-ral-4 hover:bg-ral-4/10 disabled:opacity-50"
              >
                {t.rejectReasons[r]}
              </button>
            ))}
            <button type="button" onClick={() => setRejecting(false)} className="h-8 px-2 text-xs text-ink-3 hover:text-ink">
              {t.cancel}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="md" variant="accent" disabled={busy} onClick={() => onDecide("verify")}>
              <Check className="size-4" aria-hidden />
              {t.verify}
            </Button>
            <Button size="md" variant="outline" disabled={busy} onClick={() => onDecide("duplicate")}>
              <Copy className="size-4" aria-hidden />
              {t.duplicate}
            </Button>
            <Button
              size="md"
              variant="outline"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="text-ral-4 hover:border-ral-4"
            >
              <CircleSlash className="size-4" aria-hidden />
              {t.reject}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function AlertCard({
  flag,
  locale,
  dict,
  busy,
  onResolve,
}: {
  flag: AreaFlag;
  locale: Locale;
  dict: Dictionary;
  busy: boolean;
  onResolve: () => void;
}) {
  const t = dict.mod;
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-3xl border border-line bg-surface p-5">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ral-4/10 text-ral-4">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.flags[flag.reason as keyof typeof t.flags] ?? flag.reason}</p>
        <p className="text-sm text-ink-2">
          {fill(locale, t.alertLine, { reports: flag.details.reports ?? 0, devices: flag.details.devices ?? 0 })}
        </p>
        <Link
          href={`/${locale}/area/${flag.h3}`}
          target="_blank"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          {t.viewArea}
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>
      <Button variant="outline" disabled={busy} onClick={onResolve}>
        <Check className="size-4" aria-hidden />
        {t.resolve}
      </Button>
    </li>
  );
}

// ---------- dashboard ----------
function Dashboard({
  locale,
  dict,
  username,
  onLogout,
}: {
  locale: Locale;
  dict: Dictionary;
  username: string;
  onLogout: () => void;
}) {
  const t = dict.mod;
  const qc = useQueryClient();
  // null = automatic: open the first tab that has something to review.
  const [picked, setPicked] = useState<Tab | null>(null);
  const queue = useQuery({ queryKey: ["mod-queue"], queryFn: fetchQueue, refetchInterval: 60_000 });
  const stats = useQuery({ queryKey: ["mod-stats"], queryFn: fetchStats, refetchInterval: 60_000 });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["mod-queue"] });
    void qc.invalidateQueries({ queryKey: ["mod-stats"] });
  };
  const action = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: Decision; reason?: RejectReason }) =>
      decide(id, decision, reason),
    onSettled: refresh,
  });
  const resolve = useMutation({ mutationFn: resolveFlag, onSettled: refresh });

  const s = stats.data;
  const tiles: { key: keyof Dictionary["mod"]["stats"]; value?: number; tone?: string }[] = [
    { key: "flagged", value: s?.flagged, tone: "text-[#b26a00]" },
    { key: "pending", value: s?.pending },
    { key: "areaAlerts", value: s?.areaAlerts, tone: "text-ral-4" },
    { key: "today", value: s?.today },
    { key: "verified", value: s?.verified, tone: "text-positive" },
    { key: "rejected", value: s?.rejected },
  ];
  const counts: Record<Tab, number> = {
    flagged: queue.data?.flagged.length ?? 0,
    pending: queue.data?.pending.length ?? 0,
    alerts: queue.data?.flags.length ?? 0,
  };
  const tab: Tab =
    picked ?? (counts.flagged > 0 ? "flagged" : counts.alerts > 0 ? "alerts" : "pending");
  const setTab = setPicked;
  const reports = tab === "flagged" ? queue.data?.flagged : tab === "pending" ? queue.data?.pending : undefined;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-3">{fill(locale, t.signedInAs, { name: username })}</p>
        <Button variant="ghost" onClick={onLogout}>
          <LogOut className="size-4" aria-hidden />
          {t.logout}
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(({ key, value, tone }) => (
          <div key={key} className="rounded-2xl border border-line bg-surface p-4">
            <dd className={cn("font-display text-3xl font-extrabold tabular-nums", tone)}>
              {value === undefined ? "—" : formatNumber(locale, value)}
            </dd>
            <dt className="mt-1 text-xs text-ink-3">{t.stats[key]}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex gap-1 rounded-full bg-surface-2 p-1" role="tablist">
        {(["flagged", "pending", "alerts"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors",
              tab === key ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
            )}
          >
            {t.tabs[key]}
            <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs tabular-nums">
              {formatNumber(locale, counts[key])}
            </span>
          </button>
        ))}
      </div>

      {action.isError && (
        <p role="alert" className="mt-4 rounded-xl bg-ral-4/10 px-4 py-3 text-sm text-ral-4">
          {t.actionFailed}
        </p>
      )}

      <div className="mt-4">
        {queue.isLoading ? (
          <p className="flex items-center gap-2 py-10 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {dict.common.loading}
          </p>
        ) : tab === "alerts" ? (
          counts.alerts === 0 ? (
            <p className="py-10 text-center text-sm text-ink-3">{t.empty}</p>
          ) : (
            <ul className="space-y-3">
              {queue.data?.flags.map((flag) => (
                <AlertCard
                  key={flag.id}
                  flag={flag}
                  locale={locale}
                  dict={dict}
                  busy={resolve.isPending}
                  onResolve={() => resolve.mutate(flag.id)}
                />
              ))}
            </ul>
          )
        ) : !reports || reports.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-3">{t.empty}</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                locale={locale}
                dict={dict}
                busy={action.isPending && action.variables?.id === report.id}
                onDecide={(decision, reason) => action.mutate({ id: report.id, decision, reason })}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ME_KEY = ["mod-me"];

export function ModDashboard({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const qc = useQueryClient();
  // Checks an existing session (token in this tab). Queries only run in the browser.
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (getToken() ? (await fetchMe()).username : null),
    retry: false,
    staleTime: Infinity,
  });
  const setUser = (name: string | null) => qc.setQueryData(ME_KEY, name);

  if (me.isPending) {
    return <Loader2 className="mx-auto mt-16 size-6 animate-spin text-ink-3" aria-label={dict.common.loading} />;
  }
  const user = me.isError ? null : me.data;
  if (!user) return <LoginForm dict={dict} onSuccess={setUser} />;
  return (
    <Dashboard
      locale={locale}
      dict={dict}
      username={user}
      onLogout={() => {
        void logout().finally(() => {
          qc.removeQueries({ queryKey: ["mod-queue"] });
          qc.removeQueries({ queryKey: ["mod-stats"] });
          setUser(null);
        });
      }}
    />
  );
}
