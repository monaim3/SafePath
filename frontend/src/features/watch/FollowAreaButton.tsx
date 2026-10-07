"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { fill, type Dictionary, type Locale } from "@/i18n";
import { fetchMyAreas, saveMyAreas, WatchError } from "@/lib/api/watch";
import { watchCellFor } from "@/lib/pwa";
import { Button } from "@/components/ui/Button";
import { usePushSupport } from "./hooks";

export const MY_AREAS_KEY = ["my-areas"];
const MAX_AREAS = 3;

export function useMyAreas() {
  const support = usePushSupport();
  return useQuery({
    queryKey: MY_AREAS_KEY,
    queryFn: fetchMyAreas,
    enabled: support === "ok",
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function errorText(t: Dictionary["watch"], error: unknown, locale: Locale): string | null {
  if (!error) return null;
  const code = error instanceof WatchError ? error.code : "failed";
  if (code === "limit") return fill(locale, t.limit, { n: MAX_AREAS });
  return t[code];
}

/** "Follow this area" on an area page: push notifications when a report here is verified. */
export function FollowAreaButton({ h3, locale, dict }: { h3: string; locale: Locale; dict: Dictionary }) {
  const t = dict.watch;
  const qc = useQueryClient();
  const support = usePushSupport();
  const cell = watchCellFor(h3);
  const { data: areas = [], isLoading } = useMyAreas();
  const following = areas.includes(cell);

  const save = useMutation({
    mutationFn: () => {
      const next = following ? areas.filter((a) => a !== cell) : [...areas, cell];
      if (next.length > MAX_AREAS) throw new WatchError("limit");
      return saveMyAreas(next, locale);
    },
    onSuccess: (next) => qc.setQueryData(MY_AREAS_KEY, next),
  });

  if (support === null) return null; // server render / before hydration
  const blocked = support === "unsupported" || support === "ios-install" || support === "denied";
  const message = blocked ? t[support === "ios-install" ? "iosInstall" : support] : errorText(t, save.error, locale);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={following ? "outline" : "accent"}
        disabled={blocked || isLoading || save.isPending}
        onClick={() => save.mutate()}
        aria-pressed={following}
      >
        {save.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : following ? (
          <BellRing className="size-4" aria-hidden />
        ) : blocked ? (
          <BellOff className="size-4" aria-hidden />
        ) : (
          <Bell className="size-4" aria-hidden />
        )}
        {save.isPending ? t.saving : following ? t.following : t.follow}
      </Button>
      {message ? (
        <p role="alert" className="max-w-xs text-xs leading-relaxed text-ral-4">
          {message}
        </p>
      ) : (
        <p className="max-w-xs text-xs leading-relaxed text-ink-3">
          {following ? t.unfollowHint : fill(locale, t.followHint, { n: MAX_AREAS })}{" "}
          <Link href={`/${locale}/watch`} className="font-medium text-accent hover:underline">
            {t.manage}
          </Link>
        </p>
      )}
    </div>
  );
}
