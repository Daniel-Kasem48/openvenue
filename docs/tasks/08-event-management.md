# 08 · Event management

## Problem

Events (`shows`) can only be **added** via a small modal. There is no list, no edit, no reschedule,
no delete.

## API (`apps/api/src/app.ts`)

- `PUT /venues/:id/shows/:showId`: change title / start / end. If confirmed bookings exist,
  rescheduling also moves their `starts_at` / `ends_at` in the same transaction; reject if that
  would violate the booking overlap constraint.
- `DELETE /venues/:id/shows/:showId`: allowed only when there are no confirmed bookings; otherwise
  409 with a clear message. (Cancelling an event with bookings is a separate, explicit action:
  `POST /venues/:id/shows/:showId/cancel` cancels all its bookings, then deletes the event.)
- Validation via zod in contracts.

## UI

- Seat venues get an **Events** tab inside the venue panel: table of events (title, date, sold /
  capacity, blocked) with Edit, Manage seats and Delete actions.
- Edit uses the same modal as add (title "Edit event" / "Edit showtime").
- Confirm dialogs for delete and cancel state how many bookings are affected.

## Acceptance

- [ ] API tests: edit, reschedule with bookings, delete blocked by bookings, cancel-all.
- [ ] Browser test: create → edit → delete an event.
