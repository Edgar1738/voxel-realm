import { describe, it, expect } from 'vitest';
import type { WorldMeta } from '../src/persistence/SaveTypes';
import {
  MANIFEST_VERSION,
  slugify,
  buildManifestEntry,
  manifestEntryProblems,
  emptyManifest,
  upsertManifestEntry,
  validateManifest,
  findManifestEntry,
  entryMetaProblems,
  type WorldManifestEntry,
} from '../src/persistence/worldManifest';

const fullMeta: WorldMeta = {
  seed: 42,
  version: 1,
  preset: 'citadel',
  title: 'Moonspire Realm',
  description: 'A ruined citadel above a lake.',
  spawn: { x: 8, y: 72, z: 94 },
  look: { yaw: 0.5, pitch: -0.2 },
  landmarks: [{ name: 'Gatehouse', x: 8, y: 64, z: 47 }],
  tour: [
    { name: 'Road', x: 8, y: 72, z: 94 },
    { name: 'Keep', x: 8, y: 72, z: 8 },
  ],
};

describe('slugify', () => {
  it('produces url-safe slugs and never empty', () => {
    expect(slugify('Moonspire Realm')).toBe('moonspire-realm');
    expect(slugify('  Tidewreck Cove!!  ')).toBe('tidewreck-cove');
    expect(slugify('a/b_c.d')).toBe('a-b-c-d');
    expect(slugify('***')).toBe('world');
    expect(slugify('')).toBe('world');
  });
});

describe('buildManifestEntry', () => {
  it('composes an entry from a complete meta', () => {
    const entry = buildManifestEntry('Moonspire Realm', fullMeta, {
      tags: ['citadel', 'ruin'],
      preview: 'previews/moonspire.jpg',
      chunkCount: 2100,
    });
    expect(entry).toMatchObject({
      slug: 'moonspire-realm',
      title: 'Moonspire Realm',
      description: 'A ruined citadel above a lake.',
      preset: 'citadel',
      seed: 42,
      version: 1,
      spawn: { x: 8, y: 72, z: 94 },
      look: { yaw: 0.5, pitch: -0.2 },
      tags: ['citadel', 'ruin'],
      preview: 'previews/moonspire.jpg',
      chunkCount: 2100,
      packageVersion: MANIFEST_VERSION,
    });
    expect(entry.landmarks).toEqual(fullMeta.landmarks);
    expect(entry.tour).toEqual(fullMeta.tour);
  });

  it('falls back to the slug for a missing title and copies points defensively', () => {
    const noTitle: WorldMeta = { ...fullMeta };
    delete noTitle.title;
    const entry = buildManifestEntry('Tidewreck Cove', noTitle);
    expect(entry.title).toBe('tidewreck-cove');
    entry.spawn.x = 999; // mutating the entry must not touch the source meta
    expect(fullMeta.spawn!.x).toBe(8);
  });

  it('requires spawn and look', () => {
    const noSpawn: WorldMeta = { ...fullMeta };
    delete noSpawn.spawn;
    const noLook: WorldMeta = { ...fullMeta };
    delete noLook.look;
    expect(() => buildManifestEntry('x', noSpawn)).toThrow(/spawn/);
    expect(() => buildManifestEntry('x', noLook)).toThrow(/look/);
  });
});

describe('manifestEntryProblems', () => {
  const good = buildManifestEntry('Moonspire Realm', fullMeta, { tags: ['citadel'] });

  it('accepts a complete entry', () => {
    expect(manifestEntryProblems(good)).toEqual([]);
  });

  it('flags empty title/description', () => {
    expect(manifestEntryProblems({ ...good, title: ' ' })).toContain('title is empty');
    expect(manifestEntryProblems({ ...good, description: '' })).toContain('description is empty');
  });

  it('flags a non-slug-safe slug and non-finite geometry', () => {
    expect(manifestEntryProblems({ ...good, slug: 'Not A Slug' })).toContain(
      'slug missing or not slug-safe',
    );
    expect(manifestEntryProblems({ ...good, spawn: { x: 0, y: Infinity, z: 0 } })).toContain(
      'spawn is not finite',
    );
    const badTour: WorldManifestEntry = { ...good, tour: [{ x: NaN, y: 0, z: 0 }] };
    expect(manifestEntryProblems(badTour)).toContain('tour[0] is not finite');
  });
});

describe('entryMetaProblems', () => {
  const entry = buildManifestEntry('Moonspire Realm', fullMeta);

  it('accepts a snapshot whose meta matches its manifest entry', () => {
    expect(entryMetaProblems(entry, fullMeta)).toEqual([]);
  });

  it('flags a missing meta and every generator-identity mismatch', () => {
    expect(entryMetaProblems(entry, undefined)).toEqual(['snapshot has no meta']);
    expect(entryMetaProblems(entry, { ...fullMeta, seed: 7 })[0]).toMatch(/seed 7/);
    expect(entryMetaProblems(entry, { ...fullMeta, version: 9 })[0]).toMatch(/version 9/);
    expect(entryMetaProblems(entry, { ...fullMeta, preset: 'flat' })[0]).toMatch(/preset flat/);
  });

  it('treats an absent preset as "default"', () => {
    const noPreset: WorldMeta = { ...fullMeta };
    delete noPreset.preset;
    const defaultEntry = { ...entry, preset: 'default' };
    expect(entryMetaProblems(defaultEntry, noPreset)).toEqual([]);
  });

  it('requires spawn and look on the snapshot meta', () => {
    const noSpawn: WorldMeta = { ...fullMeta };
    delete noSpawn.spawn;
    expect(entryMetaProblems(entry, noSpawn)).toContain('snapshot meta is missing spawn/look');
  });
});

describe('manifest collection', () => {
  it('starts empty at the current version', () => {
    expect(emptyManifest()).toEqual({ version: MANIFEST_VERSION, worlds: [] });
  });

  it('upserts by slug (replace, not duplicate) and validates the collection', () => {
    const a = buildManifestEntry('World A', fullMeta, { tags: ['a'] });
    const aUpdated = buildManifestEntry('World A', { ...fullMeta, description: 'Changed.' });
    const b = buildManifestEntry('World B', fullMeta);

    let m = emptyManifest();
    m = upsertManifestEntry(m, a);
    m = upsertManifestEntry(m, b);
    m = upsertManifestEntry(m, aUpdated); // same slug as a → replace

    expect(m.worlds.map((w) => w.slug)).toEqual(['world-b', 'world-a']);
    expect(m.worlds.find((w) => w.slug === 'world-a')?.description).toBe('Changed.');
    expect(validateManifest(m)).toEqual([]);
  });

  it('finds entries by slug', () => {
    const m = upsertManifestEntry(emptyManifest(), buildManifestEntry('World A', fullMeta));
    expect(findManifestEntry(m, 'world-a')?.title).toBe('Moonspire Realm');
    expect(findManifestEntry(m, 'nope')).toBeUndefined();
  });

  it('reports a version mismatch and per-entry problems with the slug prefix', () => {
    const bad = { ...buildManifestEntry('World A', fullMeta), title: '' };
    const m = { version: 999, worlds: [bad] };
    const problems = validateManifest(m);
    expect(problems.some((p) => p.includes('manifest version'))).toBe(true);
    expect(problems).toContain('"world-a": title is empty');
  });
});
