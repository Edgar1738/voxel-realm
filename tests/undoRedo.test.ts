import { describe, it, expect } from 'vitest';
import { UndoRedo, type EditOp } from '../src/edit/UndoRedo';

const op = (next: number): EditOp => ({ x: 0, y: 0, z: 0, prev: 0, next });

describe('UndoRedo', () => {
  it('returns the op to undo, then to redo', () => {
    const ur = new UndoRedo();
    ur.record(op(1));
    expect(ur.canUndo).toBe(true);
    const undone = ur.undo();
    expect(undone?.next).toBe(1); // caller applies prev
    expect(ur.canUndo).toBe(false);
    const redone = ur.redo();
    expect(redone?.next).toBe(1); // caller applies next
  });

  it('returns null when there is nothing to undo/redo', () => {
    const ur = new UndoRedo();
    expect(ur.undo()).toBeNull();
    expect(ur.redo()).toBeNull();
  });

  it('clears the redo stack on a new edit', () => {
    const ur = new UndoRedo();
    ur.record(op(1));
    ur.undo();
    ur.record(op(2)); // new edit invalidates redo
    expect(ur.redo()).toBeNull();
  });
});
