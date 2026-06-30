import type { TintCategory } from '../blocks/blocks';

export type RGB = readonly [number, number, number];

/** The no-tint multiplier (and palette index 0). */
export const WHITE: RGB = [1, 1, 1];

// Per-biome multipliers, indexed by Biome ordinal 0..5
// (Plains, Forest, Desert, Mountains, Tundra, Swamp). Plains = identity so
// existing worlds' plains/forest grass renders unchanged.
const GRASS_TINTS: readonly RGB[] = [
  [1.0, 1.0, 1.0], // Plains
  [0.92, 1.0, 0.85], // Forest — lush
  [0.86, 0.78, 0.45], // Desert — dry tan
  [0.8, 0.85, 0.7], // Mountains
  [0.78, 0.86, 0.82], // Tundra — pale cold
  [0.62, 0.7, 0.42], // Swamp — murky
];
const FOLIAGE_TINTS: readonly RGB[] = [
  [1.0, 1.0, 1.0], // Plains
  [0.85, 0.98, 0.78], // Forest
  [0.8, 0.74, 0.42], // Desert
  [0.74, 0.82, 0.66], // Mountains
  [0.74, 0.84, 0.8], // Tundra
  [0.55, 0.66, 0.4], // Swamp
];

/** index 0 = white; 1..6 = grass per biome; 7..12 = foliage per biome. */
export const TINT_PALETTE: RGB[] = [WHITE, ...GRASS_TINTS, ...FOLIAGE_TINTS];

/** The palette index for a (biome, category). An unknown biome clamps to Plains. */
export function tintIndexFor(biome: number, category: TintCategory): number {
  const b = biome >= 0 && biome < 6 ? biome : 0;
  return category === 'grass' ? 1 + b : 7 + b;
}
