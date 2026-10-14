"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { cellToLatLng, getResolution, gridDisk, gridDistance, latLngToCell } from "h3-js";
import { Hand, Layers, Navigation, RotateCw, WifiOff } from "lucide-react";
import { fill, formatClock, type Dictionary, type Locale } from "@/i18n";
import {
  fetchArea,
  fetchCityTimeProfile,
  fetchMapCells,
  USING_DEMO_DATA,
} from "@/lib/api/safety";
import { BANDS } from "@/lib/safety/bands";
import { resForZoom, type GridRes } from "@/lib/safety/grid";
import { streetLookup, useStreetDay } from "@/lib/safety/street-day";
import { cn } from "@/components/ui/cn";
import { AreaPeek } from "./AreaPeek";
import { usePlaceName } from "@/lib/use-place-name";
import { Directions, type RouteOverlay } from "./Directions";
import { PlaceSearch } from "./PlaceSearch";
import {
  SafetyMap,
  type Basemap,
  type FitTarget,
  type FlyTarget,
  type MePosition,
} from "./SafetyMap";
import { TimeDock } from "./TimeDock";
import { PeriodSwitch } from "./PeriodSwitch";
import type { CellSummary, Period } from "@/lib/safety/types";

const GLASS = "border border-line bg-glass shadow-soft backdrop-blur-xl";
/** While map data keeps failing, try again this often (on top of the reload when the phone reconnects). */
const RETRY_EVERY_MS = 15_000;
const retryWhileFailing = (q: { state: { status: string } }) => (q.state.status === "error" ? RETRY_EVERY_MS : false);
/** Lookup used before (or without) area data: every place reads as "no reports". */
const NO_RISK_DATA = (): number | undefined => undefined;
const EMPTY_DAY: readonly number[] = new Array(24).fill(0);
/** The opening view: slightly south of the city centre so Dhaka sits above the time panel. */
const HOME_VIEW = { center: [90.41, 23.7] as [number, number], zoom: 10 };
/** Zoom a tapped neighbourhood cell opens at: street-level cells, with the whole neighbourhood in view. */
const CELL_ZOOM_IN = 14.3;
/** How far a search looks for an area with reports: 4 street cells ≈ 500 m. */
const SEARCH_RINGS = 4;

/** The searched cell if it has reports, else the closest one within SEARCH_RINGS. */
function nearestReported(
  origin: string,
  cells: CellSummary[] | undefined,
): string | null {
  if (!cells) return null;
  const shown = new Set(cells.filter((c) => !c.insufficient).map((c) => c.h3));
  let best: string | null = null;
  let bestDist = Infinity;
  for (const h of gridDisk(origin, SEARCH_RINGS)) {
    if (!shown.has(h)) continue;
    const d = gridDistance(origin, h);
    if (d < bestDist) [best, bestDist] = [h, d];
  }
  return best;
}

export function MapScreen({
  locale,
  dict,
  header,
}: {
  locale: Locale;
  dict: Dictionary;
  header: ReactNode;
}) {
  const [hour, setHourState] = useState<number | "all">("all");
  // Which reports count: last 30 / 90 days or all time (default).
  const [period, setPeriod] = useState<Period>("all");
  // Tracked separately: comparing against the current hour during render would differ between server and client.
  const [isNow, setIsNow] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>("satellite");
  const [res, setRes] = useState<GridRes>(8);
  const [selected, setSelected] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [overlay, setOverlay] = useState<RouteOverlay | null>(null);
  const [fitTo, setFitTo] = useState<FitTarget | null>(null);
  // A search or route field has focus. On phones the keyboard then shrinks the screen and the
  // bottom panels would ride up over the field and its results, so they step aside while typing.
  const [typing, setTyping] = useState(false);
  // Leaving the field (a tap on a search result) waits a moment before the panels come back,
  // or they'd reappear under the finger mid-tap — while the keyboard still fills the screen —
  // and catch the tap meant for the result.
  const typingEnd = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queryClient = useQueryClient();

  const pickHour = useCallback((next: number | "all", now = false) => {
    setHourState(next);
    setIsNow(now);
  }, []);

  // After a failed load (weak connection, API waking up), keep trying quietly in the background.
  const {
    data: cells,
    isError: cellsFailed,
    isFetching: cellsLoading,
    refetch: refetchCells,
    fetchStatus: cellsFetchStatus,
    dataUpdatedAt: cellsUpdatedAt,
  } = useQuery({
    queryKey: ["map-cells", hour, res, period],
    queryFn: () => fetchMapCells({ hour, res, period }),
    placeholderData: keepPreviousData,
    refetchInterval: retryWhileFailing,
  });
  const { data: cityProfile } = useQuery({
    queryKey: ["city-time-profile", period],
    queryFn: () => fetchCityTimeProfile(period),
    placeholderData: keepPreviousData,
    refetchInterval: retryWhileFailing,
  });
  const { data: selectedArea } = useQuery({
    queryKey: ["area", selected, period],
    queryFn: () => fetchArea(selected ?? "", period),
    enabled: selected !== null,
  });

  // Route checks always use street-level cells, whatever the current zoom: every hour in one
  // download, kept on the phone, so changing the hour or losing the signal needs no new request.
  const { data: streetDay, isError: streetDayFailed } = useStreetDay(period, directionsOpen);
  // Activity data still loading or unavailable: show the route straight away, without risk
  // colours; they appear as soon as the data arrives (never a blank route panel while waiting).
  const lookup = useMemo(() => streetLookup(streetDay, hour) ?? NO_RISK_DATA, [streetDay, hour]);

  // Keep the route / live dot clear of the panels: left panel on desktop, top panel + folded bottom dock on mobile.
  // A trip is running: on phones the map takes the screen (slim status on top, time-left bar below).
  const [tripOn, setTripOn] = useState(false);
  const tripOnRef = useRef(false);
  const handleTripChange = useCallback((on: boolean) => {
    tripOnRef.current = on;
    setTripOn(on);
  }, []);

  const panelPadding = useCallback(() => {
    const desktop = window.innerWidth >= 1024;
    if (desktop) return { top: 110, bottom: 320, left: 430, right: 80 };
    // During a trip the dot sits low, leaving room to see the road ahead (like Google Maps).
    if (tripOnRef.current) return { top: Math.round(window.innerHeight * 0.4), bottom: 120, left: 30, right: 30 };
    return { top: Math.round(window.innerHeight * 0.5), bottom: 110, left: 30, right: 30 };
  }, []);

  const handleOverlay = useCallback(
    (next: RouteOverlay | null) => {
      setOverlay(next);
      if (!next || !next.fit) return;
      setFitTo({ bounds: next.bounds, key: next.key, padding: panelPadding() });
    },
    [panelPadding],
  );

  // Live GPS position while a trip runs: the map shows it as a moving dot and follows it.
  const [me, setMe] = useState<MePosition | null>(null);

  // Only street-level cells are ever selected, so the card and its place name describe one street.
  // A tap on a zoomed-out cell zooms into it instead (like map clusters): its colour comes from its
  // busiest street, so zooming in shows where that is.
  const handleSelect = useCallback((h3: string | null) => {
    if (h3 && getResolution(h3) < 10) {
      const [lat, lng] = cellToLatLng(h3);
      setSelected(null);
      setFlyTo({ center: [lng, lat], zoom: CELL_ZOOM_IN, key: Date.now() });
      return;
    }
    setSelected(h3);
  }, []);
  // Finer cells as you zoom in: neighbourhood → block → street segment.
  const handleZoom = useCallback(
    (zoom: number) => setRes(resForZoom(zoom)),
    [],
  );

  // With an area selected, the time chart answers "how is it HERE at each hour?"
  const areaMode = selected !== null && selectedArea != null;
  const place = usePlaceName(selected, locale);
  const selectedPlace = selectedArea?.isDemo ? null : place;

  const peek = selected && (
    <AreaPeek
      h3={selected}
      hour={hour}
      period={period}
      locale={locale}
      dict={dict}
      onClose={() => setSelected(null)}
    />
  );

  const demoNote = USING_DEMO_DATA && (
    <p className="mt-2 rounded-lg bg-[#fde68a] px-2 py-1 text-[11px] font-semibold text-[#3a2a12] lg:hidden">
      {dict.common.demoBanner}
    </p>
  );

  return (
    <div
      className={cn("relative h-dvh w-full overflow-hidden bg-surface-2", tripOn && "trip-on")}
      onFocusCapture={(e) => {
        if (!(e.target instanceof HTMLInputElement) || e.target.type === "range") return;
        clearTimeout(typingEnd.current);
        setTyping(true);
      }}
      onBlurCapture={(e) => {
        if (!(e.target instanceof HTMLInputElement)) return;
        clearTimeout(typingEnd.current);
        typingEnd.current = setTimeout(() => setTyping(false), 400);
      }}
    >
      <SafetyMap
        className="absolute inset-0"
        cells={cells}
        selected={selected}
        onSelect={handleSelect}
        flyTo={flyTo}
        basemap={basemap}
        overlay={overlay?.features}
        fitTo={fitTo}
        initialZoom={HOME_VIEW.zoom}
        initialCenter={HOME_VIEW.center}
        onZoomChange={handleZoom}
        me={me}
        followPadding={panelPadding}
        recenterLabel={dict.route.recenter}
        ariaLabel={dict.map.legendTitle}
      />

      {header}

      {/*
        Layout zones (no overlaps):
        - lg+: left column = search / directions + legend; time dock sits to its right; peek top-right.
        - below lg: search / directions on top, peek + time dock stacked at the bottom.
      */}
      {/* ---------- left column: search or directions (like Google Maps), legend ---------- */}
      <div className="pointer-events-none absolute left-3 right-3 top-[5.25rem] z-20 flex flex-col gap-2 lg:bottom-5 lg:right-auto lg:w-[24rem] [&>*]:pointer-events-auto">
        {directionsOpen ? (
          <Directions
            locale={locale}
            dict={dict}
            hour={hour}
            lookup={lookup}
            onClose={() => setDirectionsOpen(false)}
            onOverlay={handleOverlay}
            onTripPosition={setMe}
            onTripChange={handleTripChange}
            onTripEnded={() => {
              // "End" closes directions and returns to the opening view of the city.
              setDirectionsOpen(false);
              setSelected(null);
              setFlyTo({ ...HOME_VIEW, key: Date.now() });
            }}
            riskDataFailed={streetDayFailed && !streetDay}
          />
        ) : (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <PlaceSearch
                labels={dict.net}
                placeholder={dict.map.searchPlaceholder}
                onSelect={async (place) => {
                  setFlyTo({ center: place.center, zoom: 15, key: Date.now() });
                  setSelected(null);
                  // Open the closest area with reports, so searching a place always shows something.
                  const res15 = resForZoom(15);
                  const near = await queryClient
                    .fetchQuery({
                      queryKey: ["map-cells", hour, res15, period],
                      queryFn: () => fetchMapCells({ hour, res: res15, period }),
                    })
                    .catch(() => undefined);
                  setSelected(
                    nearestReported(
                      latLngToCell(place.center[1], place.center[0], res15),
                      near,
                    ),
                  );
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setDirectionsOpen(true)}
              title={dict.route.open}
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-2xl text-white",
                "bg-brand shadow-soft",
              )}
            >
              <Navigation className="size-5" aria-hidden />
              <span className="sr-only">{dict.route.open}</span>
            </button>
          </div>
        )}
        {!directionsOpen && (
          <PeriodSwitch dict={dict} value={period} onChange={setPeriod} />
        )}
        {/* Weak or no connection but a saved copy is showing: a quiet note, not an error. */}
        {cells && (cellsFailed || cellsFetchStatus === "paused") && (
          <p role="status" className={cn("inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs text-ink-2", GLASS)}>
            <WifiOff className="size-3.5 shrink-0 text-ral-3" aria-hidden />
            {/* No time for a stand-in (another hour's colours kept on screen while this one can't load). */}
            {cellsUpdatedAt > 0
              ? fill(locale, dict.net.savedData, { time: formatClock(locale, dict, new Date(cellsUpdatedAt)) })
              : dict.net.savedDataOlder}
          </p>
        )}
        {cellsFailed && !cells && (
          <div role="alert" className={cn("flex items-start gap-3 self-start rounded-2xl px-4 py-3 text-sm lg:max-w-sm", GLASS)}>
            <WifiOff className="mt-0.5 size-4 shrink-0 text-ral-4" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">{dict.net.zonesFailed}</p>
              <p className="mt-0.5 text-xs text-ink-3">{dict.net.retrying}</p>
              <button
                type="button"
                onClick={() => void refetchCells()}
                disabled={cellsLoading}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-accent disabled:opacity-60"
              >
                <RotateCw className={cn("size-3.5", cellsLoading && "animate-spin")} aria-hidden />
                {dict.net.retry}
              </button>
            </div>
          </div>
        )}
        {!selected && !directionsOpen && (
          <p className="hidden items-center gap-2 self-start rounded-full bg-glass px-3 py-1.5 text-xs text-ink-2 backdrop-blur-xl lg:inline-flex">
            <Hand className="size-3.5" aria-hidden />
            {dict.map.tapHint}
          </p>
        )}

        {/* legend: bottom of the left column, hidden while directions use the space */}
        {!directionsOpen && (
          <aside
            className={cn(
              "mt-auto hidden w-64 rounded-2xl p-4 lg:block",
              GLASS,
            )}
          >
            <p className="text-xs font-semibold">{dict.map.legendTitle}</p>
            <p className="text-[11px] text-ink-3">{dict.map.legendNote}</p>
            <div className="mt-3 flex h-2 gap-0.5" aria-hidden>
              {BANDS.map((b, i) => (
                <span
                  key={b}
                  className="flex-1 first:rounded-l-full last:rounded-r-full"
                  style={{ background: `var(--ral-${i})` }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
              <span>{dict.bands.very_low}</span>
              <span>{dict.bands.very_high}</span>
            </div>
            <p className="mt-3 flex items-center gap-2 text-[11px] text-ink-3">
              <span
                className="size-3.5 shrink-0 rounded-[3px] bg-ral-2 bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.8)_0_2px,transparent_2px_5px)]"
                aria-hidden
              />
              {dict.map.fewReports}
            </p>
            {USING_DEMO_DATA && (
              <p className="mt-3 rounded-lg bg-[#fde68a] px-2 py-1 text-[11px] font-semibold text-[#3a2a12]">
                {dict.common.demoBanner}
              </p>
            )}
          </aside>
        )}
      </div>

      {/* ---------- basemap toggle (like Google Maps "Layers") ---------- */}
      <button
        type="button"
        onClick={() =>
          setBasemap((b) => (b === "satellite" ? "map" : "satellite"))
        }
        className={cn(
          "absolute right-3 top-[8.75rem] z-20 flex items-center gap-2 rounded-2xl p-1.5 pr-3 text-xs font-semibold lg:top-[5.25rem]",
          directionsOpen && "max-lg:hidden",
          GLASS,
        )}
      >
        <span
          className={cn(
            "grid size-9 place-items-center rounded-xl text-white",
            basemap === "satellite" ? "bg-[#2f6b3a]" : "bg-[#0a6fd6]",
          )}
          aria-hidden
        >
          <Layers className="size-4" />
        </span>
        {basemap === "satellite" ? dict.map.mapView : dict.map.satellite}
      </button>

      {/* ---------- desktop: area peek ---------- */}
      {peek && (
        <div className="absolute right-3 top-[9rem] z-30 hidden w-80 lg:block">
          {peek}
        </div>
      )}

      {/* ---------- bottom: peek (mobile) + time dock ---------- */}
      <div
        className={cn(
          // Wider than the panel it centres: taps on its empty sides must reach the map's hexagons.
          "pointer-events-none absolute inset-x-3 bottom-3 z-20 lg:bottom-5 lg:left-[calc(24rem+1.5rem)] lg:right-16",
          (typing || tripOn) && "max-lg:hidden",
        )}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-2 [&>*]:pointer-events-auto">
          {peek && <div className="lg:hidden">{peek}</div>}
          <TimeDock
            locale={locale}
            dict={dict}
            hour={hour}
            isNow={isNow}
            onPick={pickHour}
            values={areaMode ? selectedArea.hours : (cityProfile ?? EMPTY_DAY)}
            mode={areaMode ? "area" : "city"}
            areaName={
              areaMode
                ? (selectedPlace ??
                  `${selectedArea.isDemo ? dict.home.heroCardDemoArea : dict.home.heroCardArea} ${selectedArea.code}`)
                : undefined
            }
            footer={demoNote}
            compact={directionsOpen || selected !== null}
          />
        </div>
      </div>
    </div>
  );
}
