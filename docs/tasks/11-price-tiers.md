# 11 · Price tiers and price painting

## Problem

Setting prices is the operator's most frequent job. Today you click one seat, type a price, and
optionally "Apply price to this row". A 984-seat stadium takes hundreds of clicks, and the map
doesn't show what costs what.

## Layout model (`packages/contracts`)

- `layout.pricing` gains a mode `'tiers'` and `tiers: { id, name, color, amount }[]` (max 12).
- `resource.tierId?: string`. `reservationPrice()` resolves: tier amount → resource price →
  uniform amount. Older layouts without tiers must parse unchanged (add a contracts test).

## UI

- Inspector **Reservation pricing** section in tiers mode: list of tiers (name, colour swatch,
  amount, seat count, potential revenue), add / edit / delete.
- **Paint mode**: pick a tier, then click seats on the 2D or 3D map; scope selector
  Seat / Row / Block reuses the existing selection-scope logic in `App.tsx` (`selectPlace`).
- Map colouring toggle "Colour by price" in the toolbar: seats use their tier colour; the legend
  shows tiers.
- Totals footer: assigned / unassigned seats, potential revenue at full sale.

## Constraints

- No API route changes needed: tiers live in the layout JSON saved with `PUT /venues/:id`.
- Server-side price validation at booking time must use the same `reservationPrice()`.

## Acceptance

- [x] Paint a whole block in one click; save; reload; prices persist and bookings charge them.
- [x] Contracts tests for the price resolution order.

## Implementation

- Added up to 12 validated tiers in the existing layout JSON, with unique UUIDs, names,
  six-digit hex colors and integer minor-unit amounts. Invalid/dangling assignments are rejected.
- `reservationPrice()` resolves tier → explicit resource price → standard price only in tiers
  mode. Both explicit tier zero and resource zero remain free. Resource prices are optional so
  a missing value can reach the standard fallback; legacy per-resource pricing still defaults
  missing prices to zero. No API route or migration was needed.
- The inspector supports adding, editing and deleting tiers, assigned counts, per-tier potential
  revenue and totals across all floors. Deleting a tier clears its assignments across the layout.
- Paint mode reuses the existing Seat / Row / Block selection semantics. It assigns or clears
  tiers on either map without dragging or booking places. Changes remain a draft until Save layout.
- Colour by price adds a tier legend in desktop and mobile layouts. Selected, blocked and
  reserved states keep priority in 2D, ordinary 3D and instanced stadium rendering. Seat labels
  retain a light outline against user-chosen tier colors.

## Validation

Tests were added before the schema/resolver, painting/deletion and color changes and observed
failing for the missing behavior. The browser workflow was also observed failing before the tiers
UI was added.

- `tests/price-tiers.test.ts`: price precedence, explicit zero, legacy layouts and tier validation.
- `tests/tier-painting.test.ts`: seat/row/block scope, unchanged coordinates, clearing assignments,
  and deleting a tier across multiple floors without losing fallback prices.
- `tests/tier-rendering.test.ts`: tier colors and selection/blocked/reserved color priority.
- `tests/price-tiers-api.test.ts`: saved zero-tier/resource prices, standard fallback, stale-quote
  rejection and immutable booking price snapshots after tier edits.
- `tests/browser/price-tiers.spec.ts`: paint a stadium block, save/reload, book at the tier price,
  delete the tier; real WebGL 3D painting; drag safety in both maps; no mobile horizontal overflow.

The isolated local PostgreSQL database on port 55439 substitutes for Docker Compose during
validation. No dependency was added. Publication remains pending the parent workflow.

Validation results: **58 unit/API tests passed**, **22 browser tests passed**, typecheck and
formatting passed. The production build passed in browser global setup; existing bundle-size and
Zod annotation warnings remain non-fatal.
