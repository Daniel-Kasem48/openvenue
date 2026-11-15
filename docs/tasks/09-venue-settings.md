# 09 · Venue settings: rename and archive

## Problem

A venue can't be deleted, and its name only changes through the layout editor save.

## Scope

- Migration `006_venue_archive.sql`: `ALTER TABLE venues ADD COLUMN IF NOT EXISTS archived_at timestamptz`.
- `PATCH /venues/:id` (guarded): `{ name }` and/or `{ archived: boolean }`, with revision check.
- `GET /venues` hides archived venues for guests; admins get them with `?includeArchived=1`.
- Bookings of archived venues stay visible in Reservations.
- UI: **Venue settings** item in the venue overflow menu (task 03), modal with name field and an
  "Archive venue" danger zone (confirm by typing the venue name). Sidebar shows an "Archived"
  group for admins, collapsed by default, with Restore.

## Acceptance

- [x] API tests for rename, archive, restore, guest visibility.
- [x] Archived venues cannot receive new bookings (409).
