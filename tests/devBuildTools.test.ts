import { describe, it, expect } from 'vitest';
import {
  applyVoxelsInBatches,
  buildTerrainPathVoxels,
  createMemoryBookmarks,
  type EditResult,
} from '../src/app/DevBuildTools';
import { COBBLESTONE, SNOW, STONE } from '../src/blocks/blocks';
import type { SetVoxel } from '../src/edit/EditTypes';

describe('applyVoxelsInBatches', () => {
  it('splits large voxel sets and returns combined edit results', () => {
    const voxels: SetVoxel[] = Array.from({ length: 7 }, (_, x) => ({ x, y: 70, z: 0, id: STONE }));
    const seenBatchSizes: number[] = [];
    const applyBatch = (batch: SetVoxel[]): EditResult => {
      seenBatchSizes.push(batch.length);
      return {
        requested: batch.length,
        applied: Math.max(0, batch.length - 1),
        unloaded: batch.length === 1 ? 1 : 0,
        outOfWorld: 0,
        noChange: batch.length > 1 ? 1 : 0,
        invalid: 0,
        unloadedChunks: [],
      };
    };

    const result = applyVoxelsInBatches(voxels, applyBatch, 3);

    expect(seenBatchSizes).toEqual([3, 3, 1]);
    expect(result).toEqual({
      requested: 7,
      applied: 4,
      unloaded: 1,
      outOfWorld: 0,
      noChange: 2,
      invalid: 0,
      unloadedChunks: [],
      batches: [
        {
          requested: 3,
          applied: 2,
          unloaded: 0,
          outOfWorld: 0,
          noChange: 1,
          invalid: 0,
          unloadedChunks: [],
        },
        {
          requested: 3,
          applied: 2,
          unloaded: 0,
          outOfWorld: 0,
          noChange: 1,
          invalid: 0,
          unloadedChunks: [],
        },
        {
          requested: 1,
          applied: 0,
          unloaded: 1,
          outOfWorld: 0,
          noChange: 0,
          invalid: 0,
          unloadedChunks: [],
        },
      ],
    });
  });

  it('dedupes unloadedChunks across batches', () => {
    const voxels: SetVoxel[] = [
      { x: 0, y: 70, z: 0, id: STONE },
      { x: 1, y: 70, z: 0, id: STONE },
    ];
    const applyBatch = (batch: SetVoxel[]): EditResult => {
      if (batch.length === 1 && batch[0].x === 0) {
        // First batch: chunks '0,1' and '2,3'
        return {
          requested: 1,
          applied: 1,
          unloaded: 0,
          outOfWorld: 0,
          noChange: 0,
          invalid: 0,
          unloadedChunks: ['0,1', '2,3'],
        };
      } else {
        // Second batch: only chunk '0,1'
        return {
          requested: 1,
          applied: 1,
          unloaded: 0,
          outOfWorld: 0,
          noChange: 0,
          invalid: 0,
          unloadedChunks: ['0,1'],
        };
      }
    };

    const result = applyVoxelsInBatches(voxels, applyBatch, 1);

    // Combined result should have deduped unloadedChunks: exactly 2 unique keys
    expect(result.unloadedChunks).toHaveLength(2);
    expect(result.unloadedChunks).toContain('0,1');
    expect(result.unloadedChunks).toContain('2,3');
  });
});

describe('buildTerrainPathVoxels', () => {
  it('builds a deduped terrain-following path with marker posts', () => {
    const voxels = buildTerrainPathVoxels(
      [
        { x: 0, z: 0 },
        { x: 2, z: 0 },
      ],
      {
        block: COBBLESTONE,
        width: 1,
        markerEvery: 2,
        markerBlock: SNOW,
      },
      (x) => 70 + x,
    );

    expect(voxels).toEqual([
      { x: 0, y: 70, z: -1, id: COBBLESTONE },
      { x: 0, y: 70, z: 0, id: COBBLESTONE },
      { x: 0, y: 70, z: 1, id: COBBLESTONE },
      { x: 0, y: 71, z: 0, id: SNOW },
      { x: 0, y: 72, z: 0, id: SNOW },
      { x: 1, y: 71, z: -1, id: COBBLESTONE },
      { x: 1, y: 71, z: 0, id: COBBLESTONE },
      { x: 1, y: 71, z: 1, id: COBBLESTONE },
      { x: 2, y: 72, z: -1, id: COBBLESTONE },
      { x: 2, y: 72, z: 0, id: COBBLESTONE },
      { x: 2, y: 72, z: 1, id: COBBLESTONE },
      { x: 2, y: 73, z: 0, id: SNOW },
      { x: 2, y: 74, z: 0, id: SNOW },
    ]);
  });

  it('supports elevated path points with support columns', () => {
    const voxels = buildTerrainPathVoxels(
      [{ x: 4, y: 73, z: 5 }],
      {
        block: COBBLESTONE,
        width: 0,
        supportBlock: STONE,
      },
      () => 70,
    );

    expect(voxels).toEqual([
      { x: 4, y: 71, z: 5, id: STONE },
      { x: 4, y: 72, z: 5, id: STONE },
      { x: 4, y: 73, z: 5, id: COBBLESTONE },
    ]);
  });
});

it('combineEditResults sums the invalid count across batches', () => {
  const applyBatch = (b: { x: number; y: number; z: number; id: number }[]): EditResult => ({
    requested: b.length,
    applied: 0,
    unloaded: 0,
    outOfWorld: 0,
    noChange: 0,
    invalid: b.length,
    unloadedChunks: [],
  });
  const r = applyVoxelsInBatches(
    [
      { x: 0, y: 0, z: 0, id: 999 },
      { x: 1, y: 0, z: 0, id: 999 },
    ],
    applyBatch,
    1,
  );
  expect(r.invalid).toBe(2);
});

describe('createMemoryBookmarks', () => {
  it('saves and restores named camera poses', () => {
    let pose = {
      pos: { x: 1, y: 2, z: 3 },
      yaw: 0.5,
      pitch: -0.25,
    };
    const bookmarks = createMemoryBookmarks(
      () => pose,
      (next) => {
        pose = next;
      },
    );

    expect(bookmarks.save('entry')).toEqual(pose);
    pose = { pos: { x: 9, y: 8, z: 7 }, yaw: 1, pitch: 0 };

    expect(bookmarks.go('entry')).toEqual({ pos: { x: 1, y: 2, z: 3 }, yaw: 0.5, pitch: -0.25 });
    expect(pose).toEqual({ pos: { x: 1, y: 2, z: 3 }, yaw: 0.5, pitch: -0.25 });
    expect(bookmarks.list()).toEqual(['entry']);
  });
});
