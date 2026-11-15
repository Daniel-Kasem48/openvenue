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

- [x] API tests: edit, reschedule with bookings, delete blocked by bookings, cancel-all.
- [x] Browser test: create → edit → delete an event.

## Implemented

- Added guarded event listing and edit/delete/cancel routes, using shared contract validation.
- Every event mutation locks the venue; rescheduling updates confirmed bookings transactionally.
- Migration 005 snapshots event titles and backfills existing bookings. Removal detaches history
  only after saving the title, and removes blocks; no reservation records are deleted.
- Events tab shows upcoming and past entries, sales, capacity minus blocks, edit/seat controls,
  protected deletion and explicit cancellation. Add/edit share a modal with independent dates.
- API coverage includes auth, cross-venue isolation, overlapping reschedule rollback, multiple
  confirmed bookings, cancellation, historical title-only edits and concurrent checkout/cancel.
- Browser coverage includes create/edit/delete/cancel and a 390px viewport. Shared dialogs now
  expose their visible title as an accessible name.

No refunds or notifications are performed. Reservation history remains in PostgreSQL; the
current Reservations screen still lists confirmed bookings only (expanded in task 10).
