import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { ChunkData } from '../src/world/ChunkData';
import { packState, FACING, setOpen } from '../src/world/VoxelState';
import type { Generator } from '../src/worldgen/Generator';

const planks = { pattern: 'planks' as const, colors: [[150, 116, 70] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'gate', opaque: true, transparent: false, shape: 'gate', faces: planks },
];
const GATE = 1;
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const sink = { upload: () => {}, dispose: () => {} };

class GateAt implements Generator {
  constructor(private readonly state: number) {}
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    if (cx === 0 && cz === 0) {
      d.set(2, 5, 2, GATE);
      d.setState(2, 5, 2, this.state);
    }
    return d;
  }
}
function mgr(state: number) {
  const m = new ChunkManager(new GateAt(state), new GreedyMesher(reg), reg, sink, 1, []);
  m.preload(0, 0, 0);
  return m;
}

describe('state-aware collisionBoxesAt', () => {
  it('a closed gate has collision boxes, an open gate is passable', () => {
    expect(mgr(packState(FACING.N, 0)).collisionBoxesAt(2, 5, 2).length).toBeGreaterThan(0);
    expect(mgr(setOpen(packState(FACING.N, 0), true)).collisionBoxesAt(2, 5, 2).length).toBe(0);
  });
  it('getState reads the voxel state', () => {
    const open = setOpen(packState(FACING.E, 0), true);
    expect(mgr(open).getState(2, 5, 2)).toBe(open);
  });
});
