import { AIR } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { BlockId } from '../core/types';

/** Selects which blocks a mesh pass renders and when their faces are visible. */
export interface MeshPass {
  includes(id: BlockId): boolean;
  faceVisible(self: BlockId, neighbor: BlockId): boolean;
}

/** Opaque solids: only FULL cubes greedy-mesh; a cube face shows against any non-occluder. */
export function opaquePass(registry: BlockRegistry): MeshPass {
  return {
    includes: (id) => registry.occludes(id),
    faceVisible: (_self, neighbor) => !registry.occludes(neighbor),
  };
}

/**
 * Translucent CUBES (water, glass, ...) share one pass. Non-cube shapes (slabs/plants) are
 * excluded — slabs render in the opaque mesh and plants in the cutout mesh, so a transparent
 * plant must never also emit a full transparent cube here. A face shows against air or a
 * *different* transparent block, so a water↔glass boundary stays visible while same-type and
 * transparent↔solid internal faces are culled.
 */
export function transparentPass(registry: BlockRegistry): MeshPass {
  return {
    includes: (id) => id !== AIR && registry.get(id).transparent && registry.shape(id) === 'cube',
    faceVisible: (self, neighbor) =>
      neighbor === AIR || (neighbor !== self && registry.get(neighbor).transparent),
  };
}
