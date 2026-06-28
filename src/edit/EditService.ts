import type { EditableWorld, EditBatch, EditOutcome, SetVoxel, VoxelChange } from './EditTypes';

/** Pure batch undo/redo engine. Delegates mutations to an injected EditableWorld. */
export class EditService {
  private readonly undoStack: EditBatch[] = [];
  private readonly redoStack: EditBatch[] = [];
  private pending: VoxelChange[] | null = null;

  constructor(
    private readonly world: EditableWorld,
    private readonly historyLimit: number = 128,
  ) {}

  /**
   * Applies `edits` to the world. If any voxels actually changed, wraps them
   * in an EditBatch, pushes it onto the undo stack (capped at historyLimit),
   * clears the redo stack, and returns the batch. Returns undefined if nothing changed.
   *
   * While a group is open (between beginGroup/endGroup), mutations are applied
   * immediately but accumulated into the pending group instead of pushing their
   * own batch onto the undo stack.
   */
  apply(edits: SetVoxel[]): EditBatch | undefined {
    const changes = this.world.applyEdits(edits);
    if (changes.length === 0) return undefined;

    if (this.pending) {
      this.pending.push(...changes);
      return { changes };
    }

    const batch: EditBatch = { changes };

    if (this.undoStack.length >= this.historyLimit) {
      this.undoStack.shift();
    }
    this.undoStack.push(batch);
    this.redoStack.length = 0;

    return batch;
  }

  /**
   * Opens a pending group. Subsequent apply() calls mutate the world immediately
   * but accumulate their changes into the group. Also clears the redo stack once,
   * just like a normal apply(). Nested beginGroup() calls are ignored.
   */
  beginGroup(): void {
    if (this.pending) return; // already grouping; ignore nested begins
    this.pending = [];
    this.redoStack.length = 0;
  }

  /**
   * Closes the pending group and pushes the accumulated changes as a single
   * EditBatch onto the undo stack (capped at historyLimit). Returns the batch,
   * or undefined if the group was empty or no group was open.
   */
  endGroup(): EditBatch | undefined {
    const changes = this.pending;
    this.pending = null;
    if (!changes || changes.length === 0) return undefined;
    const batch: EditBatch = { changes };
    if (this.undoStack.length >= this.historyLimit) this.undoStack.shift();
    this.undoStack.push(batch);
    return batch;
  }

  /**
   * Runs `fn` inside a group: begins before, ends after (in a finally block so
   * the group always closes even if `fn` throws). Returns the value from `fn`.
   */
  group<T>(fn: () => T): T {
    this.beginGroup();
    try {
      return fn();
    } finally {
      this.endGroup();
    }
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
