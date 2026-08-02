import {
  BRICK,
  COBBLESTONE,
  FURNACE,
  LANTERN,
  OAK_FENCE,
  PLANKS,
  PLANK_SLAB,
  SNOW,
  STAIRS_PLANK,
  WOOD,
} from '../blocks/blocks';
import type { Prefab } from '../core/Prefab';

/** Compact alpine bed: timber headboard with a snow-white voxel blanket. */
export function alpineBed(): Prefab {
  return {
    dims: [1, 1, 2],
    blocks: [
      [0, 0, 0, WOOD],
      [0, 0, 1, SNOW],
    ],
  };
}

/** Two-wide plank counter with slab worktop. */
export function alpineCounter(): Prefab {
  return {
    dims: [2, 2, 1],
    blocks: [
      [0, 0, 0, PLANKS],
      [0, 1, 0, PLANK_SLAB],
      [1, 0, 0, PLANKS],
      [1, 1, 0, PLANK_SLAB],
    ],
  };
}

/** Small irregular crate stack for stores, docks, and workshops. */
export function crateStack(): Prefab {
  return {
    dims: [2, 2, 2],
    blocks: [
      [0, 0, 0, PLANKS],
      [1, 0, 0, PLANKS],
      [0, 0, 1, PLANKS],
      [0, 1, 0, PLANKS],
    ],
  };
}

/** Four-wide masonry hearth with brick firebox and furnace core. */
export function alpineHearth(): Prefab {
  return {
    dims: [4, 4, 1],
    blocks: [
      [0, 0, 0, COBBLESTONE],
      [1, 0, 0, FURNACE],
      [2, 0, 0, FURNACE],
      [3, 0, 0, COBBLESTONE],
      [0, 1, 0, COBBLESTONE],
      [1, 1, 0, BRICK],
      [2, 1, 0, BRICK],
      [3, 1, 0, COBBLESTONE],
      [1, 2, 0, COBBLESTONE],
      [2, 2, 0, COBBLESTONE],
      [1, 3, 0, BRICK],
      [2, 3, 0, BRICK],
    ],
  };
}

/** Fence-post lantern usable indoors or beside a path. */
export function alpineLanternPost(): Prefab {
  return {
    dims: [1, 3, 1],
    blocks: [
      [0, 0, 0, OAK_FENCE],
      [0, 1, 0, OAK_FENCE],
      [0, 2, 0, LANTERN],
    ],
  };
}

/** Dining table with slab top and two inward-facing stair chairs. */
export function alpineTableSet(): Prefab {
  return {
    dims: [4, 2, 1],
    blocks: [
      [1, 0, 0, OAK_FENCE],
      [1, 1, 0, PLANK_SLAB],
      [2, 0, 0, OAK_FENCE],
      [2, 1, 0, PLANK_SLAB],
      [0, 0, 0, STAIRS_PLANK, 1],
      [3, 0, 0, STAIRS_PLANK, 3],
    ],
  };
}
