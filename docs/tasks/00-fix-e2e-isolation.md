# 00 · Make the browser test suite pass in a full run

## Problem

`npm run test:e2e` runs 18 tests; **8 fail when the whole suite runs**, but **each passes when run
alone** (verified on `main` before the Tailwind restyle, so this is pre-existing):

- camera presets and touch gestures change the 3D viewpoint (`venue.spec.ts:392`)
- selection and review preserve a manually panned and zoomed camera (`:434`)
- stadium block numbers persist and keyboard focus stays close to the seat (`:524`)
- admin sign-in supports retry, hides dismissed credentials and opens management (`:587`)
- layout studio keeps the canvas stable and finds editable items by name (`:615`)
- operator drags objects in both views and persists movement and deletion (`:659`)
- generated scenes are previewed before applying and saved only on explicit save (`:743`)
- operator prices a row and blocks and releases it for one event (`:797`)

Typical errors: timeouts waiting for `getByRole('button', { name: 'New venue' })` or for a freshly
created venue inside `.venue-list`. Likely causes: state leaking between tests (admin session,
`inert` shell while `working`), and the shared database accumulating venues across runs so the
venue list grows without bound.

## Goal

The full suite passes reliably, three runs in a row, against a database that already contains data
from earlier runs.

## Approach (suggested)

- Find the first failing test in a full run and the state it inherits (`--reporter=line`, traces).
- Give each test a clean starting point: new browser context, explicit sign-in/sign-out, and do not
  depend on list position.
- Add a test-only reset (e.g. a script that truncates tables before the suite, wired as Playwright
  `globalSetup`) **or** make tests independent of existing rows. Never expose a reset endpoint in
  production builds.

## Acceptance

- [x] `npm run test:e2e` passes 3 times in a row without manually cleaning the DB.
- [x] No production code path added only for tests (setup scripts are fine).

## Completed — 2026-11-15

Merged PR: https://github.com/Daniel-Kasem48/openvenue/pull/1 (commit `986ae62`; running locally). The test-only fix is also applied to this checkout; the existing application/restyle changes are preserved.

The root cause was the shared API's ten-login allowance. Browser tests now use a separate application instance and ephemeral port per test while preserving database contents and production rate limits. Two regressions verify both limit enforcement and isolation. Camera gestures now wait for an actionable canvas, and the pricing-panel test supports the restyle's default-open panel and mode suffix.

Verification: 20/20 browser tests passed in three consecutive full runs against an isolated snapshot of this checkout and the same populated database. No database reset or truncation. All 50 unit/API tests, TypeScript and formatting passed in the active checkout; production builds passed. The remote-main PR base also passed three 19-test full runs, all 42 unit/API tests, and independent review.

Final CI caught a scene-preview test reading venues before creation finished; it now waits for the new venue heading. Three targeted repeats and both final CI runs passed before merging. Docker app and database are healthy; the live homepage and venue directory were checked at http://localhost:3188.
