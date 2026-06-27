import type { BlockId } from '../core/types';

export interface WorldVoxel {
  x: number;
  y: number;
  z: number;
}

export interface SetVoxel extends WorldVoxel {
  id: BlockId;
}

export interface VoxelChange extends WorldVoxel {
  before: BlockId;
  after: BlockId;
}

export interface EditBatch {
  changes: VoxelChange[];
}

/** A world that can apply a batch of voxel edits and report what actually changed. */
export interface EditableWorld {
  applyEdits(edits: SetVoxel[]): VoxelChange[];
}
