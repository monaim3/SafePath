"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bot,
  Check,
  Hourglass,
  Layers3,
  Loader2,
  ShieldCheck,
  Users,
  UserX,
} from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { ReportError, REPORTS_GO_TO_SERVER, submitReport } from "@/lib/api/safety";
import { getDeviceId } from "@/lib/device";
import { CATEGORIES, type CategoryGroup } from "@/lib/safety/categories";
import { TIME_BLOCKS } from "@/lib/safety/types";
import { redactPersonalInfo, reportSchema, type ReportInput } from "@/lib/validation/report";
import { Button, buttonClass } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { CategoryIcon, FluentIcon } from "@/components/safety/CategoryIcon";
import { LocationPicker } from "./LocationPicker";
import { WhenPicker } from "./WhenPicker";
import { Turnstile } from "./Turnstile";

const STEP_FIELDS: FieldPath<ReportInput>[][] = [
  ["kind", "category"],
  ["h3"],
  ["when", "date", "block", "hour", "days"],
  ["relation", "description"],
];

function Tile({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative rounded-2xl border p-3 text-left text-sm transition-all",
        selected
          ? "border-accent bg-accent text-accent-ink shadow-soft"
          : "border-line bg-surface hover:-translate-y-0.5 hover:border-ink-3",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Icons for report.checkPoints, in order. */
const CHECK_ICONS = [UserX, Layers3, Users, BadgeCheck, Bot, Hourglass];

const KINDS = [
  { key: "incident", icon: "kind_incident", color: "#e53935" },
  { key: "knowledge", icon: "kind_knowledge", color: "#1a73e8" },
  { key: "positive", icon: "kind_positive", color: "#2cb468" },
] as const;

/** Icon + title + one-line hint; selection shown with an accent ring and a check badge. */
function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  hint,
  greenBorder = false,
}: {
  /** Thin brand-green border (#3BCD6A, 0.5px) on the unselected card. */
  greenBorder?: boolean;
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border p-3 text-left transition-all",
        selected
          ? "border-accent bg-accent-soft/60 shadow-soft ring-1 ring-accent"
          : cn(
              "bg-surface hover:-translate-y-0.5 hover:shadow-sm",
              greenBorder ? "border-[0.5px] border-[#3BCD6A]" : "border-line hover:border-ink-3",
            ),
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 pr-5">
        <span className="block text-sm font-semibold leading-snug">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-3">{hint}</span>
      </span>
      {selected && (
        <span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-accent text-accent-ink">
          <Check className="size-3" strokeWidth={3} aria-hidden />
        </span>
      )}
    </button>
  );
}

function Question({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-2xl font-bold tracking-tight">{children}</h2>;
}

function FieldError({ message, dict }: { message?: string; dict: Dictionary }) {
  if (!message) return null;
  const text = dict.report.errors[message as keyof Dictionary["report"]["errors"]] ?? message;
  return (
    <p role="alert" className="mt-3 text-sm font-medium text-ral-4">
      {text}
    </p>
  );
}

export function QuickReport({
  locale,
  dict,
  initialH3,
}: {
  locale: Locale;
  dict: Dictionary;
  initialH3: string | null;
}) {
  const t = dict.report;
  const [step, setStep] = useState(0);

  const form = useForm<ReportInput>({
    resolver: zodResolver(reportSchema),
    defaultValues: { kind: "incident", h3: initialH3 ?? "", description: "" },
    mode: "onSubmit",
  });
  const { control, handleSubmit, trigger, setValue, formState, reset } = form;
  const kind = useWatch({ control, name: "kind" });
  const h3 = useWatch({ control, name: "h3" });
  const [whenValue, dateValue, blockValue, hourValue] = useWatch({ control, name: ["when", "date", "block", "hour"] });

  const [captchaToken, setCaptchaToken] = useState("");
  const handleToken = useCallback((token: string) => setCaptchaToken(token), []);
  const submit = useMutation({
    mutationFn: (input: ReportInput) =>
      submitReport(
        { ...input, description: redactPersonalInfo(input.description ?? "") },
        { deviceId: getDeviceId(), turnstileToken: captchaToken },
      ),
  });
  const submitErrorCode = submit.error instanceof ReportError ? submit.error.code : submit.error ? "network" : null;

  const group: CategoryGroup = kind === "positive" ? "positive" : "chhintai";
  const last = STEP_FIELDS.length - 1;

  async function next() {
    if (await trigger(STEP_FIELDS[step])) setStep((s) => Math.min(last, s + 1));
  }

  if (submit.isSuccess) {
    return (
      <div className="rise mx-auto max-w-lg py-16 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand text-white">
          <Check className="size-8" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-3xl font-bold tracking-tight">{t.successTitle}</h1>
        <p className="mt-3 leading-relaxed text-ink-2">{t.successBody}</p>
        {!REPORTS_GO_TO_SERVER && <p className="mt-3 text-xs text-ink-3">{t.demoNote}</p>}

        {/* How reports are kept honest — only what the system actually does. */}
        <section className="mt-8 rounded-3xl border border-line bg-surface p-5 text-left">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-accent" aria-hidden />
            {t.checkTitle}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {t.checkPoints.map((point, i) => {
              const Icon = CHECK_ICONS[i] ?? Check;
              return (
                <li key={point} className="flex items-start gap-2.5 text-sm leading-snug text-ink-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                  {point}
                </li>
              );
            })}
          </ul>
        </section>
        <div className="mt-8 flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              submit.reset();
              setStep(0);
            }}
          >
            {t.successAgain}
          </Button>
          <Link href={`/${locale}/map`} className={buttonClass({})}>
            {t.successMap}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="mx-auto mb-8 max-w-2xl">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{t.title}</h1>
      <p className="mt-3 text-lg text-ink-2">{t.subtitle}</p>
    </div>
    <form
      onSubmit={(e) => {
        // Enter in a field on an earlier step must move forward, never submit.
        if (step < last) {
          e.preventDefault();
          void next();
          return;
        }
        void handleSubmit((values) => submit.mutate(values))(e);
      }}
      noValidate className="mx-auto max-w-2xl">
      {/* ---------- progress ---------- */}
      <ol className="flex gap-2" aria-label="Progress">
        {t.steps.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-brand" : "bg-line")} />
            <span
              className={cn("mt-2 block text-xs", i === step ? "font-semibold text-ink" : "text-ink-3")}
              aria-current={i === step ? "step" : undefined}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      <div key={step} className="rise mt-8 min-h-[22rem]">
        {/* ---------- 1. What ---------- */}
        {step === 0 && (
          <div className="space-y-8">
            <div>
              <Question>{t.kindQ}</Question>
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {KINDS.map(({ key: k, icon, color }) => (
                      <ChoiceCard
                        key={k}
                        selected={field.value === k}
                        onClick={() => {
                          if (field.value !== k) setValue("category", undefined as never);
                          field.onChange(k);
                          setValue("when", undefined);
                        }}
                        icon={<FluentIcon name={icon} tint={color} />}
                        title={t.kind[k].title}
                        hint={t.kind[k].body}
                      />
                    ))}
                  </div>
                )}
              />
            </div>

            <div>
              <Question>{kind === "positive" ? t.whatPositiveQ : kind === "knowledge" ? t.whatUsuallyQ : t.whatQ}</Question>
              <Controller
                control={control}
                name="category"
                render={({ field, fieldState }) => (
                  <>
                    <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                      {CATEGORIES.filter((c) => c.group === group).map((c) => (
                        <ChoiceCard
                          key={c.key}
                          selected={field.value === c.key}
                          onClick={() => field.onChange(c.key)}
                          icon={<CategoryIcon category={c.key} />}
                          title={dict.categories[c.key]}
                          hint={dict.categoryHints[c.key]}
                          greenBorder
                        />
                      ))}
                    </div>
                    <FieldError message={fieldState.error?.message} dict={dict} />
                  </>
                )}
              />
            </div>
          </div>
        )}

        {/* ---------- 2. Where ---------- */}
        {step === 1 && (
          <div>
            <Question>{t.whereQ}</Question>
            <p className="mt-2 flex items-start gap-2 text-sm text-ink-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              {t.whereHint}
            </p>
            <div className="mt-4">
              <LocationPicker dict={dict} value={h3} onChange={(cell) => setValue("h3", cell, { shouldValidate: true })} />
            </div>
            <FieldError message={formState.errors.h3?.message} dict={dict} />
          </div>
        )}

        {/* ---------- 3. When ---------- */}
        {step === 2 &&
          (kind === "incident" ? (
            <WhenPicker
              locale={locale}
              dict={dict}
              value={{ when: whenValue, date: dateValue, block: blockValue, hour: hourValue }}
              onChange={(next) => {
                setValue("when", next.when);
                setValue("date", next.date);
                setValue("block", next.block as number);
                setValue("hour", next.hour);
                if (formState.isSubmitted || Object.keys(formState.errors).length) void trigger(["when", "date", "block"]);
              }}
              errors={{
                when: formState.errors.when?.message,
                date: formState.errors.date?.message,
                block: formState.errors.block ? "block" : undefined,
              }}
            />
          ) : (
            <div className="space-y-8">
              <div>
                <Question>{t.daysQ}</Question>
                <Controller
                  control={control}
                  name="days"
                  render={({ field }) => (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {(["every_day", "weekdays", "weekends"] as const).map((d) => (
                        <Tile key={d} selected={field.value === d} onClick={() => field.onChange(d)} className="text-center">
                          <span className="font-medium">{t.days[d]}</span>
                        </Tile>
                      ))}
                    </div>
                  )}
                />
              </div>

              <div>
                <Question>{kind === "positive" ? t.seenQ : t.usuallyQ}</Question>
                <Controller
                  control={control}
                  name="block"
                  render={({ field, fieldState }) => (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {TIME_BLOCKS.map((b) => (
                          <Tile key={b} selected={field.value === b} onClick={() => field.onChange(b)} className="text-center">
                            <span className="font-medium">{dict.timeBlocks[b]}</span>
                          </Tile>
                        ))}
                      </div>
                      <FieldError message={fieldState.error ? "block" : undefined} dict={dict} />
                    </>
                  )}
                />
              </div>
            </div>
          ))}
        {/* ---------- 4. Details ---------- */}
        {step === 3 && (
          <div className="space-y-8">
            <div>
              <Question>{t.relationQ}</Question>
              <Controller
                control={control}
                name="relation"
                render={({ field }) => (
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {(["experienced", "witnessed", "heard"] as const).map((r) => (
                      <Tile key={r} selected={field.value === r} onClick={() => field.onChange(r)}>
                        <span className="font-medium">{t.relation[r]}</span>
                      </Tile>
                    ))}
                  </div>
                )}
              />
            </div>
            <div>
              <label htmlFor="description" className="font-display text-2xl font-bold tracking-tight">
                {t.descLabel}
              </label>
              <textarea
                id="description"
                rows={4}
                maxLength={500}
                {...form.register("description")}
                className="mt-4 w-full resize-none rounded-2xl border border-line bg-surface p-4 text-sm outline-none focus:border-ink-3"
              />
              <p className="mt-2 flex items-start gap-2 text-xs text-ink-3">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t.descHint}
              </p>
            </div>
          </div>
        )}
      </div>

      {step === last && <Turnstile onToken={handleToken} locale={locale} />}
      {submitErrorCode && (
        <p role="alert" className="mt-4 rounded-xl bg-ral-4/10 px-4 py-3 text-sm font-medium text-ral-4">
          {t.submitErrors[submitErrorCode as keyof typeof t.submitErrors] ?? t.submitErrors.network}
        </p>
      )}

      {/* ---------- nav ---------- */}
      <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={cn(step === 0 && "invisible")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {dict.common.back}
        </Button>
        {/* Distinct keys: React must swap DOM nodes, not flip one button's type mid-click
            (that made "Next" on the last-but-one step submit the form). */}
        {step < last ? (
          <Button key="next" type="button" size="lg" onClick={next}>
            {dict.common.next}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button key="submit" type="submit" size="lg" variant="accent" disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {submit.isPending ? t.submitting : t.submit}
          </Button>
        )}
      </div>
    </form>
    </>
  );
}
