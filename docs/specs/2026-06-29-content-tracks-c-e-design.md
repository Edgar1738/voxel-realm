# Content Tracks C & E — Design (roadmap)

- **Date:** 2026-06-29
- **Status:** Approved (design); Phase C plan pending. Phase E outlined only.
- **Branch:** `claude/content-track-c` (off `main` @ `988eda2`)
- **Origin:** The remaining content/feature tracks from the 2026-06-28 multi-agent review, now unblocked by the data-driven block registry (#24) and the stability/API hardening (#25).

## Context

PR #24 made adding a *full-cube* block one declarative `BLOCK_DEFS` row and unified the dev/worldgen prefab type; PR #25 hardened the agent-facing APIs. The two remaining review tracks are content: **C (cheap content — full-cube blocks + prefabs, zero engine change)** and **E (the non-cube shape system)**. This roadmap specs **Phase C in full** and **outlines Phase E** as the following plan.

## Phase C — Cheap content

**Goal:** Add a curated set of new blocks, prefabs, a biome, and worldgen wiring — all using the existing full-cube mesher and the data-driven registry. No engine/mesher/save changes.

### New blocks (~8)
Each block is a new **append-only id** in `src/blocks/blocks.ts` (next free id is **19**; never reorder/reuse) + a `BLOCK_DEFS` row with a `TextureSpec`, the `creative: true` flag where it should appear in the picker, and `light` for emitters. Most reuse existing `textures.ts` patterns with new colors; a few add a small new pattern (see "texture patterns" below).

| id | name | flags | texture | creative |
|----|------|-------|---------|----------|
| 19 | `deepslate` | opaque | `stone` pattern, dark palette `[70,70,76]` | yes |
| 20 | `emerald ore` | opaque | `ore` pattern, green spot `[40,200,110]` | no (mined) |
| 21 | `glowstone` | opaque, `light: 15` | new `glow` pattern (bright speckle) `[230,200,110]` | yes |
| 22 | `bookshelf` | opaque | `{ top/bottom: planks, side: new bookshelf pattern }` | yes |
| 23 | `furnace` | opaque | `{ top: stone, side: new furnace-side pattern, bottom: stone }` | yes |
| 24 | `mud` | opaque | `speckle`, brown-grey `[90,74,60]` amp 14 | yes |
| 25 | `terracotta` | opaque | `speckle`, orange `[170,96,70]` amp 16 | yes |
| 26 | `gravel` | opaque | `speckle`, grey `[120,116,112]` amp 26 | yes |

**Texture patterns:** `deepslate`/`emerald ore`/`mud`/`terracotta`/`gravel`/`glowstone` reuse existing patterns (`stone`/`ore`/`speckle`) with new colors. `glowstone`, `bookshelf`, and `furnace` get a distinct look via **small new `PatternName` builders** in `src/blocks/textures.ts` (each ~5 lines, like the existing builders) wired into the `buildPattern` dispatch — this is the data-driven extension path #24 built, not an engine change. (If a builder turns out fiddly, fall back to a near-existing pattern with new colors.)

**Touch-points per block:** `blocks.ts` (id const + `BLOCK_DEFS` row) and — for the 3 distinct looks — `textures.ts` (new `PatternName` + builder). The creative picker derives automatically; `TextureArray` renders automatically.

### New prefabs (`src/worldgen/prefabs.ts`)
Each returns a `Prefab` (the unified type), built from existing + new blocks, like the existing `cottage`/`well`/`lampPost`/`ruinedTower`/`brokenWall`:
- `barn` — plank/wood barn with a wide doorway and a pitched roof.
- `watchtower` — tall cobblestone tower with a railed top and a lantern.
- `bridge` — a plank deck with support posts, spanning a gap (water/ravine).
- `marketStall` — a small wood-frame stall with a cloth (wool/planks) canopy.
- `farmPlot` — a tilled dirt patch bordered by wood, with a few `crop` blocks (reuse `LEAVES`/a green block, or a tiny crop block — keep to existing blocks to avoid scope creep).

Each has unit tests mirroring `tests/prefabs.test.ts` (dims, non-air block count, expected blocks at key offsets).

### New biome + preset
- **Swamp biome:** add `Swamp` to the `Biome` enum (`src/worldgen/BiomeMap.ts`) + a `classify` branch (warm + very wet + low) + a `SurfacePainter` rule (mud surface cap, water pools at/below sea level). Reuses the existing water system (`WaterFiller`).
- **Preset wiring (chosen):** the Swamp biome joins the **default biome world** (so it appears via `?world=default`), and a **new `frontier` preset** (`src/worldgen/Presets.ts`) scatters `barn`/`watchtower`/`marketStall`/`farmPlot` (and `bridge` over water) via the existing `scatterStructures` overlay. Add **emerald ore** to `OreScatterer` bands (rare, deep). `deepslate` ships as a craftable/creative block + ore matrix recolor for now (not a new terrain stage — that would be engine work, out of scope for Phase C).

### Constraints (Phase C)
- Block ids append-only, ids ∈ [0,255]; `CREATIVE_BLOCKS` derives from `creative`; the registry self-check must still pass (id/light range, faces resolve).
- Save schema unchanged; mesher contract unchanged; determinism preserved (any new scatter uses `Math.imul` hashing like the existing scatterers).
- Strict TS / no `any`; CI green.

### Testing (Phase C)
Registry self-check covers the new blocks at boot; per-block: a `blocks.test.ts` assertion that each new id resolves to faces and (for glowstone) `emission === 15`. Prefab tests per new prefab. Biome test: a seed/coords that classify Swamp. Scatter determinism test for the new preset. `TextureArray` test: layer count grows by the number of new unique specs.

## Phase E — Non-cube shape system (outline only; separate plan)

**Goal:** Unlock slabs/stairs/fences/cross-plants + per-block color tint — the "alive world" content that needs geometry beyond full cubes.

**Sketch (to be specced as its own plan):**
- Add `shape?: 'cube' | 'slab' | 'stair' | 'cross'` to `BlockDef` (default `cube`). Block id → shape (no save change; rotation/state metadata is a later, separate concern).
- Mesher: a per-block shape dispatch in the chunk-mesh path — greedy faces for `cube` (unchanged), template geometry for `slab`/`stair`, two diagonal billboard quads for `cross` (plants) skipping AO/face-culling. The existing `faces` layer mapping is reused; only geometry generation branches.
- Per-block **color tint:** a per-vertex tint attribute emitted by the mesher (from a block/biome lookup) multiplied in `ChunkMaterial`'s fragment shader — enables biome-tinted grass and dyed variants cheaply.
- New content enabled: stairs, slabs, fences, doors (if a hinged variant is in scope), flowers, tall grass.
- Risks to resolve in that plan: transparent/cutout handling for cross-plants, the shape-emitter interface, and whether tint and shape land together or in sub-phases.

## Rollout
Phase C lands as one branch/PR (subagent-driven). Phase E gets its own spec + plan afterward. After Phase C merge, update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories with the new blocks/prefabs/biome.
