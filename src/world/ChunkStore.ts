import { chunkKey } from '../core/coords';
import type { ChunkData } from './ChunkData';

/** Chunk pipeline lifecycle (full set per spec; M1 uses Generated/Meshed/Disposed). */
export enum ChunkState {
  Missing = 'missing',
  Generating = 'generating',
  Generated = 'generated',
  Meshing = 'meshing',
  Meshed = 'meshed',
  Disposed = 'disposed',
}

export interface ChunkEntry {
  data: ChunkData;
  state: ChunkState;
}

/** In-memory store of loaded chunks keyed by (cx, cz). */
export class ChunkStore {
  private readonly entries = new Map<string, ChunkEntry>();

  has(cx: number, cz: number): boolean {
    return this.entries.has(chunkKey(cx, cz));
  }

  get(cx: number, cz: number): ChunkEntry | undefined {
    return this.entries.get(chunkKey(cx, cz));
  }

  set(cx: number, cz: number, data: ChunkData, state: ChunkState): void {
    this.entries.set(chunkKey(cx, cz), { data, state });
  }

  setState(cx: number, cz: number, state: ChunkState): void {
    const entry = this.entries.get(chunkKey(cx, cz));
    if (entry) entry.state = state;
  }

  delete(cx: number, cz: number): void {
    this.entries.delete(chunkKey(cx, cz));
  }

  keys(): IterableIterator<string> {
    return this.entries.keys();
  }
}
