"use client";

import { useParams } from "next/navigation";
import { ArrowRight, MapPinOff } from "lucide-react";
import { defaultLocale, getDictionary, hasLocale } from "@/i18n";
import { ButtonLink } from "@/components/ui/Button";

// not-found pages get no params, so the language is read from the URL on the client.
export default function NotFound() {
  const params = useParams<{ lang?: string }>();
  const lang = params.lang && hasLocale(params.lang) ? params.lang : defaultLocale;
  const t = getDictionary(lang).notFound;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <span className="grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent">
        <MapPinOff className="size-8" aria-hidden />
      </span>
      <p className="mt-6 font-display text-5xl font-extrabold text-ink-3">404</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">{t.title}</h1>
      <p className="mt-3 leading-relaxed text-ink-2">{t.body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href={`/${lang}/map`} variant="accent">
          {t.map}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href={`/${lang}`} variant="outline">
          {t.home}
        </ButtonLink>
      </div>
    </div>
  );
}
