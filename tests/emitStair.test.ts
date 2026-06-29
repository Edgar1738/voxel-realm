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

  it('rotates the upper step with facing (a known vertex differs N vs E)', () => {
    const mk = (facing: number) => {
      const d = new ChunkData(0, 0);
      d.set(2, 10, 2, 1);
      d.setState(2, 10, 2, packState(facing, 0));
      return [...emitShaped(view(d), reg).slabs.positions];
    };
    expect(mk(FACING.N)).not.toEqual(mk(FACING.E));
  });
});

describe('registry stair flags', () => {
  it('stair collides as lowerHalf and does not occlude', () => {
    expect(reg.collisionBox(1)).toBe('lowerHalf');
    expect(reg.occludes(1)).toBe(false);
  });
});
