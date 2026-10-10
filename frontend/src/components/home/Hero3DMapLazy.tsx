"use client";

import dynamic from "next/dynamic";

/** Loads the 3D map (MapLibre + WebGL) after the page is up, so it never slows the first paint. */
export const Hero3DMapLazy = dynamic(() => import("./Hero3DMap").then((m) => m.Hero3DMap), { ssr: false });
