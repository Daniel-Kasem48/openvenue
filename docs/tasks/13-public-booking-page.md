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

- [x] Browser test books a seat through `/book/:id` without ever seeing admin UI.
- [x] Mobile 390px: whole flow usable, no horizontal scroll.

## Implementation

- URL routing uses the browser location directly; no router dependency was added. Public routes
  pin the requested active venue and optional event, skip admin-session restoration, and never
  render the workspace sidebar, breadcrumb or sign-in actions. Invalid links are terminal error
  views rather than falling back to a different venue.
- Shared progress, confirmation and reservation request/recovery logic now live in `booking/*`.
  Both public and workspace flows keep the same map, resource selection, price quote and form.
- Share/Embed actions preserve the existing menu keyboard behavior. A shared contract exposes
  only the trusted configured public origin; generated iframe URLs escape ampersands for HTML.
- Helmet permits HTTP(S) frame ancestors only on public booking document paths. Admin/API framing
  and CSRF protections are unchanged. Embedded pages hide the hero/footer, including when an admin
  cookie is present.
- Tests cover route validation, HTTP(S) sharing origins, framing headers, a real cross-origin
  iframe on two local origins, admin-cookie isolation, mobile seat checkout, unavailable links,
  copied URLs and embed snippets.

The public-to-loopback iframe fixture was rejected by Chromium's Local Network Access policy;
using two local origins verifies cross-origin framing without disabling browser security.

## Validation

- API and browser regressions were observed failing before implementation (framing policy,
  public shell, invalid links and missing share action).
- **69 unit/API tests passed**, with no skips, against the isolated local PostgreSQL database on
  port 55439 (substituting for Docker Compose).
- **36 browser tests passed**, including public booking, cross-origin framing, existing workspace
  flows, stale event recovery, menus, mobile layout and camera checks.
- Typecheck, formatting and production build passed. The build ran through Playwright global setup;
  existing bundle-size and Zod annotation warnings remain non-fatal.
- No dependency or router library was added. No publication was performed.
