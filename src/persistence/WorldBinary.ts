// src/persistence/WorldBinary.ts
//
// VRW1: the packed binary form of a world snapshot, replacing the whole-world JSON blob for
// shipped worlds. Decoding is a typed-array scan instead of a multi-MB JSON.parse + per-entry
// object validation, and the header carries a chunk directory so a later loader can range-fetch
// individual chunks without touching the payload format.
//
// Layout (little-endian):
//   bytes 0..3   magic "VRW1"
//   bytes 4..7   u32 header length H
//   bytes 8..8+H UTF-8 JSON header: { meta, entries, chunks: [{ key, start, count }, ...] }
//   (pad to a 4-byte boundary)
//   Uint32Array  indices[entries]   voxelIndex per entry, ascending within each chunk
//   Uint8Array   ids[entries]       block id per entry
//   Uint8Array   states[entries]    orientation/open state per entry
//
// Chunk `start`/`count` address entry ordinals into those three parallel arrays.

// Explicit .ts extensions: this module is reachable from Node scripts (worldBundle) via
// type-stripping, which cannot resolve extensionless relative value imports.
import { CHUNK_VOLUME } from '../core/constants.ts';
import { packVoxel, voxelId, voxelState } from './SaveTypes.ts';
import { parseWorldSnapshot } from './WorldSnapshot.ts';
import type { WorldDeltas, WorldMeta } from './SaveTypes.ts';

const MAGIC = 'VRW1';
const CHUNK_KEY = /^-?\d+,-?\d+$/;

interface HeaderChunk {
  key: string;
  start: number;
  count: number;
}

interface Header {
  meta?: WorldMeta;
  entries: number;
  chunks: HeaderChunk[];
}

export interface DecodedWorldBinary {
  meta: WorldMeta | undefined;
  deltas: WorldDeltas;
  /** Entries dropped by validation (unknown block id / out-of-range index). */
  dropped: number;
}

/** Serializes meta + per-chunk deltas into a VRW1 buffer. Chunk keys and entries are sorted. */
export function encodeWorldBinary(meta: WorldMeta | undefined, deltas: WorldDeltas): ArrayBuffer {
  const chunks: HeaderChunk[] = [];
  const sortedKeys = [...deltas.keys()].sort();
  let total = 0;
  for (const key of sortedKeys) {
    const count = deltas.get(key)!.size;
    if (count === 0) continue;
    chunks.push({ key, start: total, count });
    total += count;
  }

  const header: Header = meta ? { meta, entries: total, chunks } : { entries: total, chunks };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const payloadOffset = align4(8 + headerBytes.length);
  const buffer = new ArrayBuffer(payloadOffset + total * 6);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  bytes.set(new TextEncoder().encode(MAGIC), 0);
  view.setUint32(4, headerBytes.length, true);
  bytes.set(headerBytes, 8);

  const indices = new Uint32Array(buffer, payloadOffset, total);
  const ids = new Uint8Array(buffer, payloadOffset + total * 4, total);
  const states = new Uint8Array(buffer, payloadOffset + total * 5, total);
  let at = 0;
  for (const { key } of chunks) {
    const sorted = [...deltas.get(key)!.entries()].sort((a, b) => a[0] - b[0]);
    for (const [index, packed] of sorted) {
      indices[at] = index;
      ids[at] = voxelId(packed);
      states[at] = voxelState(packed);
      at++;
    }
  }
  return buffer;
}

/**
 * Parses a VRW1 buffer back into meta + deltas, dropping invalid entries (like
 * parseWorldSnapshot). Throws on a structurally broken buffer (bad magic, truncation,
 * malformed header, out-of-range directory) so a corrupt shipped file fails closed at boot
 * instead of quietly serving a partial world.
 */
export function decodeWorldBinary(
  buffer: ArrayBuffer,
  opts: { isValidBlockId: (id: number) => boolean },
): DecodedWorldBinary {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 8 || new TextDecoder().decode(bytes.subarray(0, 4)) !== MAGIC) {
    throw new Error('world binary: bad magic');
  }
  const headerLength = new DataView(buffer).getUint32(4, true);
  if (8 + headerLength > bytes.length) throw new Error('world binary: truncated header');
  const header = parseHeader(
    new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)),
    opts.isValidBlockId,
  );

  const payloadOffset = align4(8 + headerLength);
  const total = header.entries;
  if (payloadOffset + total * 6 > bytes.length) throw new Error('world binary: truncated payload');
  const indices = new Uint32Array(buffer, payloadOffset, total);
  const ids = new Uint8Array(buffer, payloadOffset + total * 4, total);
  const states = new Uint8Array(buffer, payloadOffset + total * 5, total);

  const deltas: WorldDeltas = new Map();
  let dropped = 0;
  for (const { key, start, count } of header.chunks) {
    const chunk = new Map<number, number>();
    for (let i = start; i < start + count; i++) {
      const index = indices[i];
      if (index >= CHUNK_VOLUME || !opts.isValidBlockId(ids[i])) {
        dropped++;
        continue;
      }
      chunk.set(index, packVoxel(ids[i], states[i]));
    }
    if (chunk.size > 0) deltas.set(key, chunk);
  }
  return { meta: header.meta, deltas, dropped };
}

/** Validates the JSON header's shape; throws on anything structurally off. */
function parseHeader(json: string, isValidBlockId: (id: number) => boolean): Header {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('world binary: header is not JSON');
  }
  if (!raw || typeof raw !== 'object') throw new Error('world binary: malformed header');
  const h = raw as Record<string, unknown>;
  const entries = h.entries;
  if (!Number.isInteger(entries) || (entries as number) < 0) {
    throw new Error('world binary: malformed header');
  }
  if (!Array.isArray(h.chunks)) throw new Error('world binary: malformed header');
  const chunks: HeaderChunk[] = [];
  let expectedStart = 0;
  for (const c of h.chunks as unknown[]) {
    const rec = c as Record<string, unknown> | null;
    const key = rec?.key;
    const start = rec?.start;
    const count = rec?.count;
    if (
      typeof key !== 'string' ||
      !CHUNK_KEY.test(key) ||
      start !== expectedStart ||
      !Number.isInteger(count) ||
      (count as number) <= 0 ||
      expectedStart + (count as number) > (entries as number)
    ) {
      throw new Error('world binary: malformed chunk directory');
    }
    expectedStart += count as number;
    chunks.push({ key, start: start as number, count: count as number });
  }
  if (expectedStart !== entries) throw new Error('world binary: malformed chunk directory');
  // Reuse the snapshot meta parser (spawn/look/landmarks/tour validation) on the header's meta.
  const meta = parseWorldSnapshot({ meta: h.meta, chunks: {} }, { isValidBlockId }).snapshot.meta;
  const header: Header = { entries: entries as number, chunks };
  if (meta) header.meta = meta;
  return header;
}

function align4(n: number): number {
  return (n + 3) & ~3;
}
