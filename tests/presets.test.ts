import { describe, it, expect } from 'vitest';
import {
  createGenerator,
  isWorldPreset,
  resolveBootPreset,
  WORLD_PRESETS,
} from '../src/worldgen/Presets';
import { AIR, GRASS, COBBLESTONE, WATER, WOOD, LEAVES } from '../src/blocks/blocks';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL, WORLD_HEIGHT } from '../src/core/constants';
import { BiomeMap, Biome } from '../src/worldgen/BiomeMap';
import type { Generator } from '../src/worldgen/Generator';
import type { WorldPreset } from '../src/worldgen/Presets';
import type { WorldMeta } from '../src/persistence/SaveTypes';

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

  it('default: keeps the tree and decoration overlays', () => {
    expect(createGenerator('default').overlays).toHaveLength(2);
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

  it('caverns: valid preset, returns a working generator with the tree overlay', () => {
    expect(isWorldPreset('caverns')).toBe(true);
    const { generator, overlays } = createGenerator('caverns');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays).toHaveLength(1); // scatterTrees

    // Must not throw and must return a ChunkData with some non-air content
    const c = generator.generateBaseChunk(SEED, 0, 0);
    let hasGround = false;
    for (const v of c.data) {
      if (v !== AIR) {
        hasGround = true;
        break;
      }
    }
    expect(hasGround).toBe(true);
  });

  it('caverns: carves significantly more air below the surface than a flat world', () => {
    const { generator: cavernsGen } = createGenerator('caverns');
    const { generator: flatGen } = createGenerator('flat');

    // Count sub-surface air across a small chunk sample
    function subSurfaceAirCount(gen: ReturnType<typeof createGenerator>['generator']): number {
      let airCount = 0;
      for (let cx = -1; cx <= 1; cx++) {
        for (let cz = -1; cz <= 1; cz++) {
          const c = gen.generateBaseChunk(SEED, cx, cz);
          for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
              // Find surface top
              let surface = -1;
              for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
                if (c.get(lx, y, lz) !== AIR) {
                  surface = y;
                  break;
                }
              }
              if (surface < 2) continue;
              // Count air strictly below the surface
              for (let y = 1; y < surface; y++) {
                if (c.get(lx, y, lz) === AIR) airCount++;
              }
            }
          }
        }
      }
      return airCount;
    }

    const cavernsAir = subSurfaceAirCount(cavernsGen);
    const flatAir = subSurfaceAirCount(flatGen);
    // Caverns should have substantially more underground air pockets than flat terrain
    expect(cavernsAir).toBeGreaterThan(flatAir * 5);
  });

  it('caverns: is deterministic across repeated generateBaseChunk calls', () => {
    const { generator } = createGenerator('caverns');
    const a = generator.generateBaseChunk(SEED, 2, -3);
    const b = generator.generateBaseChunk(SEED, 2, -3);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });
});

describe('frontier preset', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('frontier')).toBe(true);
    expect(WORLD_PRESETS).toContain('frontier');
  });
  it('resolves to a generator with at least one overlay (the prefab scatter)', () => {
    const { generator, overlays } = createGenerator('frontier');
    expect(generator).toBeDefined();
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });
});

describe('villages preset oaks', () => {
  it('wires three overlays: oaks, buildings, decorations', () => {
    expect(createGenerator('villages').overlays).toHaveLength(3);
  });

  it('grows prefab oaks rooted on grass, none in desert, with cross-chunk canopies', () => {
    const { generator, overlays } = createGenerator('villages');
    const oakOverlay = overlays[0];
    const biomes = new BiomeMap(SEED);
    let woodSeen = false;
    let leavesSeen = false;
    let rootsOnGrass = true;
    let desertTrunk = false;
    let crossChunkCanopy = false;

    for (let cx = -4; cx <= 4; cx++) {
      for (let cz = -4; cz <= 4; cz++) {
        const c = generator.generateBaseChunk(SEED, cx, cz);
        oakOverlay(c, cx, cz, SEED);
        let chunkWood = false;
        let chunkLeaves = false;
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            let lowestWood = -1;
            for (let y = 0; y < WORLD_HEIGHT; y++) {
              const v = c.get(x, y, z);
              if (v === WOOD && lowestWood < 0) lowestWood = y;
              if (v === LEAVES) chunkLeaves = true;
            }
            if (lowestWood > 0) {
              chunkWood = true;
              woodSeen = true;
              if (c.get(x, lowestWood - 1, z) !== GRASS) rootsOnGrass = false;
              const biome = biomes.biomeAt(cx * CHUNK_SIZE_X + x, cz * CHUNK_SIZE_Z + z);
              if (biome === Biome.Desert) desertTrunk = true;
            }
          }
        }
        if (chunkLeaves) leavesSeen = true;
        // A chunk holding canopy leaves but no trunk proves a neighbor's canopy reached across the
        // border — impossible with the old chunk-local overlay, which dropped cross-chunk leaves.
        if (chunkLeaves && !chunkWood) crossChunkCanopy = true;
      }
    }

    expect(woodSeen).toBe(true);
    expect(leavesSeen).toBe(true);
    expect(rootsOnGrass).toBe(true);
    expect(desertTrunk).toBe(false);
    expect(crossChunkCanopy).toBe(true);
  });
});

describe('resolveBootPreset', () => {
  const meta = (preset?: string): WorldMeta =>
    preset === undefined ? { seed: SEED, version: 1 } : { seed: SEED, version: 1, preset };

  it('uses an explicit ?world= param when it is a valid preset', () => {
    expect(resolveBootPreset('void', meta('flat'))).toBe('void');
  });

  it("keeps an existing save's stored preset when ?world= is absent", () => {
    // Regression: a bare ?save=<name> must NOT fall back to "default" and discard a flat world.
    expect(resolveBootPreset(null, meta('flat'))).toBe('flat');
  });

  it('ignores an invalid ?world= and keeps the saved preset', () => {
    expect(resolveBootPreset('nonsense', meta('canyon'))).toBe('canyon');
  });

  it('falls back to "default" for a brand-new world (no stored meta)', () => {
    expect(resolveBootPreset(null, undefined)).toBe('default');
  });

  it('falls back to "default" when meta has no preset and no param is given', () => {
    expect(resolveBootPreset(null, meta(undefined))).toBe('default');
  });
});
