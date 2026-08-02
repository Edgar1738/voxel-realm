import { describe, expect, it } from 'vitest';
import { AIR, BASALT, LAVA, MAGMA, OBSIDIAN } from '../src/blocks/blocks';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../src/core/constants';
import { createGenerator, WORLD_PRESETS } from '../src/worldgen/Presets';
import { UndergroundGenerator } from '../src/worldgen/UndergroundGenerator';
import { CURRENT_WORLDGEN_VERSION, LEGACY_WORLDGEN_VERSION } from '../src/worldgen/worldgenVersion';
import type { ChunkData } from '../src/world/ChunkData';

const SEED = 1337;

function region(radius: number): Map<string, ChunkData> {
  const { generator } = createGenerator('flat', CURRENT_WORLDGEN_VERSION);
  const chunks = new Map<string, ChunkData>();
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      chunks.set(`${cx},${cz}`, generator.generateBaseChunk(SEED, cx, cz));
    }
  }
  return chunks;
}

describe('universal underground generation', () => {
  it('wraps every solid preset while leaving void empty', () => {
    for (const preset of WORLD_PRESETS) {
      const { generator } = createGenerator(preset, CURRENT_WORLDGEN_VERSION);
      if (preset === 'void') expect(generator).not.toBeInstanceOf(UndergroundGenerator);
      else expect(generator).toBeInstanceOf(UndergroundGenerator);
    }
  });

  it('keeps legacy flat worlds byte-compatible and adds caves only to current worlds', () => {
    const legacy = createGenerator('flat', LEGACY_WORLDGEN_VERSION).generator.generateBaseChunk(
      SEED,
      0,
      0,
    );
    for (let y = 0; y <= SEA_LEVEL; y++) expect(legacy.get(8, y, 8)).not.toBe(AIR);

    const current = createGenerator('flat', CURRENT_WORLDGEN_VERSION).generator;
    let undergroundAir = 0;
    for (let cx = -4; cx <= 4; cx++) {
      for (let cz = -4; cz <= 4; cz++) {
        const chunk = current.generateBaseChunk(SEED, cx, cz);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            for (let y = 5; y <= 52; y++) {
              if (chunk.get(x, y, z) === AIR) undergroundAir++;
            }
          }
        }
      }
    }
    expect(undergroundAir).toBeGreaterThan(2_000);
  });

  it('produces deterministic, connected caverns with supported roofs and volcanic floors', () => {
    const chunks = region(4);
    let air = 0;
    let lava = 0;
    let volcanicStone = 0;
    let seamConnections = 0;

    for (const [key, chunk] of chunks) {
      const [cx, cz] = key.split(',').map(Number);
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          for (let y = 5; y <= 52; y++) {
            const id = chunk.get(x, y, z);
            if (id === AIR) air++;
            if (id === LAVA) {
              lava++;
              expect(chunk.get(x, y - 1, z)).not.toBe(AIR);
            }
            if (id === MAGMA || id === BASALT || id === OBSIDIAN) volcanicStone++;
          }
          for (let y = SEA_LEVEL - 11; y < SEA_LEVEL; y++) {
            expect(chunk.get(x, y, z)).not.toBe(AIR);
          }
        }
      }

      const east = chunks.get(`${cx + 1},${cz}`);
      if (east) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          for (let y = 5; y <= 52; y++) {
            if (chunk.get(15, y, z) === AIR && east.get(0, y, z) === AIR) seamConnections++;
          }
        }
      }
    }

    expect(air).toBeGreaterThan(2_000);
    expect(lava).toBeGreaterThan(20);
    expect(volcanicStone).toBeGreaterThan(50);
    expect(seamConnections).toBeGreaterThan(20);

    const first = createGenerator('flat', CURRENT_WORLDGEN_VERSION).generator.generateBaseChunk(
      SEED,
      -2,
      3,
    );
    const second = createGenerator('flat', CURRENT_WORLDGEN_VERSION).generator.generateBaseChunk(
      SEED,
      -2,
      3,
    );
    expect(second.data).toEqual(first.data);
  });
});
