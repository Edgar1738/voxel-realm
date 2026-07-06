import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import { WORLD_HEIGHT } from '../core/constants';
import { fbm2D, type FbmOptions } from './fbm';
import { BiomeMap } from './BiomeMap';
import type { HeightAt } from './HeightGenerator';
import type { WorldSeed } from '../core/types';

const BASE_HEIGHT = 64;
const SHAPE: FbmOptions = { octaves: 4, persistence: 0.5, lacunarity: 2, frequency: 1 / 192 };

const shapeBySeed = new Map<WorldSeed, NoiseFunction2D>();
const biomeBySeed = new Map<WorldSeed, BiomeMap>();

function shapeFor(seed: WorldSeed): NoiseFunction2D {
  let n = shapeBySeed.get(seed);
  if (!n) {
    n = createNoise2D(mulberry32(seed));
    shapeBySeed.set(seed, n);
  }
  return n;
}

function biomesFor(seed: WorldSeed): BiomeMap {
  let m = biomeBySeed.get(seed);
  if (!m) {
    m = new BiomeMap(seed);
    biomeBySeed.set(seed, m);
  }
  return m;
}

/**
 * The default/caverns world's surface height for a column: an fBm "shape" channel scaled by
 * biome-blended amplitude/base, floored and clamped. The single source of truth shared by terrain
 * generation (HeightField) and surface overlays (tree/cactus scattering), so nothing drifts off the
 * ground.
 */
export const layeredSurfaceAt: HeightAt = (seed, wx, wz) => {
  const s = fbm2D(shapeFor(seed), wx, wz, SHAPE); // [-1, 1]
  const { amplitude, baseOffset } = biomesFor(seed).blendedTerrain(wx, wz);
  let height = Math.floor(BASE_HEIGHT + baseOffset + s * amplitude);
  if (height < 1) height = 1;
  if (height > WORLD_HEIGHT - 1) height = WORLD_HEIGHT - 1;
  return height;
};
