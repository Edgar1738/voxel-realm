import { CHUNK_AREA, SEA_LEVEL } from '../core/constants';
import { ChunkData } from '../world/ChunkData';
import { HeightField } from './HeightField';
import { SurfacePainter } from './SurfacePainter';
import { CaveCarver } from './CaveCarver';
import { WaterFiller } from './WaterFiller';
import { OreScatterer } from './OreScatterer';
import { CaveTorcher } from './CaveTorcher';
import { BiomeMap } from './BiomeMap';
import type { Generator } from './Generator';
import type { GenContext, TerrainStage } from './TerrainStage';
import type { WorldSeed } from '../core/types';

/** Runs an ordered list of pure TerrainStages over a shared per-chunk GenContext. */
export class LayeredGenerator implements Generator {
  private readonly biomesBySeed = new Map<WorldSeed, BiomeMap>();

  constructor(
    private readonly stages: TerrainStage[],
    private readonly seaLevel: number,
  ) {}

  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = new ChunkData(cx, cz);
    let biomes = this.biomesBySeed.get(seed);
    if (!biomes) {
      biomes = new BiomeMap(seed);
      this.biomesBySeed.set(seed, biomes);
    }
    const ctx: GenContext = {
      seed,
      cx,
      cz,
      heights: new Int16Array(CHUNK_AREA),
      seaLevel: this.seaLevel,
      biomes,
    };
    for (const stage of this.stages) stage.apply(chunk, ctx);
    return chunk;
  }
}

/** The default world generator: heightmap, surface, caves, water, ore, then cave torches. */
export function createWorldGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [
      new HeightField(),
      new SurfacePainter(),
      new CaveCarver(),
      new WaterFiller(),
      new OreScatterer(),
      new CaveTorcher(),
    ],
    SEA_LEVEL,
  );
}

/** A spelunking world: roomier caverns than default, ore-rich and lit with torches. */
export function createCavernsGenerator(): LayeredGenerator {
  return new LayeredGenerator(
    [
      new HeightField(),
      new SurfacePainter(),
      new CaveCarver({ threshold: 0.14, frequency: 1 / 30 }),
      new WaterFiller(),
      new OreScatterer({ densityScale: 1.6 }),
      new CaveTorcher({ density: 0.05 }),
    ],
    SEA_LEVEL,
  );
}
