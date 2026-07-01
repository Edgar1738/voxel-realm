// tests/worldSnapshot.test.ts
import { describe, it, expect } from 'vitest';
import {
  serializeWorldSnapshot,
  parseWorldSnapshot,
  snapshotToDeltas,
} from '../src/persistence/WorldSnapshot';
import { CHUNK_VOLUME } from '../src/core/constants';
import type { WorldDeltas } from '../src/persistence/SaveTypes';

const isValidBlockId = (id: number): boolean => id >= 0 && id <= 13;

describe('WorldSnapshot', () => {
  it('round-trips meta + deltas through serialize/parse/snapshotToDeltas', () => {
    const deltas: WorldDeltas = new Map([
      [
        '0,0',
        new Map([
          [2, 5],
          [1, 13],
        ]),
      ],
      ['-1,2', new Map([[10, 3]])],
    ]);
    const snap = serializeWorldSnapshot({ seed: 1337, version: 1, preset: 'default' }, deltas);
    expect(snap.chunks['0,0']).toEqual([
      [1, 13],
      [2, 5],
    ]);

    const json = JSON.parse(JSON.stringify(snap));
    const { snapshot, dropped } = parseWorldSnapshot(json, { isValidBlockId });
    expect(dropped).toBe(0);
    expect(snapshot.meta).toEqual({ seed: 1337, version: 1, preset: 'default' });
    expect(snapshotToDeltas(snapshot).get('0,0')).toEqual(
      new Map([
        [1, 13],
        [2, 5],
      ]),
    );
  });

  it('drops malformed entries: bad key, out-of-range index, unknown block id, bad shape', () => {
    const { snapshot, dropped } = parseWorldSnapshot(
      {
        meta: { seed: 1, version: 1 },
        chunks: {
          good: [[0, 5]],
          '0,0': [[5, 5], [CHUNK_VOLUME, 5], [-1, 5], [10, 999], [1], 'nope'],
        },
      },
      { isValidBlockId },
    );
    expect(snapshot.chunks['good']).toBeUndefined();
    expect(snapshot.chunks['0,0']).toEqual([[5, 5]]);
    expect(dropped).toBe(6);
  });

  it('returns empty chunks and undefined meta for junk input', () => {
    const { snapshot, dropped } = parseWorldSnapshot(null, { isValidBlockId });
    expect(snapshot.chunks).toEqual({});
    expect(snapshot.meta).toBeUndefined();
    expect(dropped).toBe(0);
  });
});

describe('parseMeta – reject corrupt numeric meta', () => {
  it('returns undefined meta when seed is NaN', () => {
    const { snapshot } = parseWorldSnapshot(
      { meta: { seed: NaN, version: 1 }, chunks: {} },
      { isValidBlockId },
    );
    expect(snapshot.meta).toBeUndefined();
  });

  it('returns undefined meta when version is Infinity', () => {
    const { snapshot } = parseWorldSnapshot(
      { meta: { seed: 1, version: Infinity }, chunks: {} },
      { isValidBlockId },
    );
    expect(snapshot.meta).toBeUndefined();
  });

  it('returns undefined meta when seed is a float', () => {
    const { snapshot } = parseWorldSnapshot(
      { meta: { seed: 1.5, version: 1 }, chunks: {} },
      { isValidBlockId },
    );
    expect(snapshot.meta).toBeUndefined();
  });

  it('returns undefined meta when version is a float', () => {
    const { snapshot } = parseWorldSnapshot(
      { meta: { seed: 42, version: 1.9 }, chunks: {} },
      { isValidBlockId },
    );
    expect(snapshot.meta).toBeUndefined();
  });

  it('still parses valid integer meta correctly', () => {
    const { snapshot } = parseWorldSnapshot(
      { meta: { seed: 1337, version: 1, preset: 'caverns' }, chunks: {} },
      { isValidBlockId },
    );
    expect(snapshot.meta).toEqual({ seed: 1337, version: 1, preset: 'caverns' });
  });

  it('returns undefined meta when version is -Infinity', () => {
    const { snapshot } = parseWorldSnapshot(
      { meta: { seed: 0, version: -Infinity }, chunks: {} },
      { isValidBlockId },
    );
    expect(snapshot.meta).toBeUndefined();
  });
});

describe('parseMeta – curated optional roam fields', () => {
  it('preserves valid spawn/look/title/description/landmarks/tour', () => {
    const meta = {
      seed: 7,
      version: 1,
      preset: 'default',
      spawn: { x: 12, y: 65, z: -8 },
      look: { yaw: 1.57, pitch: -0.2 },
      title: 'Moonspire Realm',
      description: 'A curated test world.',
      landmarks: [{ name: 'Gate', x: 0, y: 64, z: 0 }],
      tour: [
        { x: 0, y: 64, z: 0 },
        { name: 'Keep', x: 20, y: 70, z: 20 },
      ],
    };
    const { snapshot } = parseWorldSnapshot({ meta, chunks: {} }, { isValidBlockId });
    expect(snapshot.meta).toEqual(meta);
  });

  it('drops malformed optional fields but keeps seed/version/preset', () => {
    const { snapshot } = parseWorldSnapshot(
      {
        meta: {
          seed: 7,
          version: 1,
          preset: 'default',
          spawn: { x: 1, y: 2 }, // missing z
          look: { yaw: NaN, pitch: 0 }, // non-finite yaw
          title: 42, // not a string
          landmarks: [
            { name: 'ok', x: 1, y: 2, z: 3 },
            { x: 1, y: 2, z: 3 }, // missing name
          ],
          tour: [
            { x: 0, y: 0, z: 0 },
            { x: Infinity, y: 0, z: 0 }, // non-finite coord
          ],
        },
        chunks: {},
      },
      { isValidBlockId },
    );
    expect(snapshot.meta).toEqual({
      seed: 7,
      version: 1,
      preset: 'default',
      landmarks: [{ name: 'ok', x: 1, y: 2, z: 3 }],
      tour: [{ x: 0, y: 0, z: 0 }],
    });
  });

  it('does not leak unknown keys and keeps legacy meta minimal', () => {
    const { snapshot } = parseWorldSnapshot(
      { meta: { seed: 5, version: 1, bogus: 'x' }, chunks: {} },
      { isValidBlockId },
    );
    expect(snapshot.meta).toEqual({ seed: 5, version: 1 });
  });
});
