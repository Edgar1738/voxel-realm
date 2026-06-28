import type { BlockId } from '../core/types';
import { BLOCK_DEFS, TEXTURE_LAYER_COUNT, type BlockDef, type Face } from './blocks';

/** Single source of truth for block lookups. Built from the stable BLOCK_DEFS table. */
export class BlockRegistry {
  private readonly byId = new Map<BlockId, BlockDef>();

  constructor() {
    for (const def of BLOCK_DEFS) this.byId.set(def.id, def);
  }

  get(id: BlockId): BlockDef {
    const def = this.byId.get(id);
    if (!def) throw new Error(`Unknown block id: ${id}`);
    return def;
  }

  /** Whether a block id exists in the registry (for validating untrusted saves). */
  has(id: BlockId): boolean {
    return this.byId.has(id);
  }

  isOpaque(id: BlockId): boolean {
    return this.get(id).opaque;
  }

  /** A block's self-emitted light level (0..15); 0 for non-emitters. */
  emission(id: BlockId): number {
    return this.get(id).light ?? 0;
  }

  /** Texture layer index for a given block face. Throws if the block has no faces
   *  (e.g. AIR) so that a mesh pass that incorrectly includes a faceless block fails
   *  loudly instead of silently baking undefined/NaN into the geometry. */
  faceLayer(id: BlockId, face: Face): number {
    const def = this.get(id);
    if (def.faces.length === 0) {
      throw new Error(`faceLayer called on block "${def.name}" (id ${id}) which has no faces`);
    }
    return def.faces[face];
  }

  /** Number of DataArrayTexture layers the renderer must allocate. */
  get layerCount(): number {
    return TEXTURE_LAYER_COUNT;
  }
}
