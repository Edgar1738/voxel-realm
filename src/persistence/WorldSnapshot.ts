// src/persistence/WorldSnapshot.ts
import { CHUNK_VOLUME } from '../core/constants';
import { voxelId, voxelState, packVoxel } from './SaveTypes';
import type { WorldDeltas, WorldMeta } from './SaveTypes';

type Entry = [number, number] | [number, number, number];

/** A portable, JSON-safe world: optional meta + per-chunk [voxelIndex, blockId, state?] entries. */
export interface WorldSnapshot {
  meta?: WorldMeta;
  chunks: Record<string, Entry[]>;
}

export interface ParseResult {
  snapshot: WorldSnapshot;
  /** How many malformed chunk keys/entries were skipped (for a warning). */
  dropped: number;
}

const CHUNK_KEY = /^-?\d+,-?\d+$/;

export function serializeWorldSnapshot(
  meta: WorldMeta | undefined,
  deltas: WorldDeltas,
): WorldSnapshot {
  const chunks: Record<string, Entry[]> = {};
  for (const [key, map] of deltas) {
    const entries: Entry[] = [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, packed]): Entry => {
        const id = voxelId(packed);
        const state = voxelState(packed);
        return state === 0 ? [index, id] : [index, id, state];
      });
    chunks[key] = entries;
  }
  return meta ? { meta, chunks } : { chunks };
}

export function snapshotToDeltas(snapshot: WorldSnapshot): WorldDeltas {
  const out: WorldDeltas = new Map();
  for (const [key, entries] of Object.entries(snapshot.chunks)) {
    out.set(key, new Map(entries.map((e) => [e[0], packVoxel(e[1], e[2] ?? 0)])));
  }
  return out;
}

/** Defensively parse untrusted JSON into a clean snapshot, dropping anything malformed. */
export function parseWorldSnapshot(
  value: unknown,
  opts: { isValidBlockId: (id: number) => boolean },
): ParseResult {
  let dropped = 0;
  const chunks: Record<string, Entry[]> = {};
  const root = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawChunks =
    root.chunks && typeof root.chunks === 'object' ? (root.chunks as Record<string, unknown>) : {};

  for (const [key, rawEntries] of Object.entries(rawChunks)) {
    if (!CHUNK_KEY.test(key) || !Array.isArray(rawEntries)) {
      dropped++;
      continue;
    }
    const clean: Entry[] = [];
    for (const entry of rawEntries) {
      if (!Array.isArray(entry) || (entry.length !== 2 && entry.length !== 3)) {
        dropped++;
        continue;
      }
      const index = entry[0];
      const id = entry[1];
      const state = entry.length === 3 ? entry[2] : 0;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= CHUNK_VOLUME ||
        !Number.isInteger(id) ||
        !opts.isValidBlockId(id) ||
        !Number.isInteger(state) ||
        state < 0 ||
        state > 255
      ) {
        dropped++;
        continue;
      }
      clean.push(state === 0 ? [index, id] : [index, id, state]);
    }
    if (clean.length > 0) chunks[key] = clean;
  }

  const meta = parseMeta(root.meta);
  return { snapshot: meta ? { meta, chunks } : { chunks }, dropped };
}

function parseMeta(value: unknown): WorldMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const m = value as Record<string, unknown>;
  if (!Number.isInteger(m.seed) || !Number.isInteger(m.version)) return undefined;
  const meta: WorldMeta = { seed: m.seed as number, version: m.version as number };
  if (typeof m.preset === 'string') meta.preset = m.preset;
  return meta;
}
