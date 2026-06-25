# Environment Expansion — Design Spec

Date: 2026-06-25
Status: Approved in brainstorming (pending written-spec review).

> Adds terrain variety, caves, trees, and water (with swim physics) to Voxel Realm —
> restructuring worldgen into a clean, extensible **stage pipeline** first so future
> terrain/landscape features slot in without bloating a god-function. Minecraft-style.

## Goal

Make the world richer and more Minecraft-like — multi-relief terrain, cave systems, oak
trees, and translucent lakes you can swim in — while leaving worldgen organized so adding
the *next* feature (more biomes, ores, structures) is "add a stage/overlay," never "edit a
600-line function."

This work happens **before** M1D (editing) and M1E (persistence); Milestone 1 is completed
afterward. It is consistent with the master design spec
(`docs/specs/2026-06-24-voxel-realm-design.md`): terrain shaping lives in the base
generator, discrete structures are overlays, block ids are stable/append-only, and pure
logic stays three.js-free. It deliberately pulls water (a P2 item) forward, handled cleanly
via a dedicated transparent render pass rather than faked as an opaque block.

## Non-goals (this round)

- Biomes / biome blending (still one global biome; terrain *relief* varies, not biome type).
- Cross-chunk structures (trees are intra-chunk only this round; the castle stays P4).
- Transparent/cutout leaves (leaves render as solid cubes — Minecraft "fast graphics").
- Water flow/spreading, waves, or refraction (water is static, flat, translucent).
- Ores, grass/flowers, snow, ice, sand physics.

## Architecture: the worldgen stage pipeline

Replace the single `HeightmapGenerator` with `LayeredGenerator`, which runs an **ordered
list of pure `TerrainStage`s** over a shared per-chunk context, then chunk overlays are
applied (as today, via `applyOverlays` in `ChunkManager`).

```ts
interface GenContext {
  seed: WorldSeed;
  cx: number;
  cz: number;
  /** Surface height per local (x,z), filled by HeightField; read by later stages. */
  heights: Int16Array; // length CHUNK_AREA, index = x + CHUNK_SIZE_X * z
  seaLevel: number;
}

interface TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void;
}

class LayeredGenerator implements Generator {
  constructor(private stages: TerrainStage[], private seaLevel: number) {}
  generateBaseChunk(seed, cx, cz): ChunkData { /* build ctx, run stages in order */ }
}
```

Stage order (base terrain):

1. **`HeightField`** — multi-octave value/simplex noise → fills `ctx.heights`. Owns all
   terrain *shape* (plains/hills/mountains). The single place to tune relief.
2. **`SurfacePainter`** — from `ctx.heights`: stone fill, dirt band, grass top, and **sand**
   near sea level (beaches/lakeshores). No noise of its own; pure function of heights.
3. **`CaveCarver`** — 3D noise; where the field exceeds a threshold and `y` is below the
   surface (and above a floor margin), set the voxel to air. Never carves the bottom floor
   layers (keeps a solid world floor) and never the grass-surface cap.
4. **`WaterFiller`** — for columns whose terrain **surface is below `seaLevel`** (basins,
   lake/sea floors), fills the air **from just above the surface up to `seaLevel`** with
   water (id 8). It does **not** flood caves under higher terrain (it only fills above the
   surface height), which keeps lakes/seas clean and the rule deterministic and cheap.

Overlay (applied after base, the spec's structure seam — same path the P4 castle uses):

5. **`TreeScatterer`** — deterministic per-chunk hashed placement: for candidate columns
   whose surface is grass and above sea level, stamp an oak (trunk + leaf canopy). **Only
   places where the entire canopy fits inside the chunk** (no cross-chunk writes this
   round); this avoids the multi-chunk-overlay problem and is a documented limitation.

Each stage is a small, single-purpose, independently unit-tested module, pure in
`(seed, cx, cz)`, with no three.js. Adding a future feature = add a `TerrainStage` (or an
overlay) and register it in the pipeline list.

## Blocks (stable, append-only — exactly the master spec's reserved table)

```txt
0=air  1=grass  2=dirt  3=stone   (existing)
4=sand   5=wood   6=leaves   8=water   (added this round)
7=glass  (reserved, unused this round — id kept open, never reassigned)
```

Registry fields per block (the `transparent` field already exists, forward-looking):
- `sand`, `wood`, `leaves`: `opaque: true` (leaves are solid cubes for now).
- `water`: `opaque: false`, `transparent: true` — rendered in the water pass, non-solid for
  collision (so you swim through it), queried by `isWater`.

Per-face textures (procedural tiles, Minecraft-ish): sand (pale), wood (bark sides + ring
top/bottom), leaves (green), water (translucent blue). New `TextureLayer` entries appended.

## Rendering: two-pass greedy meshing

Generalize the greedy mesher to run **per `MeshPass`**; each chunk yields an opaque mesh and
a water mesh.

```ts
interface MeshPass {
  /** Whether a block belongs to this pass. */
  includes(id: BlockId): boolean;
  /** Whether a face of `self` against `neighbor` is visible in this pass. */
  faceVisible(self: BlockId, neighbor: BlockId): boolean;
}
```

- **Opaque pass**: `includes = isOpaque(id)`; `faceVisible = !isOpaque(neighbor)`. Unchanged
  behavior — and because water is non-opaque, submerged lakebed/cave-wall faces still render
  (you see terrain through the water).
- **Water pass**: `includes = (id === WATER)`; `faceVisible = (neighbor === AIR)` — water
  shows only against air (surface + air-exposed sides); water↔water and water↔solid hidden.

`GreedyMesher.mesh(view, pass)` returns `MeshData` (AO/border-culling logic unchanged; the
pass only swaps the include/visibility predicates). `ChunkMeshRegistry` stores an opaque
**and** a water `THREE.Mesh` per chunk key, disposing both on unload. The water mesh uses a
translucent material (`transparent: true`, `depthWrite: false`, bluish, ~0.6 alpha) drawn
after opaque. This `MeshPass` seam is also how glass/other transparents are added later.

## Player: swim physics

`PlayerController` selects one of three modes per frame:

- **Fly** (unchanged) — overrides water; ignores buoyancy.
- **Walk** (unchanged) — gravity + grounded, used when not submerged.
- **Swim** — active when not flying and the body sample is in water.

Swim behavior (Minecraft-aligned, creative): buoyancy replaces gravity — you sink slowly;
**hold Space to swim up, Shift to sink**; horizontal and vertical speeds reduced (~0.6×);
downward speed capped. Collision still runs (water is non-solid, so vertical motion is free;
you still collide with the lakebed and banks). Leaving the water restores walk.

The world provides `ChunkManager.isWater(wx,wy,wz)` (true only for loaded water voxels;
missing chunk / out-of-range → false). `PlayerController.update` takes a sampler exposing
both `isSolid` and `isWater`; `resolveCollision` keeps using only the `isSolid` subset.

## Determinism & persistence

All stages and overlays remain pure and deterministic in `(seed, cx, cz)`, so revisits and
reloads reproduce identical terrain, and the pipeline stays Web-Worker-ready. Persistence
isn't built yet (M1E); when it is, the master spec's **version bump** rule applies because
base worldgen and block ids changed here.

## Testing strategy

Pure-logic Vitest (no WebGL):
- **E1 refactor**: `LayeredGenerator` output is **byte-identical** to the current
  `HeightmapGenerator` for sample chunks (locks the refactor as behavior-preserving).
- `HeightField` determinism + relief range; `SurfacePainter` layering + beach sand;
  `CaveCarver` carves below surface, preserves floor + grass cap; `WaterFiller` fills air
  ≤ sea level only; `TreeScatterer` deterministic placement, grass-only, canopy-in-bounds.
- Two-pass mesher: water faces only against air; opaque submerged faces still emitted;
  counts/merging unchanged for the opaque pass.
- Swim: `PlayerController` enters swim when the water sampler reports submersion, buoyancy
  rises with Space / sinks with Shift, speed reduced; fly overrides water.

Rendering/feel (translucent water, tree look, cave spelunking, swim) verified in-browser.

## Build sequence (independently-runnable TDD slices)

| Slice | Delivers | Verified |
|-------|----------|----------|
| **E1** | Worldgen pipeline refactor: `GenContext`/`TerrainStage`/`HeightField`/`SurfacePainter`/`LayeredGenerator`; **byte-identical** output to today | Vitest (equivalence) |
| **E2** | Terrain variety: multi-octave fBm in `HeightField` (plains/hills/mountains) | Vitest + eye |
| **E3** | Caves: `CaveCarver` 3D-noise stage | Vitest + eye |
| **E4** | Trees: `sand`/`wood`/`leaves` blocks + `TreeScatterer` overlay (intra-chunk) | Vitest + eye |
| **E5** | Water gen + render: `water` block + `WaterFiller` + two-pass mesher + water material | Vitest + eye |
| **E6** | Swim physics: `ChunkManager.isWater` + `PlayerController` swim mode | Vitest + eye |

E1 is a safe no-op refactor that locks the structure before features land. Water gen/render
(E5) precedes swim (E6) since swim needs water to exist. Each slice gets its own
implementation plan (`docs/plans/`) and lint+test gate before atomic commits, matching the
M1A–M1C workflow.

## Resolved decisions

- Worldgen becomes an ordered pure stage pipeline + overlays (extensibility backbone).
- Features: terrain variety, caves, trees, water, swim — Minecraft-style.
- Leaves solid (fast-graphics); only water is transparent, via a dedicated mesh pass.
- Trees intra-chunk this round; cross-chunk structures deferred (castle stays P4).
- Block ids appended per the reserved table (4 sand, 5 wood, 6 leaves, 8 water); 7 glass
  reserved/unused.
- Built in slices E1–E6 before resuming M1D/M1E.
