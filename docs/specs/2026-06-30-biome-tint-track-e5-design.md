# Biome Tint (Track E5) — Design

- **Date:** 2026-06-30
- **Status:** Approved (design); implementation plan pending.
- **Branch:** `claude/tint-track-e5` (off `main` @ `939b1c0`, which includes E1–E4).
- **Origin:** The "biome-grass tint" deferred from E1 (and again from E2/E3). Grass, leaves, and foliage plants should look different per biome — lush in forest, murky in swamp, pale in tundra, dry in desert — instead of one fixed green everywhere.

## Context

Block faces render from a shared texture array with fixed per-block colors; the shader does `base = texel.rgb` then applies AO + baked light. There is no per-vertex color. Biomes are classified per column by `BiomeMap` (used by `SurfacePainter` to choose grass/sand/snow/mud caps) but that classification never reaches the renderer. This track threads a **per-biome tint** to grass/leaves/foliage at mesh time.

**Key constraint discovered from the textures:** the grass/leaves/tall-grass textures are **already green** (e.g. `grassTop` = `[86,152,60]`). So the tint is a per-biome **multiplier** applied on top of the existing texture, **not** a full color replacement. **Plains uses the identity multiplier `[1,1,1]`** so the dominant biome (and every existing world's plains/forest grass) renders byte-identical to today; other biomes shift.

## Goals

1. Grass tops, leaves, and tall grass tint by the biome of their column.
2. Per-biome **discrete** multipliers (constant within a biome) so the greedy mesher still merges grass tops; only biome borders split a quad.
3. **No save change** — the tint derives from the world biome (recomputed at generation), never stored per voxel.
4. Plains = identity, so existing worlds' common biomes are pixel-identical.

## Non-goals

- Manual/per-voxel painted tint (`__vr.tint`) — a possible later track; this one is biome-driven only.
- Smooth per-column tint gradients / Minecraft-style 3×3 color blending (would defeat greedy merging; discrete per-biome is the deliberate trade).
- Re-coloring flowers or non-foliage blocks; changing existing textures to grayscale.
- Any `SAVE_VERSION` change.

## Invariants preserved / shifted

- Block ids unchanged (no new content blocks). Save format unchanged.
- **Invariant SHIFT (the notable one):** this is the first track to extend the **core vertex format** — every vertex in every mesh gains a `tint` (vec3) attribute. For **untinted faces and the Plains biome the tint is white `[1,1,1]`**, so: (a) the greedy merge is identical (untinted faces all share tint index 0; the merge key folds in `0`), (b) the multiply `base *= [1,1,1]` is a no-op, so cube/non-plains-free worlds render pixel-identical. The existing mesh tests assert positions/normals/uv/layers/ao/light (geometry) — those stay green; tests that build/compare `MeshData` gain the new field.
- `selfCheck()` passes; the `Shape` system and all E1–E4 behavior are untouched.

## Components

### 1. Tint palette (`src/render/Tint.ts`)
A pure module, no three.js:
- `type TintCategory = 'grass' | 'foliage'`.
- `type RGB = readonly [number, number, number]` (0..1 multipliers).
- Per-biome multipliers for each category (6 biomes). Example values (final numbers pinned in the plan): grass — Plains `[1,1,1]`, Forest `[0.92,1.0,0.85]`, Desert `[0.86,0.78,0.45]`, Mountains `[0.80,0.85,0.70]`, Tundra `[0.78,0.86,0.82]`, Swamp `[0.62,0.70,0.42]`; foliage — similar, slightly deeper.
- `TINT_PALETTE: RGB[]` — index **0 = white `[1,1,1]`** (the no-tint default), then grass entries (indices 1..6 = biome 0..5), then foliage entries (indices 7..12). 13 entries total.
- `tintIndexFor(biome: number, category: TintCategory): number` — `category==='grass' ? 1+biome : 7+biome`. (Plains grass = index 1, whose RGB is `[1,1,1]`.)

The index is what the mesher packs into its merge key (small int); the RGB is what it writes per vertex.

### 2. Tint flags (`src/blocks/blocks.ts`, `src/blocks/BlockRegistry.ts`)
- `BlockDef` gains optional `tint?: TintCategory` and `tintTopOnly?: boolean`.
- Content flags: `GRASS` → `tint:'grass', tintTopOnly:true` (only the top face tints — sides/bottom are dirt); `LEAVES` → `tint:'foliage'` (all faces); `TALL_GRASS` → `tint:'foliage'`.
- `BlockRegistry.tintCategory(id, face): TintCategory | undefined` — returns `def.tint` when `!def.tintTopOnly || face === Face.PosY`, else `undefined`. Untinted blocks → `undefined`.

### 3. Per-column biome (`src/world/ChunkData.ts`, `src/worldgen/SurfacePainter.ts`, `src/world/VoxelView.ts`)
- `ChunkData` gains `biomeData: Uint8Array(CHUNK_AREA)` (one biome ordinal per column, default 0 = Plains) + `getBiome(x,z)` / `setBiome(x,z,biome)` indexed `x + CHUNK_SIZE_X * z` (same layout as `ctx.heights`). **Not serialized** — regenerated on load (the base chunk is always regenerated; deltas only patch voxels/state).
- `SurfacePainter` already computes `biome` per column (line 18) — add `chunk.setBiome(x, z, biome)` there. Presets without `SurfacePainter` (flat/void) leave biome = 0 = Plains = white (unchanged look).
- `VoxelView.biomeAt(x, z): number` — for the center chunk returns `center.getBiome(lx, lz)`; for neighbor/out-of-range returns 0 (Plains). Tinted faces are always the solid block's own column = center chunk, so the neighbor case never tints in practice; 0 is a safe default.

### 4. Core mesher (`src/mesh/MeshTypes.ts`, `src/mesh/GreedyMesher.ts`)
- `MeshData` gains `tint: Float32Array` (3 floats/vertex).
- `GreedyMesher.meshDirection`: after `layer`, compute `category = registry.tintCategory(id, faceFor(axis,sign))`; `tintIndex = category ? tintIndexFor(view.biomeAt(solidX, solidZ), category) : 0`; `rgb = TINT_PALETTE[tintIndex]`. Store `tint: rgb` (and `tintIndex`) in the `MaskCell`.
- The merge key gains `tintIndex` in the high bits: `key = (tintIndex << 24) | (layer << 16) | (packedAo << 8) | light`. `tintIndex ≤ 12` → bits 24–27, key stays a positive < 2³¹ integer. Untinted = `tintIndex 0` → key numerically unchanged → merges exactly as today.
- `emitQuad` pushes `cell.tint[0..2]` for each of the 4 vertices. `mesh()` returns `tint: new Float32Array(buf.tint)`.

### 5. Shaped + cutout meshes (`src/mesh/emitShaped.ts`)
All shaped emitters write a `tint` per vertex so every `MeshData` carries the attribute:
- Box-based shapes (slab/stair/fence/wall/gate) → white `[1,1,1]` (none are tinted).
- The **cross/cutout** emitter (tall grass) → if `registry.tintCategory(id, Face.PosY)` is `'foliage'`, write `TINT_PALETTE[tintIndexFor(view.biomeAt(x,z),'foliage')]`; else white. (Crosses have no face normal axis; use the foliage category directly.)
- `mergeMeshData` concatenates the `tint` arrays alongside positions/normals/etc.

### 6. Render (`src/render/buildChunkMesh.ts`, `src/render/ChunkMaterial.ts`)
- `buildChunkMesh`: `geometry.setAttribute('tint', new BufferAttribute(mesh.tint, 3))`.
- Vertex shader: `in vec3 tint; out vec3 vTint; vTint = tint;`. Fragment: `in vec3 vTint;` → `vec3 base = texel.rgb * vTint;`. All three materials (opaque/transparent/cutout) share the shader, so all get the attribute.

## Data flow
```
SurfacePainter ─► ChunkData.biomeData[col] = biome   (at generation; not saved)
mesh time: face id+face ─► registry.tintCategory ─┬─ undefined ─► tintIndex 0 ─► white
                                                  └─ 'grass'/'foliage' ─► tintIndexFor(view.biomeAt, cat) ─► TINT_PALETTE[i]
  ─► MaskCell.tint (+ tintIndex in merge key) ─► per-vertex tint ─► geometry 'tint' attr ─► fragment base *= vTint
```

## Error handling
- `tintCategory` returns `undefined` for every non-tinted block/face → white → no change.
- `view.biomeAt` clamps neighbor/out-of-range to 0 (Plains/white).
- A biome ordinal is 0..5; `tintIndexFor` maps into the fixed 13-entry palette; an unexpected ordinal would index past the palette → guard `tintIndexFor` to clamp, and `TINT_PALETTE` lookups fall back to white if out of range.
- No new save path; `parseWorldSnapshot`/`writeChunk`/`/__world` are untouched (biome isn't serialized).

## Testing
- `Tint`: `tintIndexFor` maps grass/foliage×biome to distinct indices; index 0 = white; Plains grass RGB = `[1,1,1]`; palette length = 13.
- Registry: `tintCategory(GRASS, PosY)='grass'`, `(GRASS, NegY/side)=undefined`, `(LEAVES, any)='foliage'`, `(TALL_GRASS, PosY)='foliage'`, `(STONE, any)=undefined`.
- ChunkData/VoxelView: `setBiome`/`getBiome` round-trip; `VoxelView.biomeAt` reads the center chunk, returns 0 for neighbors.
- GreedyMesher: a grass-top face in a non-Plains biome emits a non-white tint; the same in Plains emits white; a stone face emits white; **two grass tops in the same biome still merge** (one quad) while **two in different biomes split** (two quads); cube geometry (positions/layers) unchanged vs. a pre-tint baseline.
- emitShaped: box faces emit white tint; a tall-grass cross in a non-Plains biome emits foliage tint; `mergeMeshData` preserves tint length = vertex count × 3.
- Live smoke: a flat world seeded so two columns fall in different biomes shows different grass tints; a plains column is unchanged; reload preserves it (biome regenerates).

## Rollout
One branch/PR off `main`. After E5: precise (taller/two-box) fence + stair collision remains the last scoped track; trapdoors/2-tall doors and manual per-voxel tint are possible future tracks. Update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories after merge (per-vertex tint attribute, per-biome palette, ChunkData biome array).
