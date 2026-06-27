// src/persistence/ServerSaveStore.ts
import type { SaveStore } from './SaveStore';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';
import { parseWorldSnapshot, snapshotToDeltas, type WorldSnapshot } from './WorldSnapshot';

const ENDPOINT = '/__world';

/** SaveStore backed by the `/__world` dev endpoint, so worlds are shared across browser profiles. */
export class ServerSaveStore implements SaveStore {
  constructor(
    private readonly name: string,
    private readonly isValidBlockId: (id: number) => boolean,
  ) {}

  private url(params: Record<string, string>): string {
    const q = new URLSearchParams({ name: this.name, ...params });
    return `${ENDPOINT}?${q.toString()}`;
  }

  async loadMeta(): Promise<WorldMeta | undefined> {
    return (await this.fetchSnapshot())?.meta;
  }

  async saveMeta(meta: WorldMeta): Promise<void> {
    await this.post(this.url({ meta: '1' }), { meta });
  }

  async loadDeltas(): Promise<WorldDeltas> {
    const snap = await this.fetchSnapshot();
    return snap ? snapshotToDeltas(snap) : new Map();
  }

  async saveChunkDelta(chunkKey: string, entries: ChunkDeltaEntries): Promise<void> {
    await this.post(this.url({ chunk: chunkKey }), { entries });
  }

  async clearDeltas(): Promise<void> {
    await this.post(this.url({ clear: '1' }), undefined);
  }

  private async post(url: string, body: unknown): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      console.error('Voxel Realm: world save failed', err);
    }
  }

  private async fetchSnapshot(): Promise<WorldSnapshot | undefined> {
    try {
      const res = await fetch(this.url({}));
      if (!res.ok) return undefined;
      const json = (await res.json()) as unknown;
      return parseWorldSnapshot(json, { isValidBlockId: this.isValidBlockId }).snapshot;
    } catch (err) {
      console.error('Voxel Realm: world load failed', err);
      return undefined;
    }
  }
}
