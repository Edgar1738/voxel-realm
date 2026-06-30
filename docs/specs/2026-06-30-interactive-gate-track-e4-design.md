# Interactive Openables — Fence Gate (Track E4) — Design

- **Date:** 2026-06-30
- **Status:** Approved (design); implementation plan pending.
- **Branch:** `claude/gates-track-e4` (off `main` @ `ff32c33`, which includes E1–E3).
- **Origin:** The interactive-block track. E2 added the per-voxel `state` byte (reserving bit 3 "for doors = open"); E3 added neighbour-connecting fences. This track adds the **interactive machinery** — a "use" action that toggles a block's `open` state, with state-aware collision — and ships a **fence gate** as the first consumer. Trapdoors and 2-tall doors become follow-ups once the machinery exists.

## Context

Blocks render by shape (`emitShaped`) and collide by `collisionBox(id)`. The player can place (right-click → place at the adjacent voxel) and break (left-click), but has no "use/activate" action. A gate needs: an `open` bit in the existing E2 `state` byte, a `'gate'` shape whose geometry depends on facing+open, **collision that depends on the open bit** (passable when open), and a **"use" interaction** to toggle it.

## Goals

1. A reusable `open` state bit (bit 3 of the E2 state byte) + helpers, persisted with no save change.
2. A `'gate'` shape: a panel blocking the gap between fence posts when closed, swung aside when open.
3. **State-aware collision:** a gate is solid when closed, passable when open.
4. A **"use" action:** right-clicking a toggleable block flips its `open` bit (instead of placing); `__vr.toggle(x,y,z)` does the same for scripts.
5. Content: an oak fence gate that connects to fences.

## Non-goals

- Trapdoors, 2-tall doors, iron/redstone-triggered doors, hinge-side variants (later tracks — they reuse this machinery).
- Swing animation (toggle is instant — a re-mesh).
- Any `SAVE_VERSION` change (the `open` bit rides the E2 state byte, already persisted as `[index,id,state]`).

## Invariants preserved

- Block ids append-only ∈ [0,255] (the gate is 38). Save format unchanged. The cube/slab/stair/cross/fence/wall render + collision paths are **byte-identical** for non-gate blocks (collision stays `collisionBox(id)` unless a block is toggleable; the only `emitShaped` change is a new `'gate'` dispatch branch). `selfCheck()` passes.

## Components

### 1. Open-state helpers (`src/world/VoxelState.ts`)
Add `OPEN_BIT = 0b1000` (bit 3) and helpers: `isOpen(state): boolean`, `setOpen(state, open): number`, `toggleOpen(state): number`. Facing stays bits 0–1 (a gate's facing is set on placement via `facingFromYaw`, like a stair). The state byte is unchanged in size/persistence; the `open` bit is just another bit E2 already serializes.

### 2. `'gate'` shape + registry (`src/blocks/blocks.ts`, `src/blocks/BlockRegistry.ts`)
`Shape` gains `'gate'`. `occludes` stays false (non-cube; emitted separately, doesn't hide neighbours). `isShape` adds it (exhaustive). The gate is a **self-contained** shape — its geometry depends only on its own `facing` + `open` state, not on neighbours (it visually pairs with a fence run because its posts sit at the voxel edges, but it does not dynamically connect like a fence). New helper `isToggleable(id): boolean = shape(id) === 'gate'` (the set of openable shapes; trapdoors/doors join later).

### 3. State-aware collision (`src/blocks/BlockRegistry.ts`, `src/world/ChunkManager.ts`)
New `collisionBoxFor(id, state): CollisionBox` — for a `'gate'`, `isOpen(state) ? 'none' : 'full'`; otherwise `collisionBox(id)` (state-independent). `collisionBox(id)` keeps returning `'full'` for a gate (the closed default, for callers without state). `ChunkManager.solidBox(wx,wy,wz)` reads the voxel's **state** (`ChunkData.getState`) alongside its id and returns `collisionBoxFor(id, state)`, so an open gate is passable. (The non-opaque guard stays; gates are `opaque:true`.)

### 4. `emitGate` geometry (`src/mesh/emitShaped.ts`)
A `'gate'` dispatch branch → `emitGate(buf, view, registry, id, x, y, z)`: reads `facing` + `isOpen` from `view.getState`. **Closed:** two slim posts on the facing axis + horizontal bars filling the gap between them (a fence-gate panel that blocks the passage). **Open:** the bars swing 90° to lie alongside one post (against the perpendicular side), leaving the passage clear. Both built from boxes via the existing `emitBoxCulled`, into the opaque mesh. Exact box dimensions pinned in the plan.

### 5. The "use" interaction (`src/app/input.ts`, `src/app/DevControls.ts`, edit path)
- **In-game:** the right-click handler (currently "place at `hit.adjacent`") becomes context-sensitive — if the **targeted** block (`hit.block`) is `registry.isToggleable(...)`, apply an edit that sets the same id with `toggleOpen(state)` at `hit.block` (a toggle, re-meshing + re-colliding the voxel) instead of placing. On any non-toggleable target it places exactly as today.
- **Scripted:** `__vr.toggle(x,y,z)` — reads the block+state, and if toggleable, applies the flipped-`open` state edit; returns the `EditResult` (or a no-op note if the block isn't toggleable).
- The toggle is an ordinary `SetVoxel` (id unchanged, `state` = flipped open bit) through the existing `EditService`/`applyEdits` — so it's undoable and persists, with no new edit machinery.

### 6. Content (`src/blocks/blocks.ts`, id 38)
`OAK_FENCE_GATE` (38) — `shape:'gate'`, `opaque:true`, `transparent:false`, `creative:true`, planks/wood texture.

## Data flow
```
place (right-click) ─► targeted block toggleable? ─yes─► SetVoxel{id, state: toggleOpen(state)} ─► applyEdits (re-mesh + re-collide)
                                                  └no──► place at adjacent (unchanged)
__vr.toggle(x,y,z) ─► same toggle edit
state.open (bit 3) ─► emitGate (closed panel vs swung-open) + collisionBoxFor (full vs none) ─► ChunkManager.solidBox (state-aware)
```
The `open` bit persists via the E2 `[index,id,state]` delta — no save change.

## Error handling
- `selfCheck` keeps the shape switch exhaustive (gate added to `collisionBox`'s switch as `'full'`).
- `__vr.toggle` / the place handler no-op (no edit) when the target isn't toggleable; out-of-range / unloaded targets report via the existing `EditResult`.
- `collisionBoxFor` falls back to `collisionBox(id)` for every non-gate shape (state ignored), so existing collision is unchanged.

## Testing
- VoxelState: `isOpen`/`setOpen`/`toggleOpen` round-trip; toggling `open` preserves facing.
- Registry: `'gate'` shape; `isToggleable(gate)` true / others false; `collisionBoxFor(gate, closed)==='full'`, `(gate, open)==='none'`; `collisionBox(id)` unchanged for non-gates.
- `emitGate`: closed vs open produce different geometry (a known box differs); facing rotates the panel; faces cull against occluders.
- `solidBox` (ChunkManager): a closed gate voxel → `'full'`, the same voxel toggled open → `'none'` (state-aware); a non-gate is unchanged.
- Interaction (pure decision): targeting a gate → a toggle `SetVoxel` with flipped open + same id; targeting a non-gate → a place. `__vr.toggle` flips a gate and no-ops a cube.
- Live smoke: place a fence run with a gate; toggle it (right-click / `__vr.toggle`); walk through when open, blocked when closed; reload → the open/closed state persists.

## Rollout
One branch/PR off `main`. After E4: trapdoors + 2-tall doors (reuse the open bit + the use action + state-aware collision), biome/per-block tint, and precise fence/stair collision remain tracks. Update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories after merge (the open bit, the use/toggle action, state-aware collision, the gate).
