"use client";

import { useCallback, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { CAPTCHA_ON, Turnstile } from "@/features/report/Turnstile";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const TOPICS = ["wrong_info", "remove", "problem", "collaborate", "other"] as const;
type Topic = (typeof TOPICS)[number];
type Fields = { name: string; email: string; topic: Topic | ""; subject: string; message: string };
const EMPTY: Fields = { name: "", email: "", topic: "", subject: "", message: "" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type T = Dictionary["contact"]["form"];

/** Contact form → saved by the API and emailed to the owner (replies go to the sender's email). */
export function ContactForm({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.contact.form;
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [website, setWebsite] = useState(""); // hidden trap field for bots
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [failure, setFailure] = useState<keyof T["errors"] | null>(null);
  // A Turnstile token is single-use: a fresh widget for every attempt.
  const [token, setToken] = useState("");
  const [round, setRound] = useState(0);
  const onToken = useCallback((v: string) => setToken(v), []);
  const waiting = CAPTCHA_ON && !token;

  const set = (key: keyof Fields) => (e: { target: { value: string } }) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  function validate(): boolean {
    const e: typeof errors = {};
    if (!fields.name.trim()) e.name = t.errors.required;
    if (!EMAIL_RE.test(fields.email.trim())) e.email = t.errors.email;
    if (!fields.topic) e.topic = t.errors.required;
    if (!fields.subject.trim()) e.subject = t.errors.required;
    if (fields.message.trim().length < 10) e.message = t.errors.short;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFailure(null);
    if (!validate() || waiting) return;
    setState("sending");
    const spent = token;
    setToken("");
    setRound((r) => r + 1);
    try {
      const res = await fetch(`${API_URL}/api/v1/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, email: fields.email.trim(), turnstile_token: spent, website }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setFailure(res.status === 429 ? "rate_limited" : body.error === "captcha" ? "captcha" : "failed");
    } catch {
      setFailure("failed");
    }
    setState("idle");
  }

  if (state === "sent") {
    return (
      <div className="py-6 text-center" role="status">
        <CheckCircle2 className="mx-auto size-12 text-positive" aria-hidden />
        <h3 className="mt-4 font-display text-xl font-bold">{t.sentTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.sentBody}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-5"
          onClick={() => {
            setFields(EMPTY);
            setState("idle");
          }}
        >
          {t.another}
        </Button>
      </div>
    );
  }

  const input =
    "mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-accent aria-[invalid=true]:border-ral-4";
  // Label names the field; the error (or hint) is linked separately, so it isn't read as part of the name.
  const a11y = (key: keyof Fields, hint?: string) => ({
    id: `contact-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] || hint ? `contact-${key}-note` : undefined,
  });
  const field = (key: keyof Fields, label: string, el: React.ReactNode, hint?: string) => (
    <div>
      <label htmlFor={`contact-${key}`} className="text-sm font-medium">
        {label}
      </label>
      {el}
      {errors[key] ? (
        <p id={`contact-${key}-note`} className="mt-1 text-xs font-medium text-ral-4">
          {errors[key]}
        </p>
      ) : (
        hint && (
          <p id={`contact-${key}-note`} className="mt-1 text-xs text-ink-3">
            {hint}
          </p>
        )
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate lang={locale}>
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "name",
          t.name,
          <input {...a11y("name")} className={input} value={fields.name} onChange={set("name")} maxLength={80} autoComplete="name" />,
        )}
        {field(
          "email",
          t.email,
          <input
            {...a11y("email", t.emailHint)}
            className={input}
            type="email"
            inputMode="email"
            value={fields.email}
            onChange={set("email")}
            maxLength={254}
            autoComplete="email"
          />,
          t.emailHint,
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {field(
          "topic",
          t.topic,
          <select {...a11y("topic")} className={cn(input, !fields.topic && "text-ink-3")} value={fields.topic} onChange={set("topic")}>
            <option value="" disabled>
              {t.topicPick}
            </option>
            {TOPICS.map((k) => (
              <option key={k} value={k} className="text-ink">
                {t.topics[k]}
              </option>
            ))}
          </select>,
        )}
        {field(
          "subject",
          t.subject,
          <input {...a11y("subject")} className={input} value={fields.subject} onChange={set("subject")} maxLength={120} />,
        )}
      </div>
      <div className="mt-4">
        {field(
          "message",
          t.message,
          <textarea
            {...a11y("message", t.messageHint)}
            className={cn(input, "min-h-36 resize-y")}
            value={fields.message}
            onChange={set("message")}
            maxLength={3000}
            rows={6}
          />,
          t.messageHint,
        )}
      </div>

      {/* invisible to people; bots that fill every field give themselves away */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />

      <Turnstile key={round} onToken={onToken} locale={locale} />

      {failure && (
        <p role="alert" className="mt-4 rounded-xl bg-ral-4/10 px-4 py-3 text-sm font-medium text-ral-4">
          {t.errors[failure]}
        </p>
      )}

      <Button type="submit" variant="accent" size="lg" className="mt-5" disabled={state === "sending" || waiting}>
        {state === "sending" || waiting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
        {state === "sending" ? t.sending : waiting ? t.checking : t.send}
      </Button>
    </form>
  );
}
