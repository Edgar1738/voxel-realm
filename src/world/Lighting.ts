import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, CHUNK_VOLUME } from '../core/constants';
import { voxelIndex } from '../core/coords';

/**
 * Per-voxel baked lighting for a single chunk. Both channels are flat arrays of
 * length CHUNK_VOLUME indexed via {@link voxelIndex}, holding levels in 0..15.
 */
export interface LightField {
  /** Skylight reaching each voxel (15 = open to the sky). */
  sky: Uint8Array;
  /** Block (emitter) light reaching each voxel. */
  block: Uint8Array;
}

/** Chunk-local sampler the flood-fill queries to decide propagation and seeding. */
export interface LightInput {
  /** Whether the local voxel blocks light (and can't hold sky/spread light through it). */
  isOpaque(x: number, y: number, z: number): boolean;
  /** A voxel's own emitted light level, 0..15 (e.g. a lantern = 14); 0 for most blocks. */
  emission(x: number, y: number, z: number): number;
}

const MAX_LIGHT = 15;

// Axis-aligned neighbour offsets (the 6 face neighbours).
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function inBounds(x: number, y: number, z: number): boolean {
  return x >= 0 && x < CHUNK_SIZE_X && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < CHUNK_SIZE_Z;
}

/**
 * BFS flood-fill from already-seeded cells. `levels` carries seed values on entry;
 * `seeds` lists the flat indices of those seeds. Light drops 1 per step and never
 * enters opaque voxels. Uses a FIFO array with a head pointer (no Array.shift).
 */
function propagate(levels: Uint8Array, seeds: number[], input: LightInput): void {
  const queue: number[] = seeds;
  let head = 0;

  while (head < queue.length) {
    const index = queue[head];
    head += 1;
    const level = levels[index];
    if (level <= 1) {
      continue;
    }

    // Decode local coords from the flat index (matches voxelIndex layout).
    const x = index % CHUNK_SIZE_X;
    const rest = (index - x) / CHUNK_SIZE_X;
    const z = rest % CHUNK_SIZE_Z;
    const y = (rest - z) / CHUNK_SIZE_Z;

    const next = level - 1;
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inBounds(nx, ny, nz)) {
        continue;
      }
      if (input.isOpaque(nx, ny, nz)) {
        continue;
      }
      const ni = voxelIndex(nx, ny, nz);
      if (next > levels[ni]) {
        levels[ni] = next;
        queue.push(ni);
      }
    }
  }
}

/**
 * Seed skylight: a non-opaque voxel open to the sky (no opaque voxel anywhere
 * above it in its column) starts at 15. Returns the seeded flat indices.
 */
function seedSky(sky: Uint8Array, input: LightInput): number[] {
  const seeds: number[] = [];
  for (let x = 0; x < CHUNK_SIZE_X; x++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      // Walk down the column; once we hit an opaque voxel, everything below is shadowed.
      let open = true;
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        if (input.isOpaque(x, y, z)) {
          open = false;
          continue;
        }
        if (open) {
          const index = voxelIndex(x, y, z);
          sky[index] = MAX_LIGHT;
          seeds.push(index);
        }
      }
    }
  }
  return seeds;
}

/** Seed block light: every voxel with emission > 0 starts at its emission level. */
function seedBlock(block: Uint8Array, input: LightInput): number[] {
  const seeds: number[] = [];
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const level = input.emission(x, y, z);
        if (level > 0) {
          const index = voxelIndex(x, y, z);
          if (level > block[index]) {
            block[index] = level;
          }
          seeds.push(index);
        }
      }
    }
  }
  return seeds;
}

/**
 * Compute baked sky and block lighting for one chunk via two independent BFS
 * flood-fills. Light drops 1 per step and never enters opaque voxels;
 * out-of-bounds neighbours are ignored (chunk-local).
 */
export function computeChunkLight(input: LightInput): LightField {
  const sky = new Uint8Array(CHUNK_VOLUME);
  const block = new Uint8Array(CHUNK_VOLUME);

  propagate(sky, seedSky(sky, input), input);
  propagate(block, seedBlock(block, input), input);

  return { sky, block };
}
