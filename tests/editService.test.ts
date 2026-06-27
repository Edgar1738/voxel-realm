import { describe, it, expect } from 'vitest';
import { EditService } from '../src/edit/EditService';
import type { EditableWorld, SetVoxel, VoxelChange } from '../src/edit/EditTypes';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';

/** A Map-backed fake world implementing EditableWorld. */
function makeFakeWorld(initial: Record<string, number> = {}): EditableWorld & {
  store: Map<string, number>;
} {
  const store = new Map<string, number>(Object.entries(initial).map(([k, v]) => [k, v]));

  function key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  return {
    store,
    applyEdits(edits: SetVoxel[]): VoxelChange[] {
      const changes: VoxelChange[] = [];
      for (const edit of edits) {
        const before = store.get(key(edit.x, edit.y, edit.z)) ?? AIR;
        if (before === edit.id) continue;
        store.set(key(edit.x, edit.y, edit.z), edit.id);
        changes.push({ x: edit.x, y: edit.y, z: edit.z, before, after: edit.id });
      }
      return changes;
    },
  };
}

describe('EditService', () => {
  it('apply() returns a batch with correct before/after and mutates the world', () => {
    const world = makeFakeWorld();
    const service = new EditService(world);

    const batch = service.apply([{ x: 1, y: 0, z: 0, id: STONE }]);

    expect(batch).not.toBeUndefined();
    expect(batch!.changes).toHaveLength(1);
    expect(batch!.changes[0]).toMatchObject({ x: 1, y: 0, z: 0, before: AIR, after: STONE });
    expect(world.store.get('1,0,0')).toBe(STONE);
  });

  it('apply() records a multi-voxel brush as ONE EditBatch', () => {
    const world = makeFakeWorld();
    const service = new EditService(world);

    const batch = service.apply([
      { x: 0, y: 0, z: 0, id: STONE },
      { x: 1, y: 0, z: 0, id: GRASS },
      { x: 2, y: 0, z: 0, id: STONE },
    ]);

    expect(batch).not.toBeUndefined();
    expect(batch!.changes).toHaveLength(3);
    expect(world.store.get('0,0,0')).toBe(STONE);
    expect(world.store.get('1,0,0')).toBe(GRASS);
    expect(world.store.get('2,0,0')).toBe(STONE);
  });

  it('apply() returns undefined and records no history when no voxel actually changes', () => {
    const world = makeFakeWorld({ '1,0,0': STONE });
    const service = new EditService(world);

    const batch = service.apply([{ x: 1, y: 0, z: 0, id: STONE }]);

    expect(batch).toBeUndefined();
    // No undo history recorded — subsequent undo() returns undefined
    expect(service.undo()).toBeUndefined();
  });

  it('undo() restores before-values; redo() restores after-values', () => {
    const world = makeFakeWorld();
    const service = new EditService(world);

    service.apply([
      { x: 0, y: 0, z: 0, id: STONE },
      { x: 1, y: 0, z: 0, id: GRASS },
    ]);

    const undoBatch = service.undo();
    expect(undoBatch).not.toBeUndefined();
    expect(world.store.get('0,0,0')).toBe(AIR);
    expect(world.store.get('1,0,0')).toBe(AIR);

    const redoBatch = service.redo();
    expect(redoBatch).not.toBeUndefined();
    expect(world.store.get('0,0,0')).toBe(STONE);
    expect(world.store.get('1,0,0')).toBe(GRASS);
  });

  it('a new apply() after an undo clears the redo stack', () => {
    const world = makeFakeWorld();
    const service = new EditService(world);

    service.apply([{ x: 0, y: 0, z: 0, id: STONE }]);
    service.undo();
    service.apply([{ x: 5, y: 0, z: 0, id: GRASS }]);

    expect(service.redo()).toBeUndefined();
  });

  it('undoes a batch that edits the same voxel twice back to the original', () => {
    const world = makeFakeWorld(); // (0,0,0) starts AIR
    const service = new EditService(world);

    // AIR -> STONE -> GRASS within one batch.
    service.apply([
      { x: 0, y: 0, z: 0, id: STONE },
      { x: 0, y: 0, z: 0, id: GRASS },
    ]);
    expect(world.store.get('0,0,0')).toBe(GRASS);

    service.undo();
    expect(world.store.get('0,0,0')).toBe(AIR); // reverse replay restores the original

    service.redo();
    expect(world.store.get('0,0,0')).toBe(GRASS);
  });
});
