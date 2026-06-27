import type { BlockId } from '../core/types';
import type { WorldMeta, SerializedDeltas } from './SaveTypes';

/** Durable storage for world meta + edit deltas. */
export interface SaveStore {
  loadMeta(): Promise<WorldMeta | undefined>;
  saveMeta(meta: WorldMeta): Promise<void>;
  loadDeltas(): Promise<SerializedDeltas>;
  putVoxel(chunkKey: string, voxelIndex: number, blockId: BlockId): Promise<void>;
  clearDeltas(): Promise<void>;
}

/** In-memory SaveStore for tests/dev (no durability). */
export class MemorySaveStore implements SaveStore {
  private meta: WorldMeta | undefined;
  private deltas: SerializedDeltas = {};

  async loadMeta(): Promise<WorldMeta | undefined> {
    return this.meta;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    this.meta = meta;
  }

  async loadDeltas(): Promise<SerializedDeltas> {
    return JSON.parse(JSON.stringify(this.deltas));
  }

  async putVoxel(chunkKey: string, voxelIndex: number, blockId: BlockId): Promise<void> {
    (this.deltas[chunkKey] ??= {})[voxelIndex] = blockId;
  }

  async clearDeltas(): Promise<void> {
    this.deltas = {};
  }
}
