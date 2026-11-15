# OpenVenue

Open-source 2D/3D venue maps and reservations for stadiums, cinemas, restaurants, and parking spaces.

## Demo

Explore a stadium in 3D, choose seats, and complete a booking.

https://github.com/user-attachments/assets/9cac011b-7e0f-43d9-8022-82c01fffc43e

## Features

- Editable layouts with 2D and 3D views.
- Event pricing, seat rows, price tiers, and blocked seats.
- Guest booking dialogs, shareable links, and embeds.
- Attendee search, check-in, CSV exports, and staff roles.
- Optional AI scene generation with Claude.

## Quick start

Requires Docker Compose.

```sh
cp .env.example .env
# Set ADMIN_PASSWORD to a unique password of at least 16 characters.
docker compose up --build
```

Open **http://localhost:3188**. Use **Admin sign in** with the configured password
and a blank email, then create your first owner account. Guests can book without signing in.

## Stack

React · TypeScript · Three.js · NestJS · MikroORM · PostgreSQL

## Documentation

- [Setup, development, architecture, and full feature guide](docs/guide.md)
- [Ticketing integrations](docs/integrations/ticketing-platforms.md) · [Ticketmaster plan](docs/plans/ticketmaster-integration.md)

Currently supports reservations and pricing; payments and ticket issuance are not included.
One shared workspace, without tenant isolation.

Built by Daniel Kasem. [MIT licensed](LICENSE).
