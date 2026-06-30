import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped } from '../src/mesh/emitShaped';
import { packState, FACING, setOpen } from '../src/world/VoxelState';

const planks = { pattern: 'planks' as const, colors: [[150, 116, 70] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'gate', opaque: true, transparent: false, shape: 'gate', faces: planks },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (d: ChunkData) => new VoxelView(d, () => undefined);
function positions(state: number): number[] {
  const d = new ChunkData(0, 0);
  d.set(4, 10, 4, 1);
  d.setState(4, 10, 4, state);
  return [...emitShaped(view(d), reg).slabs.positions];
}

describe('emitGate', () => {
  it('a closed gate emits 4 boxes (2 posts + 2 rails) = 96 verts in open air', () => {
    expect(positions(packState(FACING.N, 0)).length / 3).toBe(96);
  });
  it('open geometry differs from closed', () => {
    expect(positions(setOpen(packState(FACING.N, 0), true))).not.toEqual(
      positions(packState(FACING.N, 0)),
    );
  });
  it('facing changes the span axis (N differs from E)', () => {
    expect(positions(packState(FACING.N, 0))).not.toEqual(positions(packState(FACING.E, 0)));
  });
});
