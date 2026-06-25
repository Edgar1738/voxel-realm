# Voxel Realm — Design Spec

Date: 2026-06-24
Status: Approved (pending spec review) — rev. 2 (incorporates the M1-slicing review).

> **Milestone 1 is delivered in internal slices M1A–M1E, each independently runnable
> in the browser, to avoid a large all-at-once integration failure.**

## Vision

A Minecraft-like, browser-based voxel world: an effectively **infinite, procedurally
generated** landscape you can fly/walk through and freely edit, with a **pre-built
castle standing at spawn** as the world's signature landmark. Creative-only — no
survival, hunger, crafting grind, mobs, or resource gathering. Unlimited blocks; build,
dig, fly, explore.

Clean-room rewrite (TypeScript + three.js), not a port of the Python/Ursina "Castle"
repo. The castle becomes a **deterministic structure overlay the generator stamps at
spawn** inside a real, expansive world (P4).

## Non-goals (now and likely ever)

- Survival mechanics, mobs/AI, combat, crafting, inventory scarcity. (Creative only.)
- Multiplayer / networking. (Single-player.)
- Mod API, redstone-style logic, command system.

## Tech stack & tooling

- **TypeScript** (strict) + **three.js** (WebGL), bundled with **Vite**.
- **Vitest** unit tests; **ESLint** + **Prettier**.
- Seeded noise (e.g. `simplex-noise`). Persistence via **IndexedDB**.
- No backend; static site.

## Architecture (the anti-spaghetti core)

Small modules, one responsibility each, explicit interfaces. **Dependencies point
inward**: `app` wires everything; lower modules never import `app`/`render`. Pure logic
(`core`, `blocks`, `world`, `worldgen`, `mesh`, `edit`, `persistence`) has **no three.js
imports**, so it is unit-testable headlessly and Web-Worker-ready.

### Folder structure

```txt
src/
  app/        main.ts, Game.ts                      (composition root + game loop)
  core/       constants.ts, coords.ts, types.ts, math.ts
  blocks/     BlockRegistry.ts, blocks.ts           (single source of truth, stable ids)
  world/      ChunkData.ts, ChunkManager.ts, ChunkStore.ts
  worldgen/   Generator.ts, HeightmapGenerator.ts
  mesh/       GreedyMesher.ts, Ao.ts, MeshTypes.ts
  render/     Renderer.ts, ChunkMeshRegistry.ts, TextureArray.ts, CameraRig.ts
  player/     PlayerController.ts, Collision.ts
  edit/       VoxelRaycast.ts, EditService.ts, UndoRedo.ts
  persistence/ SaveStore.ts, IndexedDbSaveStore.ts, SaveTypes.ts
  workers/    ChunkWorkerProtocol.ts                (interface defined now; impl later)
  tests/
```

## Data model

- **Chunk** = a vertical column `16 × WORLD_HEIGHT(H) × 16`. Infinite is horizontal;
  vertical is bounded (start `H ≈ 192`, tunable). Storage: flat `Uint8Array`
  (`16*H*16`); upgrade to `Uint16Array` only if block count exceeds 255.
- **Voxel index** convention defined once in `core/coords.ts` and used everywhere.
- **Chunk key** = integer `(cx, cz)`; world↔chunk↔local conversions live in `core/`.

### Block id stability (persistence-critical)

Block ids are a **stable, append-only registry**. Never remove or re-use an id; deprecate
instead. Reordering ids would corrupt existing saves (deltas store ids). Initial table:

```txt
0 = air      1 = grass    2 = dirt     3 = stone
(reserved, added later, never reordered:)
4 = sand     5 = wood     6 = leaves   7 = glass   8 = water   ...
```

## Generation interface (structure overlay seam — added now, castle later)

The generator splits base terrain from structure overlays so the castle (P4) drops in
without rewriting worldgen:

```ts
interface Generator {
  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData;
}
// Overlays are deterministic stamps applied after base terrain.
type Overlay = (chunk: ChunkData, cx: number, cz: number, seed: WorldSeed) => void;
function applyOverlays(chunk: ChunkData, cx: number, cz: number, seed: WorldSeed,
                       overlays: Overlay[]): void;
```

M1 ships `HeightmapGenerator` (one biome) and an **empty overlay list**. P4 adds the
castle overlay (with seam blending). No castle code in M1, but the hook exists.

## Chunk pipeline, states & concurrency

Explicit lifecycle to prevent duplicate requests, races, and re-meshing disposed chunks:

```ts
type ChunkState =
  | 'missing' | 'generating' | 'generated'
  | 'meshing' | 'meshed' | 'uploaded' | 'disposed';
```

(On the main thread some transitions are synchronous; the states still gate work and
make the later move to a Web Worker pool a drop-in change.)

Streaming each frame: `ChunkManager` diffs the **desired** set (within view distance of
the camera column) against the **loaded** set; generates+meshes newly desired chunks
(budgeted per frame to avoid hitches) and disposes chunks that left range (free GPU
geometry + drop `ChunkData`; edits already persisted).

### Border meshing rule (explicit)

- A **missing neighbor counts as air** when meshing a chunk's border (temporary border
  faces are acceptable).
- **When a neighbor loads, re-mesh both touching chunks** so the seam resolves.
- On neighbor **unload**, do **not** over-optimize — leave the current mesh until that
  chunk reloads.

## Worldgen (Milestone 1)

`HeightmapGenerator`: seeded 2D noise → stone fill to `height-4`, dirt band, grass top,
air above. One biome. Pure & deterministic in `(seed, cx, cz)` so revisits and reloads
reproduce identical terrain.

## Rendering & textures

- **Greedy meshing** (lands in M1B) merges coplanar same-block faces.
- **`DataArrayTexture`**: one layer per block-face texture; merged quads carry a layer
  index + tiled UVs (clean solution to greedy-vs-atlas UV repetition).
- **Ambient occlusion** baked into vertex colors at mesh time (M1B). Nearest filtering;
  distance fog.
- **M1 is opaque blocks only.** `transparent`/`fluid`/`emissive` exist in the registry
  as forward-looking fields but transparency sorting / leaves / glass / water are
  **deferred** (separate problem).
- Textures start as small procedural tiles (no asset files); image tiles later.

## Player & editing

- Pointer-lock mouse look; WASD; Space/Shift; fly toggle. Sprint/crouch/momentum can
  follow once basic walking is solid.
- **Collision (keep simple for M1):** player AABB, gravity, grounded check; **step-up
  only after basic walking works**. Solidity sampled from loaded chunks. **A missing
  chunk near the player counts as solid/blocking** so the player never falls through
  unloaded terrain.
- Left-click break, right-click place, middle-click pick; hotbar + creative picker.
- **Undo/redo is session-only** (in-memory stack). Persistence stores the **final edit
  deltas**, not the undo history; a page reload preserves world state but not undo
  history.
- Edits mutate `ChunkData`, re-mesh the affected chunk (and neighbor chunks at borders),
  and enqueue a persistence write.

## Persistence

IndexedDB stores `{seed, version}` + **edit deltas keyed by chunk** →
`{voxelIndex: blockId}`. Load chunk = generate base from seed → apply overlays → apply
deltas. Writes debounced.

**Version rule (strict):** bump `version` whenever `WORLD_HEIGHT`, the voxel-index
convention, block ids, or base worldgen change in a way that invalidates stored deltas.
On version mismatch, refuse to silently apply stale deltas (discard or migrate, with a
warning). Block ids are append-only (see above) so they rarely force a bump.

## Testing strategy

Vitest on pure logic (no WebGL): worldgen determinism (hash check), coord/index math,
greedy mesher (merging, counts, AO, border culling with neighbors), edit + undo/redo,
persistence (de)serialization round-trip + delta application. Rendering/feel verified
manually in the browser.

## Milestone 1 — internal slices (each independently runnable)

- **M1A — Render one chunk.** Vite+TS+three.js skeleton; `BlockRegistry`; `ChunkData`;
  seeded `HeightmapGenerator`; a **basic mesher** + `TextureArray` material; render a
  single generated chunk.
- **M1B — Streaming world + greedy/AO.** `ChunkManager` load/unload around the camera;
  deterministic seams; correct geometry disposal; upgrade meshing to **greedy + AO +
  border culling** (neighbor-aware).
- **M1C — Player.** Pointer lock; flying; walking; AABB collision (missing-chunk =
  solid); fly toggle.
- **M1D — Editing.** Voxel raycast pick; place/remove/pick; re-mesh affected chunk +
  border neighbors.
- **M1E — Persistence + undo/redo.** IndexedDB deltas (reload preserves edits);
  session undo/redo.

### Milestone 1 — Definition of Done

Load the page and spawn into a deterministic grassy voxel world. Chunks stream around
the player horizontally as they move. The player can fly, walk on terrain, look around
with pointer lock, place/remove/pick blocks, undo/redo edits during the session, and
reload the page with edits preserved. Pure worldgen, coordinate, mesh, edit, and
persistence tests pass.

## Roadmap (after Milestone 1)

- **P2** — Web Worker chunk pipeline; water + sea level; 3D-noise caves; transparency.
- **P3** — Biomes (plains/forest/desert/mountains/snow) + variety blocks + trees.
- **P4 — Castle at spawn (committed identity feature).** A deterministic castle
  **overlay** stamped into the chunks around origin via the overlay seam, terrain
  blended at the edges. Core to the project, not optional.
- **P5** — Day/night cycle, sky/clouds, atmosphere.
- **P6** — Polish: sound, better water/fluids, image texture pack, perf passes.

## Repo & conventions

- New repo **`voxel-realm`** at `C:\Users\Edgar\Desktop\voxel-realm`.
- Conventional commits; small atomic commits; lint+test gate before commit.
- The existing Python "Castle" repo is left as-is.

## Resolved decisions

- Stack: TypeScript + three.js. First milestone: infinite single-biome slice, built in
  runnable sub-slices M1A–M1E. Vertical bounded, horizontal infinite. Greedy meshing +
  texture array. Generator has a base+overlay seam. Castle is a P4 overlay. Block ids
  are stable/append-only. M1 is opaque-only; undo is session-only.
