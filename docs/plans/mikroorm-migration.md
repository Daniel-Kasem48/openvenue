# MikroORM migration

Requested scope: replace direct PostgreSQL application access with MikroORM, preserve the NestJS modules and existing booking behavior, then push to main.

Implementation uses explicit EntitySchema mappings for the existing nine tables. MikroORM owns connections and transactions; each service operation gets an isolated EntityManager fork. Transaction callbacks pass the same manager to inventory, pricing and audit helpers. Entity metadata does not automatically alter the schema. Existing idempotent SQL migrations retain PostgreSQL checks, foreign keys and the exclusion constraint preventing overlapping reservations.

Ordinary CRUD uses entity queries and the unit of work. Reporting aggregates, cursor pagination, advisory locks and the resource-ownership upsert retain explicit SQL executed through MikroORM. Public booking DTOs exclude attendee contacts and staff notes. Raw query dates must keep the original API/CSV format.

## Verification checklist

- [x] Typecheck and production build.
- [x] Unit/API suite, including double-booking, transaction rollback, role changes and concurrent owner bootstrap.
- [x] ORM lifecycle, identity-map isolation and existing database compatibility.
- [x] Browser booking, pricing, account, layout and operator flows.
- [x] Review final diff, save Ticketmaster plan, push main and stop test services.

No production database connection or destructive schema synchronization is part of this migration.

## Results

105 unit/API tests and all 41 browser tests passed. Build/typecheck, formatting and diff checks passed. Existing database compatibility and fresh database initialization were both exercised. Review preserved the single-query event pricing snapshot, database-clock behavior, row-lock order and transaction rollback. No production database or live ticketing provider was accessed.
