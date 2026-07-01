// src/persistence/ServerWorldCatalog.ts
import type { WorldMeta } from './SaveTypes';

const ENDPOINT = '/__world';

export async function listWorlds(): Promise<string[]> {
  try {
    const res = await fetch(`${ENDPOINT}?list=1`);
    if (!res.ok) return [];
    const json = (await res.json()) as { worlds?: string[] };
    return json.worlds ?? [];
  } catch {
    return [];
  }
}

export async function copyWorld(from: string, to: string): Promise<void> {
  const res = await fetch(
    `${ENDPOINT}?name=${encodeURIComponent(from)}&copyTo=${encodeURIComponent(to)}`,
    { method: 'POST' },
  );
  if (!res.ok) {
    throw new Error(`Voxel Realm: copyWorld failed (${res.status} ${res.statusText})`);
  }
}

export async function deleteWorld(name: string): Promise<void> {
  const res = await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Voxel Realm: deleteWorld failed (${res.status} ${res.statusText})`);
  }
}

/** Read the current stored meta for a world (or undefined if the save has none yet). */
export async function readWorldMeta(name: string): Promise<WorldMeta | undefined> {
  const res = await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}`);
  if (!res.ok) {
    throw new Error(`Voxel Realm: readWorldMeta failed (${res.status} ${res.statusText})`);
  }
  const json = (await res.json()) as { meta?: WorldMeta };
  return json.meta;
}

/** Replace a world's stored meta wholesale (the server's meta write is a full replace). */
export async function writeWorldMeta(name: string, meta: WorldMeta): Promise<void> {
  const res = await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}&meta=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta }),
  });
  if (!res.ok) {
    throw new Error(`Voxel Realm: writeWorldMeta failed (${res.status} ${res.statusText})`);
  }
}
