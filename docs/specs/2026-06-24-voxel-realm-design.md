# Voxel Realm — Design Spec

Date: 2026-06-24
Status: Approved (pending spec review) — Milestone 1 designed in detail; later phases scoped.

## Vision

A Minecraft-like, browser-based voxel world: an effectively **infinite, procedurally
generated** landscape you can fly/walk through and freely edit, with a **pre-built
castle standing at spawn** as the world's signature landmark. Creative-only — no
survival, hunger, crafting grind, mobs, or resource gathering. Unlimited blocks; build,
dig, fly, explore.

This is a clean-room rewrite (TypeScript + three.js), not a port of the existing
Python/Ursina "Castle" repo. The castle there proved the idea of a hand-authored
fortress; here the castle becomes a **structure the world generator places at spawn**
inside a real, expansive world.

## Non-goals (now and likely ever)

- Survival mechanics (health, hunger, damage), mobs/AI, combat, crafting, inventory
  scarcity. (Creative only.)
- Multiplayer / networking. (Single-player.)
- Mod API, redstone-style logic, command system.

## Tech stack & tooling

- **TypeScript** (strict) + **three.js** (WebGL), bundled with **Vite**.
- **Vitest** for unit tests; **ESLint** + **Prettier** for lint/format.
- Noise via a small seeded library (e.g. `simplex-noise`).
- Persistence via **IndexedDB** (browser-local).
- No backend; static site, runs anywhere a browser does.

## Architecture (the anti-spaghetti core)

Small modules, each with one responsibility and an explicit interface. **Dependencies
point inward**: `app` wires everything; lower modules never import `app` or `render`
except where noted. Pure logic (world/worldgen/mesh/edit/persistence) has **no three.js
imports**, so it is unit-testable headlessly and worker-ready.

- `core/` — shared types, math, constants (chunk size, world height, view distance).
- `blocks/` — **block registry**: the single source of truth for block metadata
  (numeric id, name, per-face texture keys, solid/transparent/fluid/emissive…). Pure data.
- `world/` — `ChunkData` (flat typed array) and `ChunkManager` (streaming: which chunks
  are loaded, neighbor lookup, load/unload by camera distance). No rendering.
- `worldgen/` — deterministic generators behind a `Generator` interface;
  pure `(seed, cx, cz) → ChunkData`. Milestone 1 ships one heightmap biome.
- `mesh/` — greedy mesher: `(ChunkData, neighbors) → geometry buffers`
  (positions, normals, texture-layer + tile UVs, baked AO). Pure; no three.js.
- `render/` — three.js scene, chunk-mesh registry, texture-array material, camera,
  frustum culling. The only module that imports three.js heavily.
- `player/` — fly/walk controller and voxel collision against `ChunkData`.
- `edit/` — place / remove / pick, re-mesh of affected chunks, undo/redo.
- `persistence/` — IndexedDB load/save of world meta + per-chunk edit deltas.
- `app/` — composition root: bootstrap, game loop, dependency wiring.
- `workers/` — (later) generation+meshing Web Worker; its interface is defined now so
  it can drop in without rearchitecture.

Each unit must answer: what does it do, how is it used, what does it depend on. If a
file grows large or its boundary blurs, that is a signal to split it.

## Data model

- **Chunk** = a vertical column `CHUNK_X(16) × WORLD_HEIGHT(H) × CHUNK_Z(16)`.
  "Infinite" is horizontal; vertical is bounded (Minecraft-style). H is a constant
  (start ~192; tunable). Storage: a flat `Uint8Array` of length `16*H*16`
  (upgrade to `Uint16Array` if block-type count exceeds 255).
- **Voxel index**: `x + 16 * (z + 16 * y)` (or equivalent fixed convention) — defined
  once in `core/` and used everywhere.
- **Chunk key**: integer `(cx, cz)` column coordinates; world↔chunk↔local conversions
  live in `core/`.
- **Block id 0 = air**; all others are registry entries.

## Chunk pipeline & concurrency

Modeled as async stages behind interfaces: `request(cx,cz) → generate → mesh → upload`.
Milestone 1 runs these on the **main thread** (simple to build and debug), but the
seams are async and serialization-friendly so a **Web Worker pool** can replace the
main-thread implementation later with no change to callers.

Streaming each frame: `ChunkManager` diffs the **desired** chunk set (within view
distance of the camera's column) against the **loaded** set; it generates+meshes newly
desired chunks (budgeted per frame to avoid hitches), and disposes chunks that left
range (free GPU geometry + drop `ChunkData`; edits are already persisted). Border face
culling uses neighbor chunk data, so meshing requires neighbors to be present or treated
as air at the boundary.

## Worldgen (Milestone 1)

A single biome from a seeded 2D noise heightmap: stone fill to `height-4`, a dirt band,
grass on top; air above. Pure and deterministic in `(seed, cx, cz)` so revisiting a
chunk and reloading a save reproduce identical terrain. Biomes, caves, water/sea level,
and structures (the castle) are later phases (see Roadmap).

## Rendering & textures

- **Greedy meshing** merges coplanar same-block faces into large quads.
- A **`DataArrayTexture`** holds one texture per block face as an array layer; greedy
  quads carry a layer index plus tiled UVs, so a merged quad repeats the tile correctly.
  This is the clean solution to the greedy-vs-atlas UV problem (which forced the Python
  repo into per-face, un-merged meshes).
- **Ambient occlusion** baked into vertex colors at mesh time for the characteristic
  voxel shading. Nearest-neighbor filtering; distance fog.
- Textures start as small **procedurally generated** tiles (no asset files), swappable
  for image tiles later.

## Player & editing

- Pointer-lock mouse look; WASD move; Space/Shift; fly toggle; sprint; (carry the
  movement feel proven in the Castle repo: momentum, sprint, crouch, creative flight).
- Voxel collision resolved against `ChunkData` (solidity from the block registry).
- Left-click break, right-click place, middle-click pick; hotbar + a creative block
  picker; **undo/redo** of edits.
- Edits mutate `ChunkData`, re-mesh the affected chunk(s) (and neighbors at borders),
  and enqueue a persistence write.

## Persistence

IndexedDB stores `{seed, version}` and **edit deltas keyed by chunk** →
`{voxelIndex: blockId}`. Loading a chunk = generate from seed, then apply its deltas.
Because the base is regenerated from the seed, the store stays small and survives
worldgen changes guarded by `version`. Writes are debounced.

## Testing strategy

Unit-test the pure logic with Vitest (no WebGL needed):
- worldgen determinism (same seed/coords → identical chunk; hash check),
- coordinate/index conversions and chunk-key math,
- greedy mesher (face merging, counts, AO, border culling with neighbors),
- edit application + undo/redo,
- persistence (de)serialization round-trip and delta application.
Rendering and feel are verified manually in the browser (and can actually be seen,
unlike the headless Python harness).

## Milestone 1 — scope & success criteria

In scope: project skeleton + tooling; `core`, `blocks` (small starter palette), `world`
+ `ChunkManager` streaming, `worldgen` (one heightmap biome), `mesh` (greedy + AO +
texture array), `render`, `player` (fly/walk + collision), `edit` (place/remove/pick +
undo/redo), `persistence`, `app` loop.

Out of scope (later phases): biomes, caves, water/sea level, the castle structure,
day/night, sound, Web Workers, image texture packs.

**Success:** load the page → fly/walk over an infinite, deterministic grassy
heightmap world that streams smoothly as you move; place/remove blocks with undo/redo;
reload the page and your edits persist; pure-logic test suite green.

## Roadmap (after Milestone 1)

- **P2** — Move the chunk pipeline to Web Workers; water + sea level; 3D-noise caves.
- **P3** — Biomes (plains/forest/desert/mountains/snow) + variety blocks + scattered
  trees/features.
- **P4 — Castle at spawn (committed identity feature).** A structure system that stamps
  a pre-built castle into the chunks around the origin, with terrain blended at the seam.
  Port the authored castle layout concept from the Castle repo into a structure
  definition. This is core to the project, not optional.
- **P5** — Day/night cycle, sky/clouds, atmosphere.
- **P6** — Polish: sound, better water/fluids, image texture pack, perf passes.

## Repo & conventions

- New repo **`voxel-realm`** at `C:\Users\Edgar\Desktop\voxel-realm` (active own repos).
- Conventional commits; small atomic commits; lint+test gate before commit.
- The existing Python "Castle" repo is left as-is.

## Resolved decisions

- Stack: TypeScript + three.js (chosen over Python/Ursina and native for the best
  infinite-voxel performance with the cleanest web tooling).
- First milestone: infinite single-biome vertical slice (proves the whole pipeline
  before adding variety).
- Vertical is bounded (height limit); horizontal is effectively infinite.
- Greedy meshing + texture-array (not per-face atlas).
- Castle is a generator-placed structure (P4), not a separate authored map.
