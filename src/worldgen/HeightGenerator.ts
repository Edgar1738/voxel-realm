import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { ChunkData } from '../world/ChunkData';
import { GRASS, DIRT, STONE, SAND, WATER } from '../blocks/blocks';
import type { Generator } from './Generator';
import type { WorldSeed } from '../core/types';

/** Computes a surface height (in blocks) for a world column. Must be deterministic in (seed, wx, wz). */
export type HeightAt = (seed: WorldSeed, wx: number, wz: number) => number;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Heightmap-driven base terrain: STONE core, DIRT subsurface, a GRASS/SAND top, and WATER
 * filled up to sea level over submerged columns. Pure & deterministic in (seed, cx, cz) given
 * a deterministic `heightAt`.
 */
export class HeightGenerator implements Generator {
  constructor(
    private readonly heightAt: HeightAt,
    private readonly seaLevel: number,
  ) {}

  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = new ChunkData(cx, cz);
    for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        const wx = cx * CHUNK_SIZE_X + lx;
        const wz = cz * CHUNK_SIZE_Z + lz;
        const h = clamp(Math.round(this.heightAt(seed, wx, wz)), 1, WORLD_HEIGHT - 1);

        for (let y = 0; y <= h - 4; y++) chunk.set(lx, y, lz, STONE);
        for (let y = Math.max(0, h - 3); y <= h - 1; y++) chunk.set(lx, y, lz, DIRT);
        chunk.set(lx, h, lz, h > this.seaLevel ? GRASS : SAND);

        for (let y = h + 1; y <= this.seaLevel; y++) chunk.set(lx, y, lz, WATER);
      }
    }
    return chunk;
  }
}
