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

## Implementation findings

- The shared API exhausted its ten-login limit: requests 1–10 returned 200, request 11 returned 429. Browser contexts were already isolated.
- Each browser test now starts the existing application factory on its own ephemeral port and closes the API and database pool afterward. Production rate limits remain enabled; no reset endpoint or production test flag was added.
- The database is retained across tests and suite runs. `TEST_DATABASE_URL` is preferred, with `DATABASE_URL` accepted for compatibility.
- A separate camera-test failure reproduced three times: asynchronous canvas sizing put the drag centre below the viewport. A Playwright hover action now ensures the canvas is actionable before reading gesture coordinates. Camera assertions are unchanged.
- Two regression tests prove the login limit still applies inside a test and does not leak to the next test. The second test failed with 429 before the harness fix.

## Verification

Completed on 2026-11-15 against a populated dedicated PostgreSQL database (107 venues before investigation; no reset or truncation):

- Three consecutive full browser-suite runs passed: 19/19, 19/19, 19/19 (17 existing scenarios on the remote main branch plus two new isolation regressions).
- Camera regression passed three consecutive targeted runs.
- All 42 unit/API tests passed, with database tests enabled.
- TypeScript, formatting and production build passed.
- Independent review found no substantive issues.

The task branch is based on remote `main`; the additional local event-seat test and uncommitted Tailwind restyle are not bundled into this PR.
