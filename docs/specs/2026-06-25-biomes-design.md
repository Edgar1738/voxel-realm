# Biomes — Design Spec

Date: 2026-06-25
Status: Approved in brainstorming (pending written-spec review).

> Adds five Minecraft-style biomes — Plains, Forest, Desert, Mountains, Tundra — plus
> altitude snow-caps, layered onto the existing worldgen stage pipeline. A single pure
> `BiomeMap` classifies each column from low-frequency climate noise; downstream stages
> (terrain, surface, vegetation) query it. Built in three runnable slices B1–B3.

## Goal

Make the world feel like distinct regions you travel between — flat sandy deserts, dramatic
snow-capped mountains, dense forests, open plains, and snowy tundra — while keeping worldgen
extensible: adding a future biome is "add a `BiomeDef` entry," not "edit four files."

This continues the environment work (E1–E6) and is consistent with the master design spec
(`docs/specs/2026-06-24-voxel-realm-design.md`, roadmap **P3**): terrain shaping stays in the
generator pipeline, block ids are stable/append-only, pure logic stays three.js-free and
deterministic in `(seed, cx, cz)`.

## Non-goals (this round)

- Minecraft's full multi-noise system (continentalness/erosion/depth/weirdness). We use three
  low-frequency channels (temperature, humidity, mountainousness) — enough for five readable
  biomes.
- Biome-specific structures (villages), rivers, oceans-as-biome (water already exists via
  sea level), or rare/edge biomes (jungle, swamp, mesa).
- A dedicated spruce tree, sandstone, or biome-tinted grass color. Tundra trees reuse oak
  (snowy/sparse); a spruce can come later.
- Smooth *surface-block* blending (only terrain *height* is blended; block-type edges are
  per-column and read fine, like the existing sand↔grass shoreline).

## Architecture: BiomeMap + biome-driven pipeline

A pure `BiomeMap` is the single source of truth. Every downstream stage queries it.

```ts
enum Biome { Plains, Forest, Desert, Mountains, Tundra }

interface BiomeDef {
  biome: Biome;
  /** Terrain amplitude (vertical relief) for this biome. */
  amplitude: number;
  /** Base-height offset added to the global base height. */
  baseOffset: number;
}

class BiomeMap {
  constructor(seed: WorldSeed);
  /** Classifies a column from climate noise. */
  biomeAt(worldX: number, worldZ: number): Biome;
  /** The biome's terrain parameters (for HeightField). */
  defAt(worldX: number, worldZ: number): BiomeDef;
  /** Blended amplitude/base over a small kernel, so biome borders slope smoothly. */
  blendedTerrain(worldX: number, worldZ: number): { amplitude: number; baseOffset: number };
}
```

**Classification** uses three seeded low-frequency noise channels (derived from the world seed
via salted `mulberry32` + `createNoise2D`, the established pattern):

```txt
temperature T in [-1,1], humidity H in [-1,1], mountainousness M in [-1,1]
if   M > MOUNTAIN_THRESHOLD     -> Mountains
elif T > HOT and H < DRY        -> Desert
elif T < COLD                   -> Tundra
elif H > WET                    -> Forest
else                            -> Plains
```

Channels are low-frequency (e.g. ~1/512) so biomes are large and contiguous. The thresholds
are tuned constants in `BiomeMap`.

### Terrain blending (the one subtlety)

Biome borders must not form cliffs. `blendedTerrain` samples `defAt` over a small kernel
(e.g. a 3×3 grid spaced ~8 blocks) and averages `amplitude`/`baseOffset`, producing gradual
slopes across borders. `HeightField` uses these blended params; its fBm **shape** channel
stays. This **replaces E2's relief channel** — amplitude now comes from the (blended) biome,
not a separate relief noise.

Surface block type and vegetation use the **discrete** `biomeAt` at the column (hard edges are
acceptable and natural-looking).

## Biome behaviors

| Biome | amplitude | baseOffset | Surface (B2) | Vegetation (B3) |
|-------|-----------|-----------|--------------|-----------------|
| Plains | low (~8) | 0 | grass on dirt | sparse oaks |
| Forest | low–med (~12) | 0 | grass on dirt | dense oaks |
| Desert | flat (~4) | -1 | sand (cap + band) | cacti, no trees |
| Mountains | high (~55) | +8 | grass→stone; snow above snow line | sparse oaks below tree line |
| Tundra | low–med (~12) | 0 | snow over dirt | sparse oaks (snowy) |

**Snow** (B2) is biome **and** altitude: Tundra columns get a `SNOW` cap; **any** column whose
surface is at or above `SNOW_LINE` gets a `SNOW` cap regardless of biome (so temperate peaks go
white). Beaches/underwater sand near sea level still win where applicable (sand rule already
exists in `SurfacePainter`).

## Blocks (stable, append-only)

```txt
existing: 0 air 1 grass 2 dirt 3 stone 4 sand 5 wood 6 leaves 7 (glass,reserved) 8 water
added:    9 snow (B2)   10 cactus (B3)
```

- `snow`: opaque, white tile.
- `cactus`: opaque, green tile (rendered as a full block this round — no notches/inset).

New `TextureLayer` entries appended; `TEXTURE_LAYER_COUNT` grows accordingly.

## Slice plan (independently-runnable TDD slices)

| Slice | Delivers | Verified |
|-------|----------|----------|
| **B1** | `BiomeMap` (classification + params + blended terrain); `HeightField` uses biome-blended amplitude (replaces E2 relief) | Vitest + eye |
| **B2** | Biome-aware `SurfacePainter` (desert sand, tundra snow, altitude snow-line) + `SNOW` block | Vitest + eye |
| **B3** | Biome-aware vegetation (forest/plains/tundra density, desert cacti) + `CACTUS` block | Vitest + eye |

Each slice gets its own implementation plan in `docs/plans/`, with a lint+test gate before
atomic commits, matching the M1/E workflow. B1 establishes `BiomeMap`; B2/B3 layer onto it.

## Testing strategy

Pure-logic Vitest (no WebGL):
- `BiomeMap`: deterministic; produces all five biomes across a large region; deserts trend
  hot+dry, tundra cold, mountains where M is high; `blendedTerrain` is continuous (small
  delta between adjacent columns — no cliffs) and bounded by the per-biome amplitudes.
- `HeightField`: still deterministic + in-range; terrain variety persists; mountain regions
  reach higher than desert regions.
- `SurfacePainter` (B2): desert columns cap with sand; tundra/high-altitude columns cap with
  snow; plains/forest cap with grass; floor stays stone.
- Vegetation (B3): cacti only in desert, oaks only in non-desert land, density varies by
  biome; deterministic; intra-chunk (canopy fits).

Rendering/feel (distinct regions, smooth borders, snowy peaks, deserts, cacti) verified in
the browser.

## Determinism & persistence

`BiomeMap` and all stages remain pure and deterministic in `(seed, cx, cz)`. Terrain shape
changes here (amplitude now biome-driven), so when persistence (M1E) exists, the master spec's
version-bump rule applies. Block ids are append-only (snow 9, cactus 10).

## Resolved decisions

- Five biomes: Plains, Forest, Desert, Mountains, Tundra; plus altitude snow-caps.
- Climate from three low-frequency noise channels (temperature, humidity, mountainousness).
- Terrain *height* blended across borders; surface/vegetation discrete per column.
- Biome amplitude replaces E2's relief channel; fBm shape channel stays.
- Append blocks: snow (9), cactus (10). Tundra trees reuse oak; spruce/sandstone deferred.
- Built in slices B1 (terrain) → B2 (surface) → B3 (vegetation).
