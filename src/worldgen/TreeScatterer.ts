import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, GRASS, WOOD, LEAVES } from '../blocks/blocks';
import type { Overlay } from './Generator';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const CANOPY_RADIUS = 2; // keeps the whole tree inside one chunk
const MAX_TREES_PER_CHUNK = 4;

/** Per-chunk deterministic RNG, mixing the world seed with chunk coords. */
function chunkRng(seed: WorldSeed, cx: number, cz: number): () => number {
  const h = (Math.imul(seed, 73856093) ^ Math.imul(cx, 19349663) ^ Math.imul(cz, 83492791)) >>> 0;
  return mulberry32(h);
}

/** Finds the surface (topmost non-air) y in a column, or -1 if the column is empty. */
function surfaceY(chunk: ChunkData, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (chunk.get(x, y, z) !== AIR) return y;
  return -1;
}

/** Stamps a small oak: a wood trunk capped by a leaf canopy (radius 2 then radius 1). */
function growOak(chunk: ChunkData, x: number, z: number, base: number, trunkHeight: number): void {
  const top = base + trunkHeight - 1;

  // Leaves: two wide layers around the top, two narrow layers above.
  const placeLeaves = (cy: number, radius: number): void => {
    if (cy >= WORLD_HEIGHT) return;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (chunk.get(x + dx, cy, z + dz) === AIR) chunk.set(x + dx, cy, z + dz, LEAVES);
      }
    }
  };
  placeLeaves(top - 1, 2);
  placeLeaves(top, 2);
  placeLeaves(top + 1, 1);
  placeLeaves(top + 2, 1);

  // Trunk last, so it overrides any leaf placed in the trunk column.
  for (let y = base; y <= top && y < WORLD_HEIGHT; y++) chunk.set(x, y, z, WOOD);
}

/**
 * Deterministic tree overlay: scatters small oaks on grass. Only places where the full
 * canopy fits inside the chunk (no cross-chunk writes this round) and the canopy top stays
 * within the world height.
 */
export const scatterTrees: Overlay = (chunk, cx, cz, seed) => {
  const rng = chunkRng(seed, cx, cz);
  const count = Math.floor(rng() * (MAX_TREES_PER_CHUNK + 1));

  for (let t = 0; t < count; t++) {
    const x = CANOPY_RADIUS + Math.floor(rng() * (CHUNK_SIZE_X - 2 * CANOPY_RADIUS));
    const z = CANOPY_RADIUS + Math.floor(rng() * (CHUNK_SIZE_Z - 2 * CANOPY_RADIUS));
    const trunkHeight = 4 + Math.floor(rng() * 3); // 4..6

    const surface = surfaceY(chunk, x, z);
    if (surface < 0 || chunk.get(x, surface, z) !== GRASS) continue;

    const base = surface + 1;
    if (base + trunkHeight + 2 >= WORLD_HEIGHT) continue; // canopy must fit vertically
    growOak(chunk, x, z, base, trunkHeight);
  }
};
