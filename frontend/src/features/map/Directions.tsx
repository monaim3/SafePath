"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, ArrowLeft, Car, Circle, Footprints, Loader2, LocateFixed, MapPin, Route } from "lucide-react";
import { fill, formatHour, type Dictionary, type Locale } from "@/i18n";
import type { PlaceResult } from "@/lib/api/safety";
import { fetchRoutes } from "@/lib/api/routing";
import { BAND_COLORS } from "@/lib/safety/bands";
import {
  analyzeRoute,
  lowestRiskIndex,
  type CellLookup,
  type RouteAnalysis,
  type RouteOption,
  type TravelMode,
} from "@/lib/safety/route-risk";
import { BandBadge } from "@/components/safety/BandBadge";
import { cn } from "@/components/ui/cn";
import { PlaceSearch } from "./PlaceSearch";

/** Google-style route blue for stretches with no reports. */
export const ROUTE_BLUE = "#1a73e8";

type LngLat = [lng: number, lat: number];

export interface RouteOverlay {
  features: GeoJSON.FeatureCollection;
  bounds: [LngLat, LngLat];
  key: string;
}

function buildOverlay(routes: RouteOption[], analyses: RouteAnalysis[], selected: number): RouteOverlay {
  const features: GeoJSON.Feature[] = [];
  routes.forEach((r, i) => {
    if (i !== selected) {
      features.push({ type: "Feature", properties: { kind: "alt", index: i }, geometry: { type: "LineString", coordinates: r.coordinates } });
    }
  });
  const sel = routes[selected];
  features.push({ type: "Feature", properties: { kind: "casing" }, geometry: { type: "LineString", coordinates: sel.coordinates } });
  for (const seg of analyses[selected].segments) {
    features.push({
      type: "Feature",
      properties: { kind: "seg", color: seg.band ? BAND_COLORS[seg.band] : ROUTE_BLUE },
      geometry: { type: "LineString", coordinates: seg.coordinates },
    });
  }
  const first = sel.coordinates[0];
  const last = sel.coordinates[sel.coordinates.length - 1];
  features.push({ type: "Feature", properties: { kind: "start" }, geometry: { type: "Point", coordinates: first } });
  features.push({ type: "Feature", properties: { kind: "end" }, geometry: { type: "Point", coordinates: last } });

  const all = routes.flatMap((r) => r.coordinates);
  const lngs = all.map((c) => c[0]);
  const lats = all.map((c) => c[1]);
  return {
    features: { type: "FeatureCollection", features },
    bounds: [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    key: `${sel.id}-${routes.length}-${first.join()}-${last.join()}`,
  };
}

export function Directions({
  locale,
  dict,
  hour,
  lookup,
  onClose,
  onOverlay,
}: {
  locale: Locale;
  dict: Dictionary;
  hour: number | "all";
  lookup: CellLookup | null;
  onClose: () => void;
  onOverlay: (overlay: RouteOverlay | null) => void;
}) {
  const t = dict.route;
  const [from, setFrom] = useState<PlaceResult | null>(null);
  const [to, setTo] = useState<PlaceResult | null>(null);
  const [mode, setMode] = useState<TravelMode>("drive");
  const [picked, setPicked] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [version, setVersion] = useState(0); // remounts the inputs after swap / my-location

  const { data: routes, isFetching, isError } = useQuery({
    queryKey: ["routes", from?.center, to?.center, mode],
    queryFn: ({ signal }) => fetchRoutes(from!.center, to!.center, mode, signal),
    enabled: from !== null && to !== null,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const analyses = useMemo(
    () => (routes && lookup ? routes.map((r) => analyzeRoute(r, lookup)) : null),
    [routes, lookup],
  );
  const recommended = analyses ? lowestRiskIndex(analyses) : 0;
  const fastest = routes ? routes.reduce((best, r, i) => (r.duration < routes[best].duration ? i : best), 0) : 0;
  const selected = routes && picked !== null && picked < routes.length ? picked : recommended;

  useEffect(() => {
    onOverlay(routes && analyses ? buildOverlay(routes, analyses, selected) : null);
  }, [routes, analyses, selected, onOverlay]);

  useEffect(() => () => onOverlay(null), [onOverlay]);

  const timeLabel = hour === "all" ? dict.map.allDay : formatHour(locale, dict, hour);

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFrom({
          id: "me",
          name: t.myLocation,
          context: "",
          center: [pos.coords.longitude, pos.coords.latitude],
        });
        setPicked(null);
        setVersion((v) => v + 1);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  return (
    <div className="flex max-h-[46dvh] flex-col overflow-hidden rounded-3xl border border-line bg-glass shadow-soft backdrop-blur-xl lg:max-h-[calc(100dvh-6.5rem)]">
      {/* ---------- inputs ---------- */}
      <div className="border-b border-line p-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="sr-only">{dict.common.close}</span>
          </button>
          <h2 className="text-sm font-semibold">{t.title}</h2>
          <div className="ml-auto flex rounded-full bg-surface-2 p-0.5">
            {(["drive", "walk"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setPicked(null);
                }}
                aria-pressed={mode === m}
                title={m === "drive" ? t.modeDrive : t.modeWalk}
                className={cn(
                  "grid h-7 w-9 place-items-center rounded-full transition-colors",
                  mode === m ? "bg-surface text-accent shadow-sm" : "text-ink-3 hover:text-ink",
                )}
              >
                {m === "drive" ? <Car className="size-4" aria-hidden /> : <Footprints className="size-4" aria-hidden />}
                <span className="sr-only">{m === "drive" ? t.modeDrive : t.modeWalk}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <PlaceSearch
              key={`from-${version}`}
              id="route-from"
              variant="inline"
              placeholder={t.from}
              initialText={from?.name ?? ""}
              icon={<Circle className="size-3.5 shrink-0 text-ink-3" strokeWidth={3} aria-hidden />}
              onSelect={(p) => {
                setFrom(p);
                setPicked(null);
              }}
              onClear={() => setFrom(null)}
            />
            <PlaceSearch
              key={`to-${version}`}
              id="route-to"
              variant="inline"
              placeholder={t.to}
              initialText={to?.name ?? ""}
              icon={<MapPin className="size-4 shrink-0 text-[#e53935]" aria-hidden />}
              onSelect={(p) => {
                setTo(p);
                setPicked(null);
              }}
              onClear={() => setTo(null)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setFrom(to);
              setTo(from);
              setPicked(null);
              setVersion((v) => v + 1);
            }}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <ArrowDownUp className="size-4" aria-hidden />
            <span className="sr-only">{t.swap}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={locateMe}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft"
        >
          {locating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LocateFixed className="size-3.5" aria-hidden />}
          {locating ? t.locating : t.myLocation}
        </button>
      </div>

      {/* ---------- results ---------- */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
        {(!from || !to) && <p className="text-sm text-ink-3">{t.pickBoth}</p>}
        {from && to && isFetching && (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.searching}
          </p>
        )}
        {from && to && isError && !isFetching && <p className="text-sm text-ral-4">{t.error}</p>}

        {routes && analyses && !isFetching && (
          <>
            <ul className="space-y-2">
              {routes.map((r, i) => {
                const a = analyses[i];
                const active = i === selected;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(i)}
                      aria-pressed={active}
                      className={cn(
                        "w-full rounded-2xl border p-3 text-left transition-colors",
                        active ? "border-accent bg-surface shadow-sm" : "border-line bg-surface/60 hover:border-ink-3",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Route className={cn("size-4", active ? "text-accent" : "text-ink-3")} aria-hidden />
                        <span className="font-display text-lg font-bold">
                          {fill(locale, t.minutes, { n: Math.max(1, Math.round(r.duration / 60)) })}
                        </span>
                        <span className="text-xs text-ink-3">
                          · {fill(locale, t.km, { n: Number((r.distance / 1000).toFixed(1)) })}
                        </span>
                        <span className="ml-auto flex gap-1">
                          {i === recommended && (
                            <span className="rounded-full bg-positive-soft px-2 py-0.5 text-[11px] font-semibold text-positive">
                              {t.lowerRisk}
                            </span>
                          )}
                          {i === fastest && (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                              {t.fastest}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* route strip: each stretch coloured by reported activity */}
                      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                        {a.segments.map((s, k) => (
                          <span
                            key={k}
                            style={{
                              width: `${(s.length / Math.max(1, r.distance)) * 100}%`,
                              background: s.band ? BAND_COLORS[s.band] : ROUTE_BLUE,
                              opacity: s.band ? 1 : 0.35,
                            }}
                          />
                        ))}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                        <span className="text-ink-2">
                          {a.exposurePct > 0 ? fill(locale, t.exposure, { p: a.exposurePct }) : t.noExposure}
                        </span>
                        {a.peakBand && (
                          <span className="flex items-center gap-1 text-ink-3">
                            {t.peak}
                            <BandBadge band={a.peakBand} label={dict.bands[a.peakBand]} />
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* roads on the selected route */}
            <h3 className="mt-5 text-xs font-semibold text-ink-2">{fill(locale, t.roadsTitle, { time: timeLabel })}</h3>
            <ol className="mt-2 space-y-1.5">
              {analyses[selected].roads.map((road, k) => (
                <li key={`${road.name}-${k}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: road.band ? BAND_COLORS[road.band] : ROUTE_BLUE, opacity: road.band ? 1 : 0.4 }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{road.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-3">
                    {fill(locale, t.km, { n: Number((road.distance / 1000).toFixed(1)) })}
                  </span>
                  {road.band ? (
                    <BandBadge band={road.band} label={dict.bands[road.band]} />
                  ) : (
                    <span className="shrink-0 text-[11px] text-ink-3">{t.noReports}</span>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11px] leading-relaxed text-ink-3">{t.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  );
}
