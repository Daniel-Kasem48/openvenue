# 13 · Public guest booking page

## Problem

Guests book inside the same admin-style shell (sidebar, "Admin sign in", workspace breadcrumb).
Operators have no link to share or embed on their own website.

## Goal

A clean, public booking flow per venue at `/book/:venueId` (and `/book/:venueId?show=<id>`).

## Scope

- Client-side routing (add a tiny router or use the URL directly; justify any dependency).
- Layout: no sidebar; venue name and hero, steps Time → Place → Review → Done, map, price
  summary, confirmation with reference. Reuse `Map2D` / `Map3D` and the existing booking logic,
  extracted from `App.tsx` into `apps/web/src/booking/*` components.
- Operator side: **Share booking link** action (copy URL) and an **Embed** snippet
  (`<iframe src=".../book/:id?embed=1">`, where `embed=1` hides the page chrome).
- Set the `PUBLIC_ORIGIN` / CSP / frame-ancestors headers in the API so embedding is allowed only
  for `/book/*`.

## Acceptance

- [ ] Browser test books a seat through `/book/:id` without ever seeing admin UI.
- [ ] Mobile 390px: whole flow usable, no horizontal scroll.
