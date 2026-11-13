# OpenVenue MVP

Approved direction: fresh open-source implementation with restaurant, parking and cinema templates; independent of Spantrek source and assets. MIT license. Personal GitHub account Daniel-Kasem48.

One React/TypeScript web app and NestJS REST API with PostgreSQL. Shared Zod contracts describe venues, floors, resources, shows and bookings. SVG editing and Three.js viewing consume the same coordinates. Floor heights are visual, coordinates are metres.

Admin signs in with a configured password and manages layouts and reservations. Visitors select a venue, floor, time interval (or cinema show), resource and guest name, then reserve. Public endpoints never expose guest data. Admin-only booking list/cancellation. Restaurant capacity and parking accessible/EV metadata are preserved. Three seeded venues demonstrate templates; templates can be instantiated as new independent venues. JSON layout export/import and venue duplication permit reuse.

Database exclusion constraints prevent concurrent overlap on resource/time interval; cinema bookings use server-owned show intervals. Layout saves use revision checking and preserve resource IDs; deleting resources with booking history is rejected. Input validation, secure cookies, same-origin checks, request limits, rollback, tests and setup documentation are included.

MVP is single-operator and self-hosted. No payments, integrations, CAD import, customer accounts or multi-tenant SaaS. 3D is schematic geometry, not photorealism. Native Sites hosting cannot run the agreed NestJS/PostgreSQL stack; deliver GitHub source and Docker self-hosting, not a disconnected static demo.
