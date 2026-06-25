import { CHUNK_AREA, SEA_LEVEL } from '../core/constants';
import { ChunkData } from '../world/ChunkData';
import { HeightField } from './HeightField';
import { SurfacePainter } from './SurfacePainter';
import type { Generator } from './Generator';
import type { GenContext, TerrainStage } from './TerrainStage';
import type { WorldSeed } from '../core/types';

/** Runs an ordered list of pure TerrainStages over a shared per-chunk GenContext. */
export class LayeredGenerator implements Generator {
  constructor(
    private readonly stages: TerrainStage[],
    private readonly seaLevel: number,
  ) {}

  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = new ChunkData(cx, cz);
    const ctx: GenContext = {
      seed,
      cx,
      cz,
      heights: new Int16Array(CHUNK_AREA),
      seaLevel: this.seaLevel,
    };
    for (const stage of this.stages) stage.apply(chunk, ctx);
    return chunk;
  }
}

/** The default world generator: heightmap then surface painting. */
export function createWorldGenerator(): LayeredGenerator {
  return new LayeredGenerator([new HeightField(), new SurfacePainter()], SEA_LEVEL);
}
