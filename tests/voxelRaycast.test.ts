import { describe, it, expect } from 'vitest';
import { raycastVoxels } from '../src/edit/VoxelRaycast';
import { AIR, STONE } from '../src/blocks/blocks';

describe('raycastVoxels', () => {
  it('hits a STONE voxel straight down -Z and returns block, adjacent, normal, id', () => {
    // origin at {0.5, 5.5, 0.5}, dir {0, 0, -1}
    // STONE only at z === -4, so floor(origin.z)=0, stepping -z hits -4
    // block = {0, 5, -4}, adjacent = {0, 5, -3} (last empty cell), normal = {0, 0, 1}
    const sampler = {
      getBlock: (x: number, y: number, z: number): number =>
        x === 0 && y === 5 && z === -4 ? STONE : AIR,
    };
    const hit = raycastVoxels(sampler, { x: 0.5, y: 5.5, z: 0.5 }, { x: 0, y: 0, z: -1 }, 20);
    expect(hit).not.toBeUndefined();
    expect(hit!.block).toEqual({ x: 0, y: 5, z: -4 });
    expect(hit!.adjacent).toEqual({ x: 0, y: 5, z: -3 });
    expect(hit!.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(hit!.id).toBe(STONE);
    // invariant: adjacent === block + normal
    expect(hit!.adjacent).toEqual({
      x: hit!.block.x + hit!.normal.x,
      y: hit!.block.y + hit!.normal.y,
      z: hit!.block.z + hit!.normal.z,
    });
  });

  it('returns undefined when no solid voxel is within maxDistance', () => {
    const sampler = { getBlock: (): number => AIR };
    const hit = raycastVoxels(sampler, { x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 10);
    expect(hit).toBeUndefined();
  });

  it('handles negative world coordinates (dir -X, STONE at x === -2)', () => {
    // origin at {0.5, 0.5, 0.5}, dir {-1, 0, 0}
    // STONE at x === -2; adjacent should be at x === -1, normal {1, 0, 0}
    const sampler = {
      getBlock: (x: number, _y: number, _z: number): number => (x === -2 ? STONE : AIR),
    };
    const hit = raycastVoxels(sampler, { x: 0.5, y: 0.5, z: 0.5 }, { x: -1, y: 0, z: 0 }, 10);
    expect(hit).not.toBeUndefined();
    expect(hit!.block.x).toBe(-2);
    expect(hit!.adjacent.x).toBe(-1);
    expect(hit!.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(hit!.id).toBe(STONE);
    // invariant: adjacent === block + normal
    expect(hit!.adjacent).toEqual({
      x: hit!.block.x + hit!.normal.x,
      y: hit!.block.y + hit!.normal.y,
      z: hit!.block.z + hit!.normal.z,
    });
  });

  it('returns undefined for a zero-length direction vector', () => {
    // A zero-length direction is nonsensical — no ray should be fired, no hit returned.
    const sampler = {
      // Even with a STONE block at z === -1 (where the old bug would fire toward),
      // a zero-length direction must still return undefined.
      getBlock: (x: number, y: number, z: number): number =>
        x === 0 && y === 0 && z === -1 ? STONE : AIR,
    };
    const hit = raycastVoxels(sampler, { x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 0, z: 0 }, 10);
    expect(hit).toBeUndefined();
  });
});
