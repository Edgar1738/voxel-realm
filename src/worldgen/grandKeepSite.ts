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
  dressCourtyard,
  dressGreatHall,
  dressThroneFloor,
  dressResidentialFloor,
  dressHighCastleFloor,
  dressStateAndGallery,
  dressLibraryAndBarracks,
  polishGrandStair,
  polishExteriorSilhouette,
  dressDungeon,
} from './grandKeepDressing';
import { buildDeepInteriors, NORTH_STAIR, MID_STAIR } from './grandKeepInteriors';
import { buildKeepBalconies } from './grandKeepBalconies';
import { buildVillage } from './grandKeepVillage';
import { buildSkyways } from './grandKeepSkyways';
import { buildKingsSolar } from './grandKeepKingsSolar';
import {
  G,
  CX,
  Z0,
  KZ0,
  KCX,
  FLOOR,
  STACK,
  STAIR_X0,
  STAIR_Z0,
  GATE_HALF,
  GATE_TOP,
  DUNGEON_SHAFT,
  SEC_X1,
  SEC_Z0,
  SEC_Z1,
} from './grandKeepFrame';
import type { Overlay } from './Generator';

/**
 * Final pass: re-cut the primary processional corridor so later stamps cannot choke the route.
 * Spawn road → gate → courtyard → keep entrance → grand-stair doorways → dungeon shaft mouth.
 */
function clearProcessional(s: CitadelStamp): void {
  // Gate passage only through the south wall / gatehouse (do not wipe courtyard props)
  const gateInner = Z0 + 16;
  s.fill(CX - GATE_HALF, G + 1, Z0 - 2, CX + GATE_HALF, GATE_TOP + 1, gateInner, AIR);

  // Approach road air column (keeps stall overhangs / banners from choking the processional)
  s.fill(CX - 2, G + 1, Z0 - 50, CX + 2, G + 4, Z0 - 2, AIR);

  // Courtyard spine in two segments so the central fountain / plaza props (≈ KZ0-14..-8) stay
  s.fill(CX - 2, G + 1, gateInner, CX + 2, G + 4, KZ0 - 16, AIR);
  s.fill(CX - 2, G + 1, KZ0 - 8, CX + 2, G + 4, KZ0 - 2, AIR);

  // Keep south entrance (wide + tall) including chapel bay join
  s.fill(KCX - 4, FLOOR.ground, KZ0 - 4, KCX + 4, FLOOR.ground + 6, KZ0 + 2, AIR);

  // Grand stair well doors on every storey
  for (const fy of STACK) {
    s.fill(STAIR_X0, fy + 1, STAIR_Z0 + 2, STAIR_X0, fy + 4, STAIR_Z0 + 10, AIR);
  }

  // Corridor from hall center toward stair well at ground
  s.fill(KCX + 8, FLOOR.ground + 1, STAIR_Z0 + 4, STAIR_X0, FLOOR.ground + 4, STAIR_Z0 + 8, AIR);

  // Doors into north service stair + mid gallery stair on every storey
  for (const fy of STACK) {
    const ncx = (NORTH_STAIR.x0 + NORTH_STAIR.x1) >> 1;
    s.fill(ncx - 1, fy + 1, NORTH_STAIR.z0, ncx + 1, fy + 3, NORTH_STAIR.z0, AIR);
    const mz = (MID_STAIR.z0 + MID_STAIR.z1) >> 1;
    s.fill(MID_STAIR.x0, fy + 1, mz - 1, MID_STAIR.x0, fy + 3, mz + 1, AIR);
    s.fill(MID_STAIR.x1, fy + 1, mz - 1, MID_STAIR.x1, fy + 3, mz + 1, AIR);
  }
  // Secondary stair → roof exit
  const scz = (SEC_Z0 + SEC_Z1) >> 1;
  s.fill(SEC_X1, FLOOR.roof + 1, scz - 1, SEC_X1, FLOOR.roof + 3, scz + 1, AIR);

  // Dungeon shaft mouth open in Great Hall (do not re-hollow the spiral post — dungeon rebuilds it)
  const sx = DUNGEON_SHAFT.x;
  const sz = DUNGEON_SHAFT.z;
  s.fill(sx - 2, FLOOR.ground, sz + 3, sx + 2, FLOOR.ground + 3, sz + 4, AIR); // south doorway only

  // Hotel-wing stair doors stay open (residential / guest are above the solar)
  for (const fy of [FLOOR.residential, FLOOR.guest, FLOOR.library, FLOOR.barracks]) {
    s.fill(STAIR_X0, fy + 1, STAIR_Z0 + 2, STAIR_X0, fy + 4, STAIR_Z0 + 10, AIR);
  }
}

/**
 * The Grand Keep site overlay — deterministic fortress complex stamped per chunk.
 *
 * M1: composition + circulation shell.
 * M2: courtyard wayfinding, key-room dressing, stair lighting, exterior silhouette.
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

    // Village (inner bailey + outer town) + sky towers / multi-story bridges
    buildVillage(s);
    buildSkyways(s);

    // Main keep massing + vertical circulation
    buildKeepShell(s);
    buildKeepFloors(s);
    buildGrandStaircase(s);
    buildSecondaryStair(s);

    // Interior volumes
    buildGreatHall(s);
    buildThroneFloor(s);
    buildResidentialFloor(s);
    buildHighCastleFloor(s);
    buildRoof(s);

    // Deep walkable network: corridors, room chains, extra stairs
    buildDeepInteriors(s);

    // King's Solar — multi-storey open royal apartment (wins over mid-floor clutter)
    buildKingsSolar(s);

    // Exterior balconies on every storey
    buildKeepBalconies(s);

    // Towers + underground
    buildMajorTowers(s);
    buildDungeonAccess(s);
    buildDungeon(s);

    // Polish (dressing / wayfinding / silhouette)
    polishExteriorSilhouette(s);
    dressCourtyard(s);
    dressGreatHall(s);
    dressThroneFloor(s);
    dressStateAndGallery(s);
    dressResidentialFloor(s);
    dressLibraryAndBarracks(s);
    dressHighCastleFloor(s);
    polishGrandStair(s);
    dressDungeon(s);

    // Last: guarantee primary circulation openings
    clearProcessional(s);
  };
}
