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
      d.set(8, 5, 8, OAK_FENCE); // isolated fence (no connectable neighbours)
      d.set(10, 5, 8, OAK_FENCE); // straight run: fence–fence along x
      d.set(11, 5, 8, OAK_FENCE);
      d.set(12, 5, 8, OAK_FENCE);
      d.set(6, 5, 12, OAK_FENCE); // corner: arms east + south
      d.set(7, 5, 12, OAK_FENCE);
      d.set(6, 5, 13, OAK_FENCE);
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
  it('an isolated fence collides only as its central post', () => {
    expect(mgr().collisionBoxesAt(8, 5, 8)).toEqual([[8.375, 5, 8.375, 8.625, 6.5, 8.625]]);
  });
  it('a fence next to a solid cube grows an arm toward it (but none toward a gate)', () => {
    // Stone to the west (arm), open gate to the east (no arm — gates do not connect).
    expect(mgr().collisionBoxesAt(3, 5, 2)).toEqual([
      [3.375, 5, 2.375, 3.625, 6.5, 2.625], // post
      [3, 5, 2.375, 3.375, 6.5, 2.625], // west arm toward the stone
    ]);
  });
  it('a straight fence run grows arms on both x sides', () => {
    expect(mgr().collisionBoxesAt(11, 5, 8)).toEqual([
      [11.375, 5, 8.375, 11.625, 6.5, 8.625], // post
      [11.625, 5, 8.375, 12, 6.5, 8.625], // east arm
      [11, 5, 8.375, 11.375, 6.5, 8.625], // west arm
    ]);
  });
  it('a corner fence grows arms east and south only', () => {
    expect(mgr().collisionBoxesAt(6, 5, 12)).toEqual([
      [6.375, 5, 12.375, 6.625, 6.5, 12.625], // post
      [6.625, 5, 12.375, 7, 6.5, 12.625], // east arm
      [6.375, 5, 12.625, 6.625, 6.5, 13], // south arm
    ]);
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
