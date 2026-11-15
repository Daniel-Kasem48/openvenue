# 05 · 3D scene visual polish

## Problem

The 3D scene looks flat: uniform hemisphere light, a plain beige floor, saturated yellow seats,
and hard edges. It is the centrepiece of demos and the first thing operators see.

## Scope (`apps/web/src/Map3D.tsx`, `apps/web/src/scene/*`)

- Lighting: soft key directional light with shadows plus a low ambient/hemisphere fill; consider
  drei `<Environment preset="city" />` at low intensity, or `ContactShadows` under the venue.
- Floor: subtle tone matching `--color-canvas`, faint grid or texture, gentle fade at the edges.
- Seats and tables: slightly rounded geometry (drei `RoundedBox`), less saturated default colors,
  clear state colors that match the 2D legend (available, reserved, selected, blocked).
- Stadium: stand surfaces with a bit of contrast; pitch lines crisp.
- Cinema stays dark-themed.

## Constraints

- Performance: stadium (984 seats) must stay ≥ 50 fps on an integrated GPU at 1440×900. Keep
  instancing where it exists (`StadiumSeats.tsx`).
- Tests read `window.__cameraView` and compare canvas screenshots before and after camera moves.
  Don't change camera presets or control behaviour.
- `frameloop="demand"` stays.

## Acceptance

- [ ] Before/after screenshots for restaurant, parking, cinema and stadium in the PR.
- [ ] All checks in the README pass.
