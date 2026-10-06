import { Eye, Lightbulb, ShieldCheck, Sparkles } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { BANDS } from "@/lib/safety/bands";

const ICONS = [ShieldCheck, Eye, Lightbulb, Sparkles];
/** Icon tint per card, following the logo sweep. */
const ICON_COLORS = ["#2cb468", "#00a99d", "#0a8fd6", "#0a6fd6"];

/** Frosted glass: translucent fill, blur, hairline border and a lit top edge. */
const GLASS =
  "bg-white/[0.12] backdrop-blur-2xl ring-1 ring-white/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_24px_48px_-24px_rgb(2_12_40/0.55)]";

export function Principles({ dict }: { dict: Dictionary }) {
  const h = dict.home;
  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="relative isolate overflow-hidden rounded-[2rem] bg-[#062a5e] p-6 text-white sm:p-10 lg:p-12">
        {/* ---------- brand mesh background ---------- */}
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute -left-24 -bottom-40 size-[30rem] rounded-full bg-[#4cbb3f] opacity-70 blur-[110px]" />
          <div className="absolute left-[30%] top-[20%] size-[26rem] rounded-full bg-[#00b8b0] opacity-70 blur-[110px]" />
          <div className="absolute -right-24 -top-40 size-[30rem] rounded-full bg-[#12b5ea] opacity-70 blur-[110px]" />
          <div className="absolute -bottom-24 right-[10%] size-[24rem] rounded-full bg-[#0a6fd6] opacity-90 blur-[100px]" />
          {/* faint grid texture, fading toward the edges */}
          <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.07)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.07)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />
        </div>

        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.4fr] lg:gap-12">
          {/* ---------- intro + scale ---------- */}
          <div className="flex flex-col">
            <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${GLASS}`}>
              {h.principlesEyebrow}
            </span>
            <h2 className="mt-4 text-balance font-display text-3xl font-extrabold tracking-tight drop-shadow-sm sm:text-[40px] sm:leading-[1.1]">
              {h.principlesTitle}
            </h2>
            <p className="mt-4 leading-relaxed text-white/85">{h.principlesBody}</p>

            <div className={`mt-8 rounded-3xl p-5 lg:mt-auto ${GLASS}`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{h.scaleTitle}</p>
              <div className="mt-4 flex h-3 gap-1" aria-hidden>
                {BANDS.map((b, i) => (
                  <span
                    key={b}
                    className="flex-1 rounded-full ring-1 ring-white/30"
                    style={{ background: `var(--ral-${i})` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-white/75">
                <span>{dict.bands.very_low}</span>
                <span>{dict.bands.very_high}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-white/90">{h.scaleNote}</p>
            </div>
          </div>

          {/* ---------- promises ---------- */}
          <ul className="grid gap-4 sm:grid-cols-2">
            {h.principles.map((p, i) => {
              const Icon = ICONS[i] ?? ShieldCheck;
              return (
                <li
                  key={p.title}
                  className={`flex flex-col rounded-3xl p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.18] ${GLASS}`}
                >
                  <span className="grid size-11 place-items-center rounded-2xl bg-white shadow-lg">
                    <Icon className="size-5" style={{ color: ICON_COLORS[i] }} aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-bold tracking-tight">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/85">{p.body}</p>
                  <ul className="mt-auto flex flex-wrap gap-1.5 pt-4" aria-label={p.title}>
                    {p.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/20"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
