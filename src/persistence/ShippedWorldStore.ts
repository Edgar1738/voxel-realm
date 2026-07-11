// src/persistence/ShippedWorldStore.ts
import type { SaveStore } from './SaveStore';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';
import { parseWorldSnapshot, snapshotToDeltas } from './WorldSnapshot';
import { decodeWorldBinary } from './WorldBinary';
import { recordMeasure } from '../app/bootStats';

/** A shipped world's read-only content: the packaged meta + chunk deltas. */
export interface ShippedWorldBase {
  meta: WorldMeta;
  deltas: WorldDeltas;
}

/**
 * Fetch a packaged world from static hosting: the VRW1 binary (`<baseUrl>worlds/<slug>.vrw`,
 * the output of `npm run world:bundle`) first, falling back to the legacy JSON snapshot
 * (`<slug>.json`) only when the binary is missing (e.g. a stale deploy). A binary that fetches
 * but fails to DECODE is corruption and rejects rather than falling back, and any rejection
 * engages boot's fail-closed volatile fallback instead of silently showing an empty world.
 */
export async function fetchShippedWorld(
  baseUrl: string,
  slug: string,
  isValidBlockId: (id: number) => boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<ShippedWorldBase> {
  const t0 = performance.now();
  const res = await fetchImpl(`${baseUrl}worlds/${encodeURIComponent(slug)}.vrw`);
  if (res.ok) {
    const buffer = await res.arrayBuffer();
    const tFetch = performance.now();
    const { meta, deltas, dropped } = decodeWorldBinary(buffer, { isValidBlockId });
    if (dropped > 0)
      console.warn(`Voxel Realm: shipped world "${slug}" had ${dropped} invalid entries dropped.`);
    if (!meta) throw new Error(`shipped world "${slug}": binary has no meta`);
    // Boot telemetry: network vs decode split. Surfaced by window.__vrBootStats().
    recordMeasure('vr:shipped-fetch+bin', t0, tFetch);
    recordMeasure('vr:shipped-decode', tFetch, performance.now());
    return { meta, deltas };
  }
  return fetchShippedWorldJson(baseUrl, slug, isValidBlockId, fetchImpl);
}

/** The legacy whole-world JSON path (kept as the binary's missing-file fallback). */
async function fetchShippedWorldJson(
  baseUrl: string,
  slug: string,
  isValidBlockId: (id: number) => boolean,
  fetchImpl: typeof fetch,
): Promise<ShippedWorldBase> {
  const url = `${baseUrl}worlds/${encodeURIComponent(slug)}.json`;
  const t0 = performance.now();
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`shipped world "${slug}": fetch failed (${res.status})`);
  const json: unknown = await res.json();
  const tJson = performance.now();
  const { snapshot, dropped } = parseWorldSnapshot(json, { isValidBlockId });
  const tValidate = performance.now();
  if (dropped > 0)
    console.warn(`Voxel Realm: shipped world "${slug}" had ${dropped} malformed entries dropped.`);
  if (!snapshot.meta) throw new Error(`shipped world "${slug}": snapshot has no meta`);
  const deltas = snapshotToDeltas(snapshot);
  // Boot telemetry: how the legacy JSON load splits into network+JSON.parse, defensive
  // validation, and delta materialization. Surfaced by window.__vrBootStats().
  recordMeasure('vr:shipped-fetch+json', t0, tJson);
  recordMeasure('vr:shipped-validate', tJson, tValidate);
  recordMeasure('vr:shipped-to-deltas', tValidate, performance.now());
  return { meta: snapshot.meta, deltas };
}

/**
 * A shipped world: an immutable packaged base plus a per-player overlay store.
 *
 * Reads: meta always comes from the base (the shipped identity — title, spawn, tour — can't be
 * clobbered by overlay bookkeeping), and `loadDeltas` returns the base with overlay chunks
 * REPLACING base chunks. That replace semantic is load-bearing: the chunk manager is seeded with
 * the merged deltas, so every flushed chunk is already the full base+player merge for that chunk.
 *
 * Writes only ever touch the overlay; the base is never mutated, so `clearDeltas` (the
 * incompatible-save discard path) can only lose player edits, never shipped content.
 */
export class ShippedWorldStore implements SaveStore {
  private basePromise: Promise<ShippedWorldBase> | undefined;
  private meta: WorldMeta | undefined;

  constructor(
    private readonly loadBase: () => Promise<ShippedWorldBase>,
    private readonly overlay: SaveStore,
  ) {}

  private base(): Promise<ShippedWorldBase> {
    return (this.basePromise ??= this.loadBase());
  }

  async loadMeta(): Promise<WorldMeta | undefined> {
    return (this.meta ??= (await this.base()).meta);
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    await this.overlay.saveMeta(meta);
  }

  async loadDeltas(): Promise<WorldDeltas> {
    const [base, overlayDeltas] = await Promise.all([this.base(), this.overlay.loadDeltas()]);
    // Hand the packaged base maps to the caller instead of deep-copying them — the base of a
    // large shipped world is hundreds of thousands of entries, and the chunk manager takes
    // ownership of what loadDeltas returns. Dropping the cached base (meta is kept separately)
    // means a hypothetical second loadDeltas re-fetches instead of observing caller mutations.
    this.meta ??= base.meta;
    this.basePromise = undefined;
    const out: WorldDeltas = base.deltas;
    for (const [key, map] of overlayDeltas) out.set(key, map);
    return out;
  }

  async saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void> {
    await this.overlay.saveChunkDelta(chunkKey, entries);
  }

  async clearDeltas(): Promise<void> {
    await this.overlay.clearDeltas();
  }
}
