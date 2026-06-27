import { chunkKey, worldToChunkCoord, worldToLocal, voxelIndex } from '../core/coords';
import type { UndoRedo } from './UndoRedo';
import type { WorldEditor } from '../world/ChunkManager';
import type { ChunkDeltas } from '../persistence/ChunkDeltas';
import type { SaveStore } from '../persistence/SaveStore';
import type { BlockId } from '../core/types';

/**
 * Orchestrates edits: mutates the world (ChunkManager), records the delta (for regeneration),
 * queues a durable write, and tracks undo/redo. Implements WorldEditor so EditService is
 * unchanged.
 */
export class WorldEdits implements WorldEditor {
  constructor(
    private readonly world: WorldEditor,
    private readonly deltas: ChunkDeltas,
    private readonly store: SaveStore,
    private readonly undo: UndoRedo,
  ) {}

  getBlock(x: number, y: number, z: number): BlockId {
    return this.world.getBlock(x, y, z);
  }

  /** A user edit (recorded for undo). */
  setBlock(x: number, y: number, z: number, id: BlockId): void {
    this.write(x, y, z, id, true);
  }

  undoEdit(): boolean {
    const op = this.undo.undo();
    if (!op) return false;
    this.write(op.x, op.y, op.z, op.prev, false);
    return true;
  }

  redoEdit(): boolean {
    const op = this.undo.redo();
    if (!op) return false;
    this.write(op.x, op.y, op.z, op.next, false);
    return true;
  }

  private write(x: number, y: number, z: number, id: BlockId, record: boolean): void {
    const prev = this.world.getBlock(x, y, z);
    if (prev === id) return;
    this.world.setBlock(x, y, z, id);

    const cx = worldToChunkCoord(x);
    const cz = worldToChunkCoord(z);
    const idx = voxelIndex(worldToLocal(x), y, worldToLocal(z));
    this.deltas.record(cx, cz, idx, id);
    void this.store.putVoxel(chunkKey(cx, cz), idx, id);

    if (record) this.undo.record({ x, y, z, prev, next: id });
  }
}
