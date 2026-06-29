# Non-cube Shapes (Track E1) — Design

- **Date:** 2026-06-29 (rev. after a Codex external review)
- **Status:** Implemented (PR pending) — `docs/plans/2026-06-29-shapes-track-e1.md`, 10 TDD tasks, suite 513 green.
- **Branch:** `claude/shapes-track-e` (stacked on `claude/content-track-c` / PR #26, so it sees block ids 19–26 and continues at **27**; rebase/retarget to `main` after #26 merges).
- **Origin:** Track E from the 2026-06-28 review — the non-cube geometry unlock. **Phase E1: orientation-free shapes** (slabs + cross-plants). Oriented shapes (stairs, fences) are E2 (they need per-voxel orientation/metadata).

## Review incorporated (Codex, 2026-06-29)
A read-only review found two real bugs and a wiring gap, all folded in below: plants must not also render in the transparent *cube* pass; `emitShaped` slabs must cull faces flush against full-cube neighbours (z-fighting); and a new cutout material must be registered with `DayNight`. Two scope decisions were taken: **per-block tint is cut from E1** (its only real use, biome-grass tint, is already deferred; plants/slabs colour from their textures; it would force a greedy merge-key change), and **slab collision is fixed in E1** via registry collision boxes (a visible half-slab that collides as a full cube feels broken).

## Context

The greedy mesher (`src/mesh/GreedyMesher.ts`) emits only full-cube faces, merged per the `MeshPass` interface (`includes(id)` selects participants; `faceVisible(self, neighbor)` decides occlusion; `opaqueAt` samples solidity for AO). Two passes exist (`ChunkMeshes = { opaque, transparent }`). E1 adds a **shape system** so blocks can be half-height slabs or billboard plants, rendered in a new alpha-cutout pass, without changing the save format or the cube path.

## Goals

1. Blocks declare `shape: 'cube' | 'slab' | 'cross'`; the id implies the shape (no save change).
2. Slabs render as half-height boxes that don't hide their neighbours' faces and don't z-fight.
3. Cross-plants (flowers, tall grass) render as alpha-cutout billboards in a dedicated pass.
4. Slabs collide as a half-height box (you can stand on the step); plants don't collide.
5. New content: two slabs, two plants, and a decoration overlay scattering plants on grass.

## Non-goals

- Stairs / fences (orientation) — E2.
- **Per-block / biome-driven tint — deferred** (its own plan; needs the greedy merge-key change and, for grass, biome data in the mesher).
- Save-format / `SAVE_VERSION` change, block metadata/rotation.
- Any change to how existing full-cube blocks mesh, render, light, or collide.

## Invariants preserved

- Block ids append-only, ∈ [0,255]; registry self-check passes. Save schema unchanged. The existing opaque/transparent meshes for cube blocks are **byte-identical** (the only mesher change is the `occludes`-based pass predicate, which is identical for all-cube neighbourhoods).

## Components

### 1. `BlockDef.shape`
`src/blocks/blocks.ts`: `shape?: 'cube' | 'slab' | 'cross'` (default `'cube'`). New blocks (ids 27+): `STONE_SLAB`, `PLANK_SLAB` (`shape:'slab'`, `opaque:true`), `FLOWER`, `TALL_GRASS` (`shape:'cross'`, **`opaque:false`, `transparent:false`** — so they are in NO cube pass; the cutout pass renders them). No `tint` field.

### 2. Registry: shape, occlusion, collision
`src/blocks/BlockRegistry.ts`:
- `shape(id): 'cube'|'slab'|'cross'` (default cube).
- `occludes(id) = isOpaque(id) && shape(id) === 'cube'` — a full opaque cube that hides neighbour faces. Slabs/plants don't occlude *geometry*.
- `collisionBox(id): 'none' | 'full' | 'lowerHalf'` — derived from shape: cube → `full`, slab → `lowerHalf`, cross → `none`.
- The `selfCheck` makes the shape handling **exhaustive** (a `never`-default switch) — an unknown shape is a compile/boot error, not a silent fallback.

**Light & AO note:** slabs stay `isOpaque:true`, so they **block light and cast AO as full solids** in E1 (consistent, simplest). Only *face-culling* and *greedy participation* use `occludes`; `opaqueAt` (AO sampling) is unchanged. A future refinement could make light/AO shape-aware.

### 3. Occlusion-aware passes (`src/mesh/MeshPass.ts`)
- `opaquePass.includes` → `registry.occludes(id)` (only full cubes are greedily meshed; slabs/plants excluded and emitted separately).
- `opaquePass.faceVisible(self, neighbor)` → `!registry.occludes(neighbor)` (a cube shows its face against a slab/plant/air).
- **`transparentPass.includes` gains a shape guard** → `id !== AIR && transparent && shape(id) === 'cube'` (so a transparent non-cube can never double-render as a transparent cube). Its `faceVisible` is unchanged.
- `GreedyMesher.opaqueAt` (AO) is **unchanged** (`isOpaque`).

### 4. `emitShaped` step + `cutout` mesh
A new pure step (`src/mesh/emitShaped.ts`) iterates a chunk's non-cube voxels via the `VoxelView` and appends to two `MeshData` buffers:
- **slab** → a half-height (y..y+0.5) box into the **opaque** `MeshData`. Each of its 6 faces is **culled when flush against an `occludes` neighbour** (bottom against a cube below, each side against a cube beside) — exactly so the slab-bottom/cube-top and slab-side/cube-side planes never coincide (no z-fighting). Faces against air/non-occluders are emitted. Per-face layers via `faceLayer`; light sampled at the voxel; AO a flat `1.0` (no per-corner AO for slabs in E1).
- **cross** → two diagonal quads (corner-to-corner across the voxel) into a new **cutout** `MeshData`, double-sided, no AO, light sampled at the voxel.
`MeshTypes.ChunkMeshes` gains `cutout: MeshData` (same `MeshData` shape — positions/normals/uvs/layers/ao/light/indices; **no new attribute**). `ChunkManager.meshChunk` runs `emitShaped` and merges its slab output into the opaque mesh and its cross output into the cutout mesh before upload.

### 5. Cutout render pass (`src/render/CutoutMaterial.ts`, new)
A `RawShaderMaterial` mirroring `ChunkMaterial` (same texture array, baked light, sun/day-light + fog uniforms) but with `transparent:false`, `depthWrite:true`, `side: DoubleSide`, and a fragment `if (texel.a < 0.5) discard;` (alpha test). `buildChunkMesh` is reused as-is (same `MeshData`). `ChunkMeshRegistry` gains a third per-chunk `Entry.cutout` mesh (positioned/added/disposed alongside opaque/transparent; `disposeAll` disposes the cutout material). **`Game.boot` creates the cutout material at boot and passes it into BOTH the `ChunkMeshRegistry` and the `DayNight` materials array** (so it receives per-frame light/fog updates — `DayNight` updates `uLightDir`/`uDayLight`/`uFogColor` on every material in its list).

### 6. Alpha-capable plant textures (`src/blocks/textures.ts`)
`Pixel` may return `RGB` or `RGBA` (`readonly [number,number,number,number]`); `paintLayer` writes the alpha channel (default 255 when omitted, so all existing RGB patterns are byte-identical). The `DataArrayTexture` is already RGBA + `NearestFilter`. A `cross` plant pattern returns `alpha:0` for background pixels and the plant colour (alpha 255) for the plant shape, so the cutout pass discards the background.

### 7. Slab collision (`src/player/Collision.ts`, `src/world/ChunkManager.ts`)
`ChunkManager.isSolid` and the AABB sweep in `Collision.ts` consult `registry.collisionBox(id)`: a `full` voxel blocks the whole cell (today's behaviour); a `lowerHalf` slab blocks only `y..y+0.5` (the player can stand on the half-step; step-up from #25 handles climbing onto it); `none` (plants) never collides. Cube blocks are unaffected. Below-world is still solid.

### 8. Content + worldgen
- Blocks (above): `STONE_SLAB` (stone texture), `PLANK_SLAB` (planks texture), `FLOWER` (cross pattern, a flower), `TALL_GRASS` (cross pattern, green blades). Slabs `creative:true`; plants `creative:true`.
- Worldgen: `scatterDecorations` overlay (`src/worldgen/Decorations.ts`) places a `FLOWER`/`TALL_GRASS` one voxel above any `GRASS` surface column, at low density, using **world-coordinate `Math.imul` hashing** (like `OreScatterer`, so it's chunk-border-stable — NOT a chunk-local RNG). Wired into the `default`, `villages`, and `frontier` presets' overlays.

## Data flow
```
BLOCK_DEFS{shape} ─► BlockRegistry.shape/occludes/collisionBox
   greedy opaque (cubes only, occludes-aware faceVisible) + transparent (cubes only) ─┐
   emitShaped (slabs → opaque MeshData w/ face-culling, crosses → cutout MeshData)  ──┤─► ChunkMeshes{opaque,transparent,cutout}
ChunkMeshRegistry.upload ─► opaque + transparent (ChunkMaterial) + cutout (CutoutMaterial)
Game.boot ─► CutoutMaterial registered in DayNight[] (light/fog) and ChunkMeshRegistry
Collision/isSolid ─► registry.collisionBox  (full / lowerHalf / none)
```
`faceLayer(id, face)` and the save format are unchanged.

## Error handling
- `selfCheck` rejects a `shape` block missing the faces it needs and uses an exhaustive shape switch (unknown shape = boot error, no silent fallback).
- `emitShaped` is pure and bounded by chunk volume.

## Testing
- Registry: `shape`/`occludes`/`collisionBox` defaults + a slab (lowerHalf, occludes=false) + a cross (none, occludes=false); self-check stays green.
- MeshPass: `opaquePass.faceVisible` shows a cube face against a slab; `opaquePass.includes`/`transparentPass.includes` exclude non-cube shapes (a plant is in neither cube pass).
- `emitShaped`: a slab over a cube emits NO bottom face (culled) and a top face (max y = 0.5); a slab in open air emits all faces; a single cross emits two quads in the cutout buffer with sampled light.
- textures: `paintLayer` writes alpha; the `cross` pattern yields transparent background + opaque plant pixels; an existing RGB pattern is byte-identical (alpha 255).
- Collision: a `lowerHalf` slab blocks at `y..y+0.5` and lets the player stand at +0.5; a `cross` plant is walk-through; full cubes unchanged.
- Decorations: deterministic (same seed → same plants), plants only above `GRASS`, chunk-border-stable.
- Render (cutout discard, day/night on the cutout material) verified by `npm run build` + an in-app smoke (place a slab on a cube → the cube shows no z-fight and the slab is half-height & standable; place a flower → transparent background, lit by day/night).

## Rollout
One branch/PR stacked on #26. After E1 merges: E2 (stairs/fences + orientation/metadata) and a tint/biome-grass plan become their own efforts. Update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories after merge (shapes, the cutout pass, slab collision).
