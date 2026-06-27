import { AIR } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockId } from '../core/types';

/** Selects which blocks a mesh pass renders and when their faces are visible. */
export interface MeshPass {
  includes(id: BlockId): boolean;
  faceVisible(self: BlockId, neighbor: BlockId): boolean;
}

/** Opaque solids: any opaque block; a face shows against any non-opaque neighbor. */
export function opaquePass(registry: BlockRegistry): MeshPass {
  return {
    includes: (id) => registry.isOpaque(id),
    faceVisible: (_self, neighbor) => !registry.isOpaque(neighbor),
  };
}

/**
 * Translucent blocks (water, glass, ...) share one pass. A face shows against air or against a
 * *different* transparent block, so a water↔glass boundary stays visible (each side renders its
 * own face under backface culling), while same-type (water↔water, glass↔glass) and transparent↔
 * solid internal faces are culled.
 */
export function transparentPass(registry: BlockRegistry): MeshPass {
  return {
    includes: (id) => id !== AIR && registry.get(id).transparent,
    faceVisible: (self, neighbor) =>
      neighbor === AIR || (neighbor !== self && registry.get(neighbor).transparent),
  };
}
