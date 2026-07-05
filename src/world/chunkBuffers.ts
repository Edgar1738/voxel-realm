import { CHUNK_AREA, CHUNK_VOLUME } from '../core/constants';

/**
 * Backing storage for one chunk's voxel arrays, laid out in a single buffer so the whole
 * chunk can be handed to a mesh worker as ONE (Shared)ArrayBuffer reference (P6).
 *
 * Layout: data | skyLight | blockLight | state (CHUNK_VOLUME each) | biomeData (CHUNK_AREA).
 */
export const CHUNK_BUFFER_BYTES = CHUNK_VOLUME * 4 + CHUNK_AREA;

export interface ChunkArrays {
  data: Uint8Array;
  skyLight: Uint8Array;
  blockLight: Uint8Array;
  state: Uint8Array;
  biomeData: Uint8Array;
}

// Off by default: unit tests and non-isolated pages use plain ArrayBuffers. Game.boot
// enables shared backing only when a mesh worker pool will actually read the memory
// (requires crossOriginIsolated, i.e. COOP/COEP headers).
let useShared = false;

/** Enable/disable SharedArrayBuffer backing for newly-allocated chunks (P6 worker meshing). */
export function setSharedChunkBuffers(enabled: boolean): void {
  useShared = enabled && typeof SharedArrayBuffer !== 'undefined';
}

/** Whether new chunks are currently allocated over SharedArrayBuffers. */
export function sharedChunkBuffersEnabled(): boolean {
  return useShared;
}

/** Typed-array views over a chunk buffer at the canonical layout offsets. */
export function chunkArraysOver(buffer: ArrayBufferLike): ChunkArrays {
  return {
    data: new Uint8Array(buffer, 0, CHUNK_VOLUME),
    skyLight: new Uint8Array(buffer, CHUNK_VOLUME, CHUNK_VOLUME),
    blockLight: new Uint8Array(buffer, CHUNK_VOLUME * 2, CHUNK_VOLUME),
    state: new Uint8Array(buffer, CHUNK_VOLUME * 3, CHUNK_VOLUME),
    biomeData: new Uint8Array(buffer, CHUNK_VOLUME * 4, CHUNK_AREA),
  };
}

/** Allocates one chunk's backing buffer (shared when enabled) plus its views. */
export function allocChunkArrays(): { buffer: ArrayBufferLike; arrays: ChunkArrays } {
  const buffer = useShared
    ? new SharedArrayBuffer(CHUNK_BUFFER_BYTES)
    : new ArrayBuffer(CHUNK_BUFFER_BYTES);
  return { buffer, arrays: chunkArraysOver(buffer) };
}
