/**
 * High-rise landscape towers and multi-storey sky bridges linking the village,
 * outer walls, and the tall keep mass across the plateau.
 */
import {
  AIR,
  STONE,
  BRICK,
  PLANKS,
  WOOD,
  GLASS,
  LANTERN,
  GLOWSTONE,
  COBBLESTONE,
  COBBLE_WALL,
  OAK_FENCE,
  DEEPSLATE,
} from '../blocks/blocks';
import { CitadelStamp, spiralStair, floorWithStairHole } from './CitadelStamp';
import { G, CX, CZ, X0, X1, Z0, Z1, WALK_Y, FLOOR, KCX, KZ0 } from './grandKeepFrame';

export interface SkyTower {
  id: string;
  cx: number;
  cz: number;
  half: number;
  /** Roof terrace height (solid top). */
  topY: number;
}

/**
 * Free-standing high-rise towers around the castle / village.
 * Positions sit on the expanded mesa, outside or near the outer wall.
 */
export const SKY_TOWERS: readonly SkyTower[] = [
  // Cardinals — outside walls
  { id: 'south', cx: CX, cz: Z0 - 45, half: 6, topY: G + 70 },
  { id: 'north', cx: CX, cz: Z1 + 45, half: 6, topY: G + 65 },
  { id: 'west', cx: X0 - 45, cz: CZ, half: 6, topY: G + 75 },
  { id: 'east', cx: X1 + 45, cz: CZ, half: 6, topY: G + 72 },
  // Diagonals
  { id: 'sw', cx: X0 - 35, cz: Z0 - 35, half: 5, topY: G + 58 },
  { id: 'se', cx: X1 + 35, cz: Z0 - 35, half: 5, topY: G + 62 },
  { id: 'nw', cx: X0 - 35, cz: Z1 + 35, half: 5, topY: G + 55 },
  { id: 'ne', cx: X1 + 35, cz: Z1 + 35, half: 5, topY: G + 60 },
  // Mid-ring towers (village anchors)
  { id: 'sse', cx: CX + 40, cz: Z0 - 50, half: 4, topY: G + 48 },
  { id: 'ssw', cx: CX - 40, cz: Z0 - 50, half: 4, topY: G + 48 },
  { id: 'ene', cx: X1 + 50, cz: CZ - 40, half: 4, topY: G + 52 },
  { id: 'ese', cx: X1 + 50, cz: CZ + 40, half: 4, topY: G + 52 },
];

/** Bridge deck heights (multi-story skyways). */
export const BRIDGE_LEVELS: readonly number[] = [G + 16, G + 32, G + 48, G + 64];

function towerFoot(s: CitadelStamp, t: SkyTower): void {
  const { cx, cz, half, topY } = t;
  const x0 = cx - half;
  const x1 = cx + half;
  const z0 = cz - half;
  const z1 = cz + half;
  s.fill(x0, G - 1, z0, x1, G, z1, DEEPSLATE);
  s.walls(x0, G + 1, z0, x1, topY, z1, BRICK);
  s.fill(x0 + 1, G + 1, z0 + 1, x1 - 1, topY - 1, z1 - 1, AIR);

  const stairX = x0 + 2;
  const stairZ = z0 + 2;
  // Intermediate floors every 8 blocks
  for (let fy = G + 8; fy < topY; fy += 8) {
    floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, fy, stairX, stairZ, PLANKS);
    s.set(x1 - 2, fy + 1, z1 - 2, LANTERN);
    // Windows
    s.set(cx, fy + 2, z0, GLASS);
    s.set(cx, fy + 2, z1, GLASS);
    s.set(x0, fy + 2, cz, GLASS);
    s.set(x1, fy + 2, cz, GLASS);
  }
  spiralStair(s, stairX, stairZ, G + 1, topY, COBBLESTONE, STONE);
  floorWithStairHole(s, x0 + 1, z0 + 1, x1 - 1, z1 - 1, topY, stairX, stairZ, STONE);
  s.set(cx, topY + 1, cz, GLOWSTONE);
  // Battlements
  for (let x = x0; x <= x1; x++) {
    if (((x + z0) & 1) === 0) s.set(x, topY + 1, z0, BRICK);
    if (((x + z1) & 1) === 0) s.set(x, topY + 1, z1, BRICK);
  }
  for (let z = z0; z <= z1; z++) {
    if (((x0 + z) & 1) === 0) s.set(x0, topY + 1, z, BRICK);
    if (((x1 + z) & 1) === 0) s.set(x1, topY + 1, z, BRICK);
  }
  // Ground door facing castle center
  const dx = CX - cx;
  const dz = CZ - cz;
  if (Math.abs(dx) > Math.abs(dz)) {
    if (dx > 0) s.fill(x1, G + 1, cz - 1, x1, G + 3, cz + 1, AIR);
    else s.fill(x0, G + 1, cz - 1, x0, G + 3, cz + 1, AIR);
  } else {
    if (dz > 0) s.fill(cx - 1, G + 1, z1, cx + 1, G + 3, z1, AIR);
    else s.fill(cx - 1, G + 1, z0, cx + 1, G + 3, z0, AIR);
  }
}

/**
 * Straight sky bridge from (x0,z0) to (x1,z1) at height y.
 * Deck is 3 wide with rails; support pillars every 6 blocks.
 */
function skyBridge(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  width = 1,
): void {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const steps = Math.max(Math.abs(dx), Math.abs(dz), 1);
  const sx = dx / steps;
  const sz = dz / steps;
  // Perpendicular for width
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len;
  const pz = dx / len;

  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + sx * i);
    const z = Math.round(z0 + sz * i);
    for (let w = -width; w <= width; w++) {
      const wx = Math.round(x + px * w);
      const wz = Math.round(z + pz * w);
      s.set(wx, y, wz, i % 3 === 0 ? STONE : PLANKS);
      s.fill(wx, y + 1, wz, wx, y + 3, wz, AIR);
      if (Math.abs(w) === width) {
        s.set(wx, y + 1, wz, COBBLE_WALL);
      }
    }
    // Pillars
    if (i > 0 && i < steps && i % 6 === 0) {
      const px0 = Math.round(x + px * width);
      const pz0 = Math.round(z + pz * width);
      const px1 = Math.round(x - px * width);
      const pz1 = Math.round(z - pz * width);
      s.fill(px0, G + 1, pz0, px0, y - 1, pz0, STONE);
      s.fill(px1, G + 1, pz1, px1, y - 1, pz1, STONE);
    }
    // Lanterns
    if (i % 8 === 0) {
      s.set(x, y + 1, z, LANTERN);
    }
  }
}

/** Open a door in a tower wall at (cx,cz) facing toward (tx,tz) at height y. */
function towerDock(
  s: CitadelStamp,
  t: SkyTower,
  towardX: number,
  towardZ: number,
  y: number,
): void {
  const dx = towardX - t.cx;
  const dz = towardZ - t.cz;
  const half = t.half;
  if (y >= t.topY) return;
  if (Math.abs(dx) > Math.abs(dz)) {
    const faceX = dx > 0 ? t.cx + half : t.cx - half;
    s.fill(faceX, y + 1, t.cz - 1, faceX, y + 3, t.cz + 1, AIR);
    // Landing pad just outside
    const out = dx > 0 ? faceX + 1 : faceX - 1;
    s.fill(out, y, t.cz - 1, out, y, t.cz + 1, STONE);
  } else {
    const faceZ = dz > 0 ? t.cz + half : t.cz - half;
    s.fill(t.cx - 1, y + 1, faceZ, t.cx + 1, y + 3, faceZ, AIR);
    const out = dz > 0 ? faceZ + 1 : faceZ - 1;
    s.fill(t.cx - 1, y, out, t.cx + 1, y, out, STONE);
  }
}

/** Dock onto outer wall-walk at nearest wall face. */
function wallDock(s: CitadelStamp, x: number, z: number, y: number): void {
  // Snap to nearest outer wall face
  const dist = [
    { face: 'w' as const, d: Math.abs(x - X0), px: X0, pz: z },
    { face: 'e' as const, d: Math.abs(x - X1), px: X1, pz: z },
    { face: 's' as const, d: Math.abs(z - Z0), px: x, pz: Z0 },
    { face: 'n' as const, d: Math.abs(z - Z1), px: x, pz: Z1 },
  ].sort((a, b) => a.d - b.d)[0];

  const deckY = Math.min(y, WALK_Y);
  if (dist.face === 'w' || dist.face === 'e') {
    s.fill(dist.px - 1, deckY, dist.pz - 2, dist.px + 1, deckY, dist.pz + 2, STONE);
    s.fill(dist.px, deckY + 1, dist.pz - 1, dist.px, deckY + 3, dist.pz + 1, AIR);
  } else {
    s.fill(dist.px - 2, deckY, dist.pz - 1, dist.px + 2, deckY, dist.pz + 1, STONE);
    s.fill(dist.px - 1, deckY + 1, dist.pz, dist.px + 1, deckY + 3, dist.pz, AIR);
  }
}

/** Keep mid-height balcony docks for bridges into the keep mass. */
function keepDock(s: CitadelStamp, x: number, _z: number, y: number): void {
  // Prefer south face of keep for approach drama
  const dockY = y;
  if (dockY > FLOOR.roof) return;
  s.fill(x - 2, dockY, KZ0 - 2, x + 2, dockY, KZ0 - 1, STONE);
  s.fill(x - 1, dockY + 1, KZ0, x + 1, dockY + 3, KZ0, AIR);
  for (const bx of [x - 2, x + 2]) s.set(bx, dockY + 1, KZ0 - 2, COBBLE_WALL);
}

export function buildSkyTowers(s: CitadelStamp): void {
  for (const t of SKY_TOWERS) towerFoot(s, t);
}

/**
 * Multi-level bridge network:
 * - Ring bridges between adjacent sky towers at several heights
 * - Spokes from cardinal towers into outer wall docks
 * - High spokes from mid towers toward the keep face
 */
export function buildSkyBridges(s: CitadelStamp): void {
  const byId = Object.fromEntries(SKY_TOWERS.map((t) => [t.id, t]));

  // Ring connections (each pair)
  const ring: Array<[string, string]> = [
    ['sw', 'south'],
    ['south', 'se'],
    ['se', 'east'],
    ['east', 'ne'],
    ['ne', 'north'],
    ['north', 'nw'],
    ['nw', 'west'],
    ['west', 'sw'],
    // Mid anchors
    ['ssw', 'south'],
    ['sse', 'south'],
    ['ssw', 'sw'],
    ['sse', 'se'],
    ['ene', 'east'],
    ['ese', 'east'],
    ['ene', 'ne'],
    ['ese', 'se'],
  ];

  for (const [a, b] of ring) {
    const ta = byId[a];
    const tb = byId[b];
    if (!ta || !tb) continue;
    for (const y of BRIDGE_LEVELS) {
      if (y >= ta.topY - 2 || y >= tb.topY - 2) continue;
      skyBridge(s, ta.cx, ta.cz, tb.cx, tb.cz, y, 1);
      towerDock(s, ta, tb.cx, tb.cz, y);
      towerDock(s, tb, ta.cx, ta.cz, y);
    }
  }

  // Cardinals → outer wall
  const wallSpokes: Array<[string, number, number]> = [
    ['south', CX, Z0 - 2],
    ['north', CX, Z1 + 2],
    ['west', X0 - 2, CZ],
    ['east', X1 + 2, CZ],
  ];
  for (const [id, wx, wz] of wallSpokes) {
    const t = byId[id];
    if (!t) continue;
    for (const y of [BRIDGE_LEVELS[0], BRIDGE_LEVELS[1], WALK_Y]) {
      if (y >= t.topY - 2) continue;
      skyBridge(s, t.cx, t.cz, wx, wz, y, 1);
      towerDock(s, t, wx, wz, y);
      wallDock(s, wx, wz, y);
    }
  }

  // High bridges from south cluster toward keep entrance face
  for (const id of ['south', 'sse', 'ssw'] as const) {
    const t = byId[id];
    if (!t) continue;
    const keepX = KCX;
    const keepZ = KZ0 - 3;
    for (const y of [BRIDGE_LEVELS[1], BRIDGE_LEVELS[2], FLOOR.gallery, FLOOR.throne]) {
      if (y >= t.topY - 2 || y >= FLOOR.roof) continue;
      skyBridge(s, t.cx, t.cz, keepX, keepZ, y, 1);
      towerDock(s, t, keepX, keepZ, y);
      keepDock(s, keepX, keepZ, y);
    }
  }

  // Cross-landscape elevated road: west tower ↔ east tower (high)
  {
    const tw = byId.west;
    const te = byId.east;
    if (tw && te) {
      const y = BRIDGE_LEVELS[2];
      skyBridge(s, tw.cx, tw.cz, te.cx, te.cz, y, 1);
      towerDock(s, tw, te.cx, te.cz, y);
      towerDock(s, te, tw.cx, tw.cz, y);
    }
  }

  // Decorative hanging banners on a few bridge midpoints (fence posts)
  for (const t of [byId.south, byId.east]) {
    if (!t) continue;
    s.set(t.cx, G + 20, t.cz + t.half + 2, OAK_FENCE);
    s.set(t.cx, G + 21, t.cz + t.half + 2, WOOD);
  }
}

export function buildSkyways(s: CitadelStamp): void {
  buildSkyTowers(s);
  buildSkyBridges(s);
}
