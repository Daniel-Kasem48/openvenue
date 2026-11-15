# OpenVenue task backlog

Tasks for turning OpenVenue from a strong layout editor with a booking demo into a tool a venue
operator could run a venue on. Primary user: **venue operators** (restaurant owner, parking manager,
cinema / stadium box office). Their most frequent job: **setting prices**.

Work tasks **in order** unless a task says otherwise. One task = one branch = one PR.

| #   | Task                                                                      | Area       | Size |
| --- | ------------------------------------------------------------------------- | ---------- | ---- |
| 00  | [Make the browser test suite pass in a full run](00-fix-e2e-isolation.md) | Foundation | S    |
| 01  | [Replace text glyphs with a real icon set](01-icon-set.md)                | UI         | S    |
| 02  | [Compact workspace layout](02-workspace-layout.md)                        | UI         | M    |
| 03  | [Venue header action hierarchy](03-venue-header-actions.md)               | UI         | S    |
| 04  | [Layout preview thumbnails on venue cards](04-venue-card-previews.md)     | UI         | M    |
| 05  | [3D scene visual polish](05-3d-scene-polish.md)                           | UI         | M    |
| 06  | [Sidebar: venue search and tidy list](06-sidebar.md)                      | UI         | S    |
| 07  | [Operator overview dashboard](07-overview-dashboard.md)                   | Operators  | L    |
| 08  | [Event management](08-event-management.md)                                | Operators  | M    |
| 09  | [Venue settings: rename and archive](09-venue-settings.md)                | Operators  | S    |
| 10  | [Reservation details, status and export](10-reservations.md)              | Operators  | L    |
| 11  | [Price tiers and price painting](11-price-tiers.md)                       | Pricing    | L    |
| 12  | [Per-event price overrides](12-event-pricing.md)                          | Pricing    | L    |
| 13  | [Public guest booking page](13-public-booking-page.md)                    | Guests     | L    |
| 14  | [Staff accounts and roles](14-staff-accounts.md)                          | Platform   | L    |
| 15  | [Online payments](15-payments.md) — **needs owner decision first**        | Platform   | L    |

## Project facts

- Monorepo, **npm** workspaces, Node ≥ 22. Never use yarn or pnpm here.
- Web: React 19 + Vite 7 + **Tailwind v4** (`apps/web/src`). Design tokens live in the `@theme`
  block of `apps/web/src/styles.css` (`forest-*`, `sprout-*`, `canvas`, `ink`, `font-display`,
  `shadow-card`, `shadow-float`). Shared primitives are component classes in the same file:
  `.primary`, `.secondary`, `.text-button`, `.danger`, `.full`, `.panel`, `.eyebrow`, `.muted`,
  `.field-error`, `.empty`, `.pill`, `.section`, `.float-button`. Use these and Tailwind utilities;
  do not add new plain-CSS files.
- 3D: three.js via React Three Fiber + drei (`Map3D.tsx`, `scene/*`). 2D: SVG (`Map2D.tsx`).
- API: Express router inside NestJS bootstrap, `apps/api/src/app.ts`. Postgres, raw SQL.
- Migrations: `apps/api/migrations/NNN_name.sql`, applied in order, idempotent
  (`IF NOT EXISTS`). Next free number is **005**.
- Shared types and zod schemas: `packages/contracts/src/index.ts`. Any API or layout JSON change
  goes through these schemas first.
- Prices are stored as **integer minor units** (cents). Currencies: USD, EUR, GBP, AED, SAR, SYP.

## Rules for every task

1. **Don't break test hooks.** Browser tests select by accessible name (exact button text such as
   `Edit layout`, `Save layout`, `Book <name> →`, `Sign in`) and by these class names:
   `.shell .venue-list .profile .inspector .map-stage .map-scale .selection-card .booking-reference
.resource-focus-ring`. If a task must change one, update the test in the same PR.
2. **Add tests.** API behaviour → `tests/api.test.ts` (vitest). User flows → `tests/browser/*.spec.ts`
   (Playwright). Schemas → `tests/contracts.test.ts`.
3. **Before opening a PR, all of these must pass:**
   ```bash
   npm run typecheck
   npm run format:check
   npm test
   docker compose up -d db
   set -a; . ./.env; set +a; ADMIN_PASSWORD=integration-password-123 npm run test:e2e
   npm run build
   ```
4. Keep the UI calm and dense, like an operator tool: white cards on the `canvas` background, one
   primary (dark forest) action per area, text no smaller than 11px.
5. Mobile: no horizontal scroll at 390px wide (asserted by the e2e suite).
6. Accessibility: every control keeps a visible label or `aria-label`; keep focus-visible outlines.
7. No new runtime dependency without a one-line justification in the PR description.
8. Update `README.md` when a user-visible feature is added.
