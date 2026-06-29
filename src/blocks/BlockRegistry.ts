// src/blocks/BlockRegistry.ts
import type { BlockId } from '../core/types';
import { BLOCK_DEFS, BLOCK_TEXTURES, type BlockDef, type BlockTextures, type Face } from './blocks';

/** Single source of truth for block lookups. Built from the stable BLOCK_DEFS table. */
export class BlockRegistry {
  private readonly byId = new Map<BlockId, BlockDef>();

  constructor(
    private readonly defs: BlockDef[] = BLOCK_DEFS,
    private readonly textures: BlockTextures = BLOCK_TEXTURES,
  ) {
    for (const def of this.defs) {
      if (this.byId.has(def.id)) throw new Error(`Duplicate block id: ${def.id} (${def.name})`);
      this.byId.set(def.id, def);
    }
    this.selfCheck();
  }

  /** Fail loudly at boot if the declarative table is internally inconsistent. */
  private selfCheck(): void {
    for (const def of this.defs) {
      if (!Number.isInteger(def.id) || def.id < 0 || def.id > 255) {
        throw new Error(`Block "${def.name}" id ${def.id} out of 0..255`);
      }
      if (
        def.light !== undefined &&
        (!Number.isInteger(def.light) || def.light < 0 || def.light > 15)
      ) {
        throw new Error(`Block "${def.name}" light ${def.light} out of 0..15`);
      }
      if (!def.faces) continue;
      const layers = this.textures.faceLayers.get(def.id);
      if (!layers || layers.length !== 6) {
        throw new Error(`Block "${def.name}" (id ${def.id}) did not resolve to 6 face layers`);
      }
      for (const l of layers) {
        if (l < 0 || l >= this.textures.layerCount) {
          throw new Error(
            `Block "${def.name}" face layer ${l} out of range 0..${this.textures.layerCount - 1}`,
          );
        }
      }
    }
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

  /** Texture layer index for a block face. Throws on faceless blocks (e.g. AIR). */
  faceLayer(id: BlockId, face: Face): number {
    const def = this.get(id);
    const layers = this.textures.faceLayers.get(id);
    if (!layers) {
      throw new Error(`faceLayer called on block "${def.name}" (id ${id}) which has no faces`);
    }
    return layers[face];
  }

  /** Number of DataArrayTexture layers the renderer must allocate. */
  get layerCount(): number {
    return this.textures.layerCount;
  }
}
