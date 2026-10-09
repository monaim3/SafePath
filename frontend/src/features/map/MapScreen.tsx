"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { gridDisk, gridDistance, latLngToCell } from "h3-js";
import { Hand, Layers, Navigation } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import {
  fetchArea,
  fetchCityTimeProfile,
  fetchMapCells,
  USING_DEMO_DATA,
} from "@/lib/api/safety";
import { BANDS } from "@/lib/safety/bands";
import { resForZoom, type GridRes } from "@/lib/safety/grid";
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
} from "./SafetyMap";
import { TimeDock } from "./TimeDock";
import { PeriodSwitch } from "./PeriodSwitch";
import type { CellSummary, Period } from "@/lib/safety/types";

const GLASS = "border border-line bg-glass shadow-soft backdrop-blur-xl";
const EMPTY_DAY: readonly number[] = new Array(24).fill(0);
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
  const queryClient = useQueryClient();

  const pickHour = useCallback((next: number | "all", now = false) => {
    setHourState(next);
    setIsNow(now);
  }, []);

  const { data: cells } = useQuery({
    queryKey: ["map-cells", hour, res, period],
    queryFn: () => fetchMapCells({ hour, res, period }),
    placeholderData: keepPreviousData,
  });
  const { data: cityProfile } = useQuery({
    queryKey: ["city-time-profile", period],
    queryFn: () => fetchCityTimeProfile(period),
    placeholderData: keepPreviousData,
  });
  const { data: selectedArea } = useQuery({
    queryKey: ["area", selected, period],
    queryFn: () => fetchArea(selected ?? "", period),
    enabled: selected !== null,
  });

  // Route checks always use street-level cells, whatever the current zoom.
  const { data: streetCells, isError: streetCellsFailed } = useQuery({
    queryKey: ["map-cells", hour, 10, period],
    queryFn: () => fetchMapCells({ hour, res: 10, period }),
    enabled: directionsOpen,
  });
  const lookup = useMemo(() => {
    // Activity data unavailable (API down): still show the route, just without risk colours.
    if (!streetCells) return streetCellsFailed ? () => undefined : null;
    const scores = new Map(streetCells.map((c) => [c.h3, c.score]));
    return (h3: string) => scores.get(h3);
  }, [streetCells, streetCellsFailed]);

  const handleOverlay = useCallback((next: RouteOverlay | null) => {
    setOverlay(next);
    if (!next) return;
    // Keep the route clear of the panels: left panel on desktop, top panel + folded bottom dock on mobile.
    const desktop = window.innerWidth >= 1024;
    setFitTo({
      bounds: next.bounds,
      key: next.key,
      padding: desktop
        ? { top: 110, bottom: 320, left: 430, right: 80 }
        : {
            top: Math.round(window.innerHeight * 0.5),
            bottom: 110,
            left: 30,
            right: 30,
          },
    });
  }, []);

  const handleSelect = useCallback((h3: string | null) => setSelected(h3), []);
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
    <div className="relative h-dvh w-full overflow-hidden bg-surface-2">
      <SafetyMap
        className="absolute inset-0"
        cells={cells}
        selected={selected}
        onSelect={handleSelect}
        flyTo={flyTo}
        basemap={basemap}
        overlay={overlay?.features}
        fitTo={fitTo}
        initialZoom={10}
        // Slightly south of the city centre so Dhaka sits above the time panel.
        initialCenter={[90.41, 23.7]}
        onZoomChange={handleZoom}
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
          />
        ) : (
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <PlaceSearch
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
      <div className="absolute inset-x-3 bottom-3 z-20 lg:bottom-5 lg:left-[calc(24rem+1.5rem)] lg:right-16">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
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
