/**
 * H3 grid resolutions used for aggregation.
 * Like Google Maps, detail grows with zoom: neighbourhood → block → street segment.
 * The finest level (res 10, ~65 m edge / ~130 m across) is also the public privacy floor.
 */
export type GridRes = 8 | 9 | 10;

/** Reports are stored (publicly) at this resolution — about 150 m. */
export const REPORT_RES: GridRes = 10;

/** Areas used for the home preview and rankings. */
export const OVERVIEW_RES: GridRes = 9;

export function resForZoom(zoom: number): GridRes {
  if (zoom < 12) return 8;
  if (zoom < 14) return 9;
  return 10;
}
