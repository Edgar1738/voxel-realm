import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../core/constants';
import { mulberry32 } from '../core/math';
import { ChunkData } from '../world/ChunkData';
import { AIR, GRASS, DIRT, STONE, COBBLESTONE } from '../blocks/blocks';
import { scatterTrees } from './TreeScatterer';
import { createWorldGenerator } from './LayeredGenerator';
import { HeightGenerator } from './HeightGenerator';
import { fbm2D, type FbmOptions } from './fbm';
import { scatterStructures } from './Structures';
import { cottage, well } from './prefabs';
import type { Generator, Overlay } from './Generator';
import type { BlockId, WorldSeed } from '../core/types';

/** Selectable world environments, chosen via the `?world=` query param. */
export type WorldPreset =
  | 'default'
  | 'flat'
  | 'void'
  | 'arena'
  | 'amplified'
  | 'islands'
  | 'canyon'
  | 'villages';

export const WORLD_PRESETS: readonly WorldPreset[] = [
  'default',
  'flat',
  'void',
  'arena',
  'amplified',
  'islands',
  'canyon',
  'villages',
];

export function isWorldPreset(value: string | null): value is WorldPreset {
  return value !== null && (WORLD_PRESETS as readonly string[]).includes(value);
}

/** Builds a per-y column (index = y) of a uniform layered terrain up to `surface`. */
function flatColumn(surface: number, top: BlockId, sub: BlockId, deep: BlockId): BlockId[] {
  const column: BlockId[] = [];
  for (let y = 0; y <= surface; y++) {
    column[y] = y === surface ? top : y >= surface - 3 ? sub : deep;
  }
  return column;
}

/** Fills every column of every chunk with the same vertical profile. */
class FlatGenerator implements Generator {
  constructor(private readonly column: ReadonlyArray<BlockId>) {}

  generateBaseChunk(_seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = new ChunkData(cx, cz);
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        for (let y = 0; y < this.column.length; y++) {
          if (this.column[y] !== AIR) chunk.set(x, y, z, this.column[y]);
        }
      }
    }
    return chunk;
  }
}

/** Empty world (skyblock): all air, build from nothing. */
class VoidGenerator implements Generator {
  generateBaseChunk(_seed: WorldSeed, cx: number, cz: number): ChunkData {
    return new ChunkData(cx, cz);
  }
}

/**
 * Caches one simplex sampler per seed for a height function. Each function passes its own salt so
 * the three presets draw from independent noise fields even for the same world seed.
 */
function noiseCache(salt: number): (seed: WorldSeed) => NoiseFunction2D {
  const bySeed = new Map<WorldSeed, NoiseFunction2D>();
  return (seed: WorldSeed): NoiseFunction2D => {
    let n = bySeed.get(seed);
    if (!n) {
      n = createNoise2D(mulberry32((seed ^ salt) >>> 0));
      bySeed.set(seed, n);
    }
    return n;
  };
}

const AMPLIFIED_FBM: FbmOptions = {
  octaves: 5,
  persistence: 0.5,
  lacunarity: 2,
  frequency: 1 / 220,
};
const ISLANDS_FBM: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 140 };
const CANYON_FBM: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 160 };

/** Tall, dramatic mountains: a high base biased well above sea level with large amplitude. */
const amplifiedHeight: (seed: WorldSeed, wx: number, wz: number) => number = (() => {
  const noise = noiseCache(0x1234);
  return (seed, wx, wz) => {
    const s = fbm2D(noise(seed), wx, wz, AMPLIFIED_FBM); // [-1, 1]
    return SEA_LEVEL + 30 + s * 60;
  };
})();

/** Archipelago: a base below sea level so only the high crests of the fBm poke above the water. */
const islandsHeight: (seed: WorldSeed, wx: number, wz: number) => number = (() => {
  const noise = noiseCache(0x5a17);
  return (seed, wx, wz) => {
    const s = fbm2D(noise(seed), wx, wz, ISLANDS_FBM); // [-1, 1]
    // Bias the field upward then cube it so low/mid values stay submerged and only peaks emerge.
    const lifted = (s + 0.35) ** 3;
    return SEA_LEVEL - 6 + lifted * 34;
  };
})();

/** Mid plateau cut by sharp ravines: ridge noise carves narrow, deep canyons through a flat top. */
const canyonHeight: (seed: WorldSeed, wx: number, wz: number) => number = (() => {
  const noise = noiseCache(0xc0de);
  const PLATEAU = SEA_LEVEL + 18;
  const DEPTH = 40;
  return (seed, wx, wz) => {
    const ridge = fbm2D(noise(seed), wx, wz, CANYON_FBM); // [-1, 1]
    // (1 - |ridge|) peaks where the noise crosses zero, producing narrow valleys; square it to
    // sharpen the walls so only thin ravines drop the full DEPTH.
    const carve = (1 - Math.abs(ridge)) ** 2;
    return PLATEAU - carve * DEPTH;
  };
})();

const PLAINS_FBM: FbmOptions = { octaves: 3, persistence: 0.5, lacunarity: 2, frequency: 1 / 96 };

/** Gentle rolling plains just above sea level — a calm canvas for scattered villages. */
const plainsHeight: (seed: WorldSeed, wx: number, wz: number) => number = (() => {
  const noise = noiseCache(0x711a);
  return (seed, wx, wz) => {
    const s = fbm2D(noise(seed), wx, wz, PLAINS_FBM); // [-1, 1]
    return SEA_LEVEL + 6 + s * 5;
  };
})();

/** Resolves a preset to its generator + overlays. */
export function createGenerator(preset: WorldPreset): {
  generator: Generator;
  overlays: Overlay[];
} {
  switch (preset) {
    case 'flat':
      return {
        generator: new FlatGenerator(flatColumn(SEA_LEVEL, GRASS, DIRT, STONE)),
        overlays: [],
      };
    case 'arena':
      return {
        generator: new FlatGenerator(flatColumn(SEA_LEVEL, COBBLESTONE, COBBLESTONE, STONE)),
        overlays: [],
      };
    case 'void':
      return { generator: new VoidGenerator(), overlays: [] };
    case 'amplified':
      return {
        generator: new HeightGenerator(amplifiedHeight, SEA_LEVEL),
        overlays: [scatterTrees],
      };
    case 'islands':
      return { generator: new HeightGenerator(islandsHeight, SEA_LEVEL), overlays: [] };
    case 'canyon':
      return { generator: new HeightGenerator(canyonHeight, SEA_LEVEL), overlays: [] };
    case 'villages':
      return {
        generator: new HeightGenerator(plainsHeight, SEA_LEVEL),
        overlays: [
          scatterTrees,
          scatterStructures([cottage(), cottage(), well()], {
            cellSize: 80,
            density: 0.6,
            clusterCount: 5,
            clusterRadius: 9,
            clearFootprint: true,
            surfaceAt: plainsHeight,
          }),
        ],
      };
    case 'default':
    default:
      return { generator: createWorldGenerator(), overlays: [scatterTrees] };
  }
}
