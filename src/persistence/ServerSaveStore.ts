// src/persistence/ServerSaveStore.ts
import type { SaveStore } from './SaveStore';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';
import { parseWorldSnapshot, snapshotToDeltas, type WorldSnapshot } from './WorldSnapshot';

const ENDPOINT = '/__world';

/** SaveStore backed by the `/__world` dev endpoint, so worlds are shared across browser profiles. */
export class ServerSaveStore implements SaveStore {
  /**
   * In-flight/unconsumed snapshot shared between loadMeta and loadDeltas, so boot's
   * meta-then-deltas sequence fetches + parses the (potentially multi-MB) world once instead
   * of twice. loadDeltas consumes it: later reads re-fetch, so post-boot callers still see
   * fresh disk state (dev worlds are edited by other sessions).
   */
  private snapshotPromise: Promise<WorldSnapshot | undefined> | undefined;

  constructor(
    private readonly name: string,
    private readonly isValidBlockId: (id: number) => boolean,
  ) {}

  private url(params: Record<string, string>): string {
    const q = new URLSearchParams({ name: this.name, ...params });
    return `${ENDPOINT}?${q.toString()}`;
  }

  private snapshotOnce(): Promise<WorldSnapshot | undefined> {
    const promise = (this.snapshotPromise ??= this.fetchSnapshot());
    // Never cache a failure: a rejected fetch must not poison a later retry.
    promise.catch(() => {
      if (this.snapshotPromise === promise) this.snapshotPromise = undefined;
    });
    return promise;
  }

  async loadMeta(): Promise<WorldMeta | undefined> {
    return (await this.snapshotOnce())?.meta;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    await this.post(this.url({ meta: '1' }), { meta });
  }

  async loadDeltas(): Promise<WorldDeltas> {
    const snap = await this.snapshotOnce();
    this.snapshotPromise = undefined;
    return snap ? snapshotToDeltas(snap) : new Map();
  }

  async saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void> {
    await this.post(this.url({ chunk: chunkKey }), { entries });
  }

  async clearDeltas(): Promise<void> {
    await this.post(this.url({ clear: '1' }), undefined);
  }

  private async post(url: string, body: unknown): Promise<void> {
    const init: RequestInit = { method: 'POST' };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
      // keepalive caps fetch bodies at 64KiB and rejects anything larger, which silently
      // starves big chunk deltas (bulk edits) of persistence. Only small bodiless/meta
      // writes can afford it, so plain fetch is used for all payloads instead.
    } else {
      init.keepalive = true;
    }
    // Let failures propagate (network error or non-2xx) so callers can keep the edit dirty
    // and retry instead of silently dropping it.
    const res = await fetch(url, init);
    if (!res.ok) {
      throw new Error(`Voxel Realm: world save failed (${res.status} ${res.statusText})`);
    }
  }

  private async fetchSnapshot(): Promise<WorldSnapshot | undefined> {
    const res = await fetch(this.url({}));
    if (!res.ok) {
      throw new Error(`Voxel Realm: world load failed (${res.status} ${res.statusText})`);
    }
    const json = (await res.json()) as unknown;
    const { snapshot, dropped } = parseWorldSnapshot(json, {
      isValidBlockId: this.isValidBlockId,
    });
    if (dropped > 0) {
      console.warn(
        `Voxel Realm: world "${this.name}" dropped ${dropped} invalid entr${dropped === 1 ? 'y' : 'ies'} on load`,
      );
    }
    return snapshot;
  }
}
