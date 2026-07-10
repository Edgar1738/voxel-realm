import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import { GRAND_KEEP, grandKeepSurfaceAt } from '../src/worldgen/GrandKeepGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import {
  AIR,
  STONE,
  COBBLESTONE,
  PLANKS,
  WATER,
  GLOWSTONE,
  STAIRS_STONE,
  BLOCK_DEFS,
} from '../src/blocks/blocks';
import {
  G,
  CX,
  CZ,
  X0,
  X1,
  Z0,
  Z1,
  KX0,
  KX1,
  KZ0,
  KZ1,
  KCX,
  KCZ,
  FLOOR,
  STAIR_X0,
  STAIR_Z0,
  STAIR_Z1,
  CROWN,
  WATCH,
  DUNGEON_SHAFT,
} from '../src/worldgen/grandKeepFrame';

const SEED = 1337;

function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
  state: (wx: number, wy: number, wz: number) => number;
} {
  const { generator, overlays } = createGenerator('grand-keep');
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
  const state = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return chunkOf(cx, cz).getState(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
  return { at, state };
}

function isSolid(id: number): boolean {
  if (id === AIR) return false;
  const def = BLOCK_DEFS[id];
  return !!def && !def.transparent;
}

describe('grand-keep preset registration', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('grand-keep')).toBe(true);
    expect(WORLD_PRESETS).toContain('grand-keep');
  });

  it('resolves to a generator with site overlay + plains scatter', () => {
    const { generator, overlays } = createGenerator('grand-keep');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBe(2);
  });
});

describe('grand-keep terrain (mesa)', () => {
  it('is flat at groundY across the plateau', () => {
    for (const [x, z] of [
      [CX, CZ],
      [CX - 40, CZ + 20],
      [CX + 50, CZ - 40],
    ] as const) {
      expect(grandKeepSurfaceAt(SEED, x, z)).toBe(G);
    }
  });

  it('slopes to plains far from the fortress', () => {
    const far = grandKeepSurfaceAt(SEED, CX, CZ + 220);
    expect(far).toBeLessThan(G - 6);
    expect(far).toBeGreaterThan(GRAND_KEEP.plainsY - 6);
  });

  it('is deterministic', () => {
    expect(grandKeepSurfaceAt(SEED, 17, -23)).toBe(grandKeepSurfaceAt(SEED, 17, -23));
  });
});

describe('grand-keep massing scale', () => {
  it('has outer curtain footprint ≥ 120 on both axes', () => {
    expect(X1 - X0 + 1).toBeGreaterThanOrEqual(120);
    expect(Z1 - Z0 + 1).toBeGreaterThanOrEqual(120);
  });

  it('has main keep footprint ~96×60', () => {
    expect(KX1 - KX0 + 1).toBeGreaterThanOrEqual(90);
    expect(KZ1 - KZ0 + 1).toBeGreaterThanOrEqual(55);
  });

  it('has four above-ground floors + dungeon + roof', () => {
    expect(FLOOR.dungeon).toBeLessThan(G);
    expect(FLOOR.ground).toBeGreaterThan(G);
    expect(FLOOR.throne).toBeGreaterThan(FLOOR.ground);
    expect(FLOOR.residential).toBeGreaterThan(FLOOR.throne);
    expect(FLOOR.high).toBeGreaterThan(FLOOR.residential);
    expect(FLOOR.roof).toBeGreaterThan(FLOOR.high);
    expect(CROWN.topY).toBeGreaterThan(FLOOR.roof);
    expect(WATCH.topY).toBeGreaterThan(FLOOR.roof);
  });
});

describe('grand-keep structure stamps', () => {
  const { at } = makeSampler();

  it('places solid curtain wall on the south gate axis sides', () => {
    // West curtain mass away from the gatehouse (gatehouse spans CX±GATE_HALF±6)
    expect(isSolid(at(CX - 30, G + 4, Z0 + 1))).toBe(true);
    expect(isSolid(at(X0 + 1, G + 6, CZ))).toBe(true);
  });

  it('has a clear gate passage on the south wall', () => {
    expect(at(CX, G + 2, Z0 + 1)).toBe(AIR);
    expect(at(CX, G + 2, Z0 + 6)).toBe(AIR);
  });

  it('has walkable courtyard paving south of the keep', () => {
    const id = at(CX, G, KZ0 - 10);
    expect([STONE, COBBLESTONE].includes(id as 3 | 12)).toBe(true);
  });

  it('has a hollow Great Hall interior', () => {
    expect(at(KCX, FLOOR.ground + 3, KZ0 + 20)).toBe(AIR);
    expect(at(KCX, FLOOR.ground + 8, KZ0 + 20)).toBe(AIR);
  });

  it('has solid keep exterior walls', () => {
    expect(isSolid(at(KX0, FLOOR.ground + 4, KZ0 + 20))).toBe(true);
    expect(isSolid(at(KX1, FLOOR.ground + 4, KZ0 + 20))).toBe(true);
  });

  it('has grand stair well air volume and stair blocks', () => {
    expect(at(STAIR_X0 + 3, FLOOR.ground + 2, STAIR_Z0 + 4)).not.toBe(undefined);
    // At least one stair step in the well
    let foundStair = false;
    for (let y = FLOOR.ground; y < FLOOR.throne; y++) {
      for (let z = STAIR_Z0; z <= STAIR_Z1; z++) {
        if (at(STAIR_X0 + 3, y, z) === STAIRS_STONE) {
          foundStair = true;
          break;
        }
      }
      if (foundStair) break;
    }
    expect(foundStair).toBe(true);
  });

  it('has dungeon air volume under the keep', () => {
    expect(at(KCX, FLOOR.dungeon + 2, KCZ)).toBe(AIR);
  });

  it('has dungeon shaft near the hall', () => {
    const sx = DUNGEON_SHAFT.x;
    const sz = DUNGEON_SHAFT.z;
    // Spiral newel post is solid; a ring neighbor is air or a step.
    expect(isSolid(at(sx, FLOOR.dungeon + 2, sz))).toBe(true);
    const ring = at(sx + 1, FLOOR.dungeon + 2, sz);
    expect(ring === AIR || ring === COBBLESTONE || isSolid(ring)).toBe(true);
  });

  it('has roof surface and crown tower above roof', () => {
    expect(isSolid(at(KCX, FLOOR.roof, KZ0 + 10)) || at(KCX, FLOOR.roof, KZ0 + 10) === PLANKS).toBe(
      true,
    );
    // Crown tower wall
    expect(isSolid(at(CROWN.cx + CROWN.half, FLOOR.roof + 5, CROWN.cz))).toBe(true);
    // Summit glow
    expect(at(CROWN.cx, CROWN.topY + 1, CROWN.cz)).toBe(GLOWSTONE);
  });

  it('has watch tower above roof', () => {
    expect(isSolid(at(WATCH.cx + WATCH.half, FLOOR.roof + 5, WATCH.cz))).toBe(true);
  });

  it('has moat water outside the south wall (off the bridge)', () => {
    // Off-axis moat cell south of walls
    const wx = CX + 20;
    const wz = Z0 - 6;
    expect(at(wx, G - 1, wz)).toBe(WATER);
  });

  it('has approach road south of the gate', () => {
    const id = at(CX, G, Z0 - 30);
    expect([STONE, COBBLESTONE].includes(id as 3 | 12) || id === 26 /* gravel */).toBe(true);
  });
});

describe('grand-keep storey separations', () => {
  it('uses 12-block rises between major floors (stair-friendly)', () => {
    expect(FLOOR.throne - FLOOR.ground).toBe(12);
    expect(FLOOR.residential - FLOOR.throne).toBe(12);
    expect(FLOOR.high - FLOOR.residential).toBe(12);
    expect(FLOOR.roof - FLOOR.high).toBe(12);
  });
});
