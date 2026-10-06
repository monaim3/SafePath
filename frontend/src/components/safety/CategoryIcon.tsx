/* eslint-disable @next/next/no-img-element -- tiny static icons; next/image adds nothing here */
import type { CategoryKey } from "@/lib/safety/categories";
import { cn } from "@/components/ui/cn";

/**
 * 3D icons from Microsoft Fluent Emoji (MIT licence — see public/icons/FLUENT-EMOJI-LICENSE.txt),
 * resized to 128px WebP and served locally.
 */
const TINTS: Record<CategoryKey, string> = {
  motorbike: "#e53935",
  rickshaw_cng: "#2cb468",
  on_foot: "#fb8c00",
  bus: "#e53935",
  weapon: "#607d8b",
  well_lit: "#f9a825",
  busy_late: "#1a73e8",
  patrol_seen: "#e53935",
  cctv: "#5f6b7a",
};

const SIZES = {
  sm: { box: "size-7 rounded-lg", img: "size-6" },
  md: { box: "size-14 rounded-2xl", img: "size-11" },
  lg: { box: "size-16 rounded-2xl", img: "size-12" },
} as const;

export type IconName = CategoryKey | "kind_incident" | "kind_knowledge" | "kind_positive";

/** Custom SafePath illustrations (SVG, drawn for this project) — no stock icon fits these ideas. */
const CUSTOM_SVG: ReadonlySet<IconName> = new Set(["kind_incident", "kind_knowledge", "kind_positive"]);

/** Fluent 3D icon on a soft tinted tile. */
export function FluentIcon({
  name,
  tint,
  size = "md",
  className,
}: {
  name: IconName;
  tint: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center ring-1 ring-inset", s.box, className)}
      style={{
        background: `linear-gradient(145deg, ${tint}33, ${tint}14)`,
        ["--tw-ring-color" as string]: `${tint}40`,
      }}
    >
      <img src={`/icons/${name}.${CUSTOM_SVG.has(name) ? "svg" : "webp"}`} alt="" width={64} height={64} loading="lazy" className={cn(s.img, "drop-shadow-[0_2px_3px_rgb(0_0_0/0.18)]")} />
    </span>
  );
}

export function CategoryIcon({
  category,
  size = "md",
  className,
}: {
  category: CategoryKey;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return <FluentIcon name={category} tint={TINTS[category]} size={size} className={className} />;
}
