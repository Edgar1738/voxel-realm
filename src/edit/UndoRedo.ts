import type { BlockId } from '../core/types';

/** A single reversible voxel edit at world coords. */
export interface EditOp {
  x: number;
  y: number;
  z: number;
  prev: BlockId;
  next: BlockId;
}

/** Session-only undo/redo stacks (not persisted). */
export class UndoRedo {
  private readonly undoStack: EditOp[] = [];
  private readonly redoStack: EditOp[] = [];

  record(op: EditOp): void {
    this.undoStack.push(op);
    this.redoStack.length = 0;
  }

  /** Pops an op to undo (caller applies its `prev`), or null. */
  undo(): EditOp | null {
    const op = this.undoStack.pop();
    if (!op) return null;
    this.redoStack.push(op);
    return op;
  }

  /** Pops an op to redo (caller applies its `next`), or null. */
  redo(): EditOp | null {
    const op = this.redoStack.pop();
    if (!op) return null;
    this.undoStack.push(op);
    return op;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
}
