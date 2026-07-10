// src/persistence/worldShare.ts
//
// The share loop (M4): export the current world as a portable JSON file, import one on the
// menu. Exports reuse the WorldSnapshot wire format (the same shape as `.saves/<name>.json`
// and the shipped bundles), so a shared file is also a valid dev save. Imports run through
// parseWorldSnapshot's defensive validation and land in a fresh save name that can never
// collide with a shipped slug — a collision would silently boot the ShippedWorldStore and
// hide the import.
import { serializeWorldSnapshot, parseWorldSnapshot, type WorldSnapshot } from './WorldSnapshot';
import type { SaveStore } from './SaveStore';
import type { ChunkDeltaEntries, WorldDeltas, WorldMeta } from './SaveTypes';

/** Serialize the live world (meta + edit deltas) to the portable snapshot JSON. */
export function exportWorldJson(meta: WorldMeta | undefined, deltas: WorldDeltas): string {
  return JSON.stringify(serializeWorldSnapshot(meta, deltas));
}

/** Lower-kebab slug of a world title/name for file and save names. */
export function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Download filename for a shared world: `<title-or-name>.voxelrealm.json`. */
export function exportFileName(title: string | undefined, worldName: string): string {
  const slug = slugify(title ?? '') || slugify(worldName) || 'world';
  return `${slug}.voxelrealm.json`;
}

/**
 * Save name for an imported world: the title/file slug plus a base36 minute stamp, so two
 * imports never merge into each other and the name can never equal a shipped slug or
 * `default` (both are reserved boot paths).
 */
export function importSaveName(title: string | undefined, fileName: string, nowMs: number): string {
  const fromFile = fileName.replace(/\.voxelrealm\.json$|\.json$/i, '');
  const slug = slugify(title?.trim() || fromFile) || 'imported';
  return `${slug}-${Math.floor(nowMs / 60000).toString(36)}`;
}

export interface ImportResult {
  snapshot: WorldSnapshot;
  chunkCount: number;
  /** Malformed chunk entries the validator dropped (worth a warning, not a failure). */
  dropped: number;
}

/**
 * Parse untrusted share-file text. Throws a user-facing Error for unusable input; malformed
 * rows inside an otherwise-valid file are dropped and counted instead.
 */
export function parseImportText(
  text: string,
  isValidBlockId: (id: number) => boolean,
): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a world file — the file is not valid JSON.');
  }
  const { snapshot, dropped } = parseWorldSnapshot(raw, { isValidBlockId });
  const chunkCount = Object.keys(snapshot.chunks).length;
  if (chunkCount === 0) {
    throw new Error('Not a world file — it contains no world chunks.');
  }
  if (!snapshot.meta) {
    throw new Error('Not a world file — it is missing world metadata (seed/version).');
  }
  return { snapshot, chunkCount, dropped };
}

/** Write a validated snapshot into a fresh store (meta first, then every chunk delta). */
export async function writeImportedWorld(
  store: SaveStore,
  snapshot: WorldSnapshot,
): Promise<number> {
  if (snapshot.meta) await store.saveMeta(snapshot.meta);
  let written = 0;
  for (const [key, entries] of Object.entries(snapshot.chunks)) {
    await store.saveChunkDelta(key, entries as ChunkDeltaEntries);
    written++;
  }
  return written;
}
