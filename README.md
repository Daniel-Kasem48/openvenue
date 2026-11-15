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
- 3D opens by default: rounded furniture, detailed vehicles, soft directional shadows, neutral floors with gently fading edges and a striped stadium pitch, orbit/zoom, camera fitting, selection and availability. Cinema retains its dark theme; lighting is procedural and needs no external environment downloads. Editing switches to 2D. Camera buttons offer overview, top and four side views; drag to rotate, Ctrl + drag (or right-drag) to pan, and pinch/scroll to zoom. Selection and review preserve the current camera; use a viewpoint button or Reset view to reframe.
- Fourteen editable scenery types: plants, counters, sofas, partitions, columns, doors, screens, stairs, ramps, cars, chargers, barriers, pitches and text/number labels. Position, size, height, rotation and color persist in the shared layout.
- Template creation, venue duplication, validated JSON import/export.
- Persistent PostgreSQL bookings with database-enforced overlap prevention.
- Administrator sign-in, reservation list and cancellation. Guest names are private.
- Responsive interface, keyboard-selectable 2D resources, 3D resource dropdown, and consistent decorative SVG icons with accessible control names.

## Booking and management

Guests start in the venue directory, choose dates, a cinema screening or a stadium event, select a place in the default 3D view, review their choice, and receive a confirmation reference. Availability is checked again by the server when confirming; a conflict keeps the guest’s name so they can choose another place. Save the confirmation details before leaving the page; guest self-service cancellation and email receipts are not included.

Administrators land on Overview after signing in or restoring a session, with New venue in the sidebar and access to venue setup, layout editing, showtimes, and reservations. Venue workspaces use a compact header and a viewport-sized map; Reservations has its own heading. Existing venues and bookings are preserved when updating the app.

## Operator overview

Overview reports Today, Next 7 days, or Next 30 days in UTC, with reservation count,
seats/places booked (including table party sizes), and expected revenue separated by currency.
Revenue uses each confirmed reservation's saved price and is **not collected**. A booking
that overlaps the selected half-open interval counts once, including its full price; cancelled
reservations are excluded. Recent reservations are the last ten created within that selection.
Use Refresh overview to retrieve changes made while the screen is open.

Event occupancy sums confirmed seats against the number of layout resources minus blocked
seats for each event overlapping the range. Table/parking utilization counts distinct booked
resources per UTC day against resource count × reporting days; it is not hourly occupancy or
restaurant chair occupancy. These two percentages stay separate. A zero denominator displays
an em dash. Upcoming events include ongoing events and link directly to their seat controls.
Venue cards show the next ongoing/upcoming event, or today's UTC resource utilization.

`GET /api/overview?from=<ISO timestamp>&to=<ISO timestamp>` requires an admin session and
accepts positive ranges up to 366 days. Aggregates run in one SQL statement, with booking and
block counts computed independently. For custom API ranges, daily buckets start at `from`
and the last bucket may be partial. Values describe the current saved layout; capacity history
is not snapshotted. The dashboard is not a payment ledger or a measure of hours occupied.

## Dynamic scene builder and pricing

Templates create independent starting JSON data with new IDs. Each venue’s complete scene is saved in PostgreSQL `venues.layout` (JSONB); TSX only renders object types. Start from a template or choose **Empty scene**. Add/remove objects and seats, resize the floor, move/rotate/resize objects, and save. Refreshing reads the saved scene, never reapplies the template. Import/export supports the same validated JSON format.

The stadium seed has 984 seats across four stands, with each successive row higher than the last, an editable pitch, entrances, scoreboard and concessions. The yellow South Stand is inspired by [BVB’s official stadium layout](https://www.bvb.de/de/en/signal-iduna-park/stadium-visit/stadium-plan.html); this is a compact seating template, not an exact replica or official seating chart. Seats use instanced rendering for the larger scene. The compact template includes 24 numbered block labels and matching seat sections. Labels remain readable in 3D, are editable in the object library, and block renames update their seat assignments. 2D seats show short row/seat IDs and a tight keyboard-focus outline. The pitch is an ordinary scene object; deleting it removes it from both views.

In **Edit layout → Reservation pricing**, choose free, one standard price, or different prices per seat/table/space. For individual prices, select a resource and edit its reservation price. Supported currencies: USD, EUR, GBP, AED, SAR and SYP. Prices are for the entire reservation, not per hour; a table price covers the whole party. Values are stored as integer minor units. The server computes the total, checks the guest’s quote, and snapshots each confirmed price/currency so later edits do not change historical reservations. No payment is collected.

Restaurant guests choose party size and a table with enough capacity. Cinema/stadium guests choose a seat count and toggle that many seats. If any seat conflicts, the entire checkout rolls back. Each seat can subsequently be cancelled individually by the administrator.

## Event management

Cinema and stadium venue panels have **Map** and **Events** tabs. Events lists upcoming and
past events with confirmed seats sold, available capacity and blocked seats. Add or edit an
event using the shared form; event dates are independent of the guest booking date draft.
Use **Manage seats** to open the chosen event's blocks and reservations on the map.

Rescheduling moves the event and every confirmed reservation together. If any moved seat
would overlap another reservation, the entire change is rejected. Cancelled reservations retain
their original dates. Title-only edits are allowed for started events; a changed schedule must
start in the future and last at most seven days.

**Delete** is available only without confirmed reservations. **Cancel event** is a separate,
explicit action that confirms how many reservations will be cancelled, then removes the event
and its blocks. Both actions retain all reservation records, prices, seat locations and dates.
Each seat booking snapshots its event title; existing bookings are backfilled during upgrade.
Deleting an event detaches the event link without deleting history. Renaming an event does not
rewrite the title originally booked. Cancellation does not issue refunds or send notifications.

Event creation, edits, deletion and cancellation share the venue transaction lock with checkout
and blocking. The operator event list is admin-only; the public show list remains upcoming only.

## Seat rows and event blocks

Stadium seats have explicit row letters and seat numbers. Row A starts nearest the pitch in the template; tickets and booking summaries identify the block, row and seat. Existing layouts retain their labels and derive row/seat information from names such as `North A1`. New confirmed reservations save the seat location as well as its price, so later layout edits do not rewrite those details.

In **Edit layout**, select a seat to edit its row and seat number. With individual pricing enabled, **Apply price to this row** updates seats in the same block and row on that floor. Save the layout to publish prices; existing reservations keep their original amounts. This changes venue pricing, not a single event's pricing.

For an upcoming event, choose **Manage event seats**. Select individual seats, an entire row within a block, or a whole block on either map. Enter a staff-only reason and choose **Block selected seats**. Guests see those seats as unavailable, with no access to the reason. **Release selected seats** returns blocked seats to availability. Blocks apply only to the chosen event and do not create fake customer bookings. If any selected seat is already booked, the entire block request is rejected. Booking and blocking share the venue transaction lock so only one can succeed in a race. Blocks are manual; there are no automatic temporary holds or payment collection.

Blocks on ended events do not prevent removing an otherwise unused seat. Reservation history still protects seats from deletion.

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
# Browser tests build once, then start a fresh API on an ephemeral port for each test.
npx playwright install chromium
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/openvenue_test npm run test:e2e
```

GitHub Actions runs formatting, build/typecheck, PostgreSQL integration tests and
Chromium browser tests. Browser tests use unique venue names and can be repeated.
The browser fixture preserves existing database rows, isolates in-memory rate limits between
tests, and closes each API and its database pool during teardown. Production rate limits remain
enabled, including in tests. `TEST_DATABASE_URL` takes precedence over `DATABASE_URL` (also
accepted for compatibility); `.env` is loaded automatically. The fixture uses a test-only admin
password and never calls the optional scene-generation provider.

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

## Generate scenes with Claude

Set `ANTHROPIC_API_KEY` in the server's untracked `.env`. Optionally set
`ANTHROPIC_MODEL` (default `claude-haiku-4-5-20251001`, which supports structured JSON
outputs). For Docker, apply environment changes with `docker compose up -d app`.
Never put the key in a `VITE_*` variable or commit it.

Sign in, open a venue of the intended category, and choose **Generate with Claude**.
A short Haiku validation call checks the requested category and explicit floor/place
counts before generating geometry. Mismatched categories are rejected with guidance
to open or create the correct venue, without a full generation call. Describe floor dimensions,
places, aisles, furnishings, and prices. Review the 3D preview, choose **Use this
layout**, adjust it in the editor, then **Save layout**. Applying a generated scene
replaces the whole current draft, including every floor; previewing does not save
anything. For an existing venue with reservation history, generate into a new venue
instead: replacing booked resources is protected by database constraints.

Only the supplied description and venue category are sent to Anthropic—not guest
records or existing bookings. Calls use the workspace's API credits, are limited to
five requests per 15 minutes per client address, and have a shared 90-second timeout.
Invalid generated layouts receive one automatic correction attempt with Claude
(additional API usage); both attempts are validated before anything is returned.
Closing the dialog cancels the browser request but may not stop provider billing.
Output is validated on the server, expands repeated rows into normal editable
resources, and uses the existing PostgreSQL layout storage when saved. Invalid,
truncated, refused, or off-floor output is rejected without changing saved data.
Generated geometry is a starting point, not an accessibility or building-code assessment.

Provider reference: [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Venue actions: Edit layout is the main action in view mode; Duplicate and Generate with Claude
are in the keyboard-accessible More venue actions menu. While editing, Save layout is enabled
only after changes, with an unsaved indicator beside the venue name.

Directory cards preview the first floor with lightweight, noninteractive SVG geometry and show
next event dates for cinema and stadium venues. Previews refresh after saved layout changes;
booking and management buttons retain their existing labels. The venue listing includes optional
`nextEventAt` metadata (null when no future event exists), computed in one grouped database query.
The sidebar groups venues by kind and shows name/kind search when more than six venues exist.
Long names keep their full accessible name and tooltip; selecting a venue clears the search and
brings that venue into view.

Guest checkout checks the event dates reviewed in the browser. If an operator reschedules the
event before confirmation, the guest sees the updated schedule and must confirm again.
