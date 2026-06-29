# Non-cube Shapes (Track E1) — Design

- **Date:** 2026-06-29
- **Status:** Approved (design); implementation plan pending.
- **Branch:** `claude/shapes-track-e` (stacked on `claude/content-track-c` / PR #26, so it sees block ids 19–26 and continues at **27**; rebase/retarget to `main` after #26 merges).
- **Origin:** Track E from the 2026-06-28 review — the non-cube geometry unlock. This is **Phase E1: orientation-free shapes** (slabs, cross-plants, per-block tint). Oriented shapes (stairs, fences) are deferred to E2 because they need per-voxel orientation state (a save-format/metadata decision).

## Context

The greedy mesher (`src/mesh/GreedyMesher.ts`) emits only full-cube faces, merged greedily per the `MeshPass` interface (`includes(id)` selects participants; `faceVisible(self, neighbor)` decides occlusion). Two render passes exist (`ChunkMeshes = { opaque, transparent }`). E1 adds a **shape system** so blocks can be slabs or billboard plants, plus a **per-vertex tint**, without changing the save format or the cube path.

## Goals

1. Blocks can declare `shape: 'cube' | 'slab' | 'cross'`; the id implies the shape (no save change).
2. Slabs render as half-height boxes that correctly DON'T occlude their neighbours' faces.
3. Cross-plants (flowers, tall grass) render as alpha-cutout billboards in a dedicated pass.
4. A per-vertex tint lets blocks carry a static colour (default white); the cube/render path is unchanged for untinted cubes.
5. New content: two slabs, two plants, and a decoration overlay scattering plants on grass.

## Non-goals

- Stairs / fences (orientation) — E2.
- Biome-driven grass tint — needs biome data plumbed into the mesher; separate effort.
- Save-format / `SAVE_VERSION` change, block metadata/rotation.
- Any change to how existing full-cube blocks mesh or render.

## Invariants preserved

- Block ids append-only, ∈ [0,255]; registry self-check passes. Save schema unchanged. The existing opaque/transparent meshes for cube blocks are byte-identical (tint defaults to white → shader multiply by 1).

## Components

### 1. `BlockDef` gains `shape` and `tint`
`src/blocks/blocks.ts`: `shape?: 'cube' | 'slab' | 'cross'` (default `'cube'`); `tint?: [number, number, number]` (each 0..1; default `[1,1,1]`). New shaped blocks (ids 27+): `STONE_SLAB`, `PLANK_SLAB` (`shape:'slab'`), `FLOWER`, `TALL_GRASS` (`shape:'cross'`, `transparent:true`). The registry self-check additionally validates `tint` channels ∈ [0,1].

### 2. Registry: shape + occlusion helpers
`src/blocks/BlockRegistry.ts`: `shape(id): 'cube'|'slab'|'cross'` (default cube) and `occludes(id): boolean = isOpaque(id) && shape(id) === 'cube'`. "Occludes" = a full opaque cube that hides neighbour faces and casts AO. Slabs/plants are opaque-but-not-occluding.

### 3. Occlusion-aware greedy pass
`src/mesh/MeshPass.ts`: `opaquePass.includes` becomes `registry.occludes(id)` (only full cubes are greedily meshed; slabs are excluded and emitted separately). `opaquePass.faceVisible(self, neighbor)` becomes `!registry.occludes(neighbor)` (a cube shows its face against a slab/plant/air). `GreedyMesher.opaqueAt` (used for AO sampling) becomes `registry.occludes(...)` so non-cube neighbours don't darken AO or hide faces. (The transparent pass is unchanged.)

### 4. `emitShaped` step + `cutout` mesh
A new pure step (`src/mesh/emitShaped.ts`) iterates a chunk's non-cube voxels via the `VoxelView` and appends geometry to two `MeshData` buffers:
- **slab** → a half-height (y..y+0.5) 6-quad box into the **opaque** `MeshData`, with per-face layers (top/side/bottom via the registry) and sampled light; AO can be a flat value (no greedy AO) to keep it simple.
- **cross** → two diagonal quads (corner-to-corner) into a new **cutout** `MeshData`, double-sided, no AO, light sampled at the voxel.
`MeshTypes.ChunkMeshes` gains `cutout: MeshData`. `MeshData` gains `tint: Float32Array` (3 floats/vertex). `GreedyMesher.mesh` keeps emitting opaque/transparent for cubes; `ChunkManager.meshChunk` runs `emitShaped` and merges its output into the opaque mesh + the new cutout mesh before upload.

### 5. Per-vertex tint
`MeshData.tint` is filled per vertex from `BlockDef.tint` (default `[1,1,1]`) for every emitted quad (cube, slab, cross). `src/render/buildChunkMesh.ts` adds a `tint` (vec3) attribute. `src/render/ChunkMaterial.ts` fragment shader multiplies the sampled texel by `tint`. Untinted cubes get `[1,1,1]` → no visual change.

### 6. Cutout render pass
`src/render/CutoutMaterial.ts` (new): a `RawShaderMaterial` mirroring `ChunkMaterial` (same texture array, light, tint, fog) but with `transparent:false`, `depthWrite:true`, `side: DoubleSide`, and a fragment `if (texel.a < 0.5) discard;` (alpha test). `ChunkMeshRegistry` gains a third per-chunk `Entry.cutout` mesh (built from `meshes.cutout` with the cutout material), positioned/added/disposed alongside opaque/transparent; `disposeAll` disposes the cutout material.

### 7. Alpha-capable plant textures
`src/blocks/textures.ts`: `Pixel` may return `RGB` or `RGBA` (`readonly [number,number,number,number]`); `paintLayer` writes the alpha channel (default 255 when omitted). A new `cross` plant pattern returns `alpha:0` for background pixels and the plant colour (with alpha 255) for the plant shape, so the cutout pass discards the background. Existing patterns (RGB) are unaffected (alpha defaults 255).

### 8. Content + worldgen
- Blocks: `STONE_SLAB` (slab, stone texture), `PLANK_SLAB` (slab, planks texture), `FLOWER` (cross, a flower pattern), `TALL_GRASS` (cross, a grass-blade pattern). Slabs `creative:true`; plants `creative:true`, `transparent:true`, `shape:'cross'`.
- Worldgen: a `scatterDecorations` overlay (`src/worldgen/Decorations.ts`) that, per surface column on `GRASS`, deterministically (Math.imul hashing) places a `FLOWER`/`TALL_GRASS` above the surface at a low density. Wired into the `default` and `villages`/`frontier` presets' overlays.

## Data flow
```
BLOCK_DEFS{shape,tint} ─► BlockRegistry.shape/occludes/tint
   greedy opaque/transparent (cubes only, occludes-aware) ─┐
   emitShaped (slabs → opaque MeshData, crosses → cutout MeshData) ─┤─► ChunkMeshes{opaque,transparent,cutout} each with tint
ChunkMeshRegistry.upload ─► opaque(ChunkMaterial) + transparent(ChunkMaterial) + cutout(CutoutMaterial), all reading the `tint` attribute
```
`faceLayer(id, face)` is unchanged; the save format is unchanged.

## Error handling
- Registry self-check rejects an invalid `tint` (channel ∉ [0,1]) or a `shape` block missing the faces it needs, at boot.
- `emitShaped` is pure and bounded by chunk volume; unknown shapes fall back to cube emission (defensive).

## Testing
- Registry: `shape`/`occludes`/`tint` defaults + a slab/cross block; self-check rejects bad tint.
- MeshPass: `opaquePass.includes`/`faceVisible` treat a slab as non-occluding (a cube face shows against a slab; a slab is not greedily included).
- `emitShaped`: a single slab voxel → a half-height box (exact vertex/index counts + max y = 0.5); a single cross voxel → two quads in the cutout buffer; tint defaults to `[1,1,1]`, a tinted block carries its tint.
- textures: `paintLayer` writes alpha; the `cross` pattern yields transparent background + opaque plant pixels.
- Decorations: deterministic scatter (same seed → same plants; plants only above `GRASS`).
- Render (materials, cutout discard, tint multiply) verified by `npm run build` + an in-app smoke (place a slab and a flower; confirm a slab shows the neighbour's full side face and a flower renders with a transparent background).

## Rollout
One branch/PR stacked on #26. After E1 merges, E2 (stairs/fences + the orientation/metadata decision) and biome-driven tint become their own plans. Update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories after merge (new shapes, the cutout pass, the tint attribute).
