import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createBootStore, overlayDbName, namedDbName } from '../src/app/bootStore';
import { IndexedDbSaveStore } from '../src/persistence/IndexedDbSaveStore';
import { ServerSaveStore } from '../src/persistence/ServerSaveStore';
import { ShippedWorldStore } from '../src/persistence/ShippedWorldStore';
import {
  emptyManifest,
  upsertManifestEntry,
  buildManifestEntry,
} from '../src/persistence/worldManifest';
import type { WorldMeta } from '../src/persistence/SaveTypes';

const meta: WorldMeta = {
  seed: 1337,
  version: 1,
  preset: 'flat',
  title: 'Test Cove',
  description: 'A test world.',
  spawn: { x: 0, y: 64, z: 8 },
  look: { yaw: 1, pitch: 0 },
};
const manifest = upsertManifestEntry(emptyManifest(), buildManifestEntry('Test Cove', meta));
const prod = { dev: false, baseUrl: '/' };
const valid = (): boolean => true;

describe('createBootStore', () => {
  it('uses the disk-backed server store in dev, regardless of the manifest', () => {
    const store = createBootStore('test-cove', valid, manifest, { dev: true, baseUrl: '/' });
    expect(store).toBeInstanceOf(ServerSaveStore);
  });

  it('serves a shipped slug from the static base + overlay store in prod', () => {
    const store = createBootStore('test-cove', valid, manifest, prod);
    expect(store).toBeInstanceOf(ShippedWorldStore);
  });

  it('gives non-shipped named worlds their own database', () => {
    const store = createBootStore('my-build', valid, manifest, prod);
    expect(store).toBeInstanceOf(IndexedDbSaveStore);
    expect(store).not.toBeInstanceOf(ShippedWorldStore);
  });

  it('keeps the default world on the legacy database', () => {
    const store = createBootStore('default', valid, manifest, prod);
    expect(store).toBeInstanceOf(IndexedDbSaveStore);
  });

  it('namespaces shipped overlays away from named saves', () => {
    expect(overlayDbName('castle')).not.toBe(namedDbName('castle'));
  });

  it('assembles the master atlas world from a ShippedWorldStore in prod', () => {
    const store = createBootStore('atlas', valid, manifest, prod);
    expect(store).toBeInstanceOf(ShippedWorldStore);
  });

  it('assembles the atlas even in dev (it lives in public/worlds/, not .saves/)', () => {
    const store = createBootStore('atlas', valid, manifest, { dev: true, baseUrl: '/' });
    expect(store).toBeInstanceOf(ShippedWorldStore);
    expect(store).not.toBeInstanceOf(ServerSaveStore);
  });
});
