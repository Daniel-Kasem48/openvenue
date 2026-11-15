# NestJS Modules Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all backend HTTP business routes into NestJS modules without changing their behavior.
**Architecture:** Injectable services own business operations; controllers validate shared contracts and shape HTTP responses. Shared database, auth guards and exception filter preserve existing safety properties.
**Tech Stack:** Existing NestJS 11, Express adapter, PostgreSQL, Zod, TypeScript/tsx.
**Spec:** docs/superpowers/specs/2026-11-15-nest-modules-design.md

## Global constraints

No new dependency, schema migration, remote push or production connection. Keep createApp(config) for tests. Restart only the dedicated local test PostgreSQL for verification and stop it afterward.

## Review focus

- Public booking response must not expose contacts or notes.
- Every role restriction, bootstrap transition and per-app rate limit remains effective.
- Venue, event and booking operations retain transaction boundaries and lock order.
- Validation, malformed JSON and unknown API paths retain safe status/message behavior.
- Application shutdown and failed initialization release database pools.

## Tasks

- [x] Add database/config lifecycle, guards, UUID validation and exception handling.
- [x] Move auth/accounts, venue, event, booking, overview and scene-generation routes into controllers and services.
- [x] Replace bootstrap router with AppModule and retain static assets/security middleware.
- [x] Verify existing unit/API and browser coverage, add lifecycle/routing regression checks.
- [x] Review final diff, document architecture and ticketing integration findings, update primary local checkout.

## Verification

104 unit/API tests passed. Production build and typecheck passed. Browser suite: 40 passed initially; the remaining action-menu test issued an API request before sign-in completed. Added a wait for the authenticated New venue button and verified that test passes. All 41 browser cases are covered across these runs. The browser fixture starts the actual API via tsx in an isolated child process because Playwright’s transform does not support Nest parameter decorators.

Review preserved transaction locks, role checks, privacy and audit behavior; regression coverage checks initialization cleanup, guard ordering, malformed requests and API fallback routing. No dependencies or migrations added. Ticketing provider credentials and production access were not tested.
