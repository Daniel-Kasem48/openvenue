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

- [ ] Paint a whole block in one click; save; reload; prices persist and bookings charge them.
- [ ] Contracts tests for the price resolution order.
