import { chunkKey } from '../core/coords';
import type { BlockId } from '../core/types';
import type { ChunkData } from '../world/ChunkData';
import type { SerializedDeltas } from './SaveTypes';

/**
 * In-memory authoritative edit deltas (voxelIndex -> blockId) per chunk. Applied to a freshly
 * generated chunk so edits survive unload/reload; the durable copy lives in a SaveStore.
 */
export class ChunkDeltas {
  private readonly byChunk = new Map<string, Map<number, BlockId>>();

  record(cx: number, cz: number, voxelIndex: number, id: BlockId): void {
    const key = chunkKey(cx, cz);
    let m = this.byChunk.get(key);
    if (!m) {
      m = new Map();
      this.byChunk.set(key, m);
    }
    m.set(voxelIndex, id);
  }

  /** Overwrites the chunk's voxels with any recorded edits for that chunk. */
  applyTo(chunk: ChunkData): void {
    const m = this.byChunk.get(chunkKey(chunk.cx, chunk.cz));
    if (!m) return;
    for (const [idx, id] of m) chunk.data[idx] = id;
  }

  serialize(): SerializedDeltas {
    const out: SerializedDeltas = {};
    for (const [key, m] of this.byChunk) {
      const rec: Record<number, BlockId> = {};
      for (const [idx, id] of m) rec[idx] = id;
      out[key] = rec;
    }
    return out;
  }

  load(serialized: SerializedDeltas): void {
    for (const key of Object.keys(serialized)) {
      const m = new Map<number, BlockId>();
      const rec = serialized[key];
      for (const idx of Object.keys(rec)) m.set(Number(idx), rec[Number(idx)]);
      this.byChunk.set(key, m);
    }
  }
}
