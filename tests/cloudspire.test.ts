import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import {
  CLOUDSPIRE,
  cloudspireSurfaceAt,
  cloudspireTerraceY,
} from '../src/worldgen/CloudspireGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants';
import { indexToLocal, parseChunkKey, worldToChunkCoord, worldToLocal } from '../src/core/coords';
import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  CYAN_GLASS,
  GOLD_TRIM,
  WATER,
  GLOWSTONE,
  STAIRS_SLATE,
  SLATE_SLAB,
  BLOCK_DEFS,
} from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import {
  G,
  GP,
  CATH,
  CATH_CX,
  KEEP,
  KCX,
  KCZ,
  FLOOR,
  PALACE_STACK,
  STAIR_X0,
  STAIR_X1,
  STAIR_Z0,
  SPAWN,
  spireAccessibleY,
  spirePeakY,
  X0,
  X1,
  Z0,
  Z1,
  CX,
  CZ,
  SPIRE,
  FALLS,
  LOOK,
} from '../src/worldgen/cloudspireFrame';
import { curatedPresetMeta } from '../src/app/curatedPreset';
import { parseWorldSnapshot } from '../src/persistence/WorldSnapshot';
import { decodeWorldBinary } from '../src/persistence/WorldBinary';
import { voxelId, voxelState } from '../src/persistence/SaveTypes';
import { PlayerController, type PlayerWorld } from '../src/player/PlayerController';
import { walkToward } from '../src/player/Simulate';
import type { AABB } from '../src/blocks/shapeBoxes';

const SEED = 1337;

function makeSampler(seed = SEED) {
  const { generator, overlays } = createGenerator('cloudspire-citadel');
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

function isSolid(id: number): boolean {
  if (id === AIR) return false;
  const def = BLOCK_DEFS.find((d) => d.id === id);
  return !!def && !def.transparent;
}

function makePhysicsWorld(): PlayerWorld {
  const { chunkOf } = makeSampler();
  const registry = new BlockRegistry();
  return {
    isWater: () => false,
    collisionBoxes(wx: number, wy: number, wz: number): AABB[] {
      if (wy < 0) return [[wx, wy, wz, wx + 1, wy + 1, wz + 1]];
      if (wy >= WORLD_HEIGHT) return [];
      const chunk = chunkOf(worldToChunkCoord(wx), worldToChunkCoord(wz));
      const lx = worldToLocal(wx);
      const lz = worldToLocal(wz);
      const id = chunk.get(lx, wy, lz);
      if (!registry.isOpaque(id)) return [];
      const state = chunk.getState(lx, wy, lz);
      return registry
        .collisionAABBs(id, state)
        .map((b) => [wx + b[0], wy + b[1], wz + b[2], wx + b[3], wy + b[4], wz + b[5]] as AABB);
    },
  };
}

describe('cloudspire-citadel preset registration', () => {
  it('registers the preset', () => {
    expect(isWorldPreset('cloudspire-citadel')).toBe(true);
    expect(WORLD_PRESETS).toContain('cloudspire-citadel');
  });

  it('creates generator + overlays', () => {
    const { generator, overlays } = createGenerator('cloudspire-citadel');
    expect(generator).toBeTruthy();
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cloudspire materials', () => {
  it('appends Cloudspire blocks after lava without reordering', () => {
    expect(LIMESTONE).toBe(42);
    expect(CARVED_LIMESTONE).toBe(43);
    expect(SLATE).toBe(44);
    expect(SLATE_SLAB).toBe(45);
    expect(STAIRS_SLATE).toBe(46);
    expect(CYAN_GLASS).toBe(47);
    expect(GOLD_TRIM).toBe(48);
  });

  it('registers new blocks in BlockRegistry with textures', () => {
    const reg = new BlockRegistry();
    expect(reg.has(LIMESTONE)).toBe(true);
    expect(reg.has(SLATE)).toBe(true);
    expect(reg.has(CYAN_GLASS)).toBe(true);
    expect(reg.isOpaque(LIMESTONE)).toBe(true);
    expect(reg.emission(GOLD_TRIM)).toBe(10);
  });
});

describe('cloudspire terrain', () => {
  it('is deterministic', () => {
    const a = cloudspireSurfaceAt(SEED, 10, -20);
    const b = cloudspireSurfaceAt(SEED, 10, -20);
    expect(a).toBe(b);
  });

  it('flattens palace terrace near center', () => {
    expect(cloudspireSurfaceAt(SEED, 0, 0)).toBe(CLOUDSPIRE.palaceY);
  });

  it('stays in world bounds', () => {
    for (const [x, z] of [
      [0, 0],
      [200, 0],
      [0, -200],
      [-150, 150],
    ] as const) {
      const h = cloudspireSurfaceAt(SEED, x, z);
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(WORLD_HEIGHT);
    }
  });
});

describe('cloudspire massing', () => {
  const { at } = makeSampler();

  it('places limestone on outer walls', () => {
    // Away from the cleared south gate passage.
    expect(at(CX + 40, G + 8, Z0 + 1)).toBe(LIMESTONE);
  });

  it('has cathedral footprint limestone', () => {
    // Lower wall course between window bays (z0+8 is a pointed window).
    expect(at(CATH.x0, CATH.floor + 2, CATH.z0 + 3)).toBe(LIMESTONE);
  });

  it('has hollow cathedral nave air', () => {
    expect(at(0, CATH.floor + 4, CATH.z0 + 20)).toBe(AIR);
  });

  it('has cathedral entrance opening', () => {
    expect(at(0, CATH.floor + 2, CATH.z0)).toBe(AIR);
  });

  it('has palace entrance opening', () => {
    expect(at(KCX, FLOOR.ground + 2, KEEP.z0)).toBe(AIR);
  });

  it('has palace floor continuity', () => {
    expect(at(KCX, FLOOR.ground, KCZ)).not.toBe(AIR);
  });

  it('keeps stair shaft open on ground', () => {
    expect(at(STAIR_X0, FLOOR.ground + 2, STAIR_Z0 + 5)).toBe(AIR);
  });

  it('builds multi-storey palace stack', () => {
    expect(PALACE_STACK.length).toBeGreaterThan(8);
    expect(at(KEEP.x0, FLOOR.roof - 5, KCZ)).toBe(LIMESTONE);
  });

  it('reaches high spire under WORLD_HEIGHT', () => {
    const peak = spirePeakY();
    const crown = spireAccessibleY();
    expect(peak).toBeGreaterThanOrEqual(400);
    expect(peak).toBeLessThan(WORLD_HEIGHT);
    expect(crown).toBeGreaterThanOrEqual(350);
    expect(crown).toBeLessThan(peak);
  });

  it('has solid spire shell mid-height', () => {
    // Base ring of stage 0 (window bays overwrite some mid-height shell with glass).
    expect(at(KCX + 22, FLOOR.roof + 1, KCZ)).toBe(LIMESTONE);
  });

  it('has water at a waterfall column', () => {
    expect(at(70, cloudspireTerraceY(70, -30) + 1, -30)).toBe(WATER);
  });

  it('keeps the gate-to-garden processional continuously graded', () => {
    const seamZ = Z0 + 20;
    const grade = cloudspireTerraceY(CX, seamZ);
    expect(isSolid(at(CX, grade, seamZ))).toBe(true);
    expect(at(CX, grade + 1, seamZ)).toBe(AIR);
    expect(at(CX, grade + 2, seamZ)).toBe(AIR);
  });

  it('keeps formal fountains filled after court and route passes', () => {
    for (const [x, z] of [
      [CX - 45, CZ - 70],
      [CX + 45, CZ - 70],
      [CX - 48, KEEP.z0 - 10],
    ] as const) {
      const grade = cloudspireTerraceY(x, z);
      expect(at(x + 2, grade + 1, z)).toBe(WATER);
    }
  });

  it('places lower-district floors and roofs above their local grade', () => {
    const x = -50;
    const z = -94;
    const grade = cloudspireTerraceY(x, z);
    expect(isSolid(at(x, grade + 1, z))).toBe(true);
    expect(at(x, grade + 2, z)).toBe(AIR);
    expect(isSolid(at(x, grade + 14, z))).toBe(true);
  });

  it('supports the first spire step and each narrowing-stage entry', () => {
    let stageY = FLOOR.roof;
    for (let i = 0; i < 5; i++) {
      const stage = SPIRE.stages[i];
      const stairX = KCX + stage.half - 3;
      expect(isSolid(at(stairX - 1, stageY + 1, KCZ - 1))).toBe(true);
      stageY += stage.height;
      if (i < 4) {
        const next = SPIRE.stages[i + 1];
        expect(isSolid(at(KCX + next.half + 1, stageY, KCZ))).toBe(true);
        expect(at(KCX + next.half, stageY + 1, KCZ)).toBe(AIR);
      }
    }
  });

  it('connects every palace switchback flight to its alternating landing', () => {
    for (let flight = 0; flight < PALACE_STACK.length - 1; flight++) {
      const y = FLOOR.ground + flight * 10;
      const goingNorth = flight % 2 === 0;
      const stairX = goingNorth ? STAIR_X0 + 2 : STAIR_X1 - 2;
      const startZ = STAIR_Z0 + (goingNorth ? 2 : 13);
      const endZ = STAIR_Z0 + (goingNorth ? 11 : 4);
      expect(at(stairX, y, startZ)).not.toBe(AIR);
      expect(at(stairX, y + 9, endZ)).not.toBe(AIR);
      expect(at(stairX, y + 1, startZ)).toBe(AIR);

      if (flight < PALACE_STACK.length - 2) {
        const landingZ = STAIR_Z0 + (goingNorth ? 14 : 1);
        expect(at(STAIR_X0 + 1, y + 10, landingZ)).not.toBe(AIR);
        expect(at(stairX, y + 11, landingZ)).toBe(AIR);
      }
    }
  });

  it('walks consecutive switchback flights and turn landings under real collision physics', () => {
    const player = new PlayerController({ x: STAIR_X0 + 2, y: 114.9, z: STAIR_Z0 + 1 }, false);
    player.grounded = true;
    const world = makePhysicsWorld();
    const legs = [
      { x: STAIR_X0 + 2, y: 124.9, z: STAIR_Z0 + 14.5 },
      { x: STAIR_X1 - 2, y: 124.9, z: STAIR_Z0 + 14.5 },
      { x: STAIR_X1 - 2, y: 134.9, z: STAIR_Z0 + 1.5 },
      { x: STAIR_X0 + 2, y: 134.9, z: STAIR_Z0 + 1.5 },
      { x: STAIR_X0 + 2, y: 144.9, z: STAIR_Z0 + 14.5 },
    ];
    for (const target of legs) {
      const result = walkToward(player, world, target, {
        maxFrames: 1_500,
        arriveDist: 0.35,
        stuckFrames: 120,
      });
      expect(result.arrived, JSON.stringify({ target, result })).toBe(true);
    }
  });

  it('places waterfall basins and grottoes on the terrain surface', () => {
    for (const fall of FALLS) {
      const waterY = Math.max(fall.bottom, cloudspireTerraceY(fall.x, fall.z) + 1);
      expect(at(fall.x, waterY, fall.z)).toBe(WATER);
      expect(at(fall.x, waterY + 1, fall.z + 6)).toBe(AIR);
      expect(isSolid(at(fall.x, waterY + 6, fall.z + 6))).toBe(true);
    }
  });

  it('keeps the reflecting pool clear of the palace footprint', () => {
    const newPoolY = cloudspireTerraceY(-65, 15) + 1;
    expect(at(-65, newPoolY, 15)).toBe(WATER);
    expect(at(-45, cloudspireTerraceY(-45, 15) + 1, 15)).not.toBe(WATER);
  });

  it('builds continuous cistern piers from grade to basin', () => {
    const x = CLOUDSPIRE.reservoirCx - 12;
    const z = CLOUDSPIRE.reservoirCz - 12;
    const grade = cloudspireTerraceY(x, z);
    for (let y = grade; y <= CLOUDSPIRE.reservoirY - 4; y++) {
      expect(at(x, y, z)).not.toBe(AIR);
    }
  });

  it('preserves the off-axis altar and grade-level hidden alcove', () => {
    expect(at(CATH_CX - 7, CATH.floor + 3, CATH.z1 + 2)).toBe(GOLD_TRIM);

    const alcoveY = cloudspireTerraceY(CX + 46, -51);
    expect(at(CX + 46, alcoveY + 2, -51)).toBe(GLOWSTONE);
    expect(at(CX + 43, alcoveY + 2, -51)).toBe(AIR);
  });

  it('spawn overlook has solid deck', () => {
    expect(isSolid(at(SPAWN.x, G + 20, SPAWN.z))).toBe(true);
  });

  it('outer city spans intended width', () => {
    expect(X1 - X0).toBeGreaterThanOrEqual(220);
    expect(Z1 - Z0).toBeGreaterThanOrEqual(220);
  });
});

describe('cloudspire curated metadata', () => {
  it('provides title spawn tour atmosphere', () => {
    const meta = curatedPresetMeta('cloudspire-citadel', SEED, 2);
    expect(meta?.title).toBe('Cloudspire Citadel');
    expect(meta?.spawn?.z).toBe(SPAWN.z);
    expect(meta?.tour?.length).toBeGreaterThanOrEqual(8);
    expect(meta?.landmarks?.length).toBeGreaterThanOrEqual(8);
    expect(meta?.atmosphere?.weather).toBe('clear');
    expect(meta?.atmosphere?.timeOfDay).toBeCloseTo(0.42);
    expect(meta?.look).toEqual(LOOK);
    expect(meta?.landmarks?.find((l) => l.name === 'East Waterfall')?.y).toBe(GP + 1);
  });

  it('leaves default preset uncurated', () => {
    expect(curatedPresetMeta('default', SEED, 2)).toBeUndefined();
  });
});

describe('cloudspire shipped package', () => {
  // Regenerating 242 authored chunks takes ~7 s alone and legitimately exceeds the default
  // 20 s under full-suite parallel load (observed flaking as sibling suites grew heavier).
  it(
    'matches every bundled non-air voxel to the fresh generator, including state',
    { timeout: 60_000 },
    () => {
      const bytes = readFileSync(
        new URL('../public/worlds/cloudspire-citadel.vrw', import.meta.url),
      );
      const binary = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const { deltas, dropped } = decodeWorldBinary(binary, { isValidBlockId: () => true });
      const { chunkOf } = makeSampler();
      let checked = 0;
      let mismatch: string | undefined;

      for (const [key, entries] of deltas) {
        const { cx, cz } = parseChunkKey(key);
        const chunk = chunkOf(cx, cz);
        for (const [index, packed] of entries) {
          const local = indexToLocal(index);
          const actualId = chunk.get(local.x, local.y, local.z);
          const actualState = chunk.getState(local.x, local.y, local.z);
          if (actualId !== voxelId(packed) || actualState !== voxelState(packed)) {
            mismatch = `${key}:${index} expected ${voxelId(packed)}/${voxelState(packed)} got ${actualId}/${actualState}`;
            break;
          }
          checked++;
        }
        if (mismatch) break;
      }

      expect(dropped).toBe(0);
      expect(mismatch).toBeUndefined();
      expect(checked).toBeGreaterThan(1_000_000);
    },
  );
});

describe('cloudspire atmosphere parse defaults', () => {
  it('parses optional atmosphere and ignores legacy saves without it', () => {
    const withAtmo = parseWorldSnapshot(
      {
        meta: {
          seed: 1,
          version: 2,
          atmosphere: { weather: 'clear', timeOfDay: 0.3, fogNear: 100, fogFar: 200 },
        },
        chunks: {},
      },
      { isValidBlockId: () => true },
    );
    expect(withAtmo.snapshot.meta?.atmosphere?.weather).toBe('clear');
    expect(withAtmo.snapshot.meta?.atmosphere?.fogFar).toBe(200);

    const legacy = parseWorldSnapshot(
      { meta: { seed: 1, version: 2, title: 'Old' }, chunks: {} },
      { isValidBlockId: () => true },
    );
    expect(legacy.snapshot.meta?.atmosphere).toBeUndefined();
    expect(legacy.snapshot.meta?.title).toBe('Old');
  });
});
