import { describe, it, expect } from 'vitest';
import { packVoxel, voxelId, voxelState } from '../src/persistence/SaveTypes';
import {
  serializeWorldSnapshot,
  parseWorldSnapshot,
  snapshotToDeltas,
} from '../src/persistence/WorldSnapshot';
import type { WorldDeltas } from '../src/persistence/SaveTypes';

describe('packVoxel', () => {
  it('round-trips id + state', () => {
    const v = packVoxel(27, 6);
    expect(voxelId(v)).toBe(27);
    expect(voxelState(v)).toBe(6);
  });
});

describe('serialize: state===0 stays a 2-element entry (byte-identical)', () => {
  it('omits state when 0, includes it when nonzero', () => {
    const deltas: WorldDeltas = new Map([
      [
        '0,0',
        new Map([
          [5, packVoxel(3, 0)],
          [9, packVoxel(31, 6)],
        ]),
      ],
    ]);
    const snap = serializeWorldSnapshot(undefined, deltas);
    expect(snap.chunks['0,0']).toEqual([
      [5, 3],
      [9, 31, 6],
    ]);
  });
});

describe('parse: accepts v1 (length 2) and v2 (length 3)', () => {
  const ok = { isValidBlockId: () => true };
  it('a v1 snapshot (all 2-element) parses with state 0', () => {
    const { snapshot } = parseWorldSnapshot(
      {
        chunks: {
          '0,0': [
            [5, 3],
            [6, 4],
          ],
        },
      },
      ok,
    );
    const deltas = snapshotToDeltas(snapshot);
    const m = deltas.get('0,0')!;
    expect(voxelState(m.get(5)!)).toBe(0);
    expect(voxelId(m.get(5)!)).toBe(3);
  });
  it('a 3-element entry carries state; bad state is dropped', () => {
    const { snapshot, dropped } = parseWorldSnapshot(
      {
        chunks: {
          '0,0': [
            [7, 31, 6],
            [8, 31, 999],
            [9, 31, -1],
          ],
        },
      },
      ok,
    );
    const m = snapshotToDeltas(snapshot).get('0,0')!;
    expect(voxelState(m.get(7)!)).toBe(6);
    expect(m.has(8)).toBe(false); // state 999 out of range → dropped
    expect(m.has(9)).toBe(false);
    expect(dropped).toBe(2);
  });
});
