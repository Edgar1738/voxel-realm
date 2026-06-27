import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from '../core/math';
import type { WorldSeed } from '../core/types';

export enum Biome {
  Plains,
  Forest,
  Desert,
  Mountains,
  Tundra,
}

/** Terrain parameters a biome contributes to the heightmap. */
export interface BiomeDef {
  biome: Biome;
  amplitude: number;
  baseOffset: number;
}

/** What stages need from the biome system: classification + blended terrain params. */
export interface BiomeSource {
  biomeAt(worldX: number, worldZ: number): Biome;
  blendedTerrain(worldX: number, worldZ: number): { amplitude: number; baseOffset: number };
}

const DEFS: Record<Biome, BiomeDef> = {
  [Biome.Plains]: { biome: Biome.Plains, amplitude: 8, baseOffset: 0 },
  [Biome.Forest]: { biome: Biome.Forest, amplitude: 12, baseOffset: 0 },
  [Biome.Desert]: { biome: Biome.Desert, amplitude: 4, baseOffset: -1 },
  [Biome.Mountains]: { biome: Biome.Mountains, amplitude: 55, baseOffset: 8 },
  [Biome.Tundra]: { biome: Biome.Tundra, amplitude: 12, baseOffset: 0 },
};

const CLIMATE_FREQ = 1 / 512; // large, contiguous regions
const MOUNTAIN_THRESHOLD = 0.35;
const HOT = 0.3;
const DRY = -0.1;
const COLD = -0.35;
const WET = 0.25;

// Salts to derive independent channels from one seed.
const SALT_T = 0x7e3a1b;
const SALT_H = 0x2c9f55;
const SALT_M = 0x51d0e7;

// Blend kernel: a (2*BLEND_RADIUS+1)^2 grid of samples spaced this many blocks apart.
// More samples => each biome flip moves the average by a smaller fraction => smoother borders.
const BLEND_SPACING = 4;
const BLEND_RADIUS = 2; // 5x5 kernel

interface Channels {
  temperature: NoiseFunction2D;
  humidity: NoiseFunction2D;
  mountain: NoiseFunction2D;
}

// Cap on the biome classification cache; cleared wholesale when exceeded (bursty chunk gen
// reuses points within a burst, so a simple cap bounds memory without hurting locality much).
const CACHE_CAP = 1 << 17; // 131072 entries

/** Classifies columns into biomes and supplies (blended) terrain parameters. */
export class BiomeMap implements BiomeSource {
  private readonly ch: Channels;
  // Memoizes classification per (worldX,worldZ): the 5x5 blend kernel samples points that
  // overlap heavily across a chunk's columns, so this cuts noise evaluations several-fold.
  private readonly cache = new Map<string, Biome>();

  constructor(seed: WorldSeed) {
    this.ch = {
      temperature: createNoise2D(mulberry32((seed ^ SALT_T) >>> 0)),
      humidity: createNoise2D(mulberry32((seed ^ SALT_H) >>> 0)),
      mountain: createNoise2D(mulberry32((seed ^ SALT_M) >>> 0)),
    };
  }

  biomeAt(worldX: number, worldZ: number): Biome {
    const key = `${worldX},${worldZ}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const biome = this.classify(worldX, worldZ);
    if (this.cache.size >= CACHE_CAP) this.cache.clear();
    this.cache.set(key, biome);
    return biome;
  }

  private classify(worldX: number, worldZ: number): Biome {
    const t = this.ch.temperature(worldX * CLIMATE_FREQ, worldZ * CLIMATE_FREQ);
    const h = this.ch.humidity(worldX * CLIMATE_FREQ, worldZ * CLIMATE_FREQ);
    const m = this.ch.mountain(worldX * CLIMATE_FREQ, worldZ * CLIMATE_FREQ);

    if (m > MOUNTAIN_THRESHOLD) return Biome.Mountains;
    if (t > HOT && h < DRY) return Biome.Desert;
    if (t < COLD) return Biome.Tundra;
    if (h > WET) return Biome.Forest;
    return Biome.Plains;
  }

  defForBiome(biome: Biome): BiomeDef {
    return DEFS[biome];
  }

  defAt(worldX: number, worldZ: number): BiomeDef {
    return DEFS[this.biomeAt(worldX, worldZ)];
  }

  /** Amplitude/base averaged over a small kernel so biome borders slope smoothly. */
  blendedTerrain(worldX: number, worldZ: number): { amplitude: number; baseOffset: number } {
    let amplitude = 0;
    let baseOffset = 0;
    let n = 0;
    for (let dx = -BLEND_RADIUS; dx <= BLEND_RADIUS; dx++) {
      for (let dz = -BLEND_RADIUS; dz <= BLEND_RADIUS; dz++) {
        const def = this.defAt(worldX + dx * BLEND_SPACING, worldZ + dz * BLEND_SPACING);
        amplitude += def.amplitude;
        baseOffset += def.baseOffset;
        n++;
      }
    }
    return { amplitude: amplitude / n, baseOffset: baseOffset / n };
  }
}
