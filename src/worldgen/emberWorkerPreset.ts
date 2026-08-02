import { SEA_LEVEL } from '../core/constants';
import { scatterDecorations } from './Decorations';
import { createEmberSpireGenerator, ashenSurfaceAt } from './EmberSpireGenerator';
import type { Generator, Overlay } from './Generator';
import { emberSpireSite } from './emberSpireSite';
import { scatterOaks } from './treePrefabs';

/** Dynamically loaded by the generation worker so other worlds do not pay Ember's code cost. */
export function createEmberWorkerPreset(): { generator: Generator; overlays: Overlay[] } {
  return {
    generator: createEmberSpireGenerator(),
    overlays: [
      scatterOaks(ashenSurfaceAt, SEA_LEVEL, { minSurfaceY: SEA_LEVEL + 8 }),
      emberSpireSite(),
      scatterDecorations(),
    ],
  };
}
