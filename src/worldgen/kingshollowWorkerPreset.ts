import { SEA_LEVEL } from '../core/constants';
import { scatterDecorations } from './Decorations';
import { createKingshollowGenerator, kingshollowSurfaceAt } from './KingshollowGenerator';
import { kingshollowExpansion } from './kingshollowExpansion';
import { kingshollowSite } from './kingshollowSite';
import { kingshollowUnderground } from './kingshollowUnderground';
import { scatterOaks } from './treePrefabs';
import type { Generator, Overlay } from './Generator';

/** Dedicated worker preset keeps Kingshollow's authored surface and caves out of other worlds. */
export function createKingshollowWorkerPreset(): { generator: Generator; overlays: Overlay[] } {
  return {
    generator: createKingshollowGenerator(),
    overlays: [
      scatterOaks(kingshollowSurfaceAt, SEA_LEVEL, { minSurfaceY: SEA_LEVEL + 2 }),
      kingshollowSite(),
      kingshollowExpansion(),
      kingshollowUnderground(),
      scatterDecorations(),
    ],
  };
}
