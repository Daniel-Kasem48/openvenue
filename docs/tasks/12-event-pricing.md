# 12 · Per-event price overrides

**Depends on:** 08, 11.

## Problem

Prices belong to the layout, so a derby and a friendly match cost the same.

## Data (migration `007_show_pricing.sql`)

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

- [ ] API tests: override wins, multiplier fallback, booking rejects a stale expected total.
- [ ] Browser test: set +30% for one event, book a seat there and in another event, totals differ.
