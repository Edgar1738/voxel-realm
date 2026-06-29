# Foundation + Easier Building — Design

- **Date:** 2026-06-28
- **Status:** Approved (design); implementation plan pending
- **Branch:** `claude/blissful-mclean-3fb896`
- **Origin:** Phase 1 of the multi-agent code review of 2026-06-28 (5 parallel agents across worldgen/content, rendering/meshing, build tooling, world/persistence/server, core/player/tooling).

## Context

Voxel Realm's north star is an environment an AI agent can **roam, build in, and extend** — not just a Minecraft clone. The code review surfaced findings clustered into five tracks: (A) stability bugs, (B) build ergonomics, (C) cheap content, (D) foundational refactors, (E) a non-cube shape system. Two keystones recurred independently across agents: adding a block requires hand-syncing three parallel lists, and `Blueprint` (dev studio) and `Structure` (worldgen) are byte-identical but separate types.

This spec covers **Track D (foundation) + the high-impact slice of Track B (reliability + region transforms)**. It is deliberately the enabler layer: it makes Track C trivial and positions Track E to slot in cleanly later.

## Goals

1. **Adding a block becomes one declarative table row** — id, flags, light, creative visibility, and texture all in one place; no hand-maintained parallel lists.
2. **One `Prefab` type** shared by the dev studio and worldgen, with pure geometric transforms.
3. **Builds are reliable** — a multi-call structure is a single undo, and an edit never silently no-ops on an unloaded chunk without the builder knowing.
4. **Expressive region editing** — `replace`, `move`, `mirror`, `rotate`, `array` available to the `__vr` scripting API, each as one undoable action.

## Non-goals (explicitly out of scope for this phase)

- Non-cube block geometry (slabs, stairs, fences, cross/billboard plants) — Track E. The registry is *shaped* to accept it later but does not implement it.
- New content/blocks/prefabs/biomes — Track C.
- Stability bugs not adjacent to this work: disk-store lost-update race, border-light-on-deletion de-propagation, server payload caps, swim body-sample, transparent depth-sort, `worldToChunkCoord` axis hardcode — Track A. (One adjacent determinism fix *is* folded in; see Component 1.)
- Changing the save format. Block ids remain append-only and persisted; nothing in this phase alters `SAVE_VERSION` or the on-disk/IndexedDB schema.
- Changing the renderer/mesher contract. `BlockRegistry.faceLayer(id, face) → number` stays identical.

## Component 1 — One `Prefab` type + pure transforms

**New module:** `src/core/Prefab.ts`.

```ts
export type PrefabVoxel = [dx: number, dy: number, dz: number, id: BlockId];
export interface Prefab {
  dims: [number, number, number];
  blocks: PrefabVoxel[]; // non-air offsets from the min corner
}
```

**Unification.**
- `Blueprint` in `src/app/DevControls.ts:54` becomes a re-export/alias of `Prefab`.
- `Structure` in `src/worldgen/Structures.ts:13` becomes a re-export/alias of `Prefab`.
- `src/worldgen/prefabs.ts` functions return `Prefab`.
- Consumers (`scatterStructures`, `__vr.copy/paste/stamp`, blueprint save/load) are unchanged at the call site because the shape is identical.

**Pure transforms (no engine dependencies, individually unit-testable):**
- `rotateY(p: Prefab, quarterTurns: number): Prefab` — rotate about the Y axis in 90° steps; recomputes `dims` and remaps each `[dx,dy,dz]`.
- `mirror(p: Prefab, axis: 'x' | 'z'): Prefab` — reflect across the given horizontal axis.
- `repeat(p: Prefab, nx: number, ny: number, nz: number, stride: [number, number, number]): Prefab` — tile the prefab into a grid.
- `normalize(p: Prefab): Prefab` — re-anchor blocks so the min corner is the origin and `dims` is tight (used after transforms).

**Adjacent fix folded in (we are editing this file anyway):** `Structures.ts:62` `placementsAt` hash uses plain `*`, overflowing past 2^53 far from origin and breaking determinism; its siblings (`TreeScatterer`, `OreScatterer`, `CaveTorcher`) were converted to `Math.imul` in commit `ab19cca` but this one was missed. Wrap each multiply in `Math.imul`.

**Bonus enabled (not required this phase):** because scatter now consumes `Prefab`, worldgen can apply `rotateY` to placements for village variety. The plan may include a small hook; if it risks scope creep it moves to Track C.

## Component 2 — Data-driven block registry

**Files touched:** `src/blocks/blocks.ts` (the table), `src/blocks/BlockRegistry.ts` (unchanged public surface), `src/render/TextureArray.ts` (becomes a spec renderer), `src/app/CreativeInventory.ts` (derives its list).

**The table** is the single source of truth. Each entry:

```ts
type RGB = readonly [number, number, number];
type Pixel = (px: number, py: number, rng: () => number) => RGB;

type PatternName =
  | 'speckle' | 'brick' | 'cobble' | 'planks' | 'rings' | 'bark'
  | 'ridges' | 'grassTop' | 'grassSide' | 'stone' | 'leaves'
  | 'glass' | 'lantern' | 'ore';

type TextureSpec =
  | { pattern: PatternName; colors: RGB[]; amp?: number } // declarative
  | { custom: Pixel };                                    // escape hatch

type FaceTextures =
  | TextureSpec                                  // uniform: all 6 faces
  | { top: TextureSpec; side: TextureSpec; bottom: TextureSpec }
  | [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec];

interface BlockDef {
  id: BlockId;          // EXPLICIT, append-only — never reordered or reused
  name: string;
  opaque: boolean;
  transparent: boolean;
  light?: number;       // 0..15 self-emission
  creative?: boolean;   // appears in the creative picker
  faces?: FaceTextures; // omitted only for AIR (the sole faceless block)
}
```

The `PatternName` values map 1:1 onto the builders already in `TextureArray.ts:42-158` (`speckle`, `brick`, `cobble`, `planks`, `rings`, `bark`, `ridges`, `grassTop`, `grassSide`, `stoneFace`, `leaves`, `glass`, `lantern`, `ore`). `colors`/`amp` carry the arguments those builders take today. The `custom` form keeps an arbitrary `Pixel` for anything that outgrows the pattern set.

**Layer derivation (`buildTextureLayers`).** A build step:
1. Walks all `BlockDef.faces`, expanding shorthands into 6 explicit `TextureSpec`s per block.
2. Dedups identical specs into a unique list; assigns each a layer index (this replaces the hand-numbered `TextureLayer` enum).
3. Produces, per block, a resolved `number[6]` of layer indices — exactly the `faces: number[]` the mesher already consumes via `BlockRegistry.faceLayer`.
4. `createTextureArray` iterates the unique spec list and paints each layer by dispatching `pattern → builder` (or calling `custom`). `TEXTURE_LAYER_COUNT` becomes the unique-spec count.

**Derived lists.**
- `CREATIVE_BLOCKS` (`CreativeInventory.ts:19`) is computed as `BLOCK_DEFS.filter(d => d.creative).map(d => d.id)`.
- `TextureLayer` and `TEXTURE_LAYER_COUNT` are derived, not authored.

**Startup self-check** (runs once at registry construction; throws loudly on violation):
- Block ids are unique.
- Every block's faces resolve to a real layer index `< TEXTURE_LAYER_COUNT`.
- Every `creative` id exists in the registry.
- AIR is the only faceless block.

**Invariants preserved.** Block *ids* stay explicit and append-only (saves persist ids). Texture *layer indices* are internal and never persisted, so re-derivation across versions is safe. The mesher/material read path is unchanged.

**Outcome:** adding a block is one `BlockDef` row. No edits to `TextureArray.ts`, `CreativeInventory.ts`, or a layer enum.

## Component 3 — Reliable builds

**Group-undo (`src/edit/EditService.ts`).** Add a transaction API:
- `beginGroup()` — opens a group; captures that the redo stack should clear once.
- `endGroup()` — pushes the accumulated changes as a single `EditBatch` onto the undo stack (capped by `historyLimit`).
- `group<T>(fn: () => T): T` — convenience wrapper that begins, runs `fn`, and ends (even on throw).

While a group is open, `apply()` still mutates the world immediately (so per-call meshing and persistence are unchanged) but appends its `changes` to the open group instead of pushing its own batch. Reverse-replay already handles repeated edits to the same voxel within one batch (`EditService.ts:44-51`), so concatenating changes in order is correct.

`__vr` routes every multi-step builder (`fill`, `sphere`, shape generators, the new region ops) through `group(...)` so each is one undo.

**Auto-preload (`src/world/ChunkManager.ts`, `src/app/DevControls.ts`).**
- Add `ChunkManager.preloadBox(minX, minZ, maxX, maxZ)` that preloads every chunk overlapping the world-space AABB (built on the existing `preload(cx, cz, radius)` / generate+mesh path).
- `__vr` build ops compute the AABB of their voxel list and call `preloadBox` before applying, so an off-screen build no longer silently no-ops on unloaded chunks.
- Retain a loud `console.warn` when `unloaded > 0` as a backstop for any path that bypasses preloading.

**Honest diagnostics (`src/world/ChunkManager.ts` `applyEdits`, `src/app/DevBuildTools.ts`).**
- `applyEdits` returns real categorized counts (`applied`, `outOfWorld`, `unloaded`, `noChange`) instead of `DevControls.ts:177` reconstructing `noChange = requested − applied − outOfWorld − unloaded` (which clamps at 0 and hides discrepancies).
- The result additionally reports the set of unloaded chunk coordinates so a failed build self-diagnoses (and a caller can preload exactly what was missing).
- Fix the return-type annotations on `place/fill/clearBox/sphere/tunnel/...` (`DevControls.ts:358-428`) — they are typed `EditResult` but actually return `BatchedEditResult`.

## Component 4 — Region & prefab transforms in `__vr`

All built on Component 1's pure transforms and Component 3's grouping; each is a single undoable action:

- `replace(x1,y1,z1, x2,y2,z2, fromId, toId)` — scan the box, set every `fromId` voxel to `toId`. Replaces the most common manual read-modify loop.
- `move(x1,y1,z1, x2,y2,z2, dx,dy,dz)` — `copy` → `clearBox` → `paste`, grouped.
- `mirror(x1,y1,z1, x2,y2,z2, axis)` — `copy` → `mirror(Prefab)` → `paste`, grouped.
- `rotate(x1,y1,z1, x2,y2,z2, quarterTurns)` — `copy` → `rotateY(Prefab)` → `paste`, grouped.
- `array(x1,y1,z1, x2,y2,z2, nx,ny,nz, stride)` — `copy` → `repeat(Prefab)` → `paste`, grouped.

These are added to the `__vr` API object in `DevControls.ts` and listed by `__vr.help()`.

## Data flow & interfaces

```
BLOCK_DEFS (declarative table)
   │  buildTextureLayers()
   ├─► unique TextureSpec[]  ──► createTextureArray() ──► DataArrayTexture  (renderer)
   ├─► per-block faces:number[6] ──► BlockRegistry.faceLayer(id,face) ──► GreedyMesher (unchanged)
   └─► creative ids ──► CreativeInventory  ;  light/opaque/transparent ──► Lighting/MeshPass (unchanged)

__vr region op ──► copy region ──► Prefab transform (pure) ──► EditService.group( paste ) ──► one undo
__vr build op  ──► ChunkManager.preloadBox(AABB) ──► EditService.group( applyEdits ) ──► BatchedEditResult (honest counts + unloaded chunks)
```

Public/contract surfaces unchanged: `BlockRegistry` methods, the mesher, the save format, the existing `__vr` method signatures (only additions).

## Error handling

- Registry self-check throws at construction on any inconsistency (fail fast at boot, not at mesh time).
- `group()` always closes the group, even when `fn` throws, so history can't be left half-open.
- Region transforms reuse the existing `MAX_BUILD` cap and `copy`'s 200k region guard; oversize regions throw before mutating.
- `preloadBox` clamps to a sane chunk-count ceiling so a pathological AABB can't generate unbounded chunks.

## Testing strategy

New/extended vitest coverage (matching the existing suite under `tests/`):
- `prefab.test.ts` — `rotateY`/`mirror`/`repeat`/`normalize` correctness, incl. dims recompute and round-trips (rotate ×4 = identity).
- `blocks` / registry — `buildTextureLayers` dedup + resolution, self-check rejects dup ids / dangling faces / non-registry creative ids, derived `TEXTURE_LAYER_COUNT`.
- `editService` — group coalescing (N applies → 1 undo), redo-clear-once semantics, group-with-throw closes cleanly, repeated-voxel reverse-replay within a group.
- `chunkManager` — `preloadBox` covers the right chunk set; `applyEdits` honest counts incl. unloaded chunk coords.
- `devControls` / build tools — `replace`/`move`/`mirror`/`rotate`/`array` produce expected voxels and a single undo entry.
- Determinism regression — `placementsAt` reproducible at large coordinates after the `Math.imul` fix.

CI (tsc + lint + vitest + build) gates all of it.

## Migration & compatibility

- **Saves:** unaffected. Ids unchanged and append-only; layer indices not persisted.
- **Mesher/renderer:** unaffected. Same `faceLayer` contract and texture-array layout semantics.
- **Existing `__vr` scripts / memories:** unaffected; only additive methods.
- **Visual parity:** porting the current 20 textures to specs must reproduce today's look (same builder + same colors + same per-layer seed `0xc0ffee + layer`). Note: layer *indices* may change as specs are deduped; the per-layer seed is index-derived, so a golden-image or per-spec pixel test should pin parity, and any intentional change is reviewed.

## Roadmap tail (subsequent phases, separate specs)

1. **Track A — stability sweep:** disk-store per-world write queue (lost-update race), border block-light de-propagation on deletion, server-side chunk payload caps + index validation, swim feet/head sampling, transparent depth-sort, `worldToChunkCoord` axis safety.
2. **Track C — cheap content:** new ores/furniture/biome cubes + prefabs (barn, bridge, watchtower, farm), now one row / one `Prefab` each.
3. **Track E — shape system:** add an optional `shape?` discriminator to `BlockDef` and a non-greedy mesh path for slabs/stairs/fences/cross-plants + per-block color tint. The `faces`/registry structure from this phase is the seam it attaches to.

## Open questions

None blocking. Two judgment calls deferred to the implementation plan: whether to fold the worldgen rotated-placement hook into this phase or push to Track C, and whether texture parity is pinned via golden pixel tests or per-spec assertions.
