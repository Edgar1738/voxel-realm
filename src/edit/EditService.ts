import type { EditableWorld, EditBatch, EditOutcome, SetVoxel } from './EditTypes';

/** Pure batch undo/redo engine. Delegates mutations to an injected EditableWorld. */
export class EditService {
  private readonly undoStack: EditBatch[] = [];
  private readonly redoStack: EditBatch[] = [];

  constructor(
    private readonly world: EditableWorld,
    private readonly historyLimit: number = 128,
  ) {}

  /**
   * Applies `edits` to the world. If any voxels actually changed, wraps them
   * in an EditBatch, pushes it onto the undo stack (capped at historyLimit),
   * clears the redo stack, and returns the batch. Returns undefined if nothing changed.
   */
  apply(edits: SetVoxel[]): EditBatch | undefined {
    const changes = this.world.applyEdits(edits);
    if (changes.length === 0) return undefined;

    const batch: EditBatch = { changes };

    if (this.undoStack.length >= this.historyLimit) {
      this.undoStack.shift();
    }
    this.undoStack.push(batch);
    this.redoStack.length = 0;

    return batch;
  }

  /**
   * Replays the most recent batch with BEFORE values and moves it to the redo stack.
   * Returns 'empty' if there is nothing to undo, or 'blocked' (leaving history intact) if any
   * affected voxel is no longer in a loaded chunk — so history never claims a no-op succeeded.
   */
  undo(): EditOutcome {
    const batch = this.undoStack[this.undoStack.length - 1];
    if (!batch) return 'empty';
    if (!this.world.canApply(batch.changes)) return 'blocked';

    this.undoStack.pop();
    // Replay in reverse so repeated edits to the same voxel within one batch undo correctly.
    const reverseEdits: SetVoxel[] = [...batch.changes].reverse().map((c) => ({
      x: c.x,
      y: c.y,
      z: c.z,
      id: c.before,
    }));
    this.world.applyEdits(reverseEdits);
    this.redoStack.push(batch);

    return 'ok';
  }

  /**
   * Replays the next redo batch with AFTER values and moves it back to the undo stack.
   * Returns 'empty' when there is nothing to redo, or 'blocked' (leaving history intact) if any
   * affected voxel is no longer in a loaded chunk.
   */
  redo(): EditOutcome {
    const batch = this.redoStack[this.redoStack.length - 1];
    if (!batch) return 'empty';
    if (!this.world.canApply(batch.changes)) return 'blocked';

    this.redoStack.pop();
    const forwardEdits: SetVoxel[] = batch.changes.map((c) => ({
      x: c.x,
      y: c.y,
      z: c.z,
      id: c.after,
    }));
    this.world.applyEdits(forwardEdits);
    this.undoStack.push(batch);

    return 'ok';
  }
}
