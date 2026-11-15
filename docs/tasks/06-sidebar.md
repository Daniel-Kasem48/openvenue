# 06 · Sidebar: venue search and tidy list

## Problem

Long venue names wrap onto 2–3 lines, and with many venues the list becomes a long scroll with no
way to find one.

## Scope (`apps/web/src/App.tsx` sidebar)

- Names on one line with ellipsis (`truncate`) and a `title` attribute with the full name.
- When there are more than 6 venues, show a small search field above the list
  (`aria-label="Search venues"`), filtering by name and kind.
- Group by kind (Restaurants, Parking, Cinemas, Stadiums) with small group labels.
- The selected venue stays visible (scroll into view on change).

## Constraints

- Tests use `.venue-list` + `getByRole('button', { name: /<venue name>/ })`. The button's
  accessible name must still contain the full venue name (truncation is visual only).

## Acceptance

- [ ] 50 venues: list stays usable and search finds one in a single keystroke sequence.
