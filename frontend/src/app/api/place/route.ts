import { isValidCell } from "h3-js";
import { NextResponse, type NextRequest } from "next/server";
import { areaPlaceName } from "@/lib/place-name";

/** GET /api/place?h3=<cell>&lang=bn|en → { name } — cached place name for an area (used by client components). */
export async function GET(request: NextRequest) {
  const h3 = request.nextUrl.searchParams.get("h3") ?? "";
  const lang = request.nextUrl.searchParams.get("lang") === "en" ? "en" : "bn";
  if (!isValidCell(h3)) return NextResponse.json({ name: null }, { status: 400 });
  const name = await areaPlaceName(h3, lang);
  return NextResponse.json(
    { name },
    { headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400" } },
  );
}
