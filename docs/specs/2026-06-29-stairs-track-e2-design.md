# Stairs + Per-Voxel State (Track E2) — Design

- **Date:** 2026-06-29
- **Status:** Approved (design); implementation plan pending.
- **Branch:** `claude/stairs-track-e2` (off `main` @ `ac5b0d2`, which includes E1).
- **Origin:** The oriented-shape track deferred from E1. E1 shipped orientation-free shapes (slabs, cross-plants); stairs are the first shape that needs **per-voxel orientation state**, so this phase builds that state foundation (which doors/gates will later reuse) with stairs as the first consumer.

## Context

Voxel storage is one byte per voxel = block id (`ChunkData.data: Uint8Array`); edits are deltas `Map<voxelIndex, BlockId>` serialized as `[index, id]` pairs (`WorldSnapshot`); `SetVoxel = {x,y,z,id}`. There is nowhere to put a stair's facing. E2 adds a **parallel per-voxel `state` byte** and threads it through storage → save → edit/undo → mesh → placement, then adds a `'stair'` shape whose geometry rotates by that state. Stairs reuse E1's collision and the existing opaque mesh pass.

## Goals

1. A per-voxel `state` byte (orientation now; reserved bits for doors later), defaulting to 0.
2. Stairs render correctly rotated to one of 4 facings (+ a top/bottom half), faces culled like slabs.
3. A stair's facing is set on placement (from the player's yaw, or explicitly for scripted builds) and **persists** across save/load and **survives undo/redo**.
4. **Existing saves are 100% safe** — they load unchanged with `state = 0` everywhere.
5. New content: stone / plank / cobblestone / brick stairs.

## Non-goals

- Doors / gates / trapdoors / fences (later phases; they reuse this state byte).
- **Precise two-box stair collision** — E2 stairs collide as a `lowerHalf` box (reuse E1).
- Per-vertex / biome tint; corner & diagonal stairs; rotating already-placed blocks.
- **No `SAVE_VERSION` bump** (see Save, below — the format change is a backward-compatible superset).

## Invariants preserved

- Block ids append-only ∈ [0,255] (stairs are 31–34). The cube/slab/plant render + collision paths are **byte-identical** for `state = 0` (the existing default everywhere except stairs). Unoriented worlds **serialize byte-identically** to today. `BlockRegistry.selfCheck()` still passes.

## Components

### 1. Per-voxel state storage (`src/world/ChunkData.ts`)
`ChunkData` gains `readonly state = new Uint8Array(CHUNK_VOLUME)` alongside `data`, plus `getState(x,y,z): number` / `setState(x,y,z, s): void` (same bounds rules as `get`/`set`; out-of-bounds state reads 0). `cloneChunk` copies `state` too. **State bit layout** (documented constant): bits 0–1 = `facing` (0=N, 1=E, 2=S, 3=W), bit 2 = `half` (0=bottom, 1=top / upside-down), bits 3–7 reserved (doors will use bit 3 = open, bit 4 = hinge). Helpers `packState({facing, half})` / `unpackState(s)` live in a small `src/world/VoxelState.ts`.

### 2. Save: backward-compatible superset (`src/persistence/WorldSnapshot.ts`, **no version bump**)
A delta entry becomes `[index, id]` **or** `[index, id, state]`. `serializeWorldSnapshot` writes the 2-element form when `state === 0` (so every existing/unoriented voxel serializes exactly as today) and the 3-element form only when `state !== 0`. `parseWorldSnapshot` accepts both: `entry.length === 2` → state 0; `length === 3` → validate `state` is an integer ∈ [0,255], else drop. **A v1 save (all 2-element entries) therefore loads natively as all-`state`-0 — no migration step, no discard.** `SAVE_VERSION` stays `1`; `resolveSaveAction` is unchanged. (Adding stair ids is append-only, which has never bumped the version — Track C added ids 19–26 at version 1.)

### 3. Deltas carry state (`src/persistence/SaveTypes.ts`, `src/world/ChunkManager.ts`)
The in-memory delta value carries id + state, packed as a single number `id | (state << 8)` (keeps `WorldDeltas = Map<string, Map<number, number>>`; helpers `packVoxel(id,state)` / `voxelId(v)` / `voxelState(v)`). `ChunkManager.updateDelta` records the packed value (and drops the delta when it reverts to base id **and** state); `applySavedDeltas` writes both `data` and `state`; `getChunkDelta` returns the packed entries (serialize unpacks to `[index,id,state?]`).

### 4. Edit + undo carry state (`src/edit/EditTypes.ts`, `EditService`, `ChunkManager.applyEdits`)
`SetVoxel` gains `state?: number` (default 0). `VoxelChange` gains `beforeState` / `afterState` so undo/redo restores the prior id **and** orientation. `applyEdits` sets `data` + `state`, compares both for "did it change", and the group-undo path round-trips state. (Place/fill/region-op paths pass `state` through; ops that don't set it default 0.)

### 5. `'stair'` shape + mesher (`src/blocks/blocks.ts`, `src/mesh/emitShaped.ts`)
Add `'stair'` to the `Shape` union. `emitShaped` reads `view`'s state for stair voxels (a new `VoxelView.getState` mirroring `get`) and calls `emitStair`, which builds the stair as **two boxes** — a full-footprint `lowerHalf` box + an upper box on the back half (the half away from `facing`) — rotated by `facing` and vertically flipped when `half = top`. Per-face layers via `faceLayer`; faces flush against `occludes` neighbours are culled (as slabs do); emitted into the **opaque** mesh. `occludes(stair)` is `false` (a stair doesn't fully hide neighbours), and stairs stay "full" for light/AO like slabs.

### 6. Placement orientation (`src/edit/...`, `src/app/DevControls.ts`)
When a stair block is placed without an explicit `state`, its `facing` is derived from the player's yaw (the stair faces the player, Minecraft-style) and `half` from whether the aim hit the top or bottom of the target face. The in-game place path computes this; `__vr.place(x, y, z, id, state?)` lets agents pass an explicit packed state for scripted builds, and `VoxelState` helpers (`facingFromYaw(yaw)`) are exposed for convenience.

### 7. Collision (reuse E1) + content
Stairs map to E1's `lowerHalf` collision box (`BlockRegistry.collisionBox`: stair → `lowerHalf`) — **no collision-system change**; you rest on the bottom step at +½ and ascend a staircase via the existing 1-block step-up. Content: `STAIRS_STONE` (31), `STAIRS_PLANK` (32), `STAIRS_COBBLE` (33), `STAIRS_BRICK` (34), each `shape:'stair'`, `opaque:true`, `creative:true`, reusing the matching cube's textures.

## Data flow
```
place(id, state?) ─► SetVoxel{state} ─► applyEdits → ChunkData.set + setState, delta packVoxel(id,state)
ChunkData.state ─► VoxelView.getState ─► emitShaped/emitStair (rotated geometry) ─► opaque mesh
WorldDeltas(packed) ─► serializeWorldSnapshot ([index,id] or [index,id,state]) ─► disk
disk ─► parseWorldSnapshot (length 2→state0 | length 3) ─► snapshotToDeltas ─► applySavedDeltas (data+state)
undo ─► VoxelChange{before/afterState} restores id + orientation
collision ─► collisionBox(stair)='lowerHalf' (unchanged engine)
```

## Error handling
- `parseWorldSnapshot` drops entries with a non-integer/out-of-range `state` (same defensive style as id/index).
- `setState`/`getState` enforce the same bounds as `set`/`get`; unknown `facing`/`half` bits are simply ignored by `emitStair` (defensive default = bottom/north).
- `selfCheck` validates stair blocks resolve to 6 face layers like any shaped block.

## Testing
- **Save safety (critical):** a v1-style snapshot (all `[index,id]` entries) parses to all-`state`-0 and loads without discard; a stair delta round-trips `[index,id,state]`; an unoriented world **serializes byte-identically** to the pre-E2 format (state-0 → 2-element entries).
- State: `ChunkData.getState/setState` + `pack/unpackState` round-trip; `cloneChunk` copies state.
- Edit/undo: placing a stair with a facing, undo restores the prior id+state; redo re-applies.
- Mesher: `emitStair` vertex counts per facing; a known vertex rotates with `facing`; top-half flips; faces cull against a full-cube neighbour.
- Collision: stair = `lowerHalf` (rest at +½); cube/slab/plant unchanged.
- Live smoke: place the 4 stairs in all 4 facings + a top-half stair; reload and confirm orientation persists; confirm an existing (castle/showcase) save still loads.

## Rollout
One branch/PR off `main`. After E2: doors/gates/trapdoors (reuse the state byte: open/hinge bits) and fences/walls (neighbour-connect, no state) become their own plans, plus precise two-box stair collision and biome/per-block tint. Update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories after merge (the state byte, stairs, `__vr.place(...,state)`).
