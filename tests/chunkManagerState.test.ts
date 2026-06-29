import { describe, it, expect } from 'vitest';
import { ChunkManager } from '../src/world/ChunkManager';
import { GreedyMesher } from '../src/mesh/GreedyMesher';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { ChunkData } from '../src/world/ChunkData';
import type { Generator } from '../src/worldgen/Generator';

const registry = new BlockRegistry();
class Flat implements Generator {
  generateBaseChunk(_s: number, cx: number, cz: number): ChunkData {
    const d = new ChunkData(cx, cz);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) d.set(x, 0, z, 3); // stone floor
    return d;
  }
}
const sink = { upload: () => {}, dispose: () => {} };
function mgr() {
  const m = new ChunkManager(new Flat(), new GreedyMesher(registry), registry, sink, 1, []);
  m.preload(0, 0, 0);
  return m;
}

describe('ChunkManager state threading', () => {
  it('stores id + state and reports it in the delta', () => {
    const m = mgr();
    m.applyEdits([{ x: 1, y: 5, z: 1, id: 27, state: 6 }]); // arbitrary opaque id + state
    const delta = m.getChunkDelta('0,0');
    const entry = delta.find((e) => e[0] !== undefined && e[1] === 27);
    expect(entry).toBeDefined();
    expect(entry![2]).toBe(6); // [index, id, state]
  });
  it('an id-equal but state-different edit still counts as a change', () => {
    const m = mgr();
    m.applyEdits([{ x: 2, y: 5, z: 2, id: 27, state: 0 }]);
    const changes = m.applyEdits([{ x: 2, y: 5, z: 2, id: 27, state: 6 }]);
    expect(changes.length).toBe(1);
    expect(changes[0].beforeState).toBe(0);
    expect(changes[0].afterState).toBe(6);
  });
  it('reverting id AND state to base drops the delta', () => {
    const m = mgr();
    m.applyEdits([{ x: 3, y: 0, z: 3, id: 1, state: 4 }]); // change the floor voxel (only edit)
    m.applyEdits([{ x: 3, y: 0, z: 3, id: 3, state: 0 }]); // back to base (stone floor, state 0)
    expect(m.getChunkDelta('0,0').length).toBe(0); // delta fully cleared
  });
});
