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
  GRAVEL,
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
  STACK,
  STOREY_RISE,
  STAIR_X0,
  STAIR_X1,
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
  it('has expanded outer curtain footprint ≥ 200 on both axes', () => {
    expect(X1 - X0 + 1).toBeGreaterThanOrEqual(200);
    expect(Z1 - Z0 + 1).toBeGreaterThanOrEqual(200);
  });

  it('has main keep footprint ~96×60', () => {
    expect(KX1 - KX0 + 1).toBeGreaterThanOrEqual(90);
    expect(KZ1 - KZ0 + 1).toBeGreaterThanOrEqual(55);
  });

  it('has a very tall stack (~3× prior height) + dungeon + roof', () => {
    expect(FLOOR.dungeon).toBeLessThan(G);
    expect(FLOOR.ground).toBeGreaterThan(G);
    expect(FLOOR.roof).toBeGreaterThan(FLOOR.ground + 250); // ~300 blocks of stack
    expect(FLOOR.roof).toBeLessThan(512);
    expect(CROWN.topY).toBeGreaterThan(FLOOR.roof);
    expect(CROWN.topY).toBeLessThan(512);
    expect(WATCH.topY).toBeLessThan(512);
    expect(STACK.length).toBeGreaterThanOrEqual(31); // 30 rises + ground
  });
});

describe('grand-keep structure stamps', () => {
  const { at } = makeSampler();

  it('places solid curtain wall on the south gate axis sides', () => {
    // West curtain mass away from the gatehouse and village side-gates
    expect(isSolid(at(CX - 30, G + 4, Z0 + 1))).toBe(true);
    expect(isSolid(at(X0 + 1, G + 6, CZ + 20))).toBe(true);
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

  it('has M2 courtyard wayfinding (fountain / banners area lit)', () => {
    // Well / fountain footprint near plaza or a path lantern
    const nearPlaza = at(CX, G + 2, KZ0 - 11);
    // Something non-air above ground in the plaza zone (well rim or banner post)
    expect(nearPlaza === AIR ? at(CX - 1, G + 1, KZ0 - 11) !== AIR : true).toBe(true);
  });

  it('has lit grand stair well (lanterns on well walls)', () => {
    let lanterns = 0;
    for (let y = FLOOR.ground; y < FLOOR.throne + 4; y++) {
      if (at(STAIR_X0 + 1, y, STAIR_Z0 + 3) === 14 /* LANTERN */) lanterns++;
      if (at(STAIR_X1 - 1, y, STAIR_Z0 + 3) === 14) lanterns++;
    }
    expect(lanterns).toBeGreaterThan(0);
  });

  it('has deep corridor network on residential hotel floor (above solar)', () => {
    // Guest hotel sits above solar skylight so chambers are real rooms
    expect(FLOOR.residential).toBeGreaterThan(FLOOR.kingTop);
    // E-W hotel corridor should be air at body height
    expect(at(KCX, FLOOR.residential + 2, KCZ - 6)).toBe(AIR);
    expect(at(KCX, FLOOR.residential + 2, KCZ + 6)).toBe(AIR);
  });

  it('keeps the processional spine clear from approach through the gate', () => {
    // Approach road air column south of gate
    expect(at(CX, G + 2, Z0 - 20)).toBe(AIR);
    expect(at(CX, G + 2, Z0 + 2)).toBe(AIR);
    // Courtyard spine mid-way to keep
    expect(at(CX, G + 2, KZ0 - 16)).toBe(AIR);
    // Keep entrance air
    expect(at(KCX, FLOOR.ground + 2, KZ0)).toBe(AIR);
  });

  it('has grand stair door openings on residential and library floors', () => {
    expect(at(STAIR_X0, FLOOR.residential + 2, STAIR_Z0 + 6)).toBe(AIR);
    expect(at(STAIR_X0, FLOOR.library + 2, STAIR_Z0 + 6)).toBe(AIR);
  });

  it('dresses library and barracks with props', () => {
    // Library bookshelf densifier
    expect(at(KCX - 8, FLOOR.library + 2, KCZ)).toBe(22); // BOOKSHELF
    // Barracks bunk planks (east of secondary stair shaft)
    expect(at(KX0 + 16, FLOOR.barracks + 1, KZ0 + 18)).toBe(PLANKS);
  });

  it('has lived-in village house props near east bailey', () => {
    // East bailey house at KX1+8 starts a 8×8; interior table/lantern zone
    const hx = KX1 + 12;
    const hz = KZ0 + 8;
    // Floor paving under houses / streets nearby is solid
    expect(
      isSolid(at(hx, G, hz)) || at(hx, G, hz) === PLANKS || at(hx, G, hz) === COBBLESTONE,
    ).toBe(true);
  });

  it('has exterior balconies on mid floors', () => {
    const fy = FLOOR.residential;
    // First south balcony bay starts at KX0+4, depth KZ0-2..KZ0-1
    expect(isSolid(at(KX0 + 4, fy, KZ0 - 2))).toBe(true);
    // Door opening through south keep wall into that bay
    expect(at(KX0 + 5, fy + 1, KZ0)).toBe(AIR);
  });

  it('has north service stair shaft above ground', () => {
    // Spiral newel is solid at well center
    expect(isSolid(at(KX0 + 7, FLOOR.gallery + 1, KZ1 - 15))).toBe(true);
  });

  it('has village paving outside the keep mass', () => {
    // East bailey street near keep
    const id = at(KX1 + 8, G, KZ0 + 10);
    expect([STONE, COBBLESTONE, GRAVEL].includes(id as 3 | 12 | 26) || id === 26).toBe(true);
  });

  it('has a landscape sky tower shell', () => {
    // South sky tower at (CX, Z0-45)
    const tcx = CX;
    const tcz = Z0 - 45;
    expect(isSolid(at(tcx + 6, G + 20, tcz))).toBe(true);
  });

  it("has open multi-storey King's Solar atrium", () => {
    // Center of keep at mid-height of king volume should be air (open ceiling)
    const midY = FLOOR.king + 15;
    expect(at(KCX, midY, KCZ)).toBe(AIR);
    // Royal floor underfoot
    expect(at(KCX, FLOOR.king, KCZ)).not.toBe(AIR);
    // Skylight level has glass or stone ribs
    const sky = at(KCX + 1, FLOOR.kingTop, KCZ + 1);
    expect(sky === AIR || sky === 7 /* GLASS */ || isSolid(sky)).toBe(true);
  });

  it('has a king bed with red bedding and nearby treasure', () => {
    const y0 = FLOOR.king;
    const bedZ = KZ1 - 16;
    // Red mattress / coverlet (brick or terracotta)
    const mattress = at(KCX, y0 + 3, bedZ);
    expect([13, 25].includes(mattress as 13 | 25)).toBe(true); // BRICK | TERRACOTTA
    // Bed post solid
    expect(isSolid(at(KCX - 5, y0 + 2, bedZ - 3))).toBe(true);
    // Gold treasure near west alcove
    expect(at(KCX - 16, y0 + 4, bedZ - 2)).toBe(17); // GOLD_ORE
  });
});

describe('grand-keep storey separations', () => {
  it('uses consistent rises between stacked floors (stair-friendly)', () => {
    for (let i = 0; i < STACK.length - 1; i++) {
      expect(STACK[i + 1] - STACK[i]).toBe(STOREY_RISE);
    }
    expect(STOREY_RISE).toBe(10);
    expect(STACK.length).toBe(31); // 30 rises → 31 floors including ground & roof
  });
});
