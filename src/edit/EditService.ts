import { raycastVoxel, type RayHit } from './VoxelRaycast';
import { AIR } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { WorldEditor } from '../world/ChunkManager';
import type { BlockId, Vec3 } from '../core/types';

/** Turns look-rays into break/place/pick edits against a WorldEditor. */
export class EditService {
  constructor(
    private readonly world: WorldEditor,
    private readonly registry: BlockRegistry,
    private readonly reach: number,
  ) {}

  private cast(origin: Vec3, dir: Vec3): RayHit | null {
    return raycastVoxel(
      origin,
      dir,
      this.reach,
      (x, y, z) => this.world.getBlock(x, y, z),
      (id) => this.registry.isOpaque(id),
    );
  }

  /** Removes the targeted block. Returns the hit (or null on a miss). */
  break(origin: Vec3, dir: Vec3): RayHit | null {
    const hit = this.cast(origin, dir);
    if (hit) this.world.setBlock(hit.voxel.x, hit.voxel.y, hit.voxel.z, AIR);
    return hit;
  }

  /** Places `blockId` against the hit face. Returns the hit (or null on a miss). */
  place(origin: Vec3, dir: Vec3, blockId: BlockId): RayHit | null {
    const hit = this.cast(origin, dir);
    if (hit) {
      this.world.setBlock(
        hit.voxel.x + hit.normal.x,
        hit.voxel.y + hit.normal.y,
        hit.voxel.z + hit.normal.z,
        blockId,
      );
    }
    return hit;
  }

  /** Returns the targeted block id, or null on a miss. */
  pick(origin: Vec3, dir: Vec3): BlockId | null {
    const hit = this.cast(origin, dir);
    return hit ? hit.blockId : null;
  }
}
