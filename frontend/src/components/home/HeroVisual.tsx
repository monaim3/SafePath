import { Clock, Cross, Pill, ShieldCheck, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { fill, formatNumber, type Dictionary, type Locale } from "@/i18n";
import { BAND_COLORS, scoreToBand } from "@/lib/safety/bands";
import { peakBlock } from "@/lib/safety/explain";
import type { AreaDetail } from "@/lib/safety/types";
import { BandBadge, ConfidenceMeter } from "@/components/safety/BandBadge";

/*
 * Illustrated (not real) city map in a Google-Maps-like palette.
 * Story: the fastest route cuts through a high-activity zone; the brand route goes around it.
 * Coordinates are in a 500×400 viewBox; HTML overlays use the same points as percentages.
 */
const VB = { w: 500, h: 400 };
const pct = (x: number, y: number) => ({ left: `${(x / VB.w) * 100}%`, top: `${(y / VB.h) * 100}%` });

const START = { x: 40, y: 292 };
const DEST = { x: 440, y: 62 };
const ZONE = { x: 282, y: 160, r: 50 };

const MAJOR_ROADS = [
  "M -10 300 C 120 280, 220 250, 300 175 S 420 60, 510 40",
  "M 345 -10 C 335 100, 360 220, 340 410",
  "M -10 210 C 150 200, 300 215, 510 235",
];
const RIVER = "M 150 -10 C 172 80, 118 140, 150 210 S 232 300, 196 410";
const FASTEST = `M ${START.x} ${START.y} C 120 280, 220 250, 300 175 S 400 75, ${DEST.x} ${DEST.y}`;
const SAFER = `M ${START.x} ${START.y} C 90 286, 120 238, 185 212 S 310 214, 352 226 C 362 180, 344 120, 352 92 S 410 66, ${DEST.x} ${DEST.y}`;

const POIS: { x: number; y: number; Icon: ComponentType<SVGProps<SVGSVGElement>>; bg: string }[] = [
  { x: 212, y: 118, Icon: Cross, bg: "#e5484d" },
  { x: 398, y: 142, Icon: ShieldCheck, bg: "#1a73e8" },
  { x: 92, y: 168, Icon: Pill, bg: "#2cb468" },
];

export function HeroVisual({ area, locale, dict }: { area: AreaDetail; locale: Locale; dict: Dictionary }) {
  const n = (v: number) => formatNumber(locale, v);
  const peak = peakBlock(area.timeBlocks);
  const maxBlock = Math.max(...area.timeBlocks, 1);
  const confirmations = area.knowledge[0]?.confirmationsBucket ?? 10;

  return (
    <div className="relative mx-auto w-full max-w-xl pb-12 lg:pb-0">
      {/* ---------- map tile ---------- */}
      <div className="relative aspect-[5/4] overflow-hidden rounded-[2rem] bg-[var(--map-land)] shadow-[0_30px_80px_-30px_rgb(10_47_115/0.45)] ring-1 ring-line">
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <pattern id="city-blocks" width="34" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
              <rect x="3" y="3" width="28" height="20" rx="3" fill="var(--map-block)" />
            </pattern>
            <linearGradient
              id="route-grad"
              gradientUnits="userSpaceOnUse"
              x1={START.x}
              y1={START.y}
              x2={DEST.x}
              y2={DEST.y}
            >
              <stop offset="0" stopColor="#4cbb3f" />
              <stop offset="0.5" stopColor="#00b8b0" />
              <stop offset="1" stopColor="#0a6fd6" />
            </linearGradient>
          </defs>

          {/* land, blocks, parks, water */}
          <rect width={VB.w} height={VB.h} fill="url(#city-blocks)" />
          <rect x="22" y="30" width="96" height="64" rx="18" fill="var(--map-park)" />
          <ellipse cx="262" cy="88" rx="34" ry="22" fill="var(--map-park)" />
          <ellipse cx="452" cy="330" rx="70" ry="46" fill="var(--map-park)" />
          <path d={RIVER} fill="none" stroke="var(--map-water)" strokeWidth={30} strokeLinecap="round" />
          <ellipse cx="146" cy="214" rx="34" ry="22" fill="var(--map-water)" />

          {/* streets */}
          {MAJOR_ROADS.map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke="var(--map-major-casing)" strokeWidth={13} strokeLinecap="round" />
              <path d={d} fill="none" stroke="var(--map-major)" strokeWidth={10} strokeLinecap="round" />
            </g>
          ))}

          {/* high-activity zone */}
          <circle cx={ZONE.x} cy={ZONE.y} r={ZONE.r} fill={BAND_COLORS.high} fillOpacity={0.14} />
          <circle
            cx={ZONE.x}
            cy={ZONE.y}
            r={ZONE.r}
            fill="none"
            stroke={BAND_COLORS.high}
            strokeWidth={2}
            strokeDasharray="6 6"
            className="zone-spin"
          />
          <circle cx={ZONE.x} cy={ZONE.y} r={ZONE.r * 0.45} fill={BAND_COLORS.very_high} fillOpacity={0.16} />

          {/* fastest route (through the zone) */}
          <path d={FASTEST} fill="none" stroke="#5f6b7a" strokeOpacity={0.65} strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" />

          {/* lower-activity route */}
          <path d={SAFER} fill="none" stroke="#ffffff" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={SAFER}
            fill="none"
            stroke="url(#route-grad)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* start dot */}
          <circle cx={START.x} cy={START.y} r={9} fill="#ffffff" />
          <circle cx={START.x} cy={START.y} r={5.5} fill="#4cbb3f" />
        </svg>

        {/* support points */}
        {POIS.map(({ x, y, Icon, bg }) => (
          <span
            key={`${x}-${y}`}
            className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-md ring-2 ring-white"
            style={{ ...pct(x, y), background: bg }}
            aria-hidden
          >
            <Icon className="size-3.5" strokeWidth={2.5} />
          </span>
        ))}

        {/* zone label */}
        {peak !== null && (
          <span
            className="absolute inline-flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#9b1c1c] shadow-md"
            style={pct(ZONE.x, ZONE.y - ZONE.r - 4)}
          >
            <Clock className="size-3" aria-hidden />
            {dict.timeBlocks[peak]}
          </span>
        )}

        {/* destination pin */}
        <div className="absolute -translate-x-1/2 -translate-y-full" style={pct(DEST.x, DEST.y)} aria-hidden>
          <svg viewBox="0 0 40 52" className="h-11 w-9 drop-shadow-[0_6px_10px_rgb(0_0_0/0.3)]">
            <defs>
              <linearGradient id="pin-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#2fe0c8" />
                <stop offset="1" stopColor="#0a6fd6" />
              </linearGradient>
            </defs>
            <path d="M20 51C20 51 38 31 38 19A18 18 0 0 0 2 19C2 31 20 51 20 51Z" fill="url(#pin-grad)" />
            <circle cx="20" cy="19" r="7" fill="#fff" />
          </svg>
        </div>

        {/* route legend */}
        <div className="absolute left-4 top-4 flex flex-col items-start gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0a1f3d] shadow-md">
            <span className="h-1.5 w-5 rounded-full bg-brand" />
            {dict.home.heroRoute}
            <span className="font-medium text-[#45597a]">· {dict.home.heroRouteExtra}</span>
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium text-[#45597a] shadow-sm backdrop-blur">
            <span className="w-5 border-t-2 border-dotted border-[#5f6b7a]" />
            {dict.home.heroFastest}
          </span>
        </div>
      </div>

      {/* ---------- area card ---------- */}
      <div className="absolute -bottom-2 right-4 w-[min(19rem,82%)] rounded-3xl border border-line bg-surface p-5 shadow-soft sm:-right-8 lg:-bottom-10">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">
            {dict.home.heroCardArea} {area.code}
          </span>
          <BandBadge band={area.band} label={dict.bands[area.band]} />
        </div>

        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="flex items-end gap-1.5">
            <span className="font-display text-5xl font-extrabold leading-none tabular-nums">{n(area.score)}</span>
            <span className="pb-1 text-xs text-ink-3">{dict.common.of100}</span>
          </div>
          {/* activity by time of day */}
          <div className="flex h-10 items-end gap-[3px]" aria-hidden>
            {area.timeBlocks.map((v, i) => (
              <span
                key={i}
                className="w-[7px] rounded-full"
                style={{ height: `${Math.max(12, (v / maxBlock) * 100)}%`, background: BAND_COLORS[scoreToBand(v)] }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <ConfidenceMeter level={area.confidence} label={dict.confidence.label} valueLabel={dict.confidence[area.confidence]} />
          <span className="inline-flex items-center gap-1 text-xs text-ink-3">
            <Users className="size-3.5" aria-hidden />
            {fill(locale, dict.area.confirmations, { n: confirmations })}
          </span>
        </div>
      </div>
    </div>
  );
}
