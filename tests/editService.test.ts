import { describe, it, expect } from 'vitest';
import { EditService } from '../src/edit/EditService';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';
import type { WorldEditor } from '../src/world/ChunkManager';

/** A Map-backed fake world for testing edits. */
function fakeWorld(
  initial: Record<string, number> = {},
): WorldEditor & { store: Map<string, number> } {
  const store = new Map<string, number>(Object.entries(initial));
  return {
    store,
    getBlock: (x, y, z) => store.get(`${x},${y},${z}`) ?? AIR,
    setBlock: (x, y, z, id) => store.set(`${x},${y},${z}`, id),
  };
}

const reg = new BlockRegistry();

describe('EditService', () => {
  it('breaks the targeted block (sets it to air)', () => {
    const world = fakeWorld({ '5,0,0': STONE });
    const edit = new EditService(world, reg, 10);
    const hit = edit.break({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 });
    expect(hit).not.toBeNull();
    expect(world.getBlock(5, 0, 0)).toBe(AIR);
  });

  it('places a block on the hit face (the empty neighbor)', () => {
    const world = fakeWorld({ '5,0,0': STONE });
    const edit = new EditService(world, reg, 10);
    edit.place({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 }, GRASS);
    expect(world.getBlock(4, 0, 0)).toBe(GRASS); // placed against the -X face
  });

  it('picks the targeted block id', () => {
    const world = fakeWorld({ '5,0,0': STONE });
    const edit = new EditService(world, reg, 10);
    expect(edit.pick({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 })).toBe(STONE);
  });

  it('does nothing when the ray misses', () => {
    const world = fakeWorld();
    const edit = new EditService(world, reg, 10);
    expect(edit.break({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 })).toBeNull();
    expect(edit.pick({ x: 0.5, y: 0.5, z: 0.5 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });
});
