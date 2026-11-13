# OpenVenue Implementation Plan

> Execute inline with superpowers:executing-plans; fresh final code review.

**Goal:** deliver a working self-hosted venue editor and reservation MVP.
**Architecture:** apps/web and apps/api consume packages/contracts. PostgreSQL is the source of availability and booking conflicts. One shared scene powers SVG/Three.js.
**Tech Stack:** React, Vite, NestJS, PostgreSQL, Zod, Three.js, React Three Fiber, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-11-14-openvenue.md

## Global Constraints

- Fresh MIT code; no Spantrek code, assets, or credentials.
- Restaurant, parking and cinema templates all editable and duplicable.
- Public APIs expose availability but never guest names.
- Database enforces reservation overlap; API validates all mutations.

## Review Focus

- Simultaneous bookings: exactly one succeeds.
- Stale layout writes: conflict instead of lost update.
- Invalid geometry and hostile imports: reject before persistence.
- Booking history: layout edits cannot delete booked resources.
- Public routes: no admin data or mutation access without authentication.

## Task 1: contracts and templates

- [x] Write contract tests for invalid bounds, duplicate IDs, empty names, all three templates and independent clones. Run RED.
- [x] Implement packages/contracts/src/index.ts and templates.ts; run Vitest GREEN.
- [x] Commit contracts and template catalog.

## Task 2: API and persistence

- [x] Write tests against a real PostgreSQL-backed server: authorization, invalid requests, availability, concurrent booking, cancellation, show times, stale saves and deletion protection. Run RED.
- [x] Implement apps/api/src/database.ts, auth.ts, app.ts and main.ts, migrations and seeds. Run tests GREEN.
- [x] Commit API with migrations and integration tests.

## Task 3: map workspace

- [x] Add browser flows for template creation, 2D/3D switching, editing, save/reload, booking conflict, cancellation. Run RED.
- [x] Implement apps/web/src: API client, App, Map2D, Map3D and styles. Shared contracts determine geometry and request shape.
- [x] Run browser tests and production builds; commit UI and tests.

## Task 4: release

- [x] Add Docker Compose, environment example, README, CI and MIT license.
- [x] Independent code review; fix substantive findings with regression tests.
- [x] Run full tests/typecheck/build, inspect tracked files for secrets, commit and push public GitHub repository.

## Verification record

Initial contract tests failed before implementation, then passed. API integration tests run against isolated PostgreSQL 17; browser tests exercise real API persistence and rendering. Independent review reproduced and fixed three defects: case-normalized UUIDs, atomic resource ownership checks, and in-flight edit locking. Regression tests were observed failing before fixes.

Deployment decision: self-host the agreed NestJS/PostgreSQL stack with Docker; no separate Sites-hosted frontend. The standalone repository supplies isolation from the existing Spantrek repositories.

Remaining release steps are tracked in Git history and README; final suite and push verified by the implementing session.
