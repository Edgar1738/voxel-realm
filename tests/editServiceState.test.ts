import { describe, it, expect } from 'vitest';
import { EditService } from '../src/edit/EditService';
import type { EditableWorld, SetVoxel, VoxelChange, WorldVoxel } from '../src/edit/EditTypes';

/** Minimal world: one voxel cell with id + state, recording applied edits. */
class Cell implements EditableWorld {
  id = 0;
  state = 0;
  applyEdits(edits: SetVoxel[]): VoxelChange[] {
    const out: VoxelChange[] = [];
    for (const e of edits) {
      const before = this.id;
      const beforeState = this.state;
      const after = e.id;
      const afterState = e.state ?? 0;
      if (before === after && beforeState === afterState) continue;
      this.id = after;
      this.state = afterState;
      out.push({ x: e.x, y: e.y, z: e.z, before, after, beforeState, afterState });
    }
    return out;
  }
  canApply(_v: readonly WorldVoxel[]): boolean {
    return true;
  }
}

describe('EditService undo/redo restores state', () => {
  it('undo restores the prior id AND state; redo re-applies', () => {
    const cell = new Cell();
    const svc = new EditService(cell);
    svc.apply([{ x: 0, y: 0, z: 0, id: 31, state: 6 }]);
    expect([cell.id, cell.state]).toEqual([31, 6]);
    svc.undo();
    expect([cell.id, cell.state]).toEqual([0, 0]);
    svc.redo();
    expect([cell.id, cell.state]).toEqual([31, 6]);
  });
});
