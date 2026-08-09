import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { SEA_LEVEL } from '../core/constants';
import { mulberry32 } from '../core/math';
import { HeightGenerator } from './HeightGenerator';
import { fbm2D } from './fbm';
import type { WorldSeed } from '../core/types';

export const KINGSHOLLOW = {
  villageY: SEA_LEVEL + 4,
  castleY: SEA_LEVEL + 10,
  abbeyY: SEA_LEVEL + 8,
  riverX: 108,
} as const;

const cache = new Map<WorldSeed, NoiseFunction2D>();

function sampler(seed: WorldSeed): NoiseFunction2D {
  let noise = cache.get(seed);
  if (!noise) {
    noise = createNoise2D(mulberry32((seed ^ 0x4b1a65) >>> 0));
    cache.set(seed, noise);
  }
  return noise;
}

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Gentle outer countryside, a level village green, and a low motte for the castle. */
export function kingshollowSurfaceAt(seed: WorldSeed, wx: number, wz: number): number {
  const rolling =
    SEA_LEVEL +
    5 +
    fbm2D(sampler(seed), wx, wz, {
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2,
      frequency: 1 / 120,
    }) *
      4;

  const villageDistance = Math.hypot(wx / 82, (wz - 4) / 72);
  const villageBlend = 1 - smoothstep(0.78, 1.08, villageDistance);
  let height = rolling + (KINGSHOLLOW.villageY - rolling) * villageBlend;

  // The castle crowns the northern end without becoming a mountain-scale fortress.
  const castleDistance = Math.hypot(wx / 29, (wz + 45) / 23);
  const castleBlend = 1 - smoothstep(0.72, 1.08, castleDistance);
  height += (KINGSHOLLOW.castleY - height) * castleBlend;

  // Four authored district benches extend the settlement without flattening the whole shire.
  const districts: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [0, 130, 70, 64, KINGSHOLLOW.villageY], // southern merchant ward
    [-128, 42, 82, 76, KINGSHOLLOW.villageY], // western farms
    [137, 20, 70, 72, KINGSHOLLOW.villageY], // eastern industry
    [0, -137, 66, 58, KINGSHOLLOW.abbeyY], // northern abbey ridge
  ];
  for (const [dx, dz, rx, rz, level] of districts) {
    const distance = Math.hypot((wx - dx) / rx, (wz - dz) / rz);
    const blend = 1 - smoothstep(0.76, 1.08, distance);
    height += (level - height) * blend;
  }

  // A winding north-south river defines the eastern edge. The HeightGenerator fills its bed to
  // sea level, while the expansion overlay supplies bridges and waterside architecture.
  const riverCenter = KINGSHOLLOW.riverX + Math.sin(wz / 47) * 8;
  const riverDistance = Math.abs(wx - riverCenter);
  const riverBlend = 1 - smoothstep(6, 12, riverDistance);
  height += (SEA_LEVEL - 3 - height) * riverBlend;
  return height;
}

export function createKingshollowGenerator(): HeightGenerator {
  return new HeightGenerator(kingshollowSurfaceAt, SEA_LEVEL);
}
