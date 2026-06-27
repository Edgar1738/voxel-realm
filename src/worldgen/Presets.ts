import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../core/constants';
import { ChunkData } from '../world/ChunkData';
import { AIR, GRASS, DIRT, STONE, COBBLESTONE } from '../blocks/blocks';
import { scatterTrees } from './TreeScatterer';
import { createWorldGenerator } from './LayeredGenerator';
import type { Generator, Overlay } from './Generator';
import type { BlockId, WorldSeed } from '../core/types';

/** Selectable world environments, chosen via the `?world=` query param. */
export type WorldPreset = 'default' | 'flat' | 'void' | 'arena';

export const WORLD_PRESETS: readonly WorldPreset[] = ['default', 'flat', 'void', 'arena'];

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
    case 'default':
    default:
      return { generator: createWorldGenerator(), overlays: [scatterTrees] };
  }
}
