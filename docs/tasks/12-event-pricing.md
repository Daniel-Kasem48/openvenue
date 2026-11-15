# 12 · Per-event price overrides

**Depends on:** 08, 11.

## Problem

Prices belong to the layout, so a derby and a friendly match cost the same.

## Data (migration `008_show_pricing.sql`)

- `show_prices (show_id uuid REFERENCES shows(id), tier_id text, amount integer, PRIMARY KEY(show_id, tier_id))`
- Optional `shows.price_multiplier numeric(4,2)` (e.g. 1.30) applied when no tier override exists.

## API

- `GET/PUT /venues/:id/shows/:showId/pricing`.
- Availability and booking endpoints price seats for the given show, using the order:
  show tier override → multiplier × layout tier price → layout price.
- `expectedTotal` check on booking uses the event price.

## UI

- In the event's **Manage seats** view: a "Pricing for this event" card listing tiers with base
  price, override field and a multiplier shortcut (+10%, +25%, +50%).
- Guest flow shows the event price.

## Acceptance

- [x] API tests: override wins, multiplier fallback, booking rejects a stale expected total.
- [x] Browser test: set +30% for one event, book a seat there and in another event, totals differ.

## Implementation

Migration 008 adds a default multiplier of 1 and event tier overrides; 007 is reserved by the
reservation-details task. The guarded pricing endpoints validate tier ownership, multiplier
precision, duplicate tiers and effective price limits. Updates take the venue lock used by
bookings and event changes, and replace overrides transactionally. Event deletion/cancellation
clears pricing rows before deleting the event while preserving booking price snapshots.

The shared `reservationPrice(layout, resource, eventPricing?)` resolver applies a tier override
(including zero) in tiers mode, otherwise multiplies the normal venue price. It converts the
multiplier to integer hundredths and rounds **each seat** before summing the party. Configured
and effective amounts remain within the existing per-seat bound. Availability quotes and booking
validation use the same resolver; the booking insert reuses the exact validated per-seat values.

The event management card includes base tier prices, optional overrides, +10%/+25%/+50% shortcuts
and a custom multiplier input. Guest seat lists, summaries and price legends use the public
availability quote. Quote readiness is keyed to venue, event, interval and layout revision, so
changing the event cannot reuse a previous event's ready state. Event price saves invalidate the
current quote. No new runtime dependency was added.

## Verification

Tests were observed failing before the resolver, API routes and pricing card were implemented.
The browser test also caught and covers the price legend using base rather than event prices.

- Contract tests: override priority, explicit zero, multiplier precision/bounds, per-seat rounding
  (two 5-cent seats × 1.30 total 14 cents), non-tier/free mode and overflow rejection.
- API tests: GET/PUT authorization, venue ownership, invalid tiers, transactional validation,
  authoritative availability prices, stale total rejection, independent event prices, immutable
  booking snapshots, and deleting/cancelling events with pricing rows.
- Browser: save custom 1.30, verify guest summary and legend, book the same seat at $13 and $10
  for two different events, and delay a new event quote to check checkout readiness.

The provisioned isolated PostgreSQL database on port 55439 substitutes for Docker Compose.

Final checks: 78 unit/API tests and all 36 browser tests passed. TypeScript, production build,
Prettier and `git diff --check` passed. Browser coverage includes the existing camera, venue
settings, archive, event-management, tier-painting and seat-blocking workflows.
