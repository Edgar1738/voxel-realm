import { AIR, WATER } from '../blocks/blocks';
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

/** Water surface: only water blocks; a face shows only against air. */
export function waterPass(): MeshPass {
  return {
    includes: (id) => id === WATER,
    faceVisible: (_self, neighbor) => neighbor === AIR,
  };
}
