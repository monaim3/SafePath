import { BAND_COLORS, scoreToBand } from "@/lib/safety/bands";

/** Circular gauge for the Reported Activity Level. Decorative; the number is the content. */
export function ScoreRing({
  score,
  display,
  caption,
  size = 168,
}: {
  score: number;
  display: string;
  caption: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;
  const filled = arc * (Math.max(0, Math.min(100, score)) / 100);
  const color = BAND_COLORS[scoreToBand(score)];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[135deg]" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-5xl font-bold tracking-tight tabular-nums">{display}</span>
        <span className="text-xs text-ink-3">{caption}</span>
      </div>
    </div>
  );
}
