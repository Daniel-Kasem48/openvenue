# OpenVenue

Open-source 2D/3D venue maps and reservations. Start from a restaurant, parking
building, cinema, or stadium template; edit the layout and let guests reserve a resource.
Fresh implementation by Daniel Kasem, inspired by the shared-scene approach in
Spantrek. No Spantrek code, credentials, or artwork is included.

## What works

- Restaurant: a furnished bistro with 12 round/rectangular tables, chairs, place settings, cocktail bar, reception and lounge.
- Parking: 32 spaces across two floors, EV chargers, accessible bays, security booth, entry barrier, ramps, stairs and staff vehicles.
- Cinema: 48 upholstered seats with armrests, screen, acoustic partitions, foyer, concessions and administrator-created showtimes.
- Stadium: 984 priced seats in four rising stands (12 rows north/east/west, 16 south), an editable football pitch, entrances, scoreboard and concessions.
- SVG map editor: drag, numeric position/size/rotation, labels, floors, resources.
- 3D opens by default: rounded furniture, detailed vehicles, shaded materials, orbit/zoom, camera fitting, selection and availability. Editing switches to 2D. Camera buttons offer overview, top and four side views; drag to rotate, Ctrl + drag (or right-drag) to pan, and pinch/scroll to zoom. Selection and review preserve the current camera; use a viewpoint button or Reset view to reframe.
- Fourteen editable scenery types: plants, counters, sofas, partitions, columns, doors, screens, stairs, ramps, cars, chargers, barriers, pitches and text/number labels. Position, size, height, rotation and color persist in the shared layout.
- Template creation, venue duplication, validated JSON import/export.
- Persistent PostgreSQL bookings with database-enforced overlap prevention.
- Administrator sign-in, reservation list and cancellation. Guest names are private.
- Responsive interface, keyboard-selectable 2D resources, 3D resource dropdown.

## Booking and management

Guests start in the venue directory, choose dates, a cinema screening or a stadium event, select a place in the default 3D view, review their choice, and receive a confirmation reference. Availability is checked again by the server when confirming; a conflict keeps the guest’s name so they can choose another place. Save the confirmation details before leaving the page; guest self-service cancellation and email receipts are not included.

Administrators sign in to access venue setup, layout editing, showtimes, and the reservations list directly. Existing venues and bookings are preserved when updating the app.

## Dynamic scene builder and pricing

Templates create independent starting JSON data with new IDs. Each venue’s complete scene is saved in PostgreSQL `venues.layout` (JSONB); TSX only renders object types. Start from a template or choose **Empty scene**. Add/remove objects and seats, resize the floor, move/rotate/resize objects, and save. Refreshing reads the saved scene, never reapplies the template. Import/export supports the same validated JSON format.

The stadium seed has 984 seats across four stands, with each successive row higher than the last, an editable pitch, entrances, scoreboard and concessions. The yellow South Stand is inspired by [BVB’s official stadium layout](https://www.bvb.de/de/en/signal-iduna-park/stadium-visit/stadium-plan.html); this is a compact seating template, not an exact replica or official seating chart. Seats use instanced rendering for the larger scene. The compact template includes 24 numbered block labels and matching seat sections. Labels remain readable in 3D, are editable in the object library, and block renames update their seat assignments. 2D seats show short row/seat IDs and a tight keyboard-focus outline. The pitch is an ordinary scene object; deleting it removes it from both views.

In **Edit layout → Reservation pricing**, choose free, one standard price, or different prices per seat/table/space. For individual prices, select a resource and edit its reservation price. Supported currencies: USD, EUR, GBP, AED, SAR and SYP. Prices are for the entire reservation, not per hour; a table price covers the whole party. Values are stored as integer minor units. The server computes the total, checks the guest’s quote, and snapshots each confirmed price/currency so later edits do not change historical reservations. No payment is collected.

Restaurant guests choose party size and a table with enough capacity. Cinema/stadium guests choose a seat count and toggle that many seats. If any seat conflicts, the entire checkout rolls back. Each seat can subsequently be cancelled individually by the administrator.

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
packages/contracts/   Zod validation, shared types and four template factories
tests/                Contract tests and real PostgreSQL integration tests
  browser/            Playwright end-to-end flows
```

React + TypeScript + Vite, NestJS + Express, PostgreSQL + `pg`, Zod,
Three.js + React Three Fiber. Models are original procedural geometry, with no remote models or texture downloads. One API process, one database, no Redis or queues.
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
# Browser tests build the production frontend and start an isolated API on port 3189.
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

- 3D uses stylized procedural models and needs WebGL; 2D remains available. Table models display up to eight chairs.
- Existing saved layouts remain compatible; create a new venue to use the richer furnished templates. Scenery is decorative and is not bookable.
- Availability refreshes every 15 seconds and is rechecked at booking time.
- One table or parking space per reservation; up to 20 seats per cinema/stadium checkout, saved atomically with one reference per seat. Reservations last at most seven days. No payments or ticket issuance.
- Cinema showtimes apply to the venue; no multi-auditorium scheduling in this MVP.
- No recurring reservations, customer accounts, calendar integrations or CAD imports.
- Up to 10 floors and 1,000 resources per floor. Large scenes are not load-tested.
- Admin list shows up to 500 confirmed reservations, including past ones.
- Initial schema is idempotent; future releases need explicit versioned migrations.

MIT licensed. Contributions welcome; run the checks above before submitting a PR.
