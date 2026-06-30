import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped } from '../src/mesh/emitShaped';
import { packState, FACING } from '../src/world/VoxelState';

const stoneFaces = {
  pattern: 'stone' as const,
  colors: [[128, 128, 132] as [number, number, number]],
};
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stair', opaque: true, transparent: false, shape: 'stair', faces: stoneFaces },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

describe('emitStair', () => {
  it('emits two boxes (12 faces / 48 verts) for a stair in open air', () => {
    const d = new ChunkData(0, 0);
    d.set(2, 10, 2, 1);
    d.setState(2, 10, 2, packState(FACING.N, 0));
    const { slabs } = emitShaped(view(d), reg); // stairs share the opaque buffer
    expect(slabs.positions.length / 3).toBe(48); // 2 boxes × 6 faces × 4 verts (open air, nothing culled)
    let maxY = -Infinity;
    for (let i = 1; i < slabs.positions.length; i += 3) maxY = Math.max(maxY, slabs.positions[i]);
    expect(maxY).toBeCloseTo(11, 5); // the upper step reaches the voxel top
  });

  it('all 4 facings produce pairwise distinct geometry', () => {
    const mk = (facing: number) => {
      const d = new ChunkData(0, 0);
      d.set(2, 10, 2, 1);
      d.setState(2, 10, 2, packState(facing, 0));
      return [...emitShaped(view(d), reg).slabs.positions];
    };
    const [n, e, s, w] = [mk(FACING.N), mk(FACING.E), mk(FACING.S), mk(FACING.W)];
    // Every pair must be distinct — catches any two facings collapsing to the same shape.
    expect(n).not.toEqual(e);
    expect(n).not.toEqual(s);
    expect(n).not.toEqual(w);
    expect(e).not.toEqual(s);
    expect(e).not.toEqual(w);
    expect(s).not.toEqual(w);
  });

  it('top-half stair (half=1) produces geometry different from bottom-half (half=0)', () => {
    const mk = (half: number) => {
      const d = new ChunkData(0, 0);
      d.set(2, 10, 2, 1);
      d.setState(2, 10, 2, packState(FACING.N, half));
      return [...emitShaped(view(d), reg).slabs.positions];
    };
    const bottom = mk(0);
    const top = mk(1);
    expect(top).not.toEqual(bottom);
    // For half=1 the full-footprint box occupies y+0.5..y+1: its bottom face is at y+0.5=10.5.
    const yVals = Array.from({ length: top.length / 3 }, (_, i) => top[i * 3 + 1]);
    expect(yVals.some((v) => Math.abs(v - 10.5) < 1e-5)).toBe(true); // full box bottom at 10.5
    expect(yVals.some((v) => Math.abs(v - 11) < 1e-5)).toBe(true); // full box top at 11
  });
});

describe('registry stair flags', () => {
  it('stair has collision AABBs and does not occlude', () => {
    expect(reg.collisionAABBs(1, 0).length).toBeGreaterThan(0); // stair is not passable
    expect(reg.occludes(1)).toBe(false);
  });
});
