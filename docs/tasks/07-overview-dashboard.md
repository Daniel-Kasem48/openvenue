# 07 · Operator overview dashboard

## Problem

After signing in, an operator has no answer to "how does today/tonight look?".

## Goal

A new **Overview** screen, the default admin landing page.

## Content

- KPI row for the selected time range (Today, Next 7 days, Next 30 days):
  reservations count, seats/places booked, occupancy %, expected revenue (sum of `bookings.price`,
  shown per currency, labelled "not collected").
- **Upcoming events** (seat venues): title, date, sold / capacity bar, blocked seats count, link
  to manage that event's seats.
- **Recent reservations**: last 10, link to the Reservations screen.
- Per-venue cards: occupancy for the next event or for today.

## API

- `GET /api/overview?from=&to=` (guarded) returning aggregated numbers computed in SQL.
  Add the zod schema in `packages/contracts`.
- Capacity = number of resources in the venue layout (for seat venues, minus blocked seats for that
  event).

## UI

- Sidebar nav item **Overview** (first item, admin only). Charts: simple Tailwind bars, no chart
  library needed.

## Acceptance

- [x] API tests cover empty data, multiple currencies, cancelled bookings excluded.
- [x] Browser test: sign in → Overview shows a booking just created.

## Implemented

- Guarded SQL aggregates and shared request/response contracts; requests are limited to 366 days.
- Default and restored admin sessions open Overview; guests do not see its navigation.
- UTC presets, per-currency expected revenue, separate event-seat occupancy and daily distinct
  table/space utilization, upcoming event seat-management links, recent reservations and venue cards.
- Event denominator is resource count minus blocks per event; empty denominators show an em dash.
- API tests cover authentication, range validation, empty results, cancelled exclusion,
  multiple currencies, booking/block join multiplication, party sizes and daily resource deduplication.
- Browser coverage verifies fresh/restored sign-in, a new reservation, the 30-day range,
  seat-management navigation and the Reservations link.

Capacity uses the current layout. Historical capacity, hourly occupancy and automatic refresh
are outside this task; the screen has a manual refresh button. Reporting semantics are in README.
