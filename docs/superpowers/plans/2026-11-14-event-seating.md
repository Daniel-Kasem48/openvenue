# Event seating implementation plan

Goal: explicit seat locations, visible row letters, row pricing and event-only seat blocks.
Architecture: extend existing resource data with backward-compatible row/seat fields; use a separate event-seat-block table protected by the venue transaction lock shared with bookings. Reuse map controls and layout editing.
Scope: manual blocks, private staff reasons, no checkout payment changes or expiring holds.

- [x] Add tests for legacy seat-label parsing and canonical location formatting, implement metadata and row markers in both maps.
- [x] Test event block lifecycle, private reasons, cross-event isolation, booked-seat rejection, and booking/block race; implement migration and protected API.
- [x] Add operator selection of seat/row/block; blocking and release UI; row price action in layout editor; canonical locations through booking and confirmations.
- [x] Verify unit/API/browser tests, responsive layout and build; obtain final independent review and integrate into main workspace.

Compatibility: keep resource label identifiers and accessible Select labels working; price snapshots remain unchanged. Block all requested seats atomically or reject the entire operation. Existing bookings are never cancelled by blocking. No private reasons in public availability.

Verification: 50 unit/API tests passed against isolated PostgreSQL. All 18 browser scenarios passed across fresh-server batches; a single uninterrupted run exceeded the existing 10-logins-per-15-minutes limit. Production limits remain unchanged. Build, TypeScript and formatting checks passed. Desktop 2D/3D and 390px mobile screenshots inspected.

Independent review: fixed all three findings with regressions: canonical-address validation now includes legacy labels; staff block reasons and release controls refresh with availability; blocks on ended events no longer prevent deleting never-booked seats. Booking history continues to prevent deletion.

Delivery: integrate locally into main; no remote push or deployment. Pricing remains venue-wide and reservations do not collect payment.
