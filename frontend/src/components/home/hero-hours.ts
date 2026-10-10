import type { Band } from "@/lib/safety/bands";

/** The hours the 3D hero cycles through: morning, afternoon, evening, night. */
export const HERO_HOURS = [8, 15, 19, 22] as const;

/** A busy area tagged on the 3D hero with its name and score. */
export interface Hotspot {
  h3: string;
  name: string;
  score: number;
  band: Band;
}
