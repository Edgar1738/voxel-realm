// src/persistence/ShippedWorldStore.ts
import type { SaveStore } from './SaveStore';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';
import { parseWorldSnapshot, snapshotToDeltas } from './WorldSnapshot';

/** A shipped world's read-only content: the packaged meta + chunk deltas. */
export interface ShippedWorldBase {
  meta: WorldMeta;
  deltas: WorldDeltas;
}

/**
 * Fetch and defensively parse a packaged world from static hosting
 * (`<baseUrl>worlds/<slug>.json`, the output of `npm run world:bundle`).
 * Rejects on network/HTTP failure or a snapshot without meta, so boot's
 * fail-closed volatile fallback engages instead of silently showing an empty world.
 */
export async function fetchShippedWorld(
  baseUrl: string,
  slug: string,
  isValidBlockId: (id: number) => boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<ShippedWorldBase> {
  const url = `${baseUrl}worlds/${encodeURIComponent(slug)}.json`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`shipped world "${slug}": fetch failed (${res.status})`);
  const { snapshot, dropped } = parseWorldSnapshot(await res.json(), { isValidBlockId });
  if (dropped > 0)
    console.warn(`Voxel Realm: shipped world "${slug}" had ${dropped} malformed entries dropped.`);
  if (!snapshot.meta) throw new Error(`shipped world "${slug}": snapshot has no meta`);
  return { meta: snapshot.meta, deltas: snapshotToDeltas(snapshot) };
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

  constructor(
    private readonly loadBase: () => Promise<ShippedWorldBase>,
    private readonly overlay: SaveStore,
  ) {}

  private base(): Promise<ShippedWorldBase> {
    return (this.basePromise ??= this.loadBase());
  }

  async loadMeta(): Promise<WorldMeta | undefined> {
    return (await this.base()).meta;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    await this.overlay.saveMeta(meta);
  }

  async loadDeltas(): Promise<WorldDeltas> {
    const [base, overlayDeltas] = await Promise.all([this.base(), this.overlay.loadDeltas()]);
    const out: WorldDeltas = new Map();
    for (const [key, map] of base.deltas) out.set(key, new Map(map));
    for (const [key, map] of overlayDeltas) out.set(key, new Map(map));
    return out;
  }

  async saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void> {
    await this.overlay.saveChunkDelta(chunkKey, entries);
  }

  async clearDeltas(): Promise<void> {
    await this.overlay.clearDeltas();
  }
}
