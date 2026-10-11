"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  RotateCw,
  WifiOff,
  ArrowDownUp,
  ArrowLeft,
  Car,
  Circle,
  Flag,
  Footprints,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Pencil,
  Route,
  ShieldCheck,
} from "lucide-react";
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
import { travelledPart } from "@/lib/safety/trip-alerts";
import { AVOID_SCORE, peakAlongWay } from "@/lib/safety/reroute";
import { PlaceSearch } from "./PlaceSearch";
import { findSaferRoute } from "./safer-route";
import { Announcer, TripMode, type TripFix } from "./TripMode";

/** Google-style route blue for stretches with no reports. */
export const ROUTE_BLUE = "#1a73e8";

type LngLat = [lng: number, lat: number];

export interface RouteOverlay {
  features: GeoJSON.FeatureCollection;
  bounds: [LngLat, LngLat];
  key: string;
  /** False while a trip runs: the camera is following the person, so don't zoom out to the route. */
  fit: boolean;
}

function buildOverlay(
  routes: RouteOption[],
  analyses: RouteAnalysis[],
  selected: number,
  here: LngLat | null,
  /** A safer way being offered during a trip: drawn as a dashed green preview. */
  suggest: RouteOption | null = null,
  /** Keeps the key stable (no re-fit of the camera) while a trip is following the person. */
  fixedKey?: string,
): RouteOverlay {
  const features: GeoJSON.Feature[] = [];
  routes.forEach((r, i) => {
    if (i !== selected) {
      features.push({ type: "Feature", properties: { kind: "alt", index: i }, geometry: { type: "LineString", coordinates: r.coordinates } });
    }
  });
  if (suggest) {
    features.push({ type: "Feature", properties: { kind: "suggest" }, geometry: { type: "LineString", coordinates: suggest.coordinates } });
  }
  const sel = routes[selected];
  features.push({ type: "Feature", properties: { kind: "casing" }, geometry: { type: "LineString", coordinates: sel.coordinates } });
  for (const seg of analyses[selected].segments) {
    features.push({
      type: "Feature",
      properties: { kind: "seg", color: seg.band ? BAND_COLORS[seg.band] : ROUTE_BLUE },
      geometry: { type: "LineString", coordinates: seg.coordinates },
    });
  }
  // During a trip, the stretch already driven/walked turns grey, like Google Maps.
  const passed = here ? travelledPart(here, sel.coordinates) : null;
  if (passed) {
    features.push({ type: "Feature", properties: { kind: "passed" }, geometry: { type: "LineString", coordinates: passed } });
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
    key: fixedKey ?? `${sel.id}-${routes.length}-${first.join()}-${last.join()}`,
    fit: fixedKey === undefined,
  };
}

export function Directions({
  locale,
  dict,
  hour,
  lookup,
  onClose,
  onOverlay,
  onTripPosition,
  riskDataFailed = false,
}: {
  locale: Locale;
  dict: Dictionary;
  hour: number | "all";
  lookup: CellLookup | null;
  /** Area data couldn't be loaded: routes still show, without risk colours (and we say so). */
  riskDataFailed?: boolean;
  onClose: () => void;
  onOverlay: (overlay: RouteOverlay | null) => void;
  /** GPS fixes while a trip runs (null when it stops), for the moving dot on the map. */
  onTripPosition: (fix: TripFix | null) => void;
}) {
  const t = dict.route;
  const [from, setFrom] = useState<PlaceResult | null>(null);
  const [to, setTo] = useState<PlaceResult | null>(null);
  const [mode, setMode] = useState<TravelMode>("drive");
  const [picked, setPicked] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [version, setVersion] = useState(0); // remounts the inputs after swap / my-location
  // Set while a trip is running (voice alerts on). Created inside the tap so audio is allowed.
  const [trip, setTrip] = useState<Announcer | null>(null);
  // Phones: once both places are set, the inputs fold into one summary row so the routes and
  // "start trip" fit on screen. Tapping the row brings the inputs back. (Desktop always shows them.)
  const [folded, setFolded] = useState(false);
  // The start→end pair whose trip ended by reaching the destination (shows a short "arrived" note).
  const [arrivedFor, setArrivedFor] = useState<string | null>(null);
  const placesKey = `${from?.center.join()}>${to?.center.join()}`;

  const { data: baseRoutes, isFetching, isError, refetch } = useQuery({
    queryKey: ["routes", from?.center, to?.center, mode],
    queryFn: ({ signal }) => fetchRoutes(from!.center, to!.center, mode, signal),
    enabled: from !== null && to !== null,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  // When every route the router offers crosses a high-report area, also try a detour around the
  // worst one, so there's a genuinely safer option to suggest.
  const baseAnalyses = useMemo(
    () => (baseRoutes && lookup ? baseRoutes.map((r) => analyzeRoute(r, lookup)) : null),
    [baseRoutes, lookup],
  );
  const bestBase = baseRoutes && baseAnalyses ? lowestRiskIndex(baseAnalyses, baseRoutes) : 0;
  const needDetour =
    !!baseRoutes && !!lookup && peakAlongWay(baseRoutes[bestBase].coordinates, lookup) >= AVOID_SCORE;
  const { data: detour } = useQuery({
    queryKey: ["safer-detour", from?.center, to?.center, mode, hour],
    queryFn: ({ signal }) =>
      findSaferRoute({
        from: from!.center,
        to: to!.center,
        mode,
        current: baseRoutes![bestBase].coordinates,
        currentDuration: Math.min(...baseRoutes!.map((r) => r.duration)),
        lookup: lookup!,
        signal,
        aheadM: Infinity,
        alternatives: false,
      }),
    enabled: needDetour && lookup !== null && from !== null && to !== null,
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const routes = useMemo(
    () => (baseRoutes && detour ? [...baseRoutes, detour.choice.route] : baseRoutes),
    [baseRoutes, detour],
  );
  const detourIndex = baseRoutes && detour ? baseRoutes.length : -1;

  const analyses = useMemo(
    () => (routes && lookup ? routes.map((r) => analyzeRoute(r, lookup)) : null),
    [routes, lookup],
  );
  const recommended = analyses && routes ? lowestRiskIndex(analyses, routes) : 0;
  const fastest = routes ? routes.reduce((best, r, i) => (r.duration < routes[best].duration ? i : best), 0) : 0;
  // The usual (fastest) route is drawn first, since that's the way people actually go; the
  // lower-report route stays labelled as an option to tap.
  const selected = routes && picked !== null && picked < routes.length ? picked : fastest;

  // Latest GPS fix of the running trip (greys out the travelled part of the route).
  const [here, setHere] = useState<LngLat | null>(null);
  const handleFix = useCallback(
    (fix: TripFix | null) => {
      setHere(fix?.lngLat ?? null);
      onTripPosition(fix);
    },
    [onTripPosition],
  );

  // During a trip: the route actually being followed (switches when a safer way is taken),
  // and a safer way currently on offer (previewed on the map).
  const [tripRoute, setTripRoute] = useState<RouteOption | null>(null);
  const [offered, setOffered] = useState<RouteOption | null>(null);
  const activeRoute = routes ? (trip && tripRoute ? tripRoute : routes[selected]) : null;
  const routeInfo = useMemo(() => (activeRoute ? { duration: activeRoute.duration, mode } : null), [activeRoute, mode]);
  const endTrip = () => {
    setTrip(null);
    setTripRoute(null);
    setOffered(null);
  };

  useEffect(() => {
    if (!routes || !analyses || !lookup) return onOverlay(null);
    if (trip && tripRoute) {
      onOverlay(buildOverlay([tripRoute], [analyzeRoute(tripRoute, lookup)], 0, here, offered, "trip"));
      return;
    }
    onOverlay(buildOverlay(routes, analyses, selected, trip ? here : null, trip ? offered : null, trip ? "trip" : undefined));
  }, [routes, analyses, lookup, selected, onOverlay, trip, here, tripRoute, offered]);

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
        if (to) setFolded(true);
      },
      () => setLocating(false),
      // Precise fix (GPS on phones): a rough Wi-Fi/IP guess can put the start on the wrong street.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  const backButton = (
    <button
      type="button"
      onClick={onClose}
      className="grid size-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      <span className="sr-only">{dict.common.close}</span>
    </button>
  );

  const modeToggle = (
    <div className="flex shrink-0 rounded-full bg-surface-2 p-0.5">
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
  );

  const showFolded = folded && from !== null && to !== null;
  const canStart = routes && analyses && !isFetching && !trip;

  return (
    <div className="flex max-h-[46dvh] flex-col overflow-hidden rounded-3xl border border-line bg-glass shadow-soft backdrop-blur-xl lg:max-h-[calc(100dvh-6.5rem)]">
      {/* ---------- phones: folded summary "A → B" ---------- */}
      {showFolded && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 lg:hidden">
          {backButton}
          <button
            type="button"
            onClick={() => setFolded(false)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 text-left hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Circle className="size-3 shrink-0 text-ink-3" strokeWidth={3} aria-hidden />
                <span className="truncate">{from?.name}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                <MapPin className="size-3.5 shrink-0 text-[#e53935]" aria-hidden />
                <span className="truncate">{to?.name}</span>
              </span>
            </span>
            <Pencil className="size-4 shrink-0 text-accent" aria-hidden />
            <span className="sr-only">{t.editPlaces}</span>
          </button>
          {modeToggle}
        </div>
      )}

      {/* ---------- inputs ---------- */}
      <div className={cn("border-b border-line p-4", showFolded && "hidden lg:block")}>
        <div className="mb-3 flex items-center gap-2">
          {backButton}
          <h2 className="text-sm font-semibold">{t.title}</h2>
          <div className="ml-auto">{modeToggle}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <PlaceSearch
              labels={dict.net}
              key={`from-${version}`}
              id="route-from"
              variant="inline"
              placeholder={t.from}
              initialText={from?.name ?? ""}
              icon={<Circle className="size-3.5 shrink-0 text-ink-3" strokeWidth={3} aria-hidden />}
              onSelect={(p) => {
                setFrom(p);
                setPicked(null);
                if (to) setFolded(true);
              }}
              onClear={() => setFrom(null)}
            />
            <PlaceSearch
              labels={dict.net}
              key={`to-${version}`}
              id="route-to"
              variant="inline"
              placeholder={t.to}
              initialText={to?.name ?? ""}
              icon={<MapPin className="size-4 shrink-0 text-[#e53935]" aria-hidden />}
              onSelect={(p) => {
                setTo(p);
                setPicked(null);
                if (from) setFolded(true);
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
        {trip && (
          <TripMode
            locale={locale}
            dict={dict}
            route={activeRoute?.coordinates ?? null}
            routeInfo={routeInfo}
            announcer={trip}
            onStop={endTrip}
            onPosition={handleFix}
            onArrive={() => {
              endTrip();
              setArrivedFor(placesKey);
            }}
            onSuggest={setOffered}
            onSwitch={setTripRoute}
          />
        )}
        {arrivedFor === placesKey && !trip && (
          <p className="mb-4 flex items-center gap-2 rounded-2xl bg-positive-soft p-3 text-sm font-semibold text-positive" role="status">
            <Flag className="size-4 shrink-0" aria-hidden />
            {t.tripArrived}
          </p>
        )}
        {(!from || !to) && <p className="text-sm text-ink-3">{t.pickBoth}</p>}
        {from && to && isFetching && (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.searching}
          </p>
        )}
        {from && to && isError && !isFetching && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ral-4/10 px-3 py-2.5" role="alert">
            <p className="text-sm text-ral-4">{t.error}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-accent"
            >
              <RotateCw className="size-3.5" aria-hidden />
              {dict.net.retry}
            </button>
          </div>
        )}
        {routes && !isFetching && riskDataFailed && (
          <p className="mb-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <WifiOff className="mt-0.5 size-3.5 shrink-0 text-ral-4" aria-hidden />
            {dict.net.noColours}
          </p>
        )}

        {routes && analyses && !isFetching && (
          <>
            {/* the lower-report way, suggested when the one shown isn't it */}
            {!trip && recommended !== selected && (
              <div className="mb-3 rounded-2xl border border-positive/40 bg-positive-soft p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-positive">
                  <ShieldCheck className="size-4 shrink-0" aria-hidden />
                  {t.saferPickTitle}
                </p>
                <p className="mt-1 leading-snug text-ink-2">
                  {fill(locale, t.saferPickBody, {
                    n: Math.max(1, Math.round(routes[recommended].duration / 60)),
                    extra:
                      routes[recommended].duration - routes[selected].duration >= 60
                        ? fill(locale, t.saferExtraMore, {
                            n: Math.round((routes[recommended].duration - routes[selected].duration) / 60),
                          })
                        : t.saferExtraSame,
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setPicked(recommended)}
                  className="mt-2 rounded-full bg-positive px-4 py-1.5 text-xs font-semibold text-white"
                >
                  {t.saferPickButton}
                </button>
              </div>
            )}
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
                          {i === detourIndex && (
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                              {t.detour}
                            </span>
                          )}
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

      {/* pinned under the list so it never needs scrolling to find */}
      {canStart && (
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => {
              setTrip(new Announcer(locale));
              setTripRoute(null);
              setOffered(null);
              setArrivedFor(null);
              setFolded(true);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-soft transition-transform active:scale-[0.98]"
          >
            <Navigation className="size-4" aria-hidden />
            {t.tripStart}
          </button>
        </div>
      )}
    </div>
  );
}
