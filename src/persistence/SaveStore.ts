import { packVoxel } from './SaveTypes';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';

/** Durable storage for world meta + per-chunk edit deltas. */
export interface SaveStore {
  loadMeta(): Promise<WorldMeta | undefined>;
  saveMeta(meta: WorldMeta): Promise<void>;
  loadDeltas(): Promise<WorldDeltas>;
  saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void>;
  clearDeltas(): Promise<void>;
}

/** In-memory SaveStore for tests/dev (no durability). */
export class MemorySaveStore implements SaveStore {
  private meta: WorldMeta | undefined;
  private readonly chunks = new Map<string, Map<number, number>>();

  async loadMeta(): Promise<WorldMeta | undefined> {
    return this.meta;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    this.meta = { ...meta };
  }

  async loadDeltas(): Promise<WorldDeltas> {
    const out: WorldDeltas = new Map();
    for (const [key, value] of this.chunks) out.set(key, new Map(value));
    return out;
  }

  async saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void> {
    if (entries.length === 0) this.chunks.delete(chunkKey);
    else this.chunks.set(chunkKey, new Map(entries.map((e) => [e[0], packVoxel(e[1], e[2] ?? 0)])));
  }

  async clearDeltas(): Promise<void> {
    this.chunks.clear();
  }
}
