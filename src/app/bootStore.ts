// src/app/bootStore.ts
import type { SaveStore } from '../persistence/SaveStore';
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { ServerSaveStore } from '../persistence/ServerSaveStore';
import { ShippedWorldStore, fetchShippedWorld } from '../persistence/ShippedWorldStore';
import { findManifestEntry, type WorldManifest } from '../persistence/worldManifest';

/** Player edits on top of a shipped world live in their own database, per slug. */
export function overlayDbName(slug: string): string {
  return `voxel-realm:overlay:${slug}`;
}

/** A named free-build world's database. Distinct namespace from shipped overlays. */
export function namedDbName(name: string): string {
  return `voxel-realm:save:${name}`;
}

export interface BootStoreEnv {
  /** import.meta.env.DEV — dev uses the Vite disk-backed world server. */
  dev: boolean;
  /** import.meta.env.BASE_URL — where static assets (public/worlds/) are served from. */
  baseUrl: string;
}

/**
 * Choose the boot SaveStore for a world name:
 * - dev → the server-owned disk store (`.saves/`, shared across browsers) — unchanged;
 * - a shipped slug → its packaged base fetched from static hosting + a per-slug IndexedDB overlay;
 * - any other name → that world's own IndexedDB database;
 * - "default" → the original single IndexedDB database, so pre-existing player builds survive.
 */
export function createBootStore(
  worldName: string,
  isValidBlockId: (id: number) => boolean,
  manifest: WorldManifest,
  env: BootStoreEnv,
): SaveStore {
  if (env.dev) return new ServerSaveStore(worldName, isValidBlockId);
  const entry = findManifestEntry(manifest, worldName);
  if (entry) {
    return new ShippedWorldStore(
      () => fetchShippedWorld(env.baseUrl, entry.slug, isValidBlockId),
      new IndexedDbSaveStore(overlayDbName(entry.slug)),
    );
  }
  if (worldName !== 'default') return new IndexedDbSaveStore(namedDbName(worldName));
  return new IndexedDbSaveStore();
}
