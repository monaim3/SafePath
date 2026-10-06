# SafePath — frontend

Next.js 16 (App Router) + TypeScript + Tailwind v4. Spec: [`../docs/SAFEPATH_MASTER_PROMPT.md`](../docs/SAFEPATH_MASTER_PROMPT.md).

```bash
npm install      # also copies the MapLibre worker into public/maplibre (postinstall)
npm run dev
```

Open http://localhost:3000 — redirects to `/bn` (Bangla-first). English at `/en`.

## Structure

| Path | What |
|---|---|
| `src/app/[lang]/` | Routes. `(site)` group = pages with header/footer; `map/` is full-screen. |
| `src/i18n/` | `bn.ts` / `en.ts` dictionaries (typed — a missing key fails the build). |
| `src/lib/safety/` | Domain logic: bands, categories, API types, explanations. |
| `src/lib/safety/demo-data.ts` | **Synthetic demo data.** Not real reports. Remove when the API exists. |
| `src/lib/api/safety.ts` | Data access. Each function names the backend endpoint it will call. |
| `src/features/` | Interactive client features: map, area knowledge list, quick report. |
| `src/components/` | Shared UI and layout. |

## Free services used

- Map tiles: [OpenFreeMap](https://openfreemap.org) (no key)
- Search: [Photon](https://photon.komoot.io) public API — swap to self-hosted Photon in production
- Hex grid: [H3](https://h3geo.org), resolutions 8–10 by zoom
- Icons: [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) 3D (MIT, licence in `public/icons/`) and [Lucide](https://lucide.dev) (ISC)
