import {
  AGED_MASONRY,
  BASALT,
  BLUE_STONE,
  CARVED_LIMESTONE,
  CLAY_ROOF,
  COBBLESTONE,
  GRANITE,
  LIMESTONE,
  MOSSY_COBBLE,
  SANDSTONE,
  SLATE,
  STONE,
  WARM_MASONRY,
  WARM_STONE,
} from '../blocks/blocks';
import type { BlockId } from '../core/types';

/** A structure's material language. Generators consume roles instead of hard-coded gray blocks. */
export interface MaterialPalette {
  primary: BlockId;
  foundation: BlockId;
  trim: BlockId;
  weathered: BlockId;
  roof: BlockId;
}

export const CASTLE_PALETTES = {
  highlandKeep: {
    primary: AGED_MASONRY,
    foundation: BASALT,
    trim: CARVED_LIMESTONE,
    weathered: MOSSY_COBBLE,
    roof: SLATE,
  },
  sunCourt: {
    primary: WARM_MASONRY,
    foundation: SANDSTONE,
    trim: LIMESTONE,
    weathered: WARM_STONE,
    roof: CLAY_ROOF,
  },
  oldFortress: {
    primary: AGED_MASONRY,
    foundation: COBBLESTONE,
    trim: WARM_STONE,
    weathered: MOSSY_COBBLE,
    roof: SLATE,
  },
  mountainCitadel: {
    primary: BLUE_STONE,
    foundation: BASALT,
    trim: GRANITE,
    weathered: STONE,
    roof: SLATE,
  },
} as const satisfies Record<string, MaterialPalette>;

/** Stable large-scale material choice; patches are broad enough to remain visually composed. */
export function castleWallMaterial(
  palette: MaterialPalette,
  x: number,
  y: number,
  z: number,
  foundationY: number,
): BlockId {
  if (y <= foundationY + 2) return palette.foundation;
  const patch = Math.abs(Math.imul(x >> 3, 73856093) ^ Math.imul(z >> 3, 19349663)) % 100;
  if (patch < 5) return palette.weathered;
  return palette.primary;
}
