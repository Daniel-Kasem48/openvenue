# 03 · Venue header action hierarchy

## Problem

The venue header shows 4–5 buttons with equal weight: Manage event seats, Duplicate, Generate with
Claude, Edit layout / Done editing, Save layout. Nothing reads as the main action.

## Goal

One clear primary action per mode, the rest grouped.

## Design

- View mode (admin): primary = **Edit layout**; secondary = **Manage event seats** (seat venues);
  overflow menu (`…`, `aria-label="More venue actions"`) holds **Duplicate** and
  **Generate with Claude**.
- Edit mode: primary = **Save layout** (disabled until dirty), secondary = **Done editing** /
  **Discard changes**; show an "Unsaved changes" dot next to the venue name when dirty.
- Overflow menu: accessible menu button (`aria-haspopup="menu"`, arrow-key navigation, Esc closes,
  click outside closes). Write it as a small component `apps/web/src/Menu.tsx`; no new dependency
  needed.

## Constraints

- Tests click `Generate with Claude` directly. Update those tests to open the overflow menu first.
- Button texts stay exactly the same.

## Acceptance

- [ ] Keyboard: Tab to `…`, Enter opens, arrows move, Enter activates, Esc closes and returns focus.
- [ ] All checks in the README pass.
