import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, GRASS, FLOWER, TALL_GRASS } from '../blocks/blocks';
import type { ChunkData } from '../world/ChunkData';
import type { Overlay } from './Generator';
import type { WorldSeed } from '../core/types';

/** MurmurHash3 finalizer over 32-bit integer space → [0,1). Mirrors OreScatterer.hashToFloat. */
function hashToFloat(h: number): number {
  let x = h >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000;
}

/** Topmost non-air voxel y in a column, or -1 if the column is empty. */
function surfaceY(chunk: ChunkData, lx: number, lz: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (chunk.get(lx, y, lz) !== AIR) return y;
  return -1;
}

export interface DecorationOptions {
  /** Fraction of grass columns that receive a plant (0..1). Default 0.08. */
  density?: number;
}

/**
 * Scatters flowers / tall grass one voxel above grass surfaces. Deterministic in world
 * coordinates (Math.imul hashing, like OreScatterer) so a column produces the same plant no
 * matter which chunk meshes it — no seams. Runs as a post-terrain overlay (becomes base terrain).
 */
export function scatterDecorations(opts: DecorationOptions = {}): Overlay {
  const density = opts.density ?? 0.08;
  const SALT = 0x0d3c0;
  return (chunk: ChunkData, cx: number, cz: number, seed: WorldSeed): void => {
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const sy = surfaceY(chunk, lx, lz);
        if (sy < 0 || sy + 1 >= WORLD_HEIGHT) continue;
        if (chunk.get(lx, sy, lz) !== GRASS) continue;
        if (chunk.get(lx, sy + 1, lz) !== AIR) continue;
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;
        const hash =
          (Math.imul(wx, 73856093) ^
            Math.imul(wz, 83492791) ^
            Math.imul(seed, 2654435761) ^
            SALT) >>>
          0;
        const r = hashToFloat(hash);
        if (r >= density) continue;
        // Second hash bit chooses the plant so flowers/grass interleave deterministically.
        const pick = hashToFloat((hash ^ 0x9e3779b1) >>> 0);
        chunk.set(lx, sy + 1, lz, pick < 0.35 ? FLOWER : TALL_GRASS);
      }
    }
  };
}
