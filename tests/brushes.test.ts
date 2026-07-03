import { describe, it, expect } from 'vitest';
import { boxVoxels, sphereVoxels, tunnelVoxels, tunnelConfigVoxels } from '../src/edit/Brushes';
import type { TunnelConfig } from '../src/edit/Brushes';
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

describe('tunnelConfigVoxels', () => {
  const origin: WorldVoxel = { x: 0, y: 0, z: 0 };
  const cfg = (over: Partial<TunnelConfig> = {}): TunnelConfig => ({
    size: 3,
    length: 8,
    path: 'straight',
    ...over,
  });

  it('size 3, length 8, straight along -z carves 3x3x8 with the floor at entry level', () => {
    const result = tunnelConfigVoxels(origin, { x: 0, y: 0, z: -1 }, cfg());
    expect(result).toHaveLength(3 * 3 * 8);
    // Floor at entry level, extending upward — walkable.
    expect(result.every((v) => v.y >= 0 && v.y <= 2)).toBe(true);
    // Width centered on the entry column.
    expect(result.every((v) => v.x >= -1 && v.x <= 1)).toBe(true);
    // Starts one step beyond the entry and runs the full length.
    expect(result.every((v) => v.z <= -1 && v.z >= -8)).toBe(true);
    expect(result).toContainEqual({ x: 0, y: 0, z: -1 });
    expect(result).toContainEqual({ x: 1, y: 2, z: -8 });
    expect(result).not.toContainEqual({ x: 0, y: -1, z: -1 });
  });

  it('size 1 carves a 1x1 bore', () => {
    const result = tunnelConfigVoxels(origin, { x: 1, y: 0, z: 0 }, cfg({ size: 1, length: 4 }));
    expect(result).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ]);
  });

  it('size 2 carves a 2-wide, 2-tall cross-section', () => {
    const result = tunnelConfigVoxels(origin, { x: 0, y: 0, z: 1 }, cfg({ size: 2, length: 4 }));
    expect(result).toHaveLength(2 * 2 * 4);
    expect(result.every((v) => v.y >= 0 && v.y <= 1)).toBe(true);
    expect(result.every((v) => v.x >= 0 && v.x <= 1)).toBe(true);
  });

  it('length options carve exactly that many segments', () => {
    for (const length of [4, 8, 16] as const) {
      const result = tunnelConfigVoxels(origin, { x: 0, y: 0, z: -1 }, cfg({ length, size: 1 }));
      expect(result).toHaveLength(length);
    }
  });

  it("path 'up' raises the floor one block per forward step after the first", () => {
    const result = tunnelConfigVoxels(origin, { x: 1, y: 0, z: 0 }, cfg({ size: 1, path: 'up' }));
    expect(result).toContainEqual({ x: 1, y: 0, z: 0 });
    expect(result).toContainEqual({ x: 2, y: 1, z: 0 });
    expect(result).toContainEqual({ x: 8, y: 7, z: 0 });
  });

  it("path 'down' lowers the floor one block per forward step after the first", () => {
    const result = tunnelConfigVoxels(origin, { x: 1, y: 0, z: 0 }, cfg({ size: 1, path: 'down' }));
    expect(result).toContainEqual({ x: 1, y: 0, z: 0 });
    expect(result).toContainEqual({ x: 2, y: -1, z: 0 });
    expect(result).toContainEqual({ x: 8, y: -7, z: 0 });
  });

  it("stair paths keep the full cross-section at every step (size 3 'up')", () => {
    const result = tunnelConfigVoxels(origin, { x: 0, y: 0, z: -1 }, cfg({ path: 'up' }));
    expect(result).toHaveLength(3 * 3 * 8);
    // Step 8: floor has risen 7 blocks, cross-section spans y 7..9.
    const last = result.filter((v) => v.z === -8);
    expect(last).toHaveLength(9);
    expect(Math.min(...last.map((v) => v.y))).toBe(7);
    expect(Math.max(...last.map((v) => v.y))).toBe(9);
  });

  it('digging straight down ignores path and carves a centered square shaft', () => {
    const result = tunnelConfigVoxels(origin, { x: 0, y: -1, z: 0 }, cfg({ path: 'up', size: 3 }));
    expect(result).toHaveLength(3 * 3 * 8);
    expect(result.every((v) => v.y <= -1 && v.y >= -8)).toBe(true);
    expect(result.every((v) => Math.abs(v.x) <= 1 && Math.abs(v.z) <= 1)).toBe(true);
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
