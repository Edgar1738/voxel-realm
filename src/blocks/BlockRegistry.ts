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

  /** Texture layer index for a given block face. */
  faceLayer(id: BlockId, face: Face): number {
    return this.get(id).faces[face];
  }

  /** Number of DataArrayTexture layers the renderer must allocate. */
  get layerCount(): number {
    return TEXTURE_LAYER_COUNT;
  }
}
