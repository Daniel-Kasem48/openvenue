# 14 · Staff accounts and roles

## Problem

There is a single shared `ADMIN_PASSWORD`. No individual accounts, no audit trail, no read-only
staff (e.g. door staff checking guests in).

## Scope

- Migration: `users (id, email unique, name, password_hash, role CHECK (role IN ('owner','manager','staff')), created_at, disabled_at)`;
  `sessions` gains `user_id`.
- Password hashing with `node:crypto` scrypt (no new dependency). Rate-limit login (keep the
  existing behaviour).
- Bootstrap: if no users exist, `ADMIN_PASSWORD` still works and prompts creating the first owner.
- Roles: **owner** everything incl. users; **manager** venues, layouts, pricing, events,
  reservations; **staff** read reservations + check-in only.
- Server-side permission checks on every guarded route (not only hidden buttons).
- UI: **Team** screen for owners (invite by creating a user with a temporary password, change
  role, disable). Profile menu shows the user's name and role.
- `audit_log (id, user_id, action, entity, entity_id, at)` written for price changes, layout saves,
  cancellations.

## Acceptance

- [ ] API tests: each role against each guarded route (allowed / 403).
- [ ] Existing single-password installs keep working after upgrade.
