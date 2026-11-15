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

- [x] Before/after screenshots for restaurant, parking, cinema and stadium captured locally (linked below; publication pending).
- [x] Typecheck, formatting, unit/API tests, browser tests and production build pass (local PostgreSQL substitutes for Docker; details below).

## Implementation and evidence

Reduced hemisphere fill and calibrated a warm directional key against the venue size, using
soft shadow filtering and a small normal bias. Floors now use neutral canvas tones with faint
plank seams and a smooth 0.65-unit edge fade to the canvas background. The floor fade uses
world coordinates shared by the existing slab and plank materials, so it adds no textures, meshes
or draw calls and retains standard lighting/shadows. Cinema keeps its dark palette and has gently rounded arm pads. Existing rounded
furniture and the four stadium instanced meshes remain; authored seat and availability colors,
camera presets, controls and demand rendering are unchanged. Terrace supports have more contrast;
the pitch has subtle mowing stripes and depth-offset markings to avoid flicker at shallow angles.
No runtime dependency or remotely downloaded lighting asset was added.

| Venue      | Before                                      | After                                     |
| ---------- | ------------------------------------------- | ----------------------------------------- |
| Restaurant | [Before](evidence/05-restaurant-before.png) | [After](evidence/05-restaurant-after.png) |
| Parking    | [Before](evidence/05-parking-before.png)    | [After](evidence/05-parking-after.png)    |
| Cinema     | [Before](evidence/05-cinema-before.png)     | [After](evidence/05-cinema-after.png)     |
| Stadium    | [Before](evidence/05-stadium-before.png)    | [After](evidence/05-stadium-after.png)    |

Screenshots use a 1440×900 browser viewport and the full default templates, including 984 stadium
seats. The browser tests wait for an actual WebGL view matrix before capturing; they also verify
that a camera change updates both that matrix and the rendered image. Run with
`SCENE_EVIDENCE=after npm run test:e2e -- tests/browser/scene-polish.spec.ts` to refresh evidence.

**Performance limitation:** this environment reports
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
It has no verified physical integrated GPU. The ≥50 fps integrated-GPU acceptance target remains
unverified; software rendering is not a substitute for that measurement. Stadium geometry counts,
four seat draw calls, 2048² shadow map and demand rendering are preserved. No stadium bevels or
extra lighting passes were added. Check sustained orbit performance on the target hardware before
claiming the frame-rate requirement.

## Validation

- `npm run typecheck` and `npm run format:check` passed.
- With the isolated database exported from `.env`, `npm test`: **53 passed**, none skipped.
- `SCENE_EVIDENCE=after npm run test:e2e`: **24 passed**, including the existing camera,
  editing and mobile-layout tests. After the final cinema caption contrast adjustment, the four
  scene tests were rerun with a fresh production build and captures.
- `npm run build` passed via Playwright global setup; existing large-chunk/Zod annotation warnings
  remain non-fatal.
- Used the already provisioned isolated local PostgreSQL instance on port 55439 instead of
  starting the Docker Compose database. No schema or API changes.
- Self-review: no camera/control changes, no authored/resource-state color changes, no additional
  stadium meshes or shadow passes; all eight captured scene images visually inspected.

### Review follow-up: floor-edge fade

Added the explicit gentle edge fade after review. A material shader patch reduces floor alpha
only within 0.65 units of the perimeter, retaining the standard lighting and shadow shader chunks.
The slab draws before the planks to keep transparent floor layers stable when orbiting. The same
world-space boundary applies to every plank; floor dimensions key the materials
so resized layouts receive fresh fade uniforms. All four after screenshots were refreshed.
Focused verification: nine rendering/unit tests and four real-WebGL scene tests pass; the latter
rebuilds the production bundle and includes typechecking. Physical-GPU performance remains unverified.
