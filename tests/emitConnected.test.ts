import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped } from '../src/mesh/emitShaped';

const planks = { pattern: 'planks' as const, colors: [[165, 130, 80] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'fence', opaque: true, transparent: false, shape: 'fence', faces: planks },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

describe('emitConnected (fence)', () => {
  it('a lone fence emits only the post (one box = 24 verts in open air)', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1);
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(24); // post box, 6 faces × 4
  });

  it('a fence with one fence neighbour adds 2 rails toward that side only', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1);
    d.set(5, 10, 4, 1); // fence to +X
    const { slabs } = emitShaped(view(d), reg);
    // the (4,10,4) fence: post(24) + 2 rails toward +X(48) ; the (5,10,4) fence: post(24) + 2 rails toward -X(48)
    expect(slabs.positions.length / 3).toBe(24 + 48 + 24 + 48);
  });
});

describe('emitConnected cross-chunk', () => {
  it('connects to a fence in the neighbour chunk at the border', () => {
    const center = new ChunkData(0, 0);
    center.set(15, 10, 4, 1); // fence at the +X edge of chunk (0,0)
    const east = new ChunkData(1, 0);
    east.set(0, 10, 4, 1); // fence at local x=0 of chunk (1,0) == world x=16, the +X neighbour
    const v = new VoxelView(center, (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined));
    const { slabs } = emitShaped(v, reg);
    // center fence: post(24) + 2 rails toward +X(48) = 72 (no other neighbours)
    expect(slabs.positions.length / 3).toBe(72);
  });
});
