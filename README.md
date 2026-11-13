# OpenVenue

Open-source 2D/3D venue maps and reservations. Start from a restaurant, parking
building, or cinema template; edit the layout and let guests reserve a resource.
Fresh implementation by Daniel Kasem, inspired by the shared-scene approach in
Spantrek. No Spantrek code, credentials, or artwork is included.

## What works

- Restaurant: 12 tables with editable capacity; time-based reservations.
- Parking: 32 spaces across two floors, including accessible and EV spaces.
- Cinema: 48 seats, rows, screen, and administrator-created showtimes.
- SVG map editor: drag, numeric position/size/rotation, labels, floors, resources.
- Three.js viewer: the same layout, orbit, zoom, selection and availability.
- Template creation, venue duplication, validated JSON import/export.
- Persistent PostgreSQL bookings with database-enforced overlap prevention.
- Administrator sign-in, reservation list and cancellation. Guest names are private.
- Responsive interface, keyboard-selectable 2D resources, 3D resource dropdown.

## Quick start with Docker

Requires Docker Compose. From this repository:

```sh
cp .env.example .env
# Edit .env: set ADMIN_PASSWORD to a unique password of at least 16 characters.
docker compose up --build
```

Open **http://localhost:3188**. Three sample venues are seeded on first start.
Use **Admin sign in** with the password from `.env` to edit layouts and add venues.
Public visitors can view layouts and book without an account.

Data survives restarts in `postgres_data`. `docker compose down -v` deletes it.
Back up PostgreSQL before upgrading or changing database configuration.

## Development

Requires Node.js 24 (recommended), npm, and PostgreSQL 17 with `btree_gist` available.

```sh
cp .env.example .env
# Set ADMIN_PASSWORD in .env.
npm ci
docker compose up -d db
npm run dev
```

Web: **http://localhost:5188** · API: **http://localhost:3188/api/health**.
Vite proxies `/api`; do not configure cross-origin requests. Production builds
are served directly by NestJS, so a separate frontend server is unnecessary.

```sh
npm run build
npm start
```

All map coordinates are metres, measured from the upper-left corner; resource
positions describe their centres. Resource bounds include rotation. Import is
an explicit layout replacement with fresh identifiers. Resources with any
reservation history cannot be removed, including through import.

## Architecture

```text
apps/web/src/          React workspace, SVG editor and lazy-loaded 3D viewer
apps/api/src/          NestJS host, REST routes, auth and database transactions
apps/api/migrations/   Initial schema (idempotent, locked during initialization)
packages/contracts/   Zod validation, shared types and three template factories
tests/                Contract tests and real PostgreSQL integration tests
  browser/            Playwright end-to-end flows
```

React + TypeScript + Vite, NestJS + Express, PostgreSQL + `pg`, Zod,
Three.js + React Three Fiber. One API process, one database, no Redis or queues.
REST routes are grouped by venues, shows and bookings. Shared contracts validate
all writes. The scene stays JSONB; resources are indexed relationally for booking
integrity. `revision` prevents stale layout writes. Venue row locks serialize
layout mutations with bookings; a PostgreSQL GiST exclusion constraint independently
rejects overlapping confirmed bookings. Intervals use `[start, end)`; back-to-back
bookings are allowed. The API accepts ISO timestamps with offsets and stores
`timestamptz`. The UI displays the user's browser timezone.

Sessions are random, stored hashed in PostgreSQL, expire after eight hours, and
use HttpOnly/SameSite cookies. Login and booking endpoints are rate limited.
Public availability returns resource IDs only. Only admins can list or cancel bookings.

## Verification

Use a **dedicated test database**: integration tests create sample venues and bookings.
Without `TEST_DATABASE_URL`, `npm test` explicitly skips the database suite.

```sh
npm run format:check
npm run build
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/openvenue_test npm test
# Browser tests start their own servers on ports 5188 and 3188.
# Use the test password below only with a dedicated test database.
npx playwright install chromium
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/openvenue_test \
  ADMIN_PASSWORD=integration-password-123 npm run test:e2e
```

GitHub Actions runs formatting, build/typecheck, PostgreSQL integration tests and
Chromium browser tests. Browser tests use unique venue names and can be repeated.

## Hosting and limits

This MVP is a **single-operator application**. Every administrator controls every
venue. It is not tenant-isolated SaaS. Guest booking is intentionally account-free;
a public commercial deployment may need verification and additional abuse controls.

For Internet hosting, put the app behind an HTTPS reverse proxy and set
`PUBLIC_ORIGIN=https://your-domain.example` and `NODE_ENV=production`. Keep the app
and database ports private; Compose binds them to loopback. HTTPS origins enable
Secure session cookies. Requests from other browser origins are rejected. Rate
limits use the direct client address (a proxy shares its limit); forwarded headers
are intentionally not trusted by default. Configure deployment-specific trusted
proxy handling before high-volume use behind a proxy.

- 3D uses schematic geometry and needs WebGL; 2D remains available.
- Availability refreshes every 15 seconds and is rechecked at booking time.
- One resource per reservation, at most seven days; no payments or ticket issuance.
- Cinema showtimes apply to the venue; no multi-auditorium scheduling in this MVP.
- No recurring reservations, customer accounts, calendar integrations or CAD imports.
- Up to 10 floors and 1,000 resources per floor. Large scenes are not load-tested.
- Admin list shows up to 500 confirmed reservations, including past ones.
- Initial schema is idempotent; future releases need explicit versioned migrations.

MIT licensed. Contributions welcome; run the checks above before submitting a PR.
