import { cellToBoundary, cellToLatLng } from "h3-js";

/*
 * Early "outside Bangladesh" warning for the report form. The outline (geoBoundaries, CC0) is a
 * copy of backend/data/bangladesh_outline.json; the API runs the same check and has the final say.
 * Loaded on demand so only the report page downloads it.
 */
type Ring = [lng: number, lat: number][];

let rings: Promise<Ring[]> | null = null;
const load = () =>
  (rings ??= import("./bangladesh-outline.json").then((m) => m.default.polygons as Ring[]));

function insideRing(lng: number, lat: number, ring: Ring): boolean {
  // Ray casting: count the edges a ray going east from the point crosses.
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Centre or any corner of the cell inside the border (same slack as the server). */
export async function cellInBangladesh(cell: string): Promise<boolean> {
  const all = await load();
  const points = [cellToLatLng(cell), ...cellToBoundary(cell)];
  return points.some(([lat, lng]) => all.some((ring) => insideRing(lng, lat, ring)));
}
