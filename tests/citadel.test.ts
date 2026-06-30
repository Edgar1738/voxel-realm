import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { CITADEL, citadelSurfaceAt } from '../src/worldgen/CitadelGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { placementsAt } from '../src/worldgen/Structures';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import {
  AIR,
  STONE,
  COBBLESTONE,
  BRICK,
  PLANKS,
  WATER,
  GLOWSTONE,
  GOLD_ORE,
  BLOCK_DEFS,
} from '../src/blocks/blocks';
import type { Structure } from '../src/worldgen/Structures';
import type { BlockId } from '../src/core/types';

const SEED = 1337;
const G = CITADEL.groundY;

/** A whole-world sampler: generates (and overlays) chunks on demand and reads by world coords. */
function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
  chunkOf: (cx: number, cz: number) => ChunkData;
} {
  const { generator, overlays } = createGenerator('citadel');
  const cache = new Map<string, ChunkData>();
  const chunkOf = (cx: number, cz: number): ChunkData => {
    const key = `${cx},${cz}`;
    let c = cache.get(key);
    if (!c) {
      c = generator.generateBaseChunk(seed, cx, cz);
      applyOverlays(c, cx, cz, seed, overlays);
      cache.set(key, c);
    }
    return c;
  };
  const at = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return chunkOf(cx, cz).get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
  return { at, chunkOf };
}

describe('citadel preset registration', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('citadel')).toBe(true);
    expect(WORLD_PRESETS).toContain('citadel');
  });

  it('resolves to a generator with the site overlay + outlying scatter', () => {
    const { generator, overlays } = createGenerator('citadel');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBe(2);
  });
});

describe('citadel terrain (the mesa)', () => {
  it('is a flat mesa at groundY across the whole plateau top', () => {
    const pts: Array<[number, number]> = [
      [CITADEL.centerX, CITADEL.centerZ],
      [CITADEL.centerX - 40, CITADEL.centerZ + 30],
      [CITADEL.centerX + 50, CITADEL.centerZ - 50],
    ];
    for (const [x, z] of pts) expect(citadelSurfaceAt(SEED, x, z)).toBe(G);
  });

  it('slopes down to plains far from the fortress', () => {
    const far = citadelSurfaceAt(SEED, CITADEL.centerX, CITADEL.centerZ + 200);
    expect(far).toBeLessThan(G - 8);
    expect(far).toBeGreaterThan(CITADEL.plainsY - 6);
  });

  it('is deterministic in (seed, x, z)', () => {
    expect(citadelSurfaceAt(SEED, 17, -23)).toBe(citadelSurfaceAt(SEED, 17, -23));
  });

  it('carves natural caves below the mesa (sub-surface air under the courtyard)', () => {
    const { chunkOf } = makeSampler();
    const c = chunkOf(2, 2); // a flat-top chunk away from the dungeon footprint
    let air = 0;
    for (let y = 8; y < G - 2; y++) {
      for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) if (c.get(lx, y, lz) === AIR) air++;
      }
    }
    expect(air).toBeGreaterThan(50);
  });
});

describe('citadel landmarks', () => {
  const { at } = makeSampler();

  it('paves the central courtyard and keeps the sky above the plaza clear', () => {
    expect(at(8, G, 8)).toBe(STONE); // central flagstones
    expect(at(8, 99, 8)).toBe(AIR); // open air over the plaza (room to descend at spawn)
  });

  it('rings the bailey with a solid curtain wall and a passable gate', () => {
    expect(at(-40, G + 5, 8)).toBe(COBBLESTONE); // west wall body
    expect(at(8, G + 2, 55)).toBe(AIR); // south gate passage
    expect(at(4, G + 2, 55)).toBe(COBBLESTONE); // wall beside the gate
  });

  it('raises the keep with a glowing beacon visible from afar', () => {
    expect(at(8, G + 10, -12)).toBe(BRICK); // keep north wall
    expect(at(8, 132, -4)).toBe(GLOWSTONE); // rooftop beacon (keep is the tallest mass)
  });

  it('moats the fortress and bridges it only at the gates', () => {
    expect(at(8 + 57, 78, 8)).toBe(WATER); // water ring on the eastern glacis (no gate there)
    expect(at(8, 80, -48)).toBe(PLANKS); // north-gate drawbridge deck
    expect(at(8, 78, -48)).toBe(WATER); // water flowing under the drawbridge
  });

  it('extends the dungeon with a catacomb branch off the prison', () => {
    expect(at(8, 74, -10)).toBe(AIR); // catacomb interior void
    expect(at(4, 73, -13)).toBe(BRICK); // a brick burial niche
  });

  it('excavates the dungeon (corridor void + treasure) below the courtyard', () => {
    expect(at(0, 74, 8)).toBe(AIR); // main corridor void
    expect(at(0, 72, 8)).toBe(COBBLESTONE); // corridor floor
    expect(at(-16, 65, 3)).toBe(GOLD_ORE); // sealed treasure vault
  });
});

describe('citadel determinism + validity', () => {
  it('produces byte-identical chunks for a fixed seed', () => {
    const { generator, overlays } = createGenerator('citadel');
    const build = (cx: number, cz: number): ChunkData => {
      const c = generator.generateBaseChunk(SEED, cx, cz);
      applyOverlays(c, cx, cz, SEED, overlays);
      return c;
    };
    for (const [cx, cz] of [
      [0, 0],
      [-2, 1],
      [3, -1],
    ]) {
      expect(Array.from(build(cx, cz).data)).toEqual(Array.from(build(cx, cz).data));
    }
  });

  it('never emits an invalid block id across the whole fortress footprint', () => {
    const { chunkOf } = makeSampler();
    const maxValidId = BLOCK_DEFS.length - 1;
    let worstId = 0;
    let scanned = 0;
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const data = chunkOf(cx, cz).data; // generation must not throw on any site chunk
        for (let i = 0; i < data.length; i++) {
          if (data[i] > worstId) worstId = data[i];
          scanned++;
        }
      }
    }
    expect(scanned).toBeGreaterThan(0);
    expect(worstId).toBeLessThanOrEqual(maxValidId);
  });
});

describe('scatter maxSurfaceY filter', () => {
  const box: Structure = {
    dims: [2, 2, 2],
    blocks: ((): Array<[number, number, number, BlockId]> => {
      const b: Array<[number, number, number, BlockId]> = [];
      for (let y = 0; y < 2; y++)
        for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) b.push([x, y, z, COBBLESTONE]);
      return b;
    })(),
  };
  const opts = { cellSize: 16, surfaceAt: (): number => 80, density: 1, salt: 0 };

  it('skips cells whose center surface is above maxSurfaceY (keeps ruins off the mesa)', () => {
    expect(placementsAt([box], { ...opts, maxSurfaceY: 74 }, 5, 0, 0)).toEqual([]);
    expect(placementsAt([box], { ...opts, maxSurfaceY: 90 }, 5, 0, 0).length).toBeGreaterThan(0);
  });
});

describe('scatter rotation + min anchor', () => {
  const bar = (): Structure => ({
    dims: [5, 1, 1],
    blocks: [
      [0, 0, 0, COBBLESTONE],
      [4, 0, 0, COBBLESTONE],
    ],
  });

  it('rotation is deterministic and actually re-orients some placements', () => {
    const opts = { cellSize: 32, surfaceAt: (): number => 80, density: 1, salt: 0, rotate: true };
    expect(placementsAt([bar()], opts, 9, 0, 0)).toEqual(placementsAt([bar()], opts, 9, 0, 0));
    let sawTurned = false;
    for (let seed = 1; seed < 40 && !sawTurned; seed++) {
      const p = placementsAt([bar()], opts, seed, 0, 0)[0];
      if (p && p.structure.dims[0] === 1) sawTurned = true; // a 5x1 turned 90° → 1x5
    }
    expect(sawTurned).toBe(true);
  });

  it("anchor 'min' seats a placement on the lowest footprint column (never floats on a slope)", () => {
    const sloped = (_s: number, x: number): number => 80 - x; // surface drops as x grows
    const wide: Structure = {
      dims: [6, 2, 1],
      blocks: [
        [0, 0, 0, COBBLESTONE],
        [5, 0, 0, COBBLESTONE],
      ],
    };
    const corner = { cellSize: 40, surfaceAt: sloped, density: 1, salt: 0 };
    const pc = placementsAt([wide], corner, 7, 0, 0)[0];
    const pm = placementsAt([wide], { ...corner, anchor: 'min' as const }, 7, 0, 0)[0];
    expect(pm.ox).toBe(pc.ox); // anchoring doesn't move the structure horizontally
    expect(pm.oy).toBeLessThan(pc.oy); // 'min' sits lower than the origin-corner anchor
  });
});
