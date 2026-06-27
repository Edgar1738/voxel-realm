import { describe, it, expect } from 'vitest';
import { raycastVoxel } from '../src/edit/VoxelRaycast';
import { AIR, STONE } from '../src/blocks/blocks';

const isSolid = (id: number): boolean => id !== AIR;

describe('raycastVoxel', () => {
  it('hits the first solid voxel along +X and reports the entry face normal', () => {
    const getBlock = (x: number, y: number, z: number): number =>
      x === 5 && y === 0 && z === 0 ? STONE : AIR;
    const hit = raycastVoxel(
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 1, y: 0, z: 0 },
      10,
      getBlock,
      isSolid,
    );
    expect(hit).not.toBeNull();
    expect(hit!.voxel).toEqual({ x: 5, y: 0, z: 0 });
    expect(hit!.normal).toEqual({ x: -1, y: 0, z: 0 }); // entered through the -X face
    expect(hit!.blockId).toBe(STONE);
  });

  it('returns null when nothing solid is within reach', () => {
    const getBlock = (): number => AIR;
    expect(
      raycastVoxel({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, 10, getBlock, isSolid),
    ).toBeNull();
  });

  it('passes through air and stops at a solid below (-Y)', () => {
    const getBlock = (_x: number, y: number, _z: number): number => (y === 0 ? STONE : AIR);
    const hit = raycastVoxel(
      { x: 0.5, y: 5.5, z: 0.5 },
      { x: 0, y: -1, z: 0 },
      10,
      getBlock,
      isSolid,
    );
    expect(hit!.voxel).toEqual({ x: 0, y: 0, z: 0 });
    expect(hit!.normal).toEqual({ x: 0, y: 1, z: 0 }); // entered through the +Y (top) face
  });

  it('places adjacency: hit voxel + normal is the empty neighbor', () => {
    const getBlock = (x: number, _y: number, _z: number): number => (x === 3 ? STONE : AIR);
    const hit = raycastVoxel(
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 1, y: 0, z: 0 },
      10,
      getBlock,
      isSolid,
    )!;
    const target = { x: hit.voxel.x + hit.normal.x, y: hit.voxel.y, z: hit.voxel.z };
    expect(target).toEqual({ x: 2, y: 0, z: 0 });
  });
});
