import { describe, it, expect } from 'vitest';
import { EditService } from '../src/edit/EditService';
import type { EditableWorld, SetVoxel, VoxelChange } from '../src/edit/EditTypes';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';

/** A Map-backed fake world implementing EditableWorld. */
function makeFakeWorld(initial: Record<string, number> = {}): EditableWorld & {
  store: Map<string, number>;
  unloaded: Set<string>;
} {
  const store = new Map<string, number>(Object.entries(initial).map(([k, v]) => [k, v]));
  const unloaded = new Set<string>(); // coords whose chunk is "unloaded"

  function key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  return {
    store,
    unloaded,
    applyEdits(edits: SetVoxel[]): VoxelChange[] {
      const changes: VoxelChange[] = [];
      for (const edit of edits) {
        const before = store.get(key(edit.x, edit.y, edit.z)) ?? AIR;
        if (before === edit.id) continue;
        store.set(key(edit.x, edit.y, edit.z), edit.id);
        changes.push({
          x: edit.x,
          y: edit.y,
          z: edit.z,
          before,
          after: edit.id,
          beforeState: 0,
          afterState: 0,
        });
      }
      return changes;
    },
    canApply(voxels): boolean {
      return voxels.every((v) => !unloaded.has(key(v.x, v.y, v.z)));
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
    // No undo history recorded — subsequent undo() reports nothing to do.
    expect(service.undo()).toBe('empty');
  });

  it('undo() restores before-values; redo() restores after-values', () => {
    const world = makeFakeWorld();
    const service = new EditService(world);

    service.apply([
      { x: 0, y: 0, z: 0, id: STONE },
      { x: 1, y: 0, z: 0, id: GRASS },
    ]);

    expect(service.undo()).toBe('ok');
    expect(world.store.get('0,0,0')).toBe(AIR);
    expect(world.store.get('1,0,0')).toBe(AIR);

    expect(service.redo()).toBe('ok');
    expect(world.store.get('0,0,0')).toBe(STONE);
    expect(world.store.get('1,0,0')).toBe(GRASS);
  });

  it('refuses to undo when a changed voxel is no longer loaded, keeping history intact', () => {
    const world = makeFakeWorld();
    const service = new EditService(world);

    service.apply([{ x: 0, y: 0, z: 0, id: STONE }]);
    world.unloaded.add('0,0,0'); // its chunk streamed out

    expect(service.undo()).toBe('blocked');
    expect(world.store.get('0,0,0')).toBe(STONE); // unchanged

    world.unloaded.delete('0,0,0'); // streamed back in
    expect(service.undo()).toBe('ok'); // now it applies
    expect(world.store.get('0,0,0')).toBe(AIR);
  });

  it('a new apply() after an undo clears the redo stack', () => {
    const world = makeFakeWorld();
    const service = new EditService(world);

    service.apply([{ x: 0, y: 0, z: 0, id: STONE }]);
    service.undo();
    service.apply([{ x: 5, y: 0, z: 0, id: GRASS }]);

    expect(service.redo()).toBe('empty');
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

describe('EditService grouping', () => {
  it('coalesces multiple applies into one undo', () => {
    const svc = new EditService(makeFakeWorld());
    svc.group(() => {
      svc.apply([{ x: 0, y: 0, z: 0, id: STONE }]);
      svc.apply([{ x: 1, y: 0, z: 0, id: STONE }]);
      svc.apply([{ x: 2, y: 0, z: 0, id: STONE }]);
    });
    expect(svc.undo()).toBe('ok');
    // one undo reverses ALL three
    expect(svc.undo()).toBe('empty');
  });

  it('closes the group even when fn throws', () => {
    const svc = new EditService(makeFakeWorld());
    expect(() =>
      svc.group(() => {
        svc.apply([{ x: 0, y: 0, z: 0, id: STONE }]);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // history is intact and the partial work is one undoable batch
    expect(svc.undo()).toBe('ok');
    expect(svc.undo()).toBe('empty');
  });
});

describe('EditService grouping edge cases', () => {
  it('an empty group does not clear redo', () => {
    const svc = new EditService(makeFakeWorld());
    svc.apply([{ x: 0, y: 0, z: 0, id: 1 }]);
    expect(svc.undo()).toBe('ok'); // sets up a redo entry
    svc.group(() => {
      svc.apply([]);
    }); // no real change
    expect(svc.redo()).toBe('ok'); // redo still available
  });

  it('nested groups commit as one batch on the outer close', () => {
    const svc = new EditService(makeFakeWorld());
    svc.group(() => {
      svc.apply([{ x: 0, y: 0, z: 0, id: 1 }]);
      svc.group(() => {
        svc.apply([{ x: 1, y: 0, z: 0, id: 1 }]);
      }); // nested
      svc.apply([{ x: 2, y: 0, z: 0, id: 1 }]);
    });
    expect(svc.undo()).toBe('ok'); // one undo reverses ALL three
    expect(svc.undo()).toBe('empty');
  });
});
