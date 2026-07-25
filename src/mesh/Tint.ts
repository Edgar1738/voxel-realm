import type { TintCategory } from '../blocks/blocks';

export type RGB = readonly [number, number, number];

/** The no-tint multiplier (and palette index 0). */
export const WHITE: RGB = [1, 1, 1];

// Per-biome multipliers, indexed by Biome ordinal 0..5
// (Plains, Forest, Desert, Mountains, Tundra, Swamp). Plains = identity so
// existing worlds' plains/forest grass renders unchanged.
const GRASS_TINTS: readonly RGB[] = [
  [1.0, 1.0, 1.0], // Plains — identity (sage base texture carries the meadow look)
  [0.82, 0.94, 0.72], // Forest — deeper fern/moss
  [0.86, 0.78, 0.45], // Desert — dry tan
  [0.78, 0.82, 0.72], // Mountains — grey-green
  [0.76, 0.84, 0.86], // Tundra — pale blue-cold
  [0.62, 0.7, 0.42], // Swamp — murky olive
];
const FOLIAGE_TINTS: readonly RGB[] = [
  [1.0, 1.0, 1.0], // Plains
  [0.74, 0.9, 0.64], // Forest — deep olive canopy
  [0.8, 0.74, 0.42], // Desert
  [0.7, 0.78, 0.64], // Mountains
  [0.68, 0.8, 0.78], // Tundra — pine teal
  [0.55, 0.66, 0.4], // Swamp
];

/** index 0 = white; 1..6 = grass per biome; 7..12 = foliage per biome. */
export const TINT_PALETTE: readonly RGB[] = [WHITE, ...GRASS_TINTS, ...FOLIAGE_TINTS];

/** The palette index for a (biome, category). An unknown biome clamps to Plains. */
export function tintIndexFor(biome: number, category: TintCategory): number {
  const b = biome >= 0 && biome < 6 ? biome : 0;
  return category === 'grass' ? 1 + b : 7 + b;
}
