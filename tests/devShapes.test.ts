import { describe, it, expect } from 'vitest';
import { lineVoxels, cylinderVoxels, pyramidVoxels, hollowBoxVoxels } from '../src/app/DevShapes';
import { STONE } from '../src/blocks/blocks';
import type { SetVoxel } from '../src/edit/EditTypes';

// ---------------------------------------------------------------------------
// lineVoxels
// ---------------------------------------------------------------------------

describe('lineVoxels', () => {
  it('returns a single voxel when start === end', () => {
    const result = lineVoxels(5, 10, 5, 5, 10, 5, STONE);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ x: 5, y: 10, z: 5, id: STONE });
  });

  it('returns both endpoints for an axis-aligned horizontal line of length 3', () => {
    const result = lineVoxels(0, 0, 0, 3, 0, 0, STONE);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ x: 0, y: 0, z: 0, id: STONE });
    expect(result[3]).toEqual({ x: 3, y: 0, z: 0, id: STONE });
  });

  it('deduplicates coincident samples on a diagonal line', () => {
    // A 1-step diagonal: the only two distinct voxels are start and end.
    const result = lineVoxels(0, 0, 0, 1, 1, 0, STONE);
    const keys = result.map((v) => `${v.x},${v.y},${v.z}`);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('carries the correct block id through', () => {
    const id = 42;
    const result = lineVoxels(0, 0, 0, 2, 0, 0, id);
    expect(result.every((v) => v.id === id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cylinderVoxels
// ---------------------------------------------------------------------------

describe('cylinderVoxels', () => {
  it('radius-0 cylinder is a single column', () => {
    const result = cylinderVoxels(0, 0, 0, 0, 4, STONE);
    expect(result).toHaveLength(4);
    result.forEach((v, i) => expect(v).toEqual({ x: 0, y: i, z: 0, id: STONE }));
  });

  it('radius-1 height-1 cylinder has the expected 5-voxel cross shape', () => {
    // dx²+dz² ≤ 1: only (0,0),(±1,0),(0,±1) — 5 positions.
    const result = cylinderVoxels(0, 0, 0, 1, 1, STONE);
    expect(result).toHaveLength(5);
  });

  it('radius-2 height-3 cylinder voxel count is correct', () => {
    // In the 5×5 grid (dx,dz in [-2,2]), only 13 positions satisfy dx²+dz²≤4
    // (the 4 true corners and the 4 adjacent diagonals are excluded: 25-12=13).
    const result = cylinderVoxels(10, 20, 10, 2, 3, STONE);
    expect(result).toHaveLength(13 * 3);
  });

  it('all voxels lie within the expected bounding box', () => {
    const cx = 5;
    const cy = 10;
    const cz = 5;
    const radius = 3;
    const height = 5;
    const result = cylinderVoxels(cx, cy, cz, radius, height, STONE);
    for (const v of result) {
      expect(v.x).toBeGreaterThanOrEqual(cx - radius);
      expect(v.x).toBeLessThanOrEqual(cx + radius);
      expect(v.y).toBeGreaterThanOrEqual(cy);
      expect(v.y).toBeLessThanOrEqual(cy + height - 1);
      expect(v.z).toBeGreaterThanOrEqual(cz - radius);
      expect(v.z).toBeLessThanOrEqual(cz + radius);
    }
  });

  it('all voxels satisfy the circle constraint dx²+dz² ≤ r²', () => {
    const result = cylinderVoxels(0, 0, 0, 4, 2, STONE);
    for (const v of result) {
      expect(v.x * v.x + v.z * v.z).toBeLessThanOrEqual(16);
    }
  });
});

// ---------------------------------------------------------------------------
// pyramidVoxels
// ---------------------------------------------------------------------------

describe('pyramidVoxels', () => {
  it('baseRadius-0 is a single apex voxel', () => {
    const result = pyramidVoxels(0, 0, 0, 0, STONE);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ x: 0, y: 0, z: 0, id: STONE });
  });

  it('baseRadius-1 has 4 layers with tapering counts (9+4+1 = wait, 3 levels)', () => {
    // level 0: r=1 → 3×3=9; level 1: r=0 → 1×1=1  — wait, levels 0..baseRadius
    // level=0 → r=baseRadius-0=1 → 3×3=9
    // level=1 → r=0 → 1×1=1
    // total = 10
    const result = pyramidVoxels(0, 0, 0, 1, STONE);
    expect(result).toHaveLength(10);
  });

  it('baseRadius-2 has the correct total voxel count', () => {
    // level 0: r=2 → 5×5=25; level 1: r=1 → 3×3=9; level 2: r=0 → 1
    // total = 35
    const result = pyramidVoxels(0, 0, 0, 2, STONE);
    expect(result).toHaveLength(35);
  });

  it('each successive layer is strictly narrower than the one below (taper check)', () => {
    const baseRadius = 4;
    const result = pyramidVoxels(0, 0, 0, baseRadius, STONE);
    // Group voxel counts per y level
    const countsByLevel = new Map<number, number>();
    for (const v of result) {
      countsByLevel.set(v.y, (countsByLevel.get(v.y) ?? 0) + 1);
    }
    let prevCount = Infinity;
    for (let level = 0; level <= baseRadius; level++) {
      const count = countsByLevel.get(level) ?? 0;
      expect(count).toBeLessThan(prevCount);
      prevCount = count;
    }
  });

  it('apex is a single voxel at y = cy + baseRadius', () => {
    const result = pyramidVoxels(10, 5, 10, 3, STONE);
    const apex = result.filter((v) => v.y === 5 + 3);
    expect(apex).toHaveLength(1);
    expect(apex[0]).toEqual({ x: 10, y: 8, z: 10, id: STONE });
  });
});

// ---------------------------------------------------------------------------
// hollowBoxVoxels
// ---------------------------------------------------------------------------

describe('hollowBoxVoxels', () => {
  it('1×1×1 box is a single voxel (solid face = hollow face)', () => {
    const result = hollowBoxVoxels(0, 0, 0, 0, 0, 0, STONE);
    expect(result).toHaveLength(1);
  });

  it('2×2×2 hollow box is all 8 corners (no interior)', () => {
    const result = hollowBoxVoxels(0, 0, 0, 1, 1, 1, STONE);
    expect(result).toHaveLength(8);
  });

  it('3×3×3 hollow box has 26 shell voxels (no interior)', () => {
    // 3³=27 total; 1 interior voxel removed → 26
    const result = hollowBoxVoxels(0, 0, 0, 2, 2, 2, STONE);
    expect(result).toHaveLength(26);
  });

  it('4×4×4 hollow box has correct shell count', () => {
    // 4³=64 total; 2³=8 interior → 64-8=56
    const result = hollowBoxVoxels(0, 0, 0, 3, 3, 3, STONE);
    expect(result).toHaveLength(56);
  });

  it('interior voxels are absent', () => {
    const result = hollowBoxVoxels(0, 0, 0, 4, 4, 4, STONE);
    // Interior: x in [1,3], y in [1,3], z in [1,3]
    const interior = result.filter(
      (v) => v.x > 0 && v.x < 4 && v.y > 0 && v.y < 4 && v.z > 0 && v.z < 4,
    );
    expect(interior).toHaveLength(0);
  });

  it('handles reversed corner order identically', () => {
    const forward = hollowBoxVoxels(0, 0, 0, 3, 3, 3, STONE);
    const reversed = hollowBoxVoxels(3, 3, 3, 0, 0, 0, STONE);
    // Sort both by x,y,z before comparing
    const sort = (arr: SetVoxel[]) => [...arr].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
    expect(sort(forward)).toEqual(sort(reversed));
  });

  it('carries the correct block id', () => {
    const id = 7;
    const result = hollowBoxVoxels(0, 0, 0, 2, 2, 2, id);
    expect(result.every((v) => v.id === id)).toBe(true);
  });
});
