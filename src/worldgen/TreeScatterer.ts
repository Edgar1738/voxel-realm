import { mulberry32 } from '../core/math';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, GRASS, SNOW, SAND, WOOD, LEAVES, CACTUS } from '../blocks/blocks';
import { BiomeMap, Biome } from './BiomeMap';
import type { Overlay } from './Generator';
import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';

const CANOPY_RADIUS = 2; // keeps the whole tree inside one chunk
const ATTEMPTS = 6; // candidate spots per chunk
const FOREST_CHANCE = 0.85; // dense
const SPARSE_CHANCE = 0.3; // plains / tundra / low mountains
const CACTUS_CHANCE = 0.5;

/** Per-seed BiomeMap cache (the Overlay signature has no context to share one). */
const biomeCache = new Map<WorldSeed, BiomeMap>();
function biomesFor(seed: WorldSeed): BiomeMap {
  let m = biomeCache.get(seed);
  if (!m) {
    m = new BiomeMap(seed);
    biomeCache.set(seed, m);
  }
  return m;
}

/** Per-chunk deterministic RNG, mixing the world seed with chunk coords. */
function chunkRng(seed: WorldSeed, cx: number, cz: number): () => number {
  const h = (Math.imul(seed, 73856093) ^ Math.imul(cx, 19349663) ^ Math.imul(cz, 83492791)) >>> 0;
  return mulberry32(h);
}

/** Finds the surface (topmost non-air) y in a column, or -1 if empty. */
function surfaceY(chunk: ChunkData, x: number, z: number): number {
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) if (chunk.get(x, y, z) !== AIR) return y;
  return -1;
}

/** Stamps a small oak: a wood trunk capped by a leaf canopy (radius 2 then radius 1). */
function growOak(chunk: ChunkData, x: number, z: number, base: number, trunkHeight: number): void {
  const top = base + trunkHeight - 1;
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
  for (let y = base; y <= top && y < WORLD_HEIGHT; y++) chunk.set(x, y, z, WOOD);
}

/** Stamps a 1-wide cactus column. */
function growCactus(chunk: ChunkData, x: number, z: number, base: number, height: number): void {
  for (let y = base; y < base + height && y < WORLD_HEIGHT; y++) chunk.set(x, y, z, CACTUS);
}

/**
 * Deterministic biome-aware vegetation overlay: cacti on desert sand, oaks on grass (or
 * tundra snow). Density varies by biome (dense forests, sparse elsewhere). Only places where
 * the canopy fits inside the chunk and within the world height.
 */
export const scatterTrees: Overlay = (chunk, cx, cz, seed) => {
  const rng = chunkRng(seed, cx, cz);
  const biomes = biomesFor(seed);

  for (let t = 0; t < ATTEMPTS; t++) {
    const x = CANOPY_RADIUS + Math.floor(rng() * (CHUNK_SIZE_X - 2 * CANOPY_RADIUS));
    const z = CANOPY_RADIUS + Math.floor(rng() * (CHUNK_SIZE_Z - 2 * CANOPY_RADIUS));
    const roll = rng();

    const surface = surfaceY(chunk, x, z);
    if (surface < 0) continue;
    const surfaceBlock = chunk.get(x, surface, z);
    const base = surface + 1;
    const biome = biomes.biomeAt(cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z);

    if (biome === Biome.Desert) {
      if (surfaceBlock !== SAND || roll >= CACTUS_CHANCE) continue;
      const height = 1 + Math.floor(rng() * 3); // 1..3
      if (base + height >= WORLD_HEIGHT) continue;
      growCactus(chunk, x, z, base, height);
    } else {
      const onSoil = surfaceBlock === GRASS || (biome === Biome.Tundra && surfaceBlock === SNOW);
      const chance = biome === Biome.Forest ? FOREST_CHANCE : SPARSE_CHANCE;
      if (!onSoil || roll >= chance) continue;
      const trunkHeight = 4 + Math.floor(rng() * 3); // 4..6
      if (base + trunkHeight + 2 >= WORLD_HEIGHT) continue;
      growOak(chunk, x, z, base, trunkHeight);
    }
  }
};
