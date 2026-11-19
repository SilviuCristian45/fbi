# UI audit (Etapa 0) — 2026-11-17

Branch `feature/redesign-UI` (from `dev` = `349379d`). Screenshots in `before/` (desktop 1440 px, mobile 390 px @2x), console errors in `before/console.json`.

**Screenshot caveat:** headless Chrome gets `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` from fbi.gov, so every photo shows the "No Image" fallback. In a normal browser the photos load. Not a UI bug.

## Routes

| Route | What it does | Components | Access (effective) |
|---|---|---|---|
| `/auth/login` | username/password -> `POST /Auth/login`, token in localStorage | none (inline form) | anonymous |
| `/` | wanted list: search (debounce 500 ms), paging 12/24/48/100, favorite toggle | `Navbar`, inline card + pagination | USER/ADMIN (AuthGuard treats `/` as public, the page itself redirects without token, API requires a role) |
| `/wanted/[id]` | person file: gallery, physical data, aliases, caution/details (HTML), PDF dossier download, live sightings feed + route map | `SightingsList` -> `RouteModal` -> `RouteMapInner`; **no Navbar** | USER/ADMIN |
| `/saved` | favorites (same grid as `/`), **only place to report a sighting** (pin button -> `MapModal`: map, Nominatim reverse geocode, photo drag&drop) | `Navbar`, `MapModal` -> `MapInner` | USER/ADMIN |
| `/my-location` | set "Home Base" for 10 km alerts (map click or GPS) | `Navbar`, `MapInner` | USER/ADMIN |
| `/stats` | KPI cards, 7-day area chart, top targets bar chart (recharts) | `Navbar` | ADMIN (link hidden for USER; page has no guard, API returns 403 -> error card) |
| `/reports` | AI analysis reports, status badges, live refresh on `ReportProcessed`, details modal with matches | `Navbar`, `ReportDetailsModal` -> `RouteModal` | ADMIN (same: link hidden, no page guard; for USER the error is swallowed -> blank page) |
| `/health` | route handler for Docker healthcheck | — | — |

Unused: `src/components/SurveilanceFeed.tsx` (imported nowhere).

## Current state

- **Colors:** stock Tailwind palette used ad hoc: blue-600 primary, red for danger *and* titles, green for reward *and* favorites *and* "Save", slate-900 headers in modals/feeds. No tokens (`globals.css` defines `--background/--foreground`, nothing uses them).
- **Fonts:** Geist + Geist Mono are loaded via next/font but `body { font-family: Arial }` in `globals.css` overrides them, so the app renders in Arial. Mono only appears in aliases/coordinates.
- **Spacing / layout:** each page builds its own wrapper; Navbar is a floating card on 4 pages, full-bleed on `/reports`, missing on `/wanted/[id]`. Max-width and paddings differ per page.
- **Duplicates:** wanted card + favorite logic (`/` and `/saved`), 3 different paginations (`/`, `/saved`, `/reports`), 3 modals with different backdrop/header/close behavior, 2 `<Toaster/>` (AuthGuard + SightingsList), status badge/border logic inline in `/reports`, ~6 spinner variants, inline SVG icons copied between files, Leaflet marker icon from cdnjs (v1.7.1).
- **Dark mode:** `dark:` classes everywhere, driven only by `prefers-color-scheme`, no toggle; partly inconsistent (e.g. login error).
- **Language:** mixed RO/EN on the same screen: nav "Main / Saved / Stats / Locația Mea / Reports", "Caută după nume..." vs "Search saved fugitives...", "Show:" vs "Rows per page:", dossier/feed in EN with RO hints. `<html lang="en">`, `<title>Create Next App</title>`.
- **Mobile:** nav wraps into 3 rows (~450 px tall, logo text hidden); grid becomes 1 column with 256 px image cards (12 cards ~ 9600 px scroll); titles are `line-clamp-1` uppercase and lose the useful part ("JOHN DOE - CLARKSVILLE,..."); detail page puts the live feed at the very bottom.
- **Accessibility:** icon-only buttons (favorite, map pin, modal ✕) have only `title`, no `aria-label`/`aria-pressed`; login labels not linked to inputs (`htmlFor`/`id` missing); search inputs without label; modals have no `role="dialog"`, no focus trap, Esc only in `RouteModal`; no `focus-visible` styles on links/buttons (inputs use `outline-none` + ring); gallery thumbnails and sighting images without/with generic `alt`; low contrast: `text-gray-400` labels (SEX/RACE ~2.5:1), green reward text on white (~3.2:1), disabled "Next" light blue; heavy emoji use as icons (read out by screen readers).
- **States:** loading = spinners only; errors only in `console.error` on `/`, `/saved`, `/reports`, `/wanted/[id]` (user sees nothing or a blank page); `/reports` has **no empty state** (blank under the header); stats activity chart shows an empty grid with no message; feedback via `window.alert()` (report sent, PDF error, GPS, save location); "Simulare succes" 1 s artificial delay in my-location save.
- **Content bugs:** stats "Avg. Sightings / Target" shown as `0.00 %` (it is a ratio, not a percent); detail page says "use the Raportează button from the main list" but the button only exists on `/saved`; `/fbi-seal.png`, `/placeholder.png` missing; `/sounds/alarm.mp3` (urgent alert) missing, only `notif.wav` exists; fallback images from `placehold.co` (external).
- **Lint / build baseline:** `npm run build` passes. `npm run lint` **fails already: 19 errors, 22 warnings** (rules-of-hooks in `ReportDetailsModal` — hooks after an early return, `no-explicit-any`, `@ts-ignore`, `set-state-in-effect` in Navbar, unescaped entities; warnings: `<img>`, unused vars, exhaustive-deps, alt-text).

## Top 10 problems (by impact)

1. **No shared layout/design system** — every page re-implements nav placement, containers, cards, buttons, paginations, modals; result: visually inconsistent (nav changes shape between pages, detail page has none).
2. **Missing error and empty states** — failures are console-only; `/reports` and USER-on-admin-pages show blank screens; `alert()` for success/errors.
3. **Reporting a sighting (the core feature) is hidden** — only a small pin icon on `/saved` cards; not on the list, not on the person page (whose text points to a button that doesn't exist there).
4. **Mobile** — 3-row nav eats half the first screen, 1-column huge cards, truncated uppercase titles, live feed buried at the bottom of the detail page.
5. **Accessibility** — icon buttons without accessible names, unlabeled inputs, no dialog semantics/focus management, no visible keyboard focus, several contrast failures.
6. **Typography** — Geist loaded but Arial rendered; no type scale; ALL-CAPS truncated titles; emoji used as icons in headings, nav and buttons.
7. **Color semantics** — red/green/blue mean different things in different places (green = reward, favorite, save; red = title, danger, logout, PDF button); no status palette for PENDING / COMPLETED / SUSPECT FOUND.
8. **Wanted card** — the photo (main content) gets a green overlay when favorited, heart is the only affordance, no visible reward/subject/status hierarchy; placeholder from an external service.
9. **Stats page** — wrong unit (`%`), empty charts without empty state, squashed Y labels, hard-coded chart colors unrelated to the UI, recharts size warning.
10. **Mixed RO/EN copy and placeholder metadata** — inconsistent language in nav and controls, `lang="en"`, title "Create Next App".

## Outside UI scope (logic — flag only, not changed)

- `AuthGuard` treats `/` as public, so on the main page there is no SignalR connection and no `<Toaster/>`: `ReceiveActivity` (10 km alert) toasts don't show while the user is on `/`.
- `ReceiveUrgentAlert` plays `/sounds/alarm.mp3`, which doesn't exist.
- `ReportDetailsModal` calls hooks after an early `return` (lint error, can crash if `report` becomes null while mounted). Fixing it is a small restructure; it touches component structure, not behavior.
- `/stats` and `/reports` are hidden from USER only in the nav; no page-level role check (API enforces it).
