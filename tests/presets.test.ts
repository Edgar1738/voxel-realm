import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset } from '../src/worldgen/Presets';
import { AIR, GRASS, COBBLESTONE, WATER } from '../src/blocks/blocks';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL, WORLD_HEIGHT } from '../src/core/constants';
import type { Generator } from '../src/worldgen/Generator';
import type { WorldPreset } from '../src/worldgen/Presets';

const SEED = 1337;

/** Surface = highest non-air block in a column; -1 if the column is empty. */
function surfaceHeight(
  generator: Generator,
  cx: number,
  cz: number,
  lx: number,
  lz: number,
): number {
  const c = generator.generateBaseChunk(SEED, cx, cz);
  for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
    if (c.get(lx, y, lz) !== AIR) return y;
  }
  return -1;
}

/** Samples a few chunks and reports the top block + surface height per column. */
function sampleColumns(
  preset: WorldPreset,
  chunkRadius = 1,
): { topBlocks: number[]; surfaces: number[] } {
  const { generator } = createGenerator(preset);
  const topBlocks: number[] = [];
  const surfaces: number[] = [];
  for (let cx = -chunkRadius; cx <= chunkRadius; cx++) {
    for (let cz = -chunkRadius; cz <= chunkRadius; cz++) {
      const c = generator.generateBaseChunk(SEED, cx, cz);
      for (let lx = 0; lx < CHUNK_SIZE_X; lx += 4) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz += 4) {
          let surface = -1;
          for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
            if (c.get(lx, y, lz) !== AIR) {
              surface = y;
              topBlocks.push(c.get(lx, y, lz));
              break;
            }
          }
          surfaces.push(surface);
        }
      }
    }
  }
  return { topBlocks, surfaces };
}

describe('world presets', () => {
  it('flat: grass surface at sea level, solid below, air above, no overlays', () => {
    const { generator, overlays } = createGenerator('flat');
    const c = generator.generateBaseChunk(SEED, 0, 0);
    expect(c.get(0, SEA_LEVEL, 0)).toBe(GRASS);
    expect(c.get(0, SEA_LEVEL + 1, 0)).toBe(AIR);
    expect(c.get(0, SEA_LEVEL - 1, 0)).not.toBe(AIR);
    expect(overlays).toHaveLength(0);
  });

  it('void: entirely air', () => {
    const { generator } = createGenerator('void');
    const c = generator.generateBaseChunk(SEED, 2, -3);
    expect(c.get(0, SEA_LEVEL, 0)).toBe(AIR);
    expect(c.get(8, 0, 8)).toBe(AIR);
  });

  it('arena: cobblestone surface', () => {
    const { generator } = createGenerator('arena');
    const c = generator.generateBaseChunk(SEED, 0, 0);
    expect(c.get(0, SEA_LEVEL, 0)).toBe(COBBLESTONE);
  });

  it('default: keeps the tree overlay', () => {
    expect(createGenerator('default').overlays).toHaveLength(1);
  });

  it('isWorldPreset guards unknown values', () => {
    expect(isWorldPreset('flat')).toBe(true);
    expect(isWorldPreset('amplified')).toBe(true);
    expect(isWorldPreset('islands')).toBe(true);
    expect(isWorldPreset('canyon')).toBe(true);
    expect(isWorldPreset('nonsense')).toBe(false);
    expect(isWorldPreset(null)).toBe(false);
  });

  it('amplified: valid preset, returns a generator, towers well above sea level', () => {
    expect(isWorldPreset('amplified')).toBe(true);
    const { generator, overlays } = createGenerator('amplified');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays).toHaveLength(1); // trees on the mountains

    const { surfaces } = sampleColumns('amplified');
    const maxSurface = Math.max(...surfaces);
    // The default-ish world tops out near SEA_LEVEL + biome relief; amplified should clear it.
    expect(maxSurface).toBeGreaterThan(SEA_LEVEL + 40);
  });

  it('islands: valid preset, archipelago has both water and dry surface', () => {
    expect(isWorldPreset('islands')).toBe(true);
    const { generator } = createGenerator('islands');
    expect(typeof generator.generateBaseChunk).toBe('function');

    const { topBlocks } = sampleColumns('islands', 2);
    const waterTops = topBlocks.filter((b) => b === WATER).length;
    const landTops = topBlocks.filter((b) => b !== WATER).length;
    expect(waterTops).toBeGreaterThan(0); // ocean
    expect(landTops).toBeGreaterThan(0); // islands poking above
  });

  it('canyon: valid preset, plateau carved by ravines (height variation)', () => {
    expect(isWorldPreset('canyon')).toBe(true);
    const { generator } = createGenerator('canyon');
    expect(typeof generator.generateBaseChunk).toBe('function');

    const { surfaces } = sampleColumns('canyon', 2);
    const min = Math.min(...surfaces);
    const max = Math.max(...surfaces);
    expect(max - min).toBeGreaterThan(10); // ravines drop well below the plateau
  });

  it('height presets are deterministic in (seed, cx, cz)', () => {
    const { generator } = createGenerator('canyon');
    const a = surfaceHeight(generator, 1, -2, 3, 7);
    const b = surfaceHeight(generator, 1, -2, 3, 7);
    expect(a).toBe(b);
  });
});
