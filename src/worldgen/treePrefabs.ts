import { mulberry32 } from '../core/math';
import { WOOD, LEAVES, GRASS, SNOW, MUD, CACTUS, SAND } from '../blocks/blocks';
import { scatterStructures } from './Structures';
import { BiomeMap, Biome } from './BiomeMap';
import { surfaceCap } from './SurfacePainter';
import type { Prefab, PrefabVoxel } from '../core/Prefab';
import type { ScatterOptions } from './Structures';
import type { Overlay } from './Generator';
import type { HeightAt } from './HeightGenerator';
import type { BlockId, WorldSeed } from '../core/types';

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

/** A tree's crown recipe: trunk-height range, canopy radius/layer ranges, and edge irregularity. */
interface Canopy {
  trunk: [number, number]; // trunk height range (inclusive)
  maxRadius: number; // <= CENTER, so leaves stay inside [0, OAK_FOOTPRINT - 1]
  layers: [number, number]; // canopy layer count range (inclusive)
  peakT: number; // 0..1: where the widest ring sits (low = droopy, high = lollipop)
  edgeNoise: number; // rim-thinning probability, for an irregular outline
}

/** Build a broadleaf tree (oak/birch/swamp): a centered trunk under a layered, edge-noised blob. */
function blob(variantSeed: number, c: Canopy): Prefab {
  const rng = mulberry32(variantSeed >>> 0);
  const blocks: PrefabVoxel[] = [];

  const trunkHeight = c.trunk[0] + Math.floor(rng() * (c.trunk[1] - c.trunk[0] + 1));
  const trunkTop = trunkHeight - 1;
  for (let y = 0; y <= trunkTop; y++) blocks.push([CENTER, y, CENTER, WOOD]);

  // Stacked discs whose radius swells then tapers -> a rounded blob rather than a box. The canopy
  // starts just below the trunk top so foliage hugs the crown.
  const canopyBottom = trunkTop - 1;
  const layers = c.layers[0] + Math.floor(rng() * (c.layers[1] - c.layers[0] + 1));
  for (let li = 0; li < layers; li++) {
    const cy = canopyBottom + li;
    const t = layers > 1 ? li / (layers - 1) : 0; // 0..1 up the canopy
    const radius = Math.max(
      1,
      Math.min(c.maxRadius, Math.round(c.maxRadius * (1 - Math.abs(t - c.peakT) * 1.4))),
    );
    const r2 = radius * radius;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0 && cy <= trunkTop) continue; // let the trunk poke through
        const d2 = dx * dx + dz * dz;
        if (d2 > r2 + 1) continue; // circular mask trims the square corners
        if (d2 >= r2 && rng() < c.edgeNoise) continue; // edge noise thins the rim
        blocks.push([CENTER + dx, cy, CENTER + dz, LEAVES]);
      }
    }
  }
  const crownY = canopyBottom + layers;
  blocks.push([CENTER, crownY, CENTER, LEAVES]);

  return { dims: [OAK_FOOTPRINT, crownY + 1, OAK_FOOTPRINT], blocks };
}

/** Build a conifer (pine/spruce): a tall trunk under stacked conical rings tapering to a tip. */
function conifer(variantSeed: number): Prefab {
  const rng = mulberry32(variantSeed >>> 0);
  const blocks: PrefabVoxel[] = [];

  const trunkHeight = 7 + Math.floor(rng() * 3); // 7..9, taller than the broadleaves
  const trunkTop = trunkHeight - 1;
  for (let y = 0; y <= trunkTop; y++) blocks.push([CENTER, y, CENTER, WOOD]);

  const base = Math.max(1, Math.floor(trunkTop * 0.4)); // foliage starts partway up the trunk
  const tip = trunkTop + 2;
  const span = tip - base;
  for (let cy = base; cy <= tip; cy++) {
    const radius = Math.round(MAX_CANOPY_RADIUS * ((tip - cy) / span)); // widest at base -> 0 at tip
    if (radius <= 0) {
      if (cy > trunkTop) blocks.push([CENTER, cy, CENTER, LEAVES]);
      continue;
    }
    const r2 = radius * radius;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx === 0 && dz === 0 && cy <= trunkTop) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2 + 1) continue;
        if (d2 >= r2 && rng() < 0.25) continue; // light rim noise for a ragged conifer edge
        blocks.push([CENTER + dx, cy, CENTER + dz, LEAVES]);
      }
    }
  }

  return { dims: [OAK_FOOTPRINT, tip + 1, OAK_FOOTPRINT], blocks };
}

const OAK_CANOPY: Canopy = {
  trunk: [4, 7],
  maxRadius: 3,
  layers: [3, 4],
  peakT: 0.35,
  edgeNoise: 0.4,
};
const BIRCH_CANOPY: Canopy = {
  trunk: [6, 9],
  maxRadius: 2,
  layers: [3, 4],
  peakT: 0.55,
  edgeNoise: 0.35,
};
const SWAMP_CANOPY: Canopy = {
  trunk: [3, 4],
  maxRadius: 3,
  layers: [2, 3],
  peakT: 0.15,
  edgeNoise: 0.45,
};

/** Deterministic per-species library: VARIANT_COUNT prefabs from a salted seed stream. */
function variants(salt: number, make: (seed: number) => Prefab): Prefab[] {
  const out: Prefab[] = [];
  for (let i = 0; i < VARIANT_COUNT; i++) out.push(make((0x0a01 + i * 0x9e37) ^ salt));
  return out;
}

/** The deterministic oak library (broad rounded canopy). Pure: same output every call. */
export function oakVariants(): Prefab[] {
  return variants(0x0000, (s) => blob(s, OAK_CANOPY));
}

/** Birch: a taller, slimmer trunk under a narrower crown. */
export function birchVariants(): Prefab[] {
  return variants(0xb17c, (s) => blob(s, BIRCH_CANOPY));
}

/** Conifers (pine/spruce): tall trunks under tapering conical foliage, for snowy ground. */
export function coniferVariants(): Prefab[] {
  return variants(0xc09f, conifer);
}

/** Swamp oak: a short trunk under a wide, low, drooping canopy. */
export function swampOakVariants(): Prefab[] {
  return variants(0x5a3b, (s) => blob(s, SWAMP_CANOPY));
}

/** Temperate broadleaf mix (oak + birch) for grassy ground. */
function broadleafVariants(): Prefab[] {
  return [...oakVariants(), ...birchVariants()];
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
 * Plant a species library across a heightmap world: seat each trunk one block above the ground and
 * root it only on the caps `plantOn` accepts. Routed through the structure scatterer, so canopies
 * span chunk borders. `surfaceAt` must be the same height function the generator uses.
 */
function scatterTreesOnCap(
  library: Prefab[],
  plantOn: (cap: BlockId) => boolean,
  surfaceAt: HeightAt,
  seaLevel: number,
  extra?: Partial<ScatterOptions>,
): Overlay {
  const [tdx, tdz] = OAK_TRUNK_OFFSET;
  const seatAt: HeightAt = (s, x, z) => surfaceAt(s, x, z) + 1; // trunk base rests on top of the cap
  return scatterStructures(
    library,
    oakScatterOptions(seatAt, {
      cellSize: OAK_CELL_SIZE,
      density: 0.7,
      salt: 0x0a4d,
      ...extra,
      canPlace: (c) => {
        const tx = c.ox + tdx;
        const tz = c.oz + tdz;
        const cap = surfaceCap(
          Math.round(surfaceAt(c.seed, tx, tz)),
          biomesFor(c.seed).biomeAt(tx, tz),
          seaLevel,
        );
        return plantOn(cap);
      },
    }),
  );
}

/**
 * Broadleaf trees (oak + birch) for the heightmap presets: rooted on grass or snow, seated a block
 * above the ground, canopies spanning chunk borders.
 */
export function scatterOaks(
  surfaceAt: HeightAt,
  seaLevel: number,
  extra?: Partial<ScatterOptions>,
): Overlay {
  return scatterTreesOnCap(
    broadleafVariants(),
    (cap) => cap === GRASS || cap === SNOW,
    surfaceAt,
    seaLevel,
    extra,
  );
}

/**
 * A biome-accurate forest for the layered world: oak/birch on grass, conifers on snow, and swamp
 * oaks on mud — each species gated to its own surface cap, composed into a single overlay.
 */
export function scatterForest(
  surfaceAt: HeightAt,
  seaLevel: number,
  extra?: Partial<ScatterOptions>,
): Overlay {
  const broadleaf = scatterTreesOnCap(
    broadleafVariants(),
    (cap) => cap === GRASS,
    surfaceAt,
    seaLevel,
    { salt: 0x0a4d, ...extra },
  );
  const conifers = scatterTreesOnCap(
    coniferVariants(),
    (cap) => cap === SNOW,
    surfaceAt,
    seaLevel,
    {
      cellSize: 10,
      density: 0.6,
      salt: 0xc09f,
      ...extra,
    },
  );
  const swampOaks = scatterTreesOnCap(
    swampOakVariants(),
    (cap) => cap === MUD,
    surfaceAt,
    seaLevel,
    { cellSize: 11, density: 0.7, salt: 0x5a3b, ...extra },
  );
  return (chunk, cx, cz, seed) => {
    broadleaf(chunk, cx, cz, seed);
    conifers(chunk, cx, cz, seed);
    swampOaks(chunk, cx, cz, seed);
  };
}

/** A few 1-wide cactus columns (heights 1..3) for desert scatter variety. */
export function cactusVariants(): Prefab[] {
  const out: Prefab[] = [];
  for (let h = 1; h <= 3; h++) {
    const blocks: PrefabVoxel[] = [];
    for (let y = 0; y < h; y++) blocks.push([0, y, 0, CACTUS]);
    out.push({ dims: [1, h, 1], blocks });
  }
  return out;
}

/**
 * An overlay that scatters cacti across a heightmap world, seated one block above the ground and
 * only in desert columns whose surface cap is sand (never beaches, which are sand but not desert).
 * `surfaceAt` must be the same height function the generator uses.
 */
export function scatterCacti(
  surfaceAt: HeightAt,
  seaLevel: number,
  extra?: Partial<ScatterOptions>,
): Overlay {
  const seatAt: HeightAt = (s, x, z) => surfaceAt(s, x, z) + 1;
  return scatterStructures(cactusVariants(), {
    cellSize: 6,
    density: 0.5,
    salt: 0xcac7,
    ...extra,
    surfaceAt: seatAt,
    canPlace: (c) => {
      const h = Math.round(surfaceAt(c.seed, c.ox, c.oz));
      const biome = biomesFor(c.seed).biomeAt(c.ox, c.oz);
      return biome === Biome.Desert && surfaceCap(h, biome, seaLevel) === SAND;
    },
  });
}
