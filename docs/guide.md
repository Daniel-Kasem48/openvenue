# OpenVenue guide

[Back to README](../README.md)

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
- Individual owner, manager and staff accounts, private reservation details, check-in and cancellation.
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

In **Edit layout → Reservation pricing**, choose free, one standard price, different prices per seat/table/space, or **Price tiers**. For individual prices, select a resource and edit its reservation price. Supported currencies: USD, EUR, GBP, AED, SAR and SYP. Prices are for the entire reservation, not per hour; a table price covers the whole party. Values are stored as integer minor units. The server computes the total, checks the guest’s quote, and snapshots each confirmed price/currency so later edits do not change historical reservations. No payment is collected.

Restaurant guests choose party size and a table with enough capacity. Cinema/stadium guests choose a seat count and toggle that many seats. If any seat conflicts, the entire checkout rolls back. Each seat can subsequently be cancelled individually by the administrator.

## Reservation operations

Guests may supply an optional email address and phone number with their reservation. Contact
fields and staff notes are private: only authenticated operator views and exports contain them;
public confirmations and availability responses exclude them. No messages are sent automatically.

Reservations supports venue, event, date range, status and name/email/reference filters. Search
matches literal text, including `%` and `_`. Date filters include reservations overlapping the
selected days in the browser's timezone. Choose a venue to filter by its event. Archived venue
history remains searchable. Use **Load more reservations** to continue through the results.

Click a guest name or row for the details drawer. Operators can save staff notes, check in or undo
an arrival, mark a no-show, and cancel. No-show and cancelled reservations release availability
and clear check-in; they cannot be checked in or restored to confirmed. Notes remain editable.
The status filter can show cancelled/no-show history, including bookings from deleted events.

**Export CSV** downloads every row matching the filters, including private contact details and
notes, regardless of the loaded page. The file uses a UTF-8 BOM, quoted fields and UTC dates;
prices are labelled as integer minor units with separate currencies. Potential spreadsheet
formulas are prefixed with an apostrophe. Quotes, commas and multiline notes are preserved.

`GET /api/bookings` returns `{ items, nextCursor }`, ordered by start time and reference. Accepted
filters are `venueId`, `showId`, `from`, `to`, `status` (`confirmed` by default, or `cancelled`,
`no_show`, `all`), and `q`; `limit` is 1–100 (default 50). Pass the returned opaque `cursor` for
the next page. `GET /api/bookings.csv` uses the same filters and ignores pagination. Guarded
`PATCH /api/bookings/:id` accepts `notes` (up to 4,000 characters), `checkedIn` (boolean), or
`status` (`cancelled`/`no_show`). Booking creation accepts optional `guestEmail` and `guestPhone`.

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

In **Price tiers** mode, create up to 12 named, colored tiers and set each amount. Enable **Paint prices**, choose a tier and a Seat / Row / Block scope, then click places on either the 2D or 3D map. Painting does not drag or book places. Choose **Unassigned** to remove an assignment; deleting a tier clears its assignments across every floor. **Colour by price** shows the tier legend and colors while selected, reserved and blocked states retain priority. Tier cards show assigned counts and potential revenue; the footer totals assigned/unassigned places and full-sale revenue. Save the layout to apply the changes.

Tier pricing resolves the assigned tier amount, then an explicit resource price, then the standard price. Zero means free; clear a resource price to use the standard fallback. Existing per-resource layouts still treat a missing price as zero. Switching out of tiers mode ignores tier assignments for pricing. These settings apply to the venue; existing booking prices remain unchanged.

In an event's **Manage seats** view, **Pricing for this event** sets a multiplier (including +10%, +25%, +50% shortcuts or a custom 1.30) and optional tier overrides. Blank overrides use the multiplier; zero overrides are free. Tier overrides apply in Price tiers mode, and otherwise the multiplier applies to the venue's normal reservation price. Prices round to integer minor units per seat before the party total is added. Guests see the quoted event price in the seat list, price legend and reservation summary. Changing events waits for a fresh quote; checkout rejects stale totals. Existing reservations retain their saved amounts even after event prices change or the event is cancelled.

Event-pricing management uses authenticated `GET/PUT /api/venues/:id/shows/:showId/pricing` with `{ multiplier, overrides: [{ tierId, amount }] }`. Multipliers range from 0 to 99.99 with at most two decimals; override and effective per-seat amounts remain bounded by 100,000,000 minor units. Availability returns a resource-ID price map and currency. Migration `008_show_pricing.sql` is applied automatically, including to existing databases.

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

Open **http://localhost:3188**. Four sample venues are seeded on first start.
On first setup, use **Admin sign in**, leave Email blank, and enter the password from `.env`. Create your first owner account from the Overview prompt. After that, sign in with your account email and password.
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
apps/api/src/          NestJS application bootstrap and shared helpers
apps/api/src/modules/  Feature modules with dto/, controllers/, services/ and entities/
apps/api/migrations/   Initial schema (idempotent, locked during initialization)
packages/contracts/   Zod validation, shared types and four template factories
tests/                Contract tests and real PostgreSQL integration tests
  browser/            Playwright end-to-end flows
```

React + TypeScript + Vite, NestJS + Express, PostgreSQL + MikroORM, Zod,
Three.js + React Three Fiber. Models are original procedural geometry, with no remote models or texture downloads. One API process, one database, no Redis or queues.
The backend uses NestJS feature modules: `AuthModule`, `AccountsModule`, `VenuesModule`,
`EventsModule`, `BookingsModule`, `OverviewModule` and `SceneGenerationModule`. Controllers
own HTTP routing, request validation and response headers; injectable services receive typed DTOs
and own business operations. Each feature keeps its DTOs in `dto/`, ORM mappings in `entities/`,
and controllers, services and custom repositories in their respective folders. DTO types are inferred
from the shared Zod schemas; `ZodValidationPipe` applies validation, normalization and defaults at
the controller boundary. Booking rules and response mapping live in `policies/` and `mappers/`.
The database module registers all entity schemas without owning feature models.
`DatabaseModule` initializes MikroORM and SQL migrations and closes the ORM through Nest lifecycle
hooks. Feature modules explicitly import authentication; role guards read current permissions
from the database. The shared exception filter maps validation and database errors to safe API
responses. Express is the HTTP adapter and supplies parsing, cookies, security headers and static
assets; business routes are registered by Nest controllers.

Explicit `@Inject(...)` tokens keep dependency injection compatible with the existing `tsx`
runtime, which does not emit decorator type metadata. Explicit `EntitySchema` mappings cover all
nine tables and foreign keys. Each service operation uses an isolated EntityManager fork;
transaction callbacks share that manager with pricing, inventory and audit helpers. Ordinary CRUD
uses entity repositories. Custom booking, venue and show repositories own their queries;
repositories are obtained from the current manager so transaction scope is preserved. Booking
rules live in `booking-policy.ts`, and public/admin response mapping and CSV rendering live in
`booking-response.ts`. The booking service coordinates the unit of work and flushes a multi-seat
reservation once. Reports, advisory locks and the guarded inventory upsert use SQL through
MikroORM. Existing SQL migrations preserve PostgreSQL-specific constraints; startup never runs
automatic schema synchronization. Node 22.17+ is required (Docker and CI use Node 24).
Direct `pg` access is retained only in integration-test fixtures.
The `createApp(config)` entry point remains available for isolated API/browser tests, including
per-application rate limits. Browser tests start a fresh API child process through `tsx`,
because Playwright’s own transformer does not support Nest parameter decorators. Shared Zod
contracts validate all writes. The scene stays JSONB; resources are indexed relationally for booking
integrity. `revision` prevents stale layout writes. Venue row locks serialize
layout mutations with bookings; a PostgreSQL GiST exclusion constraint independently
rejects overlapping confirmed bookings. Intervals use `[start, end)`; back-to-back
bookings are allowed. The API accepts ISO timestamps with offsets and stores
`timestamptz`. The UI displays the user's browser timezone.

Sessions are random, stored hashed in PostgreSQL, expire after eight hours, and
use HttpOnly/SameSite cookies. Login and booking endpoints are rate limited.
Public availability exposes resource IDs and prices. Account roles control reservation access.

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
- Reservations use cursor pagination (50 rows per page, API maximum 100); CSV exports all rows matching the filters.
- Initial schema is idempotent; future releases need explicit versioned migrations.

Licensed under [MIT](../LICENSE). Contributions welcome; run the checks above before submitting a PR.

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

Venue settings in the actions menu rename a venue without editing its layout. Archiving requires
typing its current name, hides it from guests and blocks new reservations while retaining existing
records. Administrators can restore venues from the collapsed Archived sidebar group. Changes
check the venue revision so concurrent edits cannot silently overwrite each other.

## Public booking links and embeds

Share `/book/<venue-id>` with guests to open Time → Place → Review → Done without the workspace
sidebar or administrator controls. Add `?show=<event-id>` to preselect a cinema screening or
stadium event. Public pages remain guest-only even when an administrator is signed in. Invalid,
archived or missing venue/event links show an unavailable message instead of opening another venue.

Operators can use **More venue actions → Share booking link** to copy the current venue/event
link, or **Embed** to get an iframe snippet. `embed=1` removes the hero and footer while keeping
the booking steps and confirmation. Both flows use the existing availability, prices and stale
checkout recovery; they do not collect payment.

In production, `PUBLIC_ORIGIN` supplies the canonical HTTPS origin for shared links. Development
and instances without a configured origin use the browser's current origin. Only `/book/<id>` documents permit
HTTP(S) frame ancestors and omit `X-Frame-Options`; workspace pages and API responses retain
same-origin framing protection. This does not relax the API's cross-origin mutation checks.

## Staff accounts and audit records

Existing installations keep shared-password access until the first owner is created. Creating
that owner upgrades the current session and ends shared-password access, including other old
sessions. Owners manage accounts in Team; initial passwords are at least 12 characters and must
be shared privately. Account email invitations and password-reset delivery are not included.

Owners have full access. Managers manage venues, layouts, pricing, events and reservations.
Staff land directly in Reservations and can read details, export filtered records, and check in
or undo check-in. Staff cannot edit notes, cancel, mark no-show, change prices or manage venues.
Their venue/event filter choices use public active venues and upcoming events; historical
reservations remain searchable and readable. Every protected API checks permissions independently
of the interface. Disabling or changing an account's role affects existing sessions immediately;
at least one active owner must remain.

Passwords use asynchronous salted scrypt; session tokens are stored as hashes. Migration 009
adds accounts, session ownership and an audit log. Layout saves, price changes and cancellations
record the acting user in the same transaction; a failed audit write rolls back the action.
Bootstrap actions have a null user ID. Disabling accounts retains their audit attribution.

Guest booking opens in dialogs: time, a wide interactive 3D seat selector, review and confirmation.
Close or Escape keeps the current details; Continue booking reopens the flow. Closing is disabled
while a reservation is being submitted.

Potential organizer and ticketing integrations, API restrictions and a phased recommendation are
documented in [Ticketing platforms](integrations/ticketing-platforms.md). These integrations
are researched proposals; no external account is connected.

The [Ticketmaster rollout plan](plans/ticketmaster-integration.md) separates event discovery and purchase links from partner-approved 3D seat reservations.
