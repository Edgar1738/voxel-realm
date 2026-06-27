import { describe, it, expect } from 'vitest';
import { WorldEdits } from '../src/edit/WorldEdits';
import { ChunkDeltas } from '../src/persistence/ChunkDeltas';
import { MemorySaveStore } from '../src/persistence/SaveStore';
import { UndoRedo } from '../src/edit/UndoRedo';
import { AIR, STONE, GRASS } from '../src/blocks/blocks';
import type { WorldEditor } from '../src/world/ChunkManager';

/** Map-backed fake world (the ChunkManager seam). */
function fakeManager(): WorldEditor & { store: Map<string, number> } {
  const store = new Map<string, number>();
  return {
    store,
    getBlock: (x, y, z) => store.get(`${x},${y},${z}`) ?? AIR,
    setBlock: (x, y, z, id) => store.set(`${x},${y},${z}`, id),
  };
}

function setup() {
  const manager = fakeManager();
  const deltas = new ChunkDeltas();
  const save = new MemorySaveStore();
  const undo = new UndoRedo();
  const edits = new WorldEdits(manager, deltas, save, undo);
  return { manager, deltas, save, undo, edits };
}

describe('WorldEdits', () => {
  it('applies an edit, records the delta, and persists it', async () => {
    const { manager, save, edits } = setup();
    edits.setBlock(3, 4, 5, STONE);
    expect(manager.getBlock(3, 4, 5)).toBe(STONE);
    const persisted = await save.loadDeltas();
    expect(Object.keys(persisted).length).toBe(1); // one chunk has a delta
  });

  it('undoes and redoes an edit', () => {
    const { manager, edits } = setup();
    edits.setBlock(3, 4, 5, STONE); // prev was AIR
    expect(edits.undoEdit()).toBe(true);
    expect(manager.getBlock(3, 4, 5)).toBe(AIR);
    expect(edits.redoEdit()).toBe(true);
    expect(manager.getBlock(3, 4, 5)).toBe(STONE);
  });

  it('ignores a no-op edit (same block)', () => {
    const { manager, edits } = setup();
    manager.setBlock(3, 4, 5, GRASS);
    edits.setBlock(3, 4, 5, GRASS); // same -> no undo recorded
    expect(edits.undoEdit()).toBe(false);
  });

  it('feeds recorded deltas back into generation', () => {
    const { deltas, edits } = setup();
    edits.setBlock(1, 2, 3, STONE);
    // The same deltas instance, applied to a regenerated chunk, restores the edit.
    expect(deltas.serialize()['0,0']).toBeDefined();
  });
});
