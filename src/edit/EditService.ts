import type { EditableWorld, EditBatch, SetVoxel } from './EditTypes';

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
   * Pops the most recent batch and replays it with BEFORE values.
   * Pushes the batch onto the redo stack. Returns undefined if there is nothing to undo.
   */
  undo(): EditBatch | undefined {
    const batch = this.undoStack.pop();
    if (!batch) return undefined;

    // Replay in reverse so repeated edits to the same voxel within one batch undo correctly.
    const reverseEdits: SetVoxel[] = [...batch.changes].reverse().map((c) => ({
      x: c.x,
      y: c.y,
      z: c.z,
      id: c.before,
    }));
    this.world.applyEdits(reverseEdits);
    this.redoStack.push(batch);

    return batch;
  }

  /**
   * Pops from the redo stack and replays it with AFTER values.
   * Pushes the batch back onto the undo stack. Returns undefined if there is nothing to redo.
   */
  redo(): EditBatch | undefined {
    const batch = this.redoStack.pop();
    if (!batch) return undefined;

    const forwardEdits: SetVoxel[] = batch.changes.map((c) => ({
      x: c.x,
      y: c.y,
      z: c.z,
      id: c.after,
    }));
    this.world.applyEdits(forwardEdits);
    this.undoStack.push(batch);

    return batch;
  }
}
