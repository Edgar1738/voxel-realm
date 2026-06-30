# Fences + Walls (Track E3) — Design

- **Date:** 2026-06-30
- **Status:** Approved (design); implementation plan pending.
- **Branch:** `claude/fences-track-e3` (off `main` @ `384eaa7`, which includes E1 + E2).
- **Origin:** The neighbour-connecting building shapes. E1 added orientation-free shapes (slabs, cross-plants); E2 added oriented/stateful shapes (stairs). Fences/walls are different again: their geometry is **derived from their neighbours** at mesh time (a post + arms reaching to adjacent fences/walls/cubes), so they need **no stored state and no save-format change** — they slot into the existing E1/E2 shape system.

## Context

The shape system (`BlockDef.shape`, `BlockRegistry.shape/occludes/collisionBox`, `src/mesh/emitShaped.ts` with `emitBoxCulled`/`emitSlab`/`emitStair`/`emitCross`) renders non-cube blocks by appending boxes/billboards to the opaque or cutout mesh, culling faces that sit flush against full-cube `occludes` neighbours. Fences/walls reuse this: a connection-driven emitter builds a central post plus an arm box per connected horizontal neighbour, all through `emitBoxCulled`.

## Goals

1. A fence/wall renders a central post + arms toward each connected horizontal neighbour, recomputed from the `VoxelView` (cross-chunk safe).
2. Connections form to compatible connecting blocks and to full opaque cubes; updating a neighbour re-meshes the connection.
3. Fences/walls are see-through (don't hide neighbours) but solid to walk into.
4. New content: an oak fence + cobblestone & stone-brick walls. No save change.

## Non-goals

- Fence **gates** / any openable/interactive block — that's the doors/interaction track.
- The 1.5-tall "can't jump over" collision — fences/walls collide as a `full` box for E3.
- Light pass-through (fences stay opaque, blocking light like slabs/stairs), diagonal connections, fence↔wall cross-connection.
- Any `SAVE_VERSION` / save-format change; any new player interaction.

## Invariants preserved

- Block ids append-only ∈ [0,255] (fences/walls are 35+). Save format unchanged. The cube/slab/stair/cross/plant render + collision paths are **byte-identical** (the only `emitShaped` change is a new dispatch branch + a new pure emitter; `emitBoxCulled` is unchanged and reused). `BlockRegistry.selfCheck()` passes.

## Components

### 1. `'fence'` + `'wall'` shapes (`src/blocks/blocks.ts`, `src/blocks/BlockRegistry.ts`)
`Shape` gains `'fence'` and `'wall'`. `BlockRegistry`: `occludes` already returns false for any non-`'cube'` shape (no change). `collisionBox`: `'fence'`/`'wall'` → `'full'`. `selfCheck`'s `isShape` adds the two names (exhaustive). A new helper `connectsTo(selfId, neighborId): boolean` = `occludes(neighborId) || shape(neighborId) === shape(selfId)` — i.e. a fence connects to other fences and to full cubes; a wall to other walls and full cubes; fences and walls (different shapes) do not cross-connect.

### 2. Connection-driven emitter (`src/mesh/emitShaped.ts`)
A new `emitConnected(buf, view, registry, id, x, y, z)`:
- Emits a **central post** box (dimensions by shape: fence = a slim ~0.25-wide full-height post; wall = a ~0.5-wide, slightly lower post).
- For each of the 4 horizontal directions, if `registry.connectsTo(id, view.get(neighbor))`, emits an **arm** box from the post toward that voxel boundary (thin; fence arms are two slim rails / a slim bar at rail height, wall arms are a thicker bar — exact dims pinned in the plan).
- All boxes go through the existing `emitBoxCulled` (into the opaque `slabs` buffer), so faces flush against a full-cube neighbour are culled and the cube path stays untouched.
The `emitShaped` dispatch loop gains `else if (shape === 'fence' || shape === 'wall') emitConnected(...)`. (No `VoxelView.getState` needed — fences carry no state; connections come from `view.get` of the 4 neighbours, which already spans loaded neighbour chunks.)

### 3. Cross-chunk + re-mesh correctness
`VoxelView.get` already reads neighbour chunks (AIR when unloaded), so a fence at a chunk edge connects across the border. `ChunkManager.applyEdits` already re-meshes the edited chunk (so a same-chunk neighbour fence recomputes its arms) and adds the border-neighbour chunk to its re-mesh set when the edit is on a chunk edge (so a cross-border neighbour fence reconnects). A freshly streamed neighbour chunk re-meshes via the existing edge-neighbour pass in `ChunkManager.update`. No new wiring.

### 4. Collision + light
`collisionBox` → `'full'`: a fence/wall blocks walking into its voxel (see-through visually, solid physically) — reuses the E1/E2 collision path with no engine change. Fences/walls stay `opaque: true`, so they block light and cast AO as full cubes (the documented E1/E2 simplification; light-through is a deferred refinement).

### 5. Content (`src/blocks/blocks.ts`, ids 35+)
- `OAK_FENCE` (35) — `shape: 'fence'`, planks/wood texture.
- `COBBLE_WALL` (36) — `shape: 'wall'`, cobblestone texture.
- `STONEBRICK_WALL` (37) — `shape: 'wall'`, brick/stone-brick texture.
Each `opaque: true, transparent: false, creative: true`.

## Data flow
```
BLOCK_DEFS{shape:'fence'|'wall'} ─► BlockRegistry.shape/occludes(false)/collisionBox('full')/connectsTo
emitShaped loop ─► emitConnected (reads 4 neighbours via view.get) ─► post + arms via emitBoxCulled ─► opaque mesh
ChunkManager (existing edge-neighbour re-mesh) ─► connections update across edits + chunk streaming
collision ─► collisionBox(fence|wall)='full' (unchanged engine)
```

## Error handling
- `selfCheck` keeps the shape switch exhaustive (unknown shape = boot error); fence/wall blocks resolve to 6 face layers like any shaped block.
- `connectsTo`/`emitConnected` are pure and bounded; an out-of-range neighbour reads AIR (no connection), so border fences degrade to a bare post until the neighbour streams in (then re-mesh).

## Testing
- `connectsTo`: fence↔fence true, wall↔wall true, fence↔cube/wall↔cube true, fence↔wall false, fence↔air/slab false.
- `emitConnected`: a lone fence emits only the post; a fence with N connected neighbours emits post + N arms (vertex/box counts); an arm appears toward a connected side and not toward an unconnected side; a wall uses the wall dimensions.
- Cross-chunk: a `VoxelView` backed by a neighbour chunk containing a fence yields a connected arm at the border.
- Registry: `collisionBox('full')`, `occludes` false, `shape` correct, faces resolve; cube/slab/stair worlds byte-identical (state-0 / non-fence unaffected).
- Live smoke: a fence line connects into a continuous rail, meets a wall (no cross-connect — both just post against each other), butts into a building cube (arm into the cube), and blocks the player (full collision) while showing through the gaps.

## Rollout
One branch/PR off `main`. After E3: fence **gates** + doors (the interaction track, reusing the E2 state byte), the taller fence collision, and biome/per-block tint remain future tracks. Update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories after merge (the connecting shapes + the new content).
