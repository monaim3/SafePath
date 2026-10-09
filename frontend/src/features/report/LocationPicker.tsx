"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cellToLatLng, latLngToCell } from "h3-js";
import { Check, Loader2, LocateFixed, MapPin } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { reversePlace } from "@/lib/api/safety";
import { REPORT_RES } from "@/lib/safety/grid";
import { cn } from "@/components/ui/cn";
import { PlaceSearch } from "@/features/map/PlaceSearch";
import { SafetyMap, type FlyTarget } from "@/features/map/SafetyMap";

type LngLat = [lng: number, lat: number];

/** Where the picker opens before a spot is chosen: Mohammadpur, Dhaka. */
const MOHAMMADPUR: LngLat = [90.3605, 23.7625];

/**
 * Google-style "drop a pin": search or move the map so the fixed centre pin is on the spot,
 * with the address under it. Only the ~150 m cell is stored.
 */
export function LocationPicker({
  dict,
  value,
  onChange,
}: {
  dict: Dictionary;
  value: string;
  onChange: (h3: string) => void;
}) {
  const t = dict.report;
  const [center, setCenter] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(() => {
    if (!value) return null;
    const [lat, lng] = cellToLatLng(value);
    return { center: [lng, lat], zoom: 16, key: 1 };
  });

  const fly = (to: LngLat, zoom = 16.5) => setFlyTo({ center: to, zoom, key: Date.now() });

  // Once the map has been moved off the starting spot (pan, tap, search, "my location"),
  // the pin is the answer: the spot follows it, so "Next" works without an extra confirm.
  // Left untouched, the default spot needs the explicit button, so it can't be sent by accident.
  const startCell = latLngToCell(MOHAMMADPUR[1], MOHAMMADPUR[0], REPORT_RES);
  const handleCenter = useCallback(
    (c: LngLat) => {
      setCenter(c);
      const cell = latLngToCell(c[1], c[0], REPORT_RES);
      if (cell !== startCell) onChange(cell);
    },
    [onChange, startCell],
  );

  // Round so tiny pans don't trigger new lookups.
  const key = center ? [center[0].toFixed(4), center[1].toFixed(4)] : null;
  const { data: address, isFetching } = useQuery({
    queryKey: ["reverse", key],
    queryFn: ({ signal }) => reversePlace(center!, signal),
    enabled: center !== null,
    staleTime: 10 * 60_000,
  });

  const centerCell = center ? latLngToCell(center[1], center[0], REPORT_RES) : null;
  const confirmed = value !== "" && value === centerCell;

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fly([pos.coords.longitude, pos.coords.latitude], 17);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <PlaceSearch
            id="report-place"
            variant="inline"
            placeholder={t.searchPlace}
            onSelect={(p) => fly(p.center)}
          />
        </div>
        <button
          type="button"
          onClick={locateMe}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-accent hover:border-accent"
        >
          {locating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{dict.route.myLocation}</span>
        </button>
      </div>

      <div className="relative mt-3 h-[24rem] overflow-hidden rounded-3xl border border-line">
        <SafetyMap
          className="absolute inset-0"
          selected={value || null}
          onPick={(p) => fly(p, 16.5)}
          onCenterChange={handleCenter}
          flyTo={flyTo}
          initialCenter={MOHAMMADPUR}
          initialZoom={14}
          basemap="satellite"
          ariaLabel={t.whereQ}
        />

        {/* fixed centre pin */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full" aria-hidden>
          <MapPin
            className="size-11 fill-[#e53935] text-white drop-shadow-[0_6px_8px_rgb(0_0_0/0.45)]"
            strokeWidth={1.5}
          />
        </div>
        <span className="pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40" aria-hidden />


        {/* address under the pin + confirm */}
        <div
          className="absolute inset-x-3 top-3 flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-soft backdrop-blur">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              confirmed ? "bg-positive-soft text-positive" : "bg-[#e53935]/10 text-[#e53935]",
            )}
          >
            {confirmed ? <Check className="size-5" aria-hidden /> : <MapPin className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1" aria-live="polite">
            {isFetching ? (
              <p className="text-sm text-ink-3">{t.findingAddress}</p>
            ) : (
              <>
                <p className="truncate text-sm font-semibold">{address?.name ?? t.unnamedPlace}</p>
                {address?.context && <p className="truncate text-xs text-ink-3">{address.context}</p>}
              </>
            )}
          </div>
          {confirmed ? (
            <span className="shrink-0 rounded-full bg-positive-soft px-3 py-2 text-xs font-semibold text-positive">
              {t.chosen}
            </span>
          ) : (
            <button
              type="button"
              disabled={!centerCell}
              onClick={() => centerCell && onChange(centerCell)}
              className="shrink-0 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white shadow-soft disabled:opacity-50"
            >
              {t.chooseHere}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-3">
        <MapPin className="size-3.5 shrink-0 text-[#e53935]" aria-hidden />
        {t.moveHint}
      </p>
    </div>
  );
}
