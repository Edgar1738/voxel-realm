import { describe, it, expect } from 'vitest';
import { boxVoxels, sphereVoxels, tunnelVoxels } from '../src/edit/Brushes';
import type { WorldVoxel } from '../src/edit/EditTypes';

describe('boxVoxels', () => {
  it('returns all 8 voxels in a 2x2x2 inclusive box', () => {
    const result = boxVoxels({ x: 1, y: 2, z: 3 }, { x: 2, y: 3, z: 4 });
    expect(result).toHaveLength(8);
    // Sorted by x, then y, then z
    expect(result[0]).toEqual({ x: 1, y: 2, z: 3 });
    expect(result[7]).toEqual({ x: 2, y: 3, z: 4 });
  });

  it('returns a single voxel when a === b', () => {
    const result = boxVoxels({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('handles reversed corners', () => {
    const result = boxVoxels({ x: 2, y: 3, z: 4 }, { x: 1, y: 2, z: 3 });
    expect(result).toHaveLength(8);
  });
});

describe('sphereVoxels', () => {
  it('radius 1 around origin yields the 7 expected voxels', () => {
    const result = sphereVoxels({ x: 0, y: 0, z: 0 }, 1);
    const expected: WorldVoxel[] = [
      { x: -1, y: 0, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    expect(result).toEqual(expected);
  });

  it('radius 0 returns only the center', () => {
    const result = sphereVoxels({ x: 5, y: -3, z: 2 }, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ x: 5, y: -3, z: 2 });
  });
});

describe('tunnelVoxels', () => {
  it('2 segments of radius 1 along -z yields 18 voxels', () => {
    const result = tunnelVoxels({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 2, 1);
    expect(result).toHaveLength(18);
  });

  it('contains specific expected voxels', () => {
    const result = tunnelVoxels({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 2, 1);
    expect(result).toContainEqual({ x: -1, y: -1, z: -1 });
    expect(result).toContainEqual({ x: 1, y: 1, z: -2 });
  });
});
