// src/blocks/BlockRegistry.ts
import type { BlockId } from '../core/types';
import { isOpen } from '../world/VoxelState';
import {
  BLOCK_DEFS,
  BLOCK_TEXTURES,
  type BlockDef,
  type BlockTextures,
  type Face,
  type Shape,
  type CollisionBox,
} from './blocks';

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
      if (def.shape !== undefined && !isShape(def.shape)) {
        throw new Error(`Block "${def.name}" has unknown shape "${String(def.shape)}"`);
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

  /** Render/collision shape of a block; 'cube' when unspecified. */
  shape(id: BlockId): Shape {
    return this.get(id).shape ?? 'cube';
  }

  /** True only for a full opaque cube: hides neighbour faces and casts AO. Slabs/plants do not. */
  occludes(id: BlockId): boolean {
    return this.get(id).opaque && this.shape(id) === 'cube';
  }

  /** Collision footprint of a block within its cell, derived from its shape. */
  collisionBox(id: BlockId): CollisionBox {
    switch (this.shape(id)) {
      case 'cube':
      case 'fence':
      case 'wall':
      case 'gate':
        return 'full';
      case 'slab':
      case 'stair':
        return 'lowerHalf';
      case 'cross':
        return 'none';
    }
  }

  /** State-aware collision: an open gate is passable; everything else ignores state. */
  collisionBoxFor(id: BlockId, state: number): CollisionBox {
    if (this.shape(id) === 'gate') return isOpen(state) ? 'none' : 'full';
    return this.collisionBox(id);
  }

  /** True if right-click should toggle the block's `open` state instead of placing. */
  isToggleable(id: BlockId): boolean {
    return this.shape(id) === 'gate';
  }

  /** True if a fence/wall `self` should connect to `neighbor`: a full opaque cube, or the same shape. */
  connectsTo(self: BlockId, neighbor: BlockId): boolean {
    return this.occludes(neighbor) || this.shape(neighbor) === this.shape(self);
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

function isShape(value: string): value is Shape {
  return (
    value === 'cube' ||
    value === 'slab' ||
    value === 'cross' ||
    value === 'stair' ||
    value === 'fence' ||
    value === 'wall' ||
    value === 'gate'
  );
}
