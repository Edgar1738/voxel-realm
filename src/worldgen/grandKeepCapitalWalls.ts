import { AIR, COBBLESTONE, DEEPSLATE, PLANKS, STONE, WATER } from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import { battlements, hollowTower } from './grandKeepPrimitives';
import {
  CAPITAL_CENTER_X,
  CAPITAL_CENTER_Z,
  CAPITAL_DITCH_INSET,
  CAPITAL_DITCH_OUTSET,
  CAPITAL_GATE_HALF,
  CAPITAL_GATE_TOP_Y,
  CAPITAL_GROUND_Y,
  CAPITAL_MERLON_Y,
  CAPITAL_SOUTH_GATE_HALF,
  CAPITAL_TOWER_CENTERS,
  CAPITAL_WALK_Y,
  CAPITAL_WALL_BASE_Y,
  CAPITAL_WALL_THICKNESS,
  CAPITAL_X0,
  CAPITAL_X1,
  CAPITAL_Z0,
  CAPITAL_Z1,
} from './grandKeepCapitalFrame';

function buildCurtain(s: CitadelStamp): void {
  const t = CAPITAL_WALL_THICKNESS;
  s.fill(
    CAPITAL_X0,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_Z0,
    CAPITAL_X0 + t - 1,
    CAPITAL_WALK_Y,
    CAPITAL_Z1,
    COBBLESTONE,
  );
  s.fill(
    CAPITAL_X1 - t + 1,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_Z0,
    CAPITAL_X1,
    CAPITAL_WALK_Y,
    CAPITAL_Z1,
    COBBLESTONE,
  );
  s.fill(
    CAPITAL_X0,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_Z0,
    CAPITAL_X1,
    CAPITAL_WALK_Y,
    CAPITAL_Z0 + t - 1,
    COBBLESTONE,
  );
  s.fill(
    CAPITAL_X0,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_Z1 - t + 1,
    CAPITAL_X1,
    CAPITAL_WALK_Y,
    CAPITAL_Z1,
    COBBLESTONE,
  );
  battlements(s, CAPITAL_X0, CAPITAL_Z0, CAPITAL_X1, CAPITAL_Z1, CAPITAL_MERLON_Y, COBBLESTONE);
}

function buildTowers(s: CitadelStamp): void {
  for (const [x, z] of CAPITAL_TOWER_CENTERS) {
    hollowTower(s, x, z, 6, CAPITAL_WALL_BASE_Y, CAPITAL_WALK_Y + 8, {
      wall: STONE,
      floor: PLANKS,
      floorGap: 8,
      wallWalkY: CAPITAL_WALK_Y,
    });
  }
}

function cutGates(s: CitadelStamp): void {
  const depth = 7;
  s.fill(
    CAPITAL_CENTER_X - CAPITAL_SOUTH_GATE_HALF,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_Z0 - depth,
    CAPITAL_CENTER_X + CAPITAL_SOUTH_GATE_HALF,
    CAPITAL_GATE_TOP_Y,
    CAPITAL_Z0 + depth,
    AIR,
  );
  s.fill(
    CAPITAL_CENTER_X - CAPITAL_GATE_HALF,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_Z1 - depth,
    CAPITAL_CENTER_X + CAPITAL_GATE_HALF,
    CAPITAL_GATE_TOP_Y,
    CAPITAL_Z1 + depth,
    AIR,
  );
  s.fill(
    CAPITAL_X0 - depth,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_CENTER_Z - CAPITAL_GATE_HALF,
    CAPITAL_X0 + depth,
    CAPITAL_GATE_TOP_Y,
    CAPITAL_CENTER_Z + CAPITAL_GATE_HALF,
    AIR,
  );
  s.fill(
    CAPITAL_X1 - depth,
    CAPITAL_WALL_BASE_Y,
    CAPITAL_CENTER_Z - CAPITAL_GATE_HALF,
    CAPITAL_X1 + depth,
    CAPITAL_GATE_TOP_Y,
    CAPITAL_CENTER_Z + CAPITAL_GATE_HALF,
    AIR,
  );
}

function onBridge(wx: number, wz: number): boolean {
  const onSouth = wz < CAPITAL_Z0 && Math.abs(wx - CAPITAL_CENTER_X) <= CAPITAL_SOUTH_GATE_HALF;
  const onNorth = wz > CAPITAL_Z1 && Math.abs(wx - CAPITAL_CENTER_X) <= CAPITAL_GATE_HALF;
  const onWest = wx < CAPITAL_X0 && Math.abs(wz - CAPITAL_CENTER_Z) <= CAPITAL_GATE_HALF;
  const onEast = wx > CAPITAL_X1 && Math.abs(wz - CAPITAL_CENTER_Z) <= CAPITAL_GATE_HALF;
  return onSouth || onNorth || onWest || onEast;
}

function buildDitch(s: CitadelStamp): void {
  const ax = Math.max(CAPITAL_X0 - CAPITAL_DITCH_OUTSET, s.wx0);
  const bx = Math.min(CAPITAL_X1 + CAPITAL_DITCH_OUTSET, s.wx1);
  const az = Math.max(CAPITAL_Z0 - CAPITAL_DITCH_OUTSET, s.wz0);
  const bz = Math.min(CAPITAL_Z1 + CAPITAL_DITCH_OUTSET, s.wz1);

  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const outsideX = wx < CAPITAL_X0 ? CAPITAL_X0 - wx : wx > CAPITAL_X1 ? wx - CAPITAL_X1 : 0;
      const outsideZ = wz < CAPITAL_Z0 ? CAPITAL_Z0 - wz : wz > CAPITAL_Z1 ? wz - CAPITAL_Z1 : 0;
      const distance = Math.max(outsideX, outsideZ);
      if (distance < CAPITAL_DITCH_INSET || distance > CAPITAL_DITCH_OUTSET) continue;

      s.set(wx, CAPITAL_GROUND_Y - 5, wz, DEEPSLATE);
      s.fill(wx, CAPITAL_GROUND_Y - 4, wz, wx, CAPITAL_GROUND_Y - 1, wz, WATER);
      s.set(wx, CAPITAL_GROUND_Y, wz, AIR);
      if (onBridge(wx, wz)) s.set(wx, CAPITAL_GROUND_Y, wz, PLANKS);
    }
  }
}

/** Stamps the complete newest capital wall, its eight towers, four gates, ditch, and bridges. */
export function buildGrandKeepCapitalWalls(s: CitadelStamp): void {
  buildDitch(s);
  buildCurtain(s);
  buildTowers(s);
  cutGates(s);
}
