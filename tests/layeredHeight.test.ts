import { describe, it, expect } from 'vitest';
import { createWorldGenerator } from '../src/worldgen/LayeredGenerator';
import { layeredSurfaceAt } from '../src/worldgen/layeredHeight';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { AIR, GRASS, SNOW, SAND, MUD } from '../src/blocks/blocks';

const SEED = 1337;
const gen = createWorldGenerator();
// Painted surface caps — a column topped by one of these was not carved open or flooded.
const CAPS = new Set([GRASS, SNOW, SAND, MUD]);

describe('layeredSurfaceAt', () => {
  it('matches the default generator surface on uncarved (capped) columns', () => {
    let checked = 0;
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        const c = gen.generateBaseChunk(SEED, cx, cz);
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            let topY = -1;
            for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
              if (c.get(x, y, z) !== AIR) {
                topY = y;
                break;
              }
            }
            if (!CAPS.has(c.get(x, topY, z))) continue; // skip water-covered / cave-carved tops
            expect(layeredSurfaceAt(SEED, cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z)).toBe(topY);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('is deterministic', () => {
    expect(layeredSurfaceAt(SEED, 40, -12)).toBe(layeredSurfaceAt(SEED, 40, -12));
  });
});
