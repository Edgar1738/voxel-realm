import type { ChunkData } from '../world/ChunkData';
import type { WorldSeed } from '../core/types';
import type { BiomeSource } from './BiomeMap';

/** Shared per-chunk state threaded through the worldgen stages. */
export interface GenContext {
  seed: WorldSeed;
  cx: number;
  cz: number;
  /** Surface height per local (x,z); index = x + CHUNK_SIZE_X * z. Filled by HeightField. */
  heights: Int16Array;
  seaLevel: number;
  /** Biome classification + terrain params, shared across stages. */
  biomes: BiomeSource;
}

/** One pure, ordered step of base terrain generation. */
export interface TerrainStage {
  apply(chunk: ChunkData, ctx: GenContext): void;
}
