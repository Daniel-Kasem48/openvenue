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

- [ ] Directory with 16 venues renders in < 100ms of scripting time (Chrome performance panel).
- [ ] Buttons keep the text `Book <name> →` / `Manage <name> →`.
