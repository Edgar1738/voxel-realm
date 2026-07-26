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
  /** import.meta.env.DEV — dev normally uses the Vite disk-backed world server. */
  dev: boolean;
  /** import.meta.env.BASE_URL — where static assets (public/worlds/) are served from. */
  baseUrl: string;
  /**
   * Front-door curated links opt into the immutable packaged world even in development.
   * Direct `?save=` authoring URLs keep using `.saves/` unless they explicitly request this.
   */
  preferShipped?: boolean;
}

/**
 * Choose the boot SaveStore for a world name:
 * - a shipped slug explicitly opened from the collection → packaged base + IndexedDB overlay;
 * - other dev URLs → the server-owned disk store (`.saves/`, shared across browsers);
 * - a shipped slug in production → packaged base + a per-slug IndexedDB overlay;
 * - any other production name → that world's own IndexedDB database;
 * - "default" → the original single IndexedDB database, so pre-existing player builds survive.
 */
export function createBootStore(
  worldName: string,
  isValidBlockId: (id: number) => boolean,
  manifest: WorldManifest,
  env: BootStoreEnv,
): SaveStore {
  const entry = findManifestEntry(manifest, worldName);
  if (entry && (!env.dev || env.preferShipped)) {
    return new ShippedWorldStore(
      () => fetchShippedWorld(env.baseUrl, entry.slug, isValidBlockId),
      new IndexedDbSaveStore(overlayDbName(entry.slug)),
    );
  }
  if (env.dev) return new ServerSaveStore(worldName, isValidBlockId);
  if (worldName !== 'default') return new IndexedDbSaveStore(namedDbName(worldName));
  return new IndexedDbSaveStore();
}
