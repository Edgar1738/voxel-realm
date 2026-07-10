import { AIR } from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import {
  buildApproach,
  buildMoat,
  buildCourtyard,
  buildCurtainWalls,
  buildGatehouse,
  buildCornerTowers,
  buildWallAccess,
  buildButtresses,
} from './grandKeepWalls';
import {
  buildKeepShell,
  buildKeepFloors,
  buildGrandStaircase,
  buildSecondaryStair,
  buildGreatHall,
  buildThroneFloor,
  buildResidentialFloor,
  buildHighCastleFloor,
  buildRoof,
  buildMajorTowers,
  buildDungeonAccess,
} from './grandKeepKeep';
import { buildDungeon } from './grandKeepDungeon';
import {
  G,
  CX,
  Z0,
  KZ0,
  KCX,
  FLOOR,
  STAIR_X0,
  STAIR_Z0,
  GATE_HALF,
  GATE_TOP,
  DUNGEON_SHAFT,
} from './grandKeepFrame';
import type { Overlay } from './Generator';

/**
 * Final pass: re-cut the primary processional corridor so later stamps cannot choke the route.
 * Spawn road → gate → courtyard → keep entrance → grand-stair doorways → dungeon shaft mouth.
 */
function clearProcessional(s: CitadelStamp): void {
  // Gate passage through the south wall / gatehouse (monumental headroom)
  s.fill(CX - GATE_HALF, G + 1, Z0 - 2, CX + GATE_HALF, GATE_TOP + 1, KZ0 - 1, AIR);

  // Keep south entrance (wide + tall)
  s.fill(KCX - 4, FLOOR.ground, KZ0, KCX + 4, FLOOR.ground + 6, KZ0 + 2, AIR);

  // Ground-floor door into grand stair well (west face)
  s.fill(STAIR_X0, FLOOR.ground + 1, STAIR_Z0 + 2, STAIR_X0, FLOOR.ground + 4, STAIR_Z0 + 10, AIR);
  // Same on each major floor
  for (const fy of [FLOOR.throne, FLOOR.residential, FLOOR.high, FLOOR.roof]) {
    s.fill(STAIR_X0, fy + 1, STAIR_Z0 + 2, STAIR_X0, fy + 4, STAIR_Z0 + 10, AIR);
  }

  // Corridor from hall center toward stair well at ground
  s.fill(KCX + 8, FLOOR.ground + 1, STAIR_Z0 + 4, STAIR_X0, FLOOR.ground + 4, STAIR_Z0 + 8, AIR);

  // Dungeon shaft mouth open in Great Hall (do not re-hollow the spiral post — dungeon rebuilds it)
  const sx = DUNGEON_SHAFT.x;
  const sz = DUNGEON_SHAFT.z;
  s.fill(sx - 2, FLOOR.ground, sz + 3, sx + 2, FLOOR.ground + 3, sz + 4, AIR); // south doorway only
}

/**
 * The Grand Keep site overlay — deterministic fortress complex stamped per chunk.
 *
 * Composition (Milestone 1):
 * approach → moat → gatehouse → courtyard → multi-storey keep → towers → roof → dungeon
 *
 * Navigation spine:
 * spawn overlook → approach → Grand Gate → Inner Court → Great Hall → Grand Stair →
 * throne → residential → high castle → battlements → Crown Tower summit
 *
 * Secondary: Great Hall → dungeon shaft → Deep Dungeon → return via same shaft.
 */
export function grandKeepSite(): Overlay {
  return (chunk, cx, cz) => {
    const s = new CitadelStamp(chunk, cx, cz);

    // Site / approach
    buildApproach(s);
    buildMoat(s);
    buildCourtyard(s);

    // Defenses
    buildCurtainWalls(s);
    buildGatehouse(s);
    buildCornerTowers(s);
    buildWallAccess(s);
    buildButtresses(s);

    // Main keep massing + vertical circulation
    buildKeepShell(s);
    buildKeepFloors(s);
    buildGrandStaircase(s);
    buildSecondaryStair(s);

    // Interior volumes (light anchors only for M1)
    buildGreatHall(s);
    buildThroneFloor(s);
    buildResidentialFloor(s);
    buildHighCastleFloor(s);
    buildRoof(s);

    // Towers + underground
    buildMajorTowers(s);
    buildDungeonAccess(s);
    buildDungeon(s);

    // Last: guarantee primary circulation openings
    clearProcessional(s);
  };
}
