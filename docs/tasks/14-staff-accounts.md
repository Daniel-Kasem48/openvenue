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

- [x] API tests: each role against each guarded route (allowed / 403).
- [x] Existing single-password installs keep working after upgrade.

## Implementation

Migration 009 adds users, session ownership and audit records. Bootstrap owner creation and
last-owner changes are serialized. Owner creation converts only the requesting legacy session;
other shared-password sessions stop working. API role checks use the current account on every
request. Staff receive a reservation-only screen with check-in/undo and read/export access.

Regression tests cover concurrent bootstrap, concurrent last-owner removal attempts, each role's
route access, disabled/demoted sessions, staff field permissions, audit attribution, and rollback
when an audit insert fails. Browser verification covers owner setup, staff creation and check-in.
