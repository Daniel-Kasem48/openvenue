# 10 · Reservation details, status and export

## Problem

A reservation stores only a guest name. Operators can't contact the guest, mark arrivals, add notes
or export the list.

## Data (migration `007_booking_details.sql`)

- `bookings`: add `guest_email text`, `guest_phone text`, `notes text`,
  `checked_in_at timestamptz`, and extend the `status` check to
  `('confirmed','cancelled','no_show')`.
- The overlap exclusion constraint must stay limited to `status='confirmed'`.

## API

- Booking creation accepts optional `guestEmail` (validated) and `guestPhone`.
- `PATCH /bookings/:id`: notes, check-in / undo, mark no-show.
- `GET /bookings` gains filters: `venueId`, `showId`, `from`, `to`, `status`, `q` (name / email /
  reference), plus pagination (`limit`, `cursor`).
- `GET /bookings.csv` with the same filters (guarded), UTF-8 with BOM for Excel.

## UI (Reservations screen)

- Filter bar: venue, event, date range, status, search.
- Row click opens a side drawer: details, contact, notes, Check in / Mark no-show, Cancel.
- Status badge column. **Export CSV** button.
- Guest booking form gets optional email and phone fields.

## Constraints

- Keep `.booking-reference`, `getByRole('searchbox', { name: 'Search attendees' })` and the
  `Cancel reservation` aria-label working.
- Emails and phones are personal data: never log them, and exclude them from error messages.

## Acceptance

- [x] API tests for filters, PATCH transitions, CSV escaping (commas, quotes, newlines).
- [x] Browser test: book with email → find by email → check in → export contains the row.

## Implemented

- Migration 007 adds contact, note and check-in columns; status now includes no-show. The existing
  confirmed-only overlap exclusion remains unchanged, with a check-in/status consistency check.
- Optional validated contacts are stored privately; public booking responses omit contacts/notes.
- Guarded filters use literal substring search and bounded keyset pagination with full timestamp
  precision. Exports include every filtered row and handle BOM, CSV escaping and formula safety.
- The Reservations component provides filters, pagination, status badges, a details drawer,
  check-in/undo, notes, cancellation/no-show, and CSV download. Historical rows remain available.
- API and browser tests cover privacy, transitions, filtering/pagination, export escaping and
  contact capture → email search → check-in → export, plus mobile layout and no-show behavior.

Migration 006 belongs to venue archive support; 007 is intentionally used here. No email/SMS
notifications or restoration of terminal reservations are included.
