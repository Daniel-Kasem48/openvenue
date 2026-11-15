# NestJS backend modules

The user requested a backend refactor to NestJS modules. Replace the Express business router with Nest feature modules, thin decorated controllers and injectable services. Keep HTTP paths, successful statuses, cookie behavior, error messages, rate limits, Zod contracts, SQL, locks and audit transactions compatible. No database migrations or new dependencies.

Use Auth, Accounts, Venues, Events, Bookings, Overview and SceneGeneration modules. DatabaseModule owns pool startup/shutdown and provides application configuration. A session guard uses current database permissions, with explicit role metadata. Shared exception handling preserves safe error responses; HTTP parsing, cookies, headers and static assets remain adapter middleware.

Wrapping the existing router in modules would leave business routes outside Nest and would not meet the request. Introducing an ORM, new authentication provider or speculative integration framework is unnecessary. Explicit injection tokens are used because tsx does not emit decorator type metadata.

Ticketing integration research is a separate documented deliverable, not authorization to connect accounts or implement provider-specific code.
