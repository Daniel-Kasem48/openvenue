# 02 · Compact workspace layout

## Problem

Every screen repeats a large page heading ("Manage your venues" + subtitle + button). On the venue
screen it pushes the map about 200px down, so the map gets roughly half the viewport. The
Reservations tab still shows "Manage your venues".

## Goal

Operators get the venue on the whole screen; headings describe the current screen.

## Scope (`apps/web/src/App.tsx`)

- Large page heading only on the **directory** (guest `step === 'venues'`) and an admin home.
- On the venue screen, the venue panel header (name, kind, counts, actions) **is** the page header.
- Reservations screen gets its own heading ("Reservations"), not the venues one.
- Move "+ New venue" into the sidebar/topbar for admins (keep the button text `+ New venue`; the
  test uses `getByRole('button', { name: 'New venue' })`).
- Map stage height: fill available viewport (`calc(100dvh - <header heights>)`, min 480px) on
  ≥1024px; keep current behaviour on mobile.
- Remove the decorative footer ("Thoughtfully mapped…") from operator screens.

## Constraints

- Keep `getByRole('heading', { name: 'Manage your venues' })` and
  `'Where would you like to go?'` working, or update those tests in the same PR.
- `.map-stage`, `.inspector` class names stay.

## Acceptance

- [x] At 1440×900, admin venue screen: map top edge ≤ 220px from the top of the viewport.
- [x] Screenshot before/after attached to the PR.

Evidence: [before](evidence/02-before.png) · [after](evidence/02-after.png).
