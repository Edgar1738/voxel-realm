# The World Atlas

The **World Atlas** is a master world that gathers the curated saves into a single map. You spawn
at a central hub and travel outward — a signpost road east to the Moonspire Citadel, west to
Tidewreck Cove, north to the Glow Caverns — with each realm placed as its own explorable district.

Boot it at [`?save=atlas`](../../?save=atlas) (it is also the **Featured** card on the front-door
menu). The individual worlds still open exactly as before (`?save=moonspire-realm`, etc.) — the
atlas is additive and never touches them.

## How it works

The atlas is assembled, not authored. Nothing is copied by hand; it is composed at load time from
the same `public/worlds/<slug>.json` bundles the single shipped worlds use.

```
World Atlas = flat terrain  +  hub deltas  +  Σ (region deltas translated to atlas coordinates)
```

- **Base terrain.** The `atlas` preset is flat grass at sea level — byte-identical to the `flat`
  preset every curated save was built on. Because a save's snapshot stores only its *diff* from
  that flat base, dropping those diffs onto identical flat terrain reconstructs each world exactly
  (including the caves the Glow Caverns carved out of the ground).
- **Region placement.** Each region is shifted by a **chunk-aligned** world offset. Shifting by
  whole chunks moves the chunk key but leaves every voxel's position *inside* its chunk untouched,
  so relative block positions are preserved perfectly. Regions are spaced far enough apart that
  their chunk footprints never overlap (the assembler throws if they do).
- **Lazy streaming.** The assembled world is fed through the existing `ShippedWorldStore` →
  `ChunkManager` delta pipeline. Region blocks are held as per-chunk deltas and only stamped into a
  chunk when the player streams near it — nothing is meshed eagerly. (The heavyweight Giza and
  Washington Park saves, ~8 MB each, are left out of V1 to keep the boot-time fetch small.)
- **Navigation.** A central beacon spire marks the hub; a signpost pillar + gravel road points
  toward each region. The atlas's `WorldMeta` also carries a landmark and a guided-tour waypoint
  per region, so the in-game tour (gold beacon + distance HUD) and intro panel work automatically.

Source layout:

| File | Responsibility |
| --- | --- |
| `src/worldgen/atlas/atlasRegions.ts` | The `WORLD_ATLAS_REGIONS` registry + structural validation |
| `src/worldgen/atlas/atlasWorld.ts` | Pure assembler: translate + merge regions, build the hub, synthesize meta |
| `src/persistence/atlasBase.ts` | Fetches the region snapshots and calls the assembler |
| `src/app/bootStore.ts` | Routes the `atlas` world name to the assembled store |

## Adding another saved world to the atlas

1. **Bundle the save.** The world must already be a curated, packaged save — a
   `world-manifest.json` entry with a matching `public/worlds/<slug>.json` bundle. If it is not yet,
   follow [authoring-worlds.md](../authoring-worlds.md) and run `npm run world:bundle`.

2. **Add a registry row** in `src/worldgen/atlas/atlasRegions.ts`:

   ```ts
   {
     id: 'colosseum',            // unique, URL/log-safe atlas id
     name: 'The Colosseum',      // shown as a landmark + tour label
     sourceSave: 'colosseum',    // the manifest slug / public/worlds bundle name
     position: { x: 0, y: 0, z: 640 }, // world-space anchor; x & z MUST be multiples of 16
     direction: 'south',         // aims the hub signpost + road
     blurb: 'A Roman arena rebuilt block by block.',
   },
   ```

   Placement rules:
   - **`x` and `z` must be multiples of the chunk size (16).** This is what keeps a region's blocks
     landing whole-chunk-to-whole-chunk with their layout intact.
   - **`y` is normally `0`.** The curated saves already sit at sea level; a non-zero `y` would lift
     the whole region into the sky. (A vertical offset *is* supported — the assembler re-indexes and
     drops anything pushed out of the world — but you rarely want it.)
   - **Keep footprints from overlapping.** Give each new region its own corridor of empty chunks.
     A region's footprint is its save's chunk span (see `chunkCount` in the manifest) shifted by
     `position`; leave a comfortable buffer. The tests below will fail loudly if two regions collide.

3. **Run the checks.** `npm test` covers the atlas invariants (unique ids, chunk-aligned + spaced
   placement, referenced saves exist, region footprints stay disjoint, and every region block
   survives translation). `npm run build` typechecks. No `world:bundle` change is needed unless you
   added a brand-new save.

## Known limitations (V1)

- Only three regions ship (Citadel, Harbor, Caverns). Giza and Washington Park are excluded until
  the assembler streams region snapshots on approach instead of fetching them all at boot.
- Roads are straight, axis-aligned gravel paths to each region's near edge; the "last mile" to the
  authored arrival point is handled by the guided-tour beacon.
- Placement is manual (hand-picked `position`s). There is no automatic packer yet.
