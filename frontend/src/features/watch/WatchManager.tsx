"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BellRing, Clock, Loader2, MapPin, ShieldCheck, X } from "lucide-react";
import { fill, type Dictionary, type Locale } from "@/i18n";
import { saveMyAreas } from "@/lib/api/watch";
import { areaCode } from "@/lib/pwa";
import { usePlaceName } from "@/lib/use-place-name";
import { ButtonLink } from "@/components/ui/Button";
import { errorText, MY_AREAS_KEY, useMyAreas } from "./FollowAreaButton";
import { usePushSupport } from "./hooks";
import { InstallCard } from "./InstallCard";

function AreaName({ cell, locale, fallback }: { cell: string; locale: Locale; fallback: string }) {
  const place = usePlaceName(cell, locale);
  return (
    <>
      <span className="block truncate font-semibold">{place ?? fallback}</span>
      {place && <span className="block text-xs text-ink-3">{areaCode(cell)}</span>}
    </>
  );
}

/** The "My areas" page: followed areas, unfollow, install, and how notifications work. */
export function WatchManager({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.watch;
  const qc = useQueryClient();
  const support = usePushSupport();
  const { data: areas = [], isLoading, isError } = useMyAreas();
  const remove = useMutation({
    mutationFn: (cell: string) => saveMyAreas(areas.filter((a) => a !== cell), locale),
    onSuccess: (next) => qc.setQueryData(MY_AREAS_KEY, next),
  });

  const blocked = support === "unsupported" || support === "ios-install" || support === "denied";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <BellRing className="size-5 text-accent" aria-hidden />
          {t.listTitle}
        </h2>

        {blocked && (
          <p role="alert" className="mt-4 rounded-2xl bg-ral-4/10 p-3 text-sm text-ral-4">
            {t[support === "ios-install" ? "iosInstall" : support]}
          </p>
        )}

        {support === "ok" && isLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {dict.common.loading}
          </p>
        ) : isError ? (
          <p role="alert" className="mt-5 text-sm text-ral-4">
            {t.failed}
          </p>
        ) : areas.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-line p-5 text-center">
            <p className="text-sm leading-relaxed text-ink-2">{t.empty}</p>
            <ButtonLink href={`/${locale}/map`} variant="outline" className="mt-4">
              {t.openMap}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {areas.map((cell) => (
              <li key={cell} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <MapPin className="size-5" aria-hidden />
                </span>
                <Link href={`/${locale}/area/${cell}`} className="min-w-0 flex-1 hover:text-accent">
                  <AreaName cell={cell} locale={locale} fallback={fill(locale, t.area, { code: areaCode(cell) })} />
                </Link>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(cell)}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-ral-4 hover:bg-ral-4/10 disabled:opacity-50"
                >
                  {remove.isPending && remove.variables === cell ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <X className="size-3.5" aria-hidden />
                  )}
                  {t.unfollow}
                </button>
              </li>
            ))}
          </ul>
        )}
        {remove.error && (
          <p role="alert" className="mt-3 text-sm text-ral-4">
            {errorText(t, remove.error, locale)}
          </p>
        )}
      </section>

      <div className="space-y-5">
        <InstallCard dict={dict} />
        <section className="space-y-3 rounded-3xl bg-surface-2 p-5 text-sm leading-relaxed text-ink-2">
          <p className="flex gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {t.howBody}
          </p>
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {t.privacy}
          </p>
        </section>
      </div>
    </div>
  );
}
