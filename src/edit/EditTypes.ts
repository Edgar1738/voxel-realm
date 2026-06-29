import type { BlockId } from '../core/types';

export interface WorldVoxel {
  x: number;
  y: number;
  z: number;
}

export interface SetVoxel extends WorldVoxel {
  id: BlockId;
  /** Orientation state (0 = unoriented). */
  state?: number;
}

export interface VoxelChange extends WorldVoxel {
  before: BlockId;
  after: BlockId;
  beforeState: number;
  afterState: number;
}

export interface EditBatch {
  changes: VoxelChange[];
}

/** Result of an undo/redo attempt: applied, nothing to do, or blocked by an unloaded chunk. */
export type EditOutcome = 'ok' | 'empty' | 'blocked';

/** A world that can apply a batch of voxel edits and report what actually changed. */
export interface EditableWorld {
  applyEdits(edits: SetVoxel[]): VoxelChange[];
  /** Whether every voxel currently lies in a loaded, editable chunk. */
  canApply(voxels: readonly WorldVoxel[]): boolean;
}
