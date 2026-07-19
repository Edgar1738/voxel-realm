import { SEA_LEVEL } from '../core/constants';
import { scatterDecorations } from './Decorations';
import { createEmberSpireGenerator, ashenSurfaceAt } from './EmberSpireGenerator';
import type { Generator, Overlay } from './Generator';
import { emberSpireSite } from './emberSpireSite';
import { scatterOaks } from './treePrefabs';
import { UndergroundGenerator } from './UndergroundGenerator';
import { CURRENT_WORLDGEN_VERSION } from './worldgenVersion';

/** Dynamically loaded by the generation worker so other worlds do not pay Ember's code cost. */
export function createEmberWorkerPreset(worldgenVersion: number = CURRENT_WORLDGEN_VERSION): {
  generator: Generator;
  overlays: Overlay[];
} {
  const surface = createEmberSpireGenerator();
  return {
    generator:
      worldgenVersion < CURRENT_WORLDGEN_VERSION
        ? surface
        : new UndergroundGenerator(surface, { intensity: 1.2, volcanic: 1.65 }),
    overlays: [
      scatterOaks(ashenSurfaceAt, SEA_LEVEL, { minSurfaceY: SEA_LEVEL + 8 }),
      emberSpireSite(),
      scatterDecorations(),
    ],
  };
}
