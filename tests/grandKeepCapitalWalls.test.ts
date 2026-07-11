import { describe, expect, it } from 'vitest';
import { AIR, COBBLESTONE, PLANKS, WATER } from '../src/blocks/blocks';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../src/core/constants';
import { ChunkData } from '../src/world/ChunkData';
import { CitadelStamp } from '../src/worldgen/CitadelStamp';
import { GRAND_KEEP, grandKeepSurfaceAt } from '../src/worldgen/GrandKeepGenerator';
import {
  CAPITAL_DITCH_INSET,
  CAPITAL_DITCH_OUTSET,
  CAPITAL_GATE_HALF,
  CAPITAL_GROUND_Y,
  CAPITAL_MERLON_Y,
  CAPITAL_SOUTH_GATE_HALF,
  CAPITAL_TOWER_CENTERS,
  CAPITAL_WALK_Y,
  CAPITAL_WALL_THICKNESS,
  CAPITAL_X0,
  CAPITAL_X1,
  CAPITAL_Z0,
  CAPITAL_Z1,
} from '../src/worldgen/grandKeepCapitalFrame';
import { buildGrandKeepCapitalWalls } from '../src/worldgen/grandKeepCapitalWalls';

function makeSampler(): (wx: number, wy: number, wz: number) => number {
  const chunks = new Map<string, ChunkData>();
  return (wx, wy, wz) => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const key = `${cx},${cz}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new ChunkData(cx, cz);
      buildGrandKeepCapitalWalls(new CitadelStamp(chunk, cx, cz));
      chunks.set(key, chunk);
    }
    return chunk.get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
}

describe('Grand Keep capital terrain frame', () => {
  it('provides a flat radius-340 plateau with a radius-430 skirt', () => {
    expect(GRAND_KEEP.plateauRadius).toBe(340);
    expect(GRAND_KEEP.skirtRadius).toBe(430);
    expect(grandKeepSurfaceAt(1337, GRAND_KEEP.centerX + 340, GRAND_KEEP.centerZ)).toBe(
      GRAND_KEEP.groundY,
    );
  });
});

describe('Grand Keep capital defenses', () => {
  const at = makeSampler();

  it('exports the complete rectangular wall frame and raised wall walk', () => {
    expect([CAPITAL_X0, CAPITAL_X1, CAPITAL_Z0, CAPITAL_Z1]).toEqual([-232, 248, -220, 260]);
    expect(CAPITAL_WALL_THICKNESS).toBeGreaterThanOrEqual(4);
    expect(CAPITAL_WALL_THICKNESS).toBeLessThanOrEqual(5);
    expect(CAPITAL_WALK_Y).toBe(CAPITAL_GROUND_Y + 10);

    expect(at(CAPITAL_X0, CAPITAL_WALK_Y, 0)).toBe(COBBLESTONE);
    expect(at(CAPITAL_X1, CAPITAL_WALK_Y, 40)).toBe(COBBLESTONE);
    expect(at(-40, CAPITAL_WALK_Y, CAPITAL_Z0)).toBe(COBBLESTONE);
    expect(at(80, CAPITAL_WALK_Y, CAPITAL_Z1)).toBe(COBBLESTONE);
    expect(at(CAPITAL_X0, CAPITAL_MERLON_Y, 0)).toBe(COBBLESTONE);
  });

  it('cuts four cardinal gate passages, with a fifteen-wide royal south gate', () => {
    expect(CAPITAL_SOUTH_GATE_HALF * 2 + 1).toBe(15);
    expect(at(8, CAPITAL_GROUND_Y + 2, CAPITAL_Z0)).toBe(AIR);
    expect(at(8, CAPITAL_GROUND_Y + 2, CAPITAL_Z1)).toBe(AIR);
    expect(at(CAPITAL_X0, CAPITAL_GROUND_Y + 2, 20)).toBe(AIR);
    expect(at(CAPITAL_X1, CAPITAL_GROUND_Y + 2, 20)).toBe(AIR);
    expect(at(8 + CAPITAL_SOUTH_GATE_HALF + 1, CAPITAL_GROUND_Y + 2, CAPITAL_Z0)).not.toBe(AIR);
    expect(CAPITAL_GATE_HALF).toBeLessThan(CAPITAL_SOUTH_GATE_HALF);
  });

  it('places towers at all corners and wall midpoints', () => {
    expect(CAPITAL_TOWER_CENTERS).toHaveLength(8);
    for (const [x, z] of CAPITAL_TOWER_CENTERS) {
      expect(at(x + 6, CAPITAL_WALK_Y + 4, z)).not.toBe(AIR);
    }
  });

  it('cuts a water ditch outside the wall and preserves bridge gaps at every gate', () => {
    expect(CAPITAL_DITCH_INSET).toBeGreaterThan(0);
    expect(CAPITAL_DITCH_OUTSET).toBeGreaterThan(CAPITAL_DITCH_INSET);
    expect(at(40, CAPITAL_GROUND_Y - 1, CAPITAL_Z0 - CAPITAL_DITCH_INSET)).toBe(WATER);
    expect(at(8, CAPITAL_GROUND_Y, CAPITAL_Z0 - CAPITAL_DITCH_INSET)).toBe(PLANKS);
    expect(at(8, CAPITAL_GROUND_Y, CAPITAL_Z1 + CAPITAL_DITCH_INSET)).toBe(PLANKS);
    expect(at(CAPITAL_X0 - CAPITAL_DITCH_INSET, CAPITAL_GROUND_Y, 20)).toBe(PLANKS);
    expect(at(CAPITAL_X1 + CAPITAL_DITCH_INSET, CAPITAL_GROUND_Y, 20)).toBe(PLANKS);
  });
});
