import { mulberry32 } from '../core/math';
import { WOOD, LEAVES, GRASS, SNOW } from '../blocks/blocks';
import { scatterStructures } from './Structures';
import { BiomeMap } from './BiomeMap';
import { surfaceCap } from './SurfacePainter';
import type { Prefab, PrefabVoxel } from '../core/Prefab';
import type { ScatterOptions } from './Structures';
import type { Overlay } from './Generator';
import type { HeightAt } from './HeightGenerator';
import type { WorldSeed } from '../core/types';

/**
 * Deterministic oak tree prefabs, routed through the structure scatterer so their canopies can
 * span chunk borders (the old chunk-local overlay silently clipped cross-chunk leaves). Every
 * variant shares one footprint with the trunk at the center column, so a single `anchorOffset`
 * seats any of them by the trunk — never floating or burying a wide canopy on a slope.
 */

/** Shared width/depth of every oak variant. Must stay <= a scatterer cell so trees don't grid-pin. */
export const OAK_FOOTPRINT = 9;

/** The trunk's `[dx, dz]` column within the footprint — pass this as the scatterer's anchorOffset. */
export const OAK_TRUNK_OFFSET: [number, number] = [
  Math.floor(OAK_FOOTPRINT / 2),
  Math.floor(OAK_FOOTPRINT / 2),
];

const CENTER = Math.floor(OAK_FOOTPRINT / 2);
const MAX_CANOPY_RADIUS = 3; // <= CENTER, so leaves stay inside [0, OAK_FOOTPRINT - 1]
const VARIANT_COUNT = 8;

/** Build one oak from a seeded RNG: a centered trunk under a layered, edge-noised leaf blob. */
function oak(variantSeed: number): Prefab {
  const rng = mulberry32(variantSeed >>> 0);
  const blocks: PrefabVoxel[] = [];

  const trunkHeight = 4 + Math.floor(rng() * 4); // 4..7
  const trunkTop = trunkHeight - 1;
  for (let y = 0; y <= trunkTop; y++) blocks.push([CENTER, y, CENTER, WOOD]);

  // Stacked discs whose radius swells then tapers -> a rounded blob rather than a box. The canopy
  // starts just below the trunk top so foliage hugs the crown.
  const canopyBottom = trunkTop - 1;
  const canopyLayers = 3 + Math.floor(rng() * 2); // 3..4
  for (let li = 0; li < canopyLayers; li++) {
    const cy = canopyBottom + li;
    const t = canopyLayers > 1 ? li / (canopyLayers - 1) : 0; // 0..1 up the canopy
    // Bell profile peaking a little below the middle, so the widest ring sits low.
    const radius = Math.max(
      1,
      Math.min(MAX_CANOPY_RADIUS, Math.round(MAX_CANOPY_RADIUS * (1 - Math.abs(t - 0.35) * 1.4))),
    );
    const r2 = radius * radius;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0 && cy <= trunkTop) continue; // let the trunk poke through
        const d2 = dx * dx + dz * dz;
        if (d2 > r2 + 1) continue; // circular mask trims the square corners
        if (d2 >= r2 && rng() < 0.4) continue; // edge noise: thin the rim for an irregular outline
        blocks.push([CENTER + dx, cy, CENTER + dz, LEAVES]);
      }
    }
  }
  // A single crown leaf above the top ring gives a slightly pointed silhouette.
  const crownY = canopyBottom + canopyLayers;
  blocks.push([CENTER, crownY, CENTER, LEAVES]);

  return { dims: [OAK_FOOTPRINT, crownY + 1, OAK_FOOTPRINT], blocks };
}

/** The full deterministic oak library. Pure: same output every call. */
export function oakVariants(): Prefab[] {
  const out: Prefab[] = [];
  for (let i = 0; i < VARIANT_COUNT; i++) out.push(oak(0x0a01 + i * 0x9e37));
  return out;
}

/** Roomy default cell so a 9-wide oak has jitter space and never grid-pins to a corner. */
const OAK_CELL_SIZE = 12;

/**
 * Ready-made scatter options for the oak library: a sensible cell size and density, seated by the
 * trunk column. Callers supply the world's `surfaceAt` and may override density/salt/canPlace/etc.,
 * but the trunk anchor is always enforced so canopies never tilt on slopes.
 */
export function oakScatterOptions(
  surfaceAt: (seed: WorldSeed, x: number, z: number) => number,
  extra?: Partial<ScatterOptions>,
): ScatterOptions {
  return {
    cellSize: OAK_CELL_SIZE,
    density: 0.6,
    ...extra,
    surfaceAt,
    anchorOffset: OAK_TRUNK_OFFSET,
  };
}

/** Per-seed biome classifier cache (an Overlay only receives the seed at call time). */
const biomeCache = new Map<WorldSeed, BiomeMap>();
function biomesFor(seed: WorldSeed): BiomeMap {
  let m = biomeCache.get(seed);
  if (!m) {
    m = new BiomeMap(seed);
    biomeCache.set(seed, m);
  }
  return m;
}

/**
 * An overlay that scatters oaks across a heightmap world, seating each trunk one block above the
 * ground and rooting it only where the surface cap is grass or snow — never on beaches, desert sand,
 * swamp mud, or water. Routed through the structure scatterer, so canopies span chunk borders.
 * `surfaceAt` must be the same height function the generator uses, so trees never drift off terrain.
 */
export function scatterOaks(
  surfaceAt: HeightAt,
  seaLevel: number,
  extra?: Partial<ScatterOptions>,
): Overlay {
  const [tdx, tdz] = OAK_TRUNK_OFFSET;
  const seatAt: HeightAt = (s, x, z) => surfaceAt(s, x, z) + 1; // trunk base rests on top of the cap
  return scatterStructures(
    oakVariants(),
    oakScatterOptions(seatAt, {
      cellSize: OAK_CELL_SIZE,
      density: 0.7,
      salt: 0x0a4d,
      ...extra,
      canPlace: (c) => {
        const tx = c.ox + tdx;
        const tz = c.oz + tdz;
        const h = Math.round(surfaceAt(c.seed, tx, tz));
        const cap = surfaceCap(h, biomesFor(c.seed).biomeAt(tx, tz), seaLevel);
        return cap === GRASS || cap === SNOW;
      },
    }),
  );
}
