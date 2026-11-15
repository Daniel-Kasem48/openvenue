# 01 · Replace text glyphs with a real icon set

## Problem

The UI uses text symbols as icons: `◉ ▤ ▥ ◈ ▦ ◇ ⌖ ↗ ↺ ✦ ×`. They render differently per OS font
and make the product look unfinished.

## Goal

Use **lucide-react** icons everywhere a glyph is used as an icon.

## Scope

- `apps/web/src/App.tsx`: `types` map (venue kind icons), brand mark, sidebar nav, venue list,
  profile arrow, directory cards, venue header, view toggle (2D/3D), selection card, confirmation
  check, "Generate with Claude" sparkle, error dismiss ×.
- `Map2D.tsx` zoom controls, `Map3D.tsx` reset camera, `Modal.tsx` close button,
  `LayoutInspector.tsx` import/export arrows.
- Suggested mapping: restaurant `UtensilsCrossed`, parking `SquareParking`, cinema `Clapperboard`,
  stadium `Trophy` (or `Goal`), browse `LayoutGrid`, reservations `CalendarCheck`, 2D `Map`,
  3D `Box`, reset `RotateCcw`, generate `Sparkles`, close `X`, export `Download`, import `Upload`.
- Icons: `size-4` in buttons, `size-5` in nav, `aria-hidden="true"`, `strokeWidth={1.75}`.

## Constraints

- **Accessible names must not change.** Buttons like `2D view`, `3D view`, `Close dialog`,
  `Reset 3D camera` already have `aria-label`; text buttons keep their exact text.
- Keep the brand wordmark `openvenue`; replace only the symbol.

## Acceptance

- [x] `grep -nE "[◉▤▥◈▦◇⌖↺✦]" apps/web/src` returns nothing.
- [x] All checks in the README pass.
