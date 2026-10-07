import type { MetadataRoute } from "next";

/** Makes SafePath installable ("Add to Home Screen"). Bangla-first, like the site. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SafePath — ছিনতাই সচেতনতা",
    short_name: "SafePath",
    description: "কোথায়, কখন ছিনতাইয়ের রিপোর্ট হচ্ছে দেখুন, কম ঝুঁকির পথ বেছে নিন — বিনামূল্যে, পরিচয় গোপন রেখে।",
    lang: "bn",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f8fb",
    theme_color: "#062a5e",
    categories: ["navigation", "utilities", "news"],
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "ম্যাপ", url: "/bn/map", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
      { name: "ছিনতাইয়ের তথ্য দিন", url: "/bn/report", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
      { name: "আমার এলাকা", url: "/bn/watch", icons: [{ src: "/icons/app-192.png", sizes: "192x192" }] },
    ],
  };
}
