import { describe, it, expect } from 'vitest';
import { createGenerator } from '../src/worldgen/Presets';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import { AIR, STAIRS_STONE, BLOCK_DEFS } from '../src/blocks/blocks';
import {
  G,
  CX,
  Z0,
  KZ0,
  KCX,
  FLOOR,
  STAIR_X0,
  STAIR_X1,
  STAIR_Z0,
  STAIR_Z1,
  CROWN,
  DUNGEON_SHAFT,
  GATE_HALF,
  KCZ,
} from '../src/worldgen/grandKeepFrame';

const SEED = 1337;

function makeAt() {
  const { generator, overlays } = createGenerator('grand-keep');
  const cache = new Map<string, ChunkData>();
  const chunkOf = (cx: number, cz: number): ChunkData => {
    const key = `${cx},${cz}`;
    let c = cache.get(key);
    if (!c) {
      c = generator.generateBaseChunk(SEED, cx, cz);
      applyOverlays(c, cx, cz, SEED, overlays);
      cache.set(key, c);
    }
    return c;
  };
  return (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return chunkOf(cx, cz).get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
}

function isPassable(id: number): boolean {
  if (id === AIR) return true;
  const def = BLOCK_DEFS[id];
  // stairs, slabs, non-opaque shapes are walkable surfaces or partial
  if (!def) return false;
  if (def.shape === 'stair' || def.shape === 'slab') return true;
  return !!def.transparent && def.shape !== 'cube';
}

function hasHeadroom(
  at: (x: number, y: number, z: number) => number,
  x: number,
  y: number,
  z: number,
): boolean {
  // Standing feet on y (block top), need air at y+1 and y+2 roughly body
  return at(x, y + 1, z) === AIR && at(x, y + 2, z) === AIR;
}

describe('grand-keep circulation (structural)', () => {
  const at = makeAt();

  it('primary route cells are passable at key waypoints', () => {
    const waypoints: Array<[string, number, number, number]> = [
      ['spawn road', CX, G, Z0 - 40],
      ['gate passage', CX, G, Z0 + 4],
      ['courtyard', CX, G, KZ0 - 12],
      ['keep entrance', KCX, G, KZ0 + 2],
      ['great hall center', KCX, G, KZ0 + 20],
      ['throne floor', KCX, FLOOR.throne, KZ0 + 28],
      ['residential', KCX - 4, FLOOR.residential, KZ0 + 14],
      ['high castle', KCX + 8, FLOOR.high, KCZ],
      ['roof', KCX, FLOOR.roof, KZ0 + 20],
    ];
    for (const [name, x, floorY, z] of waypoints) {
      if (
        name === 'spawn road' ||
        name === 'gate passage' ||
        name === 'courtyard' ||
        name === 'keep entrance'
      ) {
        expect(at(x, G, z), `${name} floor`).not.toBe(AIR);
        expect(hasHeadroom(at, x, G, z), `${name} headroom`).toBe(true);
      } else {
        expect(at(x, floorY, z), `${name} floor`).not.toBe(AIR);
        expect(hasHeadroom(at, x, floorY, z), `${name} headroom`).toBe(true);
      }
    }
  });

  it('grand stair has climbable steps between ground and throne', () => {
    let stairCount = 0;
    for (let y = FLOOR.ground; y < FLOOR.throne; y++) {
      for (let x = STAIR_X0; x <= STAIR_X1; x++) {
        for (let z = STAIR_Z0; z <= STAIR_Z1; z++) {
          if (at(x, y, z) === STAIRS_STONE) {
            stairCount++;
            // at least one block of air above each step (player step-up uses partial height)
            expect(
              at(x, y + 1, z) === AIR || at(x, y + 1, z) === STAIRS_STONE,
              `head above stair ${x},${y},${z}`,
            ).toBe(true);
          }
        }
      }
    }
    // Two flights × 6 steps × 5 width = 60
    expect(stairCount).toBeGreaterThanOrEqual(50);
  });

  it('dungeon route has air headroom from shaft to vault', () => {
    const sx = DUNGEON_SHAFT.x;
    const sz = DUNGEON_SHAFT.z;
    // Floor around shaft
    expect(at(sx + 3, FLOOR.dungeon, sz)).not.toBe(AIR);
    expect(hasHeadroom(at, sx + 3, FLOOR.dungeon, sz)).toBe(true);
    // Corridor toward center
    expect(at(KCX, FLOOR.dungeon + 2, sz)).toBe(AIR);
    expect(at(KCX, FLOOR.dungeon + 3, sz)).toBe(AIR);
  });

  it('crown tower interior is hollow with spiral room', () => {
    expect(
      isPassable(at(CROWN.cx, FLOOR.roof + 3, CROWN.cz)) ||
        at(CROWN.cx, FLOOR.roof + 3, CROWN.cz) === AIR,
    ).toBe(true);
    // Outer wall solid
    expect(at(CROWN.cx + CROWN.half, FLOOR.roof + 3, CROWN.cz)).not.toBe(AIR);
  });

  it('gate opening width is monumental (≥7)', () => {
    expect(GATE_HALF * 2 + 1).toBeGreaterThanOrEqual(7);
  });
});
