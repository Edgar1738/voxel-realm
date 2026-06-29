import type { EditableWorld, EditBatch, EditOutcome, SetVoxel, VoxelChange } from './EditTypes';

/** Pure batch undo/redo engine. Delegates mutations to an injected EditableWorld. */
export class EditService {
  private readonly undoStack: EditBatch[] = [];
  private readonly redoStack: EditBatch[] = [];
  private pending: VoxelChange[] | null = null;
  private depth = 0;

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
      // Clear redo lazily — only when the first real change is recorded inside the group.
      if (this.pending.length === 0) this.redoStack.length = 0;
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
   * but accumulate their changes into the group. Redo is cleared lazily on the
   * first real change (not here). Nested beginGroup() calls increment the depth
   * counter so only the outermost endGroup() commits the batch.
   */
  beginGroup(): void {
    if (this.depth === 0) this.pending = [];
    this.depth += 1;
  }

  /**
   * Closes the pending group. If this is the outermost close (depth returns to 0),
   * pushes the accumulated changes as a single EditBatch onto the undo stack
   * (capped at historyLimit). Returns the batch, or undefined if the group was
   * empty, no group was open, or this was an inner close.
   */
  endGroup(): EditBatch | undefined {
    if (this.depth === 0) return undefined;
    this.depth -= 1;
    if (this.depth > 0) return undefined; // still inside an outer group
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
      state: c.beforeState,
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
      state: c.afterState,
    }));
    this.world.applyEdits(forwardEdits);
    this.undoStack.push(batch);

    return 'ok';
  }
}
