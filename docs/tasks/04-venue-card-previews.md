# 04 · Layout preview thumbnails on venue cards

## Problem

Directory cards show one big icon on a gradient, which looks like a placeholder.

## Goal

Each card shows a small, static top-down preview of the venue's first floor.

## Approach

- New component `apps/web/src/LayoutThumbnail.tsx`: read-only SVG drawn from `floor.resources` and
  `floor.objects` (rectangles/circles with each item's color and rotation), `viewBox` from floor
  width/depth, no interaction, no event handlers, `aria-hidden="true"`.
- Reuse geometry helpers from `Map2D.tsx` where possible; do not render `Map2D` itself (too heavy).
- Card shows: thumbnail (h-36, subtle `canvas` background), kind eyebrow, name, counts, and for
  seat venues the next event date if one exists.
- Must stay fast with 1,000+ seats (the stadium template has 984): render seats as simple `rect`s,
  memoize per `venue.revision`.

## Acceptance

- [x] Directory with 16 venues measured below 100ms locally (Chrome DevTools scripting metric; variability documented below).
- [x] Buttons keep the text `Book <name> →` / `Manage <name> →`.

## Implementation and validation

The thumbnail renders the first floor as one rect/ellipse per item, preserving authored color,
position, size and rotation. React memoization keys on venue ID and saved revision. It has no
interaction or focusable controls. The public venue listing adds optional `nextEventAt` metadata
using one grouped SQL query; it is null when there is no future event. Saving layouts preserves
that metadata, and adding a show refreshes it.

The browser benchmark uses 16 venues (four of each kind, including four stadiums with 984 seats
apiece). It measures Chrome DevTools `Performance.getMetrics` **ScriptDuration** between releasing
the venue-list response and the directory DOM becoming ready, including layout validation and
React rendering. Network waiting and startup bundle loading are outside this measurement.
Observed successful runs were **42.6, 45.9, 64.2 and 84.4 ms**. An initial run measured **109.0 ms**
on the concurrently busy host. This is local evidence, not a timing guarantee across hardware or
CPU contention. Ordinary browser tests log the metric and assert geometry/actions; explicitly
set `THUMBNAIL_BENCHMARK=1` to enforce the 100ms target on a controlled host:

```sh
THUMBNAIL_BENCHMARK=1 npm run test:e2e -- tests/browser/thumbnails.spec.ts -g 'directory previews'
```

No runtime dependencies, canvas renderers, event handlers or interactive map components were added.

Validation before integration: typecheck, formatting and production build passed; **53 unit/API
tests** and **23 browser tests** passed. The provisioned isolated PostgreSQL database on port
55439 substituted for Docker Compose. Existing large-chunk and Zod annotation build warnings
remain non-fatal.

After rebasing onto task 03, typecheck and formatting passed, and the combined menu/thumbnail
browser checks passed (**3 tests**, fresh production build). The explicit benchmark measured
**80.6 ms** with `THUMBNAIL_BENCHMARK=1`.
