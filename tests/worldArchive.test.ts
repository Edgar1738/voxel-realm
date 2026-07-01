import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  slugify,
  archiveFolderName,
  roamUrl,
  matchCaptures,
  buildManifest,
  renderReadme,
  upsertCatalog,
  archiveWorld,
  restoreWorld,
} from '../scripts/archiveCore';

describe('slug + folder naming', () => {
  it('slugifies a title to lowercase hyphenated', () => {
    expect(slugify('Medieval Village and Castle')).toBe('medieval-village-and-castle');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugify('  Castle (v2)!! ')).toBe('castle-v2');
  });

  it('builds an archive folder name as date + slug', () => {
    expect(archiveFolderName('2026-06-27', 'Medieval Village and Castle')).toBe(
      '2026-06-27-medieval-village-and-castle',
    );
  });
});

describe('roamUrl', () => {
  it('uses the default dev port', () => {
    expect(roamUrl('medieval-village-roam')).toBe(
      'http://127.0.0.1:5175/?save=medieval-village-roam',
    );
  });
});

describe('matchCaptures', () => {
  const available = [
    'medieval-village-roam-overview.jpg',
    'medieval-village-roam-gate.jpg',
    'medieval-village-roam.jpg',
    'medieval-village-overview.jpg',
    'unrelated.jpg',
  ];

  it('auto-matches the save prefix and exact name, excluding other saves', () => {
    expect(matchCaptures(available, 'medieval-village-roam')).toEqual([
      'medieval-village-roam-gate.jpg',
      'medieval-village-roam-overview.jpg',
      'medieval-village-roam.jpg',
    ]);
  });

  it('uses an explicit list when given, filtered to files that exist', () => {
    expect(
      matchCaptures(available, 'medieval-village-roam', ['unrelated.jpg', 'missing.jpg']),
    ).toEqual(['unrelated.jpg']);
  });

  it('matches .jpg, .jpeg and .png captures for the save', () => {
    const mixed = ['moon.jpg', 'moon-gate.jpeg', 'moon-hall.png', 'moon.gif', 'other.png'];
    expect(matchCaptures(mixed, 'moon')).toEqual(['moon-gate.jpeg', 'moon-hall.png', 'moon.jpg']);
  });
});

describe('roamUrl – preset', () => {
  it('appends &world for a non-default preset', () => {
    expect(roamUrl('citadel-world', 5175, 'citadel')).toBe(
      'http://127.0.0.1:5175/?save=citadel-world&world=citadel',
    );
  });

  it('omits &world for the default preset', () => {
    expect(roamUrl('flatland', 5175, 'default')).toBe('http://127.0.0.1:5175/?save=flatland');
  });
});

describe('renderReadme – roam metadata', () => {
  it('lists spawn, landmarks and tour when the meta carries them', () => {
    const manifest = buildManifest({
      archiveId: '2026-07-01-moon',
      title: 'Moonspire',
      sourceSave: 'moon',
      archivedAt: '2026-07-01T00:00:00.000Z',
      repoPath: '/repo',
      chunkCount: 1,
      captures: [],
      meta: {
        seed: 1,
        version: 1,
        preset: 'default',
        spawn: { x: 10, y: 65, z: -4 },
        landmarks: [{ name: 'Gate', x: 0, y: 64, z: 0 }],
        tour: [{ x: 0, y: 64, z: 0 }],
      },
    });
    const readme = renderReadme(manifest);
    expect(readme).toMatch(/spawn/i);
    expect(readme).toContain('10');
    expect(readme).toContain('Gate');
  });
});

describe('buildManifest', () => {
  const base = {
    archiveId: '2026-06-27-roam-test',
    title: 'Roam Test',
    sourceSave: 'roam',
    archivedAt: '2026-06-27T12:00:00.000Z',
    repoPath: '/repo',
    chunkCount: 3,
    captures: ['roam-overview.jpg'],
  };

  it('includes git and snapshot meta when provided', () => {
    const m = buildManifest({
      ...base,
      git: { branch: 'feat/dev-hud', commit: 'abc123' },
      meta: { seed: 7, version: 1, preset: 'flat' },
    });
    expect(m.source.branch).toBe('feat/dev-hud');
    expect(m.source.commit).toBe('abc123');
    expect(m.snapshot.chunkCount).toBe(3);
    expect(m.snapshot.meta?.seed).toBe(7);
  });

  it('omits git and meta fields when not provided', () => {
    const m = buildManifest(base);
    expect(m.source.branch).toBeUndefined();
    expect(m.source.commit).toBeUndefined();
    expect(m.snapshot.meta).toBeUndefined();
    expect(m.snapshot.chunkCount).toBe(3);
  });
});

describe('upsertCatalog idempotency', () => {
  const m1 = buildManifest({
    archiveId: '2026-06-27-first',
    title: 'First World',
    sourceSave: 'first',
    archivedAt: '2026-06-27T12:00:00.000Z',
    repoPath: '/repo',
    chunkCount: 1,
    captures: [],
  });
  const m2 = buildManifest({
    archiveId: '2026-06-27-second',
    title: 'Second World',
    sourceSave: 'second',
    archivedAt: '2026-06-27T12:00:00.000Z',
    repoPath: '/repo',
    chunkCount: 1,
    captures: [],
  });

  const linkCount = (catalog: string, archiveId: string): number =>
    catalog.split('\n').filter((line) => line.includes(`Artifacts/${archiveId}/`)).length;

  it('creates a table with a header row from empty', () => {
    const out = upsertCatalog(null, m1);
    expect(out).toContain('| Title |');
    expect(linkCount(out, '2026-06-27-first')).toBe(1);
  });

  it('does not duplicate a row when the same archive is re-added', () => {
    const once = upsertCatalog(null, m1);
    const twice = upsertCatalog(once, m1);
    expect(linkCount(twice, '2026-06-27-first')).toBe(1);
  });

  it('appends a row for a distinct archive', () => {
    const out = upsertCatalog(upsertCatalog(null, m1), m2);
    expect(linkCount(out, '2026-06-27-first')).toBe(1);
    expect(linkCount(out, '2026-06-27-second')).toBe(1);
  });
});

describe('archiveWorld + restoreWorld', () => {
  let root: string;
  let savesDir: string;
  let capturesDir: string;
  let artifactsDir: string;
  let catalogPath: string;

  const saveJson = JSON.stringify({
    meta: { seed: 7, version: 1, preset: 'flat' },
    chunks: { '0,0': [[1, 2]], '1,0': [[3, 4]] },
  });

  beforeEach(() => {
    root = mkdtempSync(resolve(tmpdir(), 'vr-archive-'));
    savesDir = resolve(root, '.saves');
    capturesDir = resolve(root, '.captures');
    artifactsDir = resolve(root, 'vault', 'Artifacts');
    catalogPath = resolve(root, 'vault', 'World Archive.md');
    mkdirSync(savesDir, { recursive: true });
    mkdirSync(capturesDir, { recursive: true });
    writeFileSync(resolve(savesDir, 'roam.json'), saveJson);
    writeFileSync(resolve(capturesDir, 'roam-overview.jpg'), 'a');
    writeFileSync(resolve(capturesDir, 'roam-gate.jpg'), 'b');
    writeFileSync(resolve(capturesDir, 'unrelated.jpg'), 'c');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const archive = () =>
    archiveWorld({
      saveName: 'roam',
      title: 'Roam Test',
      savesDir,
      capturesDir,
      artifactsDir,
      catalogPath,
      repoPath: '/repo',
      now: new Date(2026, 5, 27, 12, 0, 0),
    });

  it('writes world.json, captures, manifest, README and updates the catalog', () => {
    const result = archive();
    expect(result.archiveId).toBe('2026-06-27-roam-test');

    const dir = resolve(artifactsDir, '2026-06-27-roam-test');
    expect(readFileSync(resolve(dir, 'world.json'), 'utf8')).toBe(saveJson);
    expect(existsSync(resolve(dir, 'captures', 'roam-overview.jpg'))).toBe(true);
    expect(existsSync(resolve(dir, 'captures', 'roam-gate.jpg'))).toBe(true);
    expect(existsSync(resolve(dir, 'captures', 'unrelated.jpg'))).toBe(false);

    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
    expect(manifest.sourceSave).toBe('roam');
    expect(manifest.snapshot.chunkCount).toBe(2);
    expect(manifest.snapshot.meta.preset).toBe('flat');
    expect(manifest.captures).toEqual(['roam-gate.jpg', 'roam-overview.jpg']);

    const readme = readFileSync(resolve(dir, 'README.md'), 'utf8');
    expect(readme).toContain('http://127.0.0.1:5175/?save=roam');

    expect(readFileSync(catalogPath, 'utf8')).toContain('Artifacts/2026-06-27-roam-test/');
  });

  it('restores world.json into a new save name', () => {
    archive();
    const result = restoreWorld({
      archiveId: '2026-06-27-roam-test',
      saveName: 'roam-restored',
      artifactsDir,
      savesDir,
    });
    expect(readFileSync(resolve(savesDir, 'roam-restored.json'), 'utf8')).toBe(saveJson);
    expect(result.roamUrl).toBe('http://127.0.0.1:5175/?save=roam-restored');
  });

  it('refuses to overwrite an existing save unless forced', () => {
    archive();
    expect(() =>
      restoreWorld({
        archiveId: '2026-06-27-roam-test',
        saveName: 'roam',
        artifactsDir,
        savesDir,
      }),
    ).toThrow(/already exists/);

    restoreWorld({
      archiveId: '2026-06-27-roam-test',
      saveName: 'roam',
      artifactsDir,
      savesDir,
      force: true,
    });
    expect(readFileSync(resolve(savesDir, 'roam.json'), 'utf8')).toBe(saveJson);
  });
});
