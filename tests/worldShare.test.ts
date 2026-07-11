import { describe, it, expect } from 'vitest';
import {
  exportWorldJson,
  exportFileName,
  importSaveName,
  parseImportText,
  writeImportedWorld,
  slugify,
} from '../src/persistence/worldShare';
import { MemorySaveStore } from '../src/persistence/SaveStore';
import { packVoxel, type WorldDeltas, type WorldMeta } from '../src/persistence/SaveTypes';

const META: WorldMeta = { seed: 1337, version: 1, preset: 'flat', title: 'My Castle' };

function sampleDeltas(): WorldDeltas {
  return new Map([
    ['0,0', new Map([[5, packVoxel(3, 0)]])],
    ['-1,2', new Map([[9, packVoxel(31, 6)]])], // a stair with facing state
  ]);
}

const anyId = (id: number): boolean => id >= 0 && id <= 255;

describe('export → import round-trip', () => {
  it('preserves meta, chunks, and block state through the wire format', async () => {
    const json = exportWorldJson(META, sampleDeltas());
    const { snapshot, chunkCount, dropped } = parseImportText(json, anyId);
    expect(dropped).toBe(0);
    expect(chunkCount).toBe(2);
    expect(snapshot.meta?.title).toBe('My Castle');
    expect(snapshot.meta?.preset).toBe('flat');
    expect(snapshot.chunks['0,0']).toEqual([[5, 3]]);
    expect(snapshot.chunks['-1,2']).toEqual([[9, 31, 6]]); // state survives

    const store = new MemorySaveStore();
    const written = await writeImportedWorld(store, snapshot);
    expect(written).toBe(2);
    expect((await store.loadMeta())?.seed).toBe(1337);
    const deltas = await store.loadDeltas();
    expect(deltas.get('-1,2')?.get(9)).toBe(packVoxel(31, 6));
  });
});

describe('parseImportText rejection', () => {
  it('rejects non-JSON with a friendly message', () => {
    expect(() => parseImportText('not json{', anyId)).toThrow(/not valid JSON/);
  });

  it('rejects JSON with no chunks', () => {
    expect(() => parseImportText('{"meta":{"seed":1,"version":1}}', anyId)).toThrow(/no world/);
  });

  it('rejects a chunk-bearing file with no meta (seed/version drive the generator)', () => {
    expect(() => parseImportText('{"chunks":{"0,0":[[1,3]]}}', anyId)).toThrow(/metadata/);
  });

  it('drops invalid block ids instead of failing the whole file', () => {
    const json = JSON.stringify({
      meta: { seed: 1, version: 1 },
      chunks: {
        '0,0': [
          [1, 3],
          [2, 99],
        ],
      },
    });
    const { snapshot, dropped } = parseImportText(json, (id) => id === 3);
    expect(dropped).toBe(1);
    expect(snapshot.chunks['0,0']).toEqual([[1, 3]]);
  });
});

describe('naming', () => {
  it('slugifies titles for file and save names', () => {
    expect(slugify('My Castle!! (v2)')).toBe('my-castle-v2');
    expect(exportFileName('My Castle', 'x')).toBe('my-castle.voxelrealm.json');
    expect(exportFileName(undefined, 'tidewreck-cove')).toBe('tidewreck-cove.voxelrealm.json');
    expect(exportFileName('///', 'x')).toBe('x.voxelrealm.json');
  });

  it('import names get a minute stamp so they never collide or merge', () => {
    const now = 1_800_000_000_000;
    const a = importSaveName('My Castle', 'whatever.json', now);
    expect(a.startsWith('my-castle-')).toBe(true);
    expect(a).not.toBe(importSaveName('My Castle', 'whatever.json', now + 60_000));
    // A shipped title can never produce the bare shipped slug (the stamp guarantees it).
    expect(importSaveName('Tidewreck Cove', 'x.json', now)).not.toBe('tidewreck-cove');
  });

  it('falls back to the file name, then a generic slug', () => {
    const now = 60_000;
    expect(importSaveName(undefined, 'castle.voxelrealm.json', now)).toBe('castle-1');
    expect(importSaveName(undefined, '###.json', now)).toBe('imported-1');
  });
});
