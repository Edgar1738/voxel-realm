# Phase 2 — In-game Builder Tools (selection box + hotkeys) — Design

_2026-07-01. Follows the Phase 1 QoL work (targeting overlay + wheel hotbar, merged in PR #33). Approved direction: surface the existing region/prefab operations into a production, in-game UI driven by a visible selection box and hotkeys, reusing Phase 1's overlay system and the existing edit/undo pipeline._

## Problem & context

Every builder operation already exists — but only in the **dev-only** `window.__vr` console API (`src/app/DevControls.ts`, excluded from production): `fill`, `clearBox`, `replace`, `copy` (region→blueprint), `paste`, `move`, `rotate` (`rotateY`), `mirror`, `repeat` (array), with auto-preload, a 50k cap, and group undo. The pure ops live in production code and are already tested:

- `src/core/Prefab.ts` — `normalize`, `rotateY`, `mirror`, `repeat`, `validatePrefab`
- `src/app/RegionOps.ts` — `replaceVoxels`, `prefabToVoxels`, `unloadedChunksInBox`
- `src/edit/Brushes.ts` — `boxVoxels`
- `src/edit/EditService.ts` — `apply(edits)` → one undo batch; `undo`/`redo`

**Missing:** (1) a visible two-corner selection box, and (2) an in-game (production) way to trigger these ops. Phase 2 builds exactly those two things — a thin interaction + render layer over existing, tested logic.

## Goals / non-goals

**Goals:** visible selection box; production in-game hotkeys for fill / clear / replace / copy / paste (with rotate + mirror + array); live clipboard ghost for placement; group undo; auto-preload + cap safety; smooth (no per-frame allocation, no toast spam).

**Non-goals (unchanged from plan):** no on-screen button panel (hotkeys only); no blueprint disk save/load in-game (in-memory clipboard only — disk stays a dev-console feature); no new block ids, save-format, or worldgen changes; no changes to the streaming/meshing core.

## Architecture

A thin layer over existing ops. New units, each with one responsibility:

### New — pure / logic
- **`RegionOps.captureRegion(read, box) → Prefab`** — extract the world→prefab capture currently inlined in `DevControls`'s `copy` into a shared pure function (non-air blocks only, offsets from the box min corner, `normalize`d). Both the dev console `copy` and the in-game copy call it (DRY). Signature: `captureRegion(read: (x, y, z) => BlockId, box: Box): Prefab`.
- **`src/app/BuilderState.ts`** — holds all builder state and derives geometry; no three.js, no DOM (unit-testable):
  - `mode: 'off' | 'selecting' | 'pasting'`
  - `cornerA?: WorldVoxel`, `cornerB?: WorldVoxel`
  - `clipboard?: Prefab`
  - `transform: { turns: 0|1|2|3; mirrorX: boolean; mirrorZ: boolean; arrayCount: number; arrayAxis: 'x' | 'z' }`
  - `selectionBox(): Box | undefined` (from the two corners)
  - `transformedClipboard(): Prefab | undefined` — applies `mirror` (x/z) → `rotateY(turns)` → `repeat(arrayCount along arrayAxis, stride = transformed bounding dim)`, composing the already-tested `Prefab` functions in a fixed order.
- **`src/app/builderInput.ts`** — pure `resolveBuilderIntent(code: string, mode, hasSelection, hasClipboard) → BuilderIntent`, where `BuilderIntent` is a discriminated enum (`'toggleMode' | 'fill' | 'clear' | 'replace' | 'copy' | 'rotate' | 'mirror' | 'arrayInc' | 'arrayDec' | 'stamp' | 'cancel' | 'none'`). Mirrors Phase 1's `hotbarWheelDelta` pattern — testable without DOM.

### New — render (Phase 1 overlay pattern: persistent reusable meshes, `update()` only mutates)
- **`src/render/SelectionBox.ts`** — a reusable `LineSegments` box; `update(box: Box | undefined, show: boolean)` repositions/scales/toggles. No per-frame allocation.
- **`src/render/PasteGhost.ts`** — a translucent preview of the transformed clipboard at the aim origin. To avoid per-voxel meshes, render the **clipboard bounding box** (a translucent box + wireframe) sized to the transformed dims; that communicates footprint/orientation cheaply. (Rendering every clipboard voxel is a non-goal for Phase 2.)

### Modified
- **`src/app/Game.ts`** — own a `BuilderState`, the two overlays, and the per-frame update: when in Build mode, raycast the aim (reuse `raycastVoxels` + `REACH`), update `SelectionBox`/`PasteGhost`, and gate on pointer-lock + inventory (Phase 1 rule). Suspend the Phase 1 targeting overlay while Build mode is active.
- **`src/app/input.ts`** — add a keydown branch routing through `resolveBuilderIntent`; in Build mode, repurpose left-click (set corner / stamp) and suspend normal break/place/tool clicks. Right-click can cancel/exit.
- **`src/app/DevControls.ts`** — swap the inline copy capture for `RegionOps.captureRegion` (no behavior change; keeps one implementation).

## Interaction model

- **`B`** toggles Build mode on/off. Entering shows the selection overlay + a status line; leaving restores normal play + the Phase 1 targeting overlay.
- **Selecting:** left-click sets corner A; next left-click sets corner B → live `SelectionBox`. Further left-clicks cycle (A, then B, …) so you can re-drag a corner.
- **Ops on the selection:**
  - `F` — fill with the selected hotbar block
  - `G` — clear to air
  - `R` — replace: within the box, swap the **aimed block's id** → the held hotbar block
  - `C` — copy region → clipboard, then switch to **pasting** mode
- **Pasting mode** (live `PasteGhost` follows aim; origin = aimed cell):
  - `[` / `]` — rotate the clipboard −90° / +90°
  - `M` — mirror (toggles across the horizontal axis perpendicular to camera facing)
  - `+` / `-` — grow / shrink the array count (≥1) along the facing horizontal axis; stride = transformed bounding dim on that axis (seamless tiling)
  - **left-click** — stamp the transformed clipboard at the ghost origin
  - `Esc` — leave pasting mode (back to selecting; clipboard retained)
- **`Esc`** in selecting mode clears the selection; pressing it with no selection leaves Build mode.
- **Status readout** (reuse the existing HUD status line): shows selection dims + voxel count, clipboard dims, current transform (`rot 90° · mirror · x3`), and op results (applied count, and any "N voxels hit unloaded chunks" warning). Updated **on change only** — never per frame.

## Data flow & safety

Selection/clipboard → op assembles `SetVoxel[]`:
- fill: `boxVoxels(a, b).map(v => ({ ...v, id: held }))`
- clear: `boxVoxels(a, b).map(v => ({ ...v, id: AIR }))`
- replace: `replaceVoxels(read, box, aimedId, heldId)`
- paste/stamp: `prefabToVoxels(transformedClipboard(), ox, oy, oz)`

Then: auto-preload chunks overlapping the box (reuse the existing preload used by the dev API; `unloadedChunksInBox` reports gaps) → `EditService.apply(edits)` (one batch = one undo) → `ChunkManager` remeshes touched chunks. Volume is capped at `MAX_EDIT_VOXELS` (`src/app/editCap.ts`); over-cap shows a status message and applies nothing. Edits into still-unloaded chunks are dropped by `applyEdits` and reported in the status line (never silently).

## Testing

- **Pure (bulk of the value):**
  - `captureRegion` round-trips: capture a known region, `prefabToVoxels` back at the same origin reproduces the non-air voxels.
  - `BuilderState.transformedClipboard()` composes mirror→rotate→array correctly (assert against the already-tested `Prefab` fns for representative cases).
  - `BuilderState.selectionBox()` from corner pairs (order-independent min/max).
  - `resolveBuilderIntent` mapping for each mode (e.g., `[`/`]` only act in pasting mode; `F` only with a selection; unknown keys → `none`).
- **Overlay:** `SelectionBox`/`PasteGhost` construction + `update()` visibility/position (jsdom property checks, like `targetOverlay.test.ts`); assert no material/geometry allocation in `update()`.
- **Live smoke (Edgar, pointer-lock):** select a box; fill/clear/replace; copy then paste with rotate/mirror/array; confirm group undo (`Ctrl+Z` reverts a whole op); confirm no hitch and correct status readout; confirm leaving Build mode restores normal play + the Phase 1 outline/ghost.

## File structure

- Create: `src/app/BuilderState.ts`, `src/app/builderInput.ts`, `src/render/SelectionBox.ts`, `src/render/PasteGhost.ts`
- Modify: `src/app/RegionOps.ts` (+`captureRegion`), `src/app/Game.ts`, `src/app/input.ts`, `src/app/DevControls.ts` (use shared capture)
- Tests: `tests/captureRegion.test.ts`, `tests/builderState.test.ts`, `tests/builderInput.test.ts`, `tests/selectionBox.test.ts`, `tests/pasteGhost.test.ts`

## Constraints (carried from Phase 1)

- No per-frame three.js allocation/disposal; overlays created once, `update()` only mutates. No postprocessing.
- Overlays hidden when pointer unlocked or inventory open. Preview/status never spams (no per-frame toasts).
- Each op = one `EditService` batch (group undo). Respect `MAX_EDIT_VOXELS`.
- Reuse existing patterns; do not touch the streaming/meshing core. `lint` + `tsc --noEmit` + `vitest` + `build` all green.
