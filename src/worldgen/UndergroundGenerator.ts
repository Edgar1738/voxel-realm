import {
  createNoise2D,
  createNoise3D,
  type NoiseFunction2D,
  type NoiseFunction3D,
} from 'simplex-noise';
import {
  AIR,
  BASALT,
  DEEPSLATE,
  DIRT,
  LAVA,
  MAGMA,
  OBSIDIAN,
  SAND,
  STONE,
  WATER,
} from '../blocks/blocks';
import { CHUNK_AREA, CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import { mulberry32 } from '../core/math';
import type { BlockId, WorldSeed } from '../core/types';
import type { ChunkData } from '../world/ChunkData';
import type { Generator } from './Generator';

const CAVERN_CELL = 112;
const ROOF_MARGIN = 12;
const MIN_Y = 5;
const MAX_CAVERN_Y = 52;
const TUNNEL_SALT_A = 0x51a7_1001;
const TUNNEL_SALT_B = 0x51a7_1002;
const MAGMA_SALT = 0x51a7_1003;
const CELL_SALT = 0x51a7_1004;

const CARVABLE = new Set<BlockId>([STONE, DEEPSLATE, DIRT, SAND]);

export interface UndergroundProfile {
  /** Scales cavern chance, tunnel width, and volcanic dressing. */
  intensity?: number;
  /** Scales volcanic coverage independently (Ashen Reach is deliberately hotter). */
  volcanic?: number;
}

interface SeedFields {
  tunnelA: NoiseFunction3D;
  tunnelB: NoiseFunction3D;
  magma: NoiseFunction2D;
}

interface Cavern {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

function mix32(value: number): number {
  let x = value >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function hash(seed: number, x: number, z: number, salt: number): number {
  return mix32(
    Math.imul(seed, 0x9e3779b1) ^ Math.imul(x, 0x85ebca6b) ^ Math.imul(z, 0xc2b2ae35) ^ salt,
  );
}

function unit(value: number): number {
  return value / 0x100000000;
}

function floorDiv(value: number, divisor: number): number {
  return Math.floor(value / divisor);
}

function cavernFor(
  seed: WorldSeed,
  cellX: number,
  cellZ: number,
  intensity: number,
): Cavern | undefined {
  const h = hash(seed, cellX, cellZ, CELL_SALT);
  if (unit(h) > Math.min(0.78, 0.48 * intensity)) return undefined;
  const h2 = mix32(h ^ 0xa511e9b3);
  const h3 = mix32(h ^ 0x63d83595);
  const h4 = mix32(h ^ 0x9e3779b9);
  const h5 = mix32(h ^ 0x27d4eb2d);
  const h6 = mix32(h ^ 0x165667b1);
  return {
    x: cellX * CAVERN_CELL + 20 + unit(h2) * (CAVERN_CELL - 40),
    z: cellZ * CAVERN_CELL + 20 + unit(h3) * (CAVERN_CELL - 40),
    y: 18 + unit(h4) * 17,
    rx: 20 + unit(h5) * 15,
    ry: 8 + unit(h6) * 7,
    rz: 20 + unit(mix32(h6 ^ h3)) * 15,
  };
}

/**
 * Decorates any solid preset with seed-stable tunnels, rare high-ceiling rooms, and deep magma
 * rivers. It wraps the preset's base generator, so authored overlays still stamp afterward and
 * remain authoritative. Every decision uses world coordinates, keeping adjacent chunks seamless.
 */
export class UndergroundGenerator implements Generator {
  private readonly fieldsBySeed = new Map<WorldSeed, SeedFields>();
  private readonly intensity: number;
  private readonly volcanic: number;

  constructor(
    private readonly base: Generator,
    profile: UndergroundProfile = {},
  ) {
    this.intensity = Math.max(0.5, profile.intensity ?? 1);
    this.volcanic = Math.max(0.5, profile.volcanic ?? 1);
  }

  generateBaseChunk(seed: WorldSeed, cx: number, cz: number): ChunkData {
    const chunk = this.base.generateBaseChunk(seed, cx, cz);
    if (chunk.maxSolidY < MIN_Y + ROOF_MARGIN) return chunk;

    const surface = this.scanSurface(chunk);
    const caverns = this.nearbyCaverns(seed, cx, cz);
    const fields = this.fields(seed);
    this.carve(chunk, cx, cz, surface, caverns, fields);
    this.dressVolcanicFloors(chunk, seed, cx, cz, surface, fields.magma);
    chunk.recomputeMaxSolidY();
    return chunk;
  }

  private fields(seed: WorldSeed): SeedFields {
    let fields = this.fieldsBySeed.get(seed);
    if (!fields) {
      fields = {
        tunnelA: createNoise3D(mulberry32((seed ^ TUNNEL_SALT_A) >>> 0)),
        tunnelB: createNoise3D(mulberry32((seed ^ TUNNEL_SALT_B) >>> 0)),
        magma: createNoise2D(mulberry32((seed ^ MAGMA_SALT) >>> 0)),
      };
      this.fieldsBySeed.set(seed, fields);
    }
    return fields;
  }

  private scanSurface(chunk: ChunkData): Int16Array {
    const surface = new Int16Array(CHUNK_AREA);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        let y = chunk.maxSolidY;
        while (y >= 0) {
          const id = chunk.get(x, y, z);
          if (id !== AIR && id !== WATER && id !== LAVA) break;
          y--;
        }
        surface[x + CHUNK_SIZE_X * z] = y;
      }
    }
    return surface;
  }

  private nearbyCaverns(seed: WorldSeed, cx: number, cz: number): Cavern[] {
    const minX = cx * CHUNK_SIZE_X;
    const minZ = cz * CHUNK_SIZE_Z;
    const minCellX = floorDiv(minX - 40, CAVERN_CELL);
    const maxCellX = floorDiv(minX + CHUNK_SIZE_X + 40, CAVERN_CELL);
    const minCellZ = floorDiv(minZ - 40, CAVERN_CELL);
    const maxCellZ = floorDiv(minZ + CHUNK_SIZE_Z + 40, CAVERN_CELL);
    const out: Cavern[] = [];
    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const cavern = cavernFor(seed, cellX, cellZ, this.intensity);
        if (cavern) out.push(cavern);
      }
    }
    return out;
  }

  private carve(
    chunk: ChunkData,
    cx: number,
    cz: number,
    surface: Int16Array,
    caverns: readonly Cavern[],
    fields: SeedFields,
  ): void {
    const tunnelFrequency = 1 / 30;
    const tunnelThreshold = 0.064 * Math.min(this.intensity, 1.5);
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const wx = cx * CHUNK_SIZE_X + x;
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const wz = cz * CHUNK_SIZE_Z + z;
        const top = Math.min(MAX_CAVERN_Y, surface[x + CHUNK_SIZE_X * z] - ROOF_MARGIN);
        if (top <= MIN_Y) continue;
        for (let y = MIN_Y; y <= top; y++) {
          const id = chunk.get(x, y, z);
          if (!CARVABLE.has(id)) continue;
          let open = false;
          for (const cavern of caverns) {
            const dx = (wx - cavern.x) / cavern.rx;
            const dy = (y - cavern.y) / cavern.ry;
            const dz = (wz - cavern.z) / cavern.rz;
            const wobble = Math.sin((wx + wz) * 0.09 + y * 0.17) * 0.055;
            if (dx * dx + dy * dy + dz * dz + wobble < 1) {
              open = true;
              break;
            }
          }
          if (!open) {
            const a = fields.tunnelA(
              wx * tunnelFrequency,
              y * tunnelFrequency,
              wz * tunnelFrequency,
            );
            if (Math.abs(a) < tunnelThreshold) {
              const b = fields.tunnelB(
                wx * tunnelFrequency,
                y * tunnelFrequency,
                wz * tunnelFrequency,
              );
              open = Math.abs(b) < tunnelThreshold;
            }
          }
          if (open) chunk.set(x, y, z, AIR);
        }
      }
    }
  }

  private dressVolcanicFloors(
    chunk: ChunkData,
    seed: WorldSeed,
    cx: number,
    cz: number,
    surface: Int16Array,
    magmaNoise: NoiseFunction2D,
  ): void {
    for (let x = 0; x < CHUNK_SIZE_X; x++) {
      const wx = cx * CHUNK_SIZE_X + x;
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        const wz = cz * CHUNK_SIZE_Z + z;
        const top = Math.min(31, surface[x + CHUNK_SIZE_X * z] - ROOF_MARGIN);
        if (top <= MIN_Y + 1) continue;
        const river = Math.abs(magmaNoise(wx / 78, wz / 78));
        const heat = magmaNoise((wx + 311) / 145, (wz - 197) / 145);
        const riverWidth = 0.105 * Math.min(this.volcanic, 1.8);
        for (let y = MIN_Y + 1; y <= top; y++) {
          if (chunk.get(x, y, z) !== AIR) continue;
          const below = chunk.get(x, y - 1, z);
          if (!CARVABLE.has(below) && below !== BASALT && below !== MAGMA && below !== OBSIDIAN) {
            continue;
          }
          const depthBias = Math.max(0, Math.min(1, (30 - y) / 18));
          if (river < riverWidth * (0.55 + depthBias * 0.75) && heat > -0.35) {
            chunk.set(x, y, z, LAVA);
            chunk.set(x, y - 1, z, MAGMA);
          } else if (river < riverWidth * 2.25 && heat > -0.48) {
            const h = hash(seed, wx, wz, y ^ MAGMA_SALT);
            chunk.set(x, y - 1, z, unit(h) < 0.22 ? OBSIDIAN : unit(h) < 0.68 ? BASALT : MAGMA);
          }
        }
      }
    }
  }
}
