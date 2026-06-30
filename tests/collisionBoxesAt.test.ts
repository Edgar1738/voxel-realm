import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { ChunkData } from '../src/world/ChunkData';
import { OAK_FENCE, STONE, OAK_FENCE_GATE } from '../src/blocks/blocks';
import { packState, setOpen, FACING } from '../src/world/VoxelState';
import type { Generator } from '../src/worldgen/Generator';

const reg = new BlockRegistry();
const sink = { upload: () => {}, dispose: () => {} };

class Fixture implements Generator {
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    if (cx === 0 && cz === 0) {
      d.set(2, 5, 2, STONE);
      d.set(3, 5, 2, OAK_FENCE);
      d.set(4, 5, 2, OAK_FENCE_GATE);
      d.setState(4, 5, 2, setOpen(packState(FACING.N, 0), true)); // open gate
    }
    return d;
  }
}
function mgr() {
  const m = new ChunkManager(new Fixture(), new GreedyMesher(reg), reg, sink, 1, []);
  m.preload(0, 0, 0);
  return m;
}

describe('ChunkManager.collisionBoxesAt', () => {
  it('offsets local boxes to world coords', () => {
    expect(mgr().collisionBoxesAt(2, 5, 2)).toEqual([[2, 5, 2, 3, 6, 3]]); // stone cube
  });
  it('a fence is a 1.5-tall world box', () => {
    expect(mgr().collisionBoxesAt(3, 5, 2)).toEqual([[3, 5, 2, 4, 6.5, 3]]);
  });
  it('an open gate has no boxes; air has none', () => {
    expect(mgr().collisionBoxesAt(4, 5, 2)).toEqual([]);
    expect(mgr().collisionBoxesAt(0, 5, 0)).toEqual([]);
  });
  it('below-world and unloaded read as a full cube box', () => {
    expect(mgr().collisionBoxesAt(2, -1, 2)).toEqual([[2, -1, 2, 3, 0, 3]]);
    expect(mgr().collisionBoxesAt(999, 5, 999)).toEqual([[999, 5, 999, 1000, 6, 1000]]);
  });
});
