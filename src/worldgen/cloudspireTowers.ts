import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  SLATE,
  PLANKS,
  LANTERN,
  GLOWSTONE,
  BOOKSHELF,
  DEEPSLATE,
  GOLD_TRIM,
} from '../blocks/blocks';
import { CitadelStamp } from './CitadelStamp';
import { G, GP, CX, CZ, X0, X1, Z0, Z1, KEEP, FLOOR } from './cloudspireFrame';
import {
  hollowTower,
  steepRoof,
  pinnacle,
  spiralStair,
  balconyRing,
  pointedWindow,
} from './cloudspirePrimitives';

interface TowerSpec {
  x: number;
  z: number;
  half: number;
  baseY: number;
  height: number;
  tier: 'A' | 'B' | 'C';
  role: string;
}

const TOWERS: TowerSpec[] = [
  // Major visible secondary towers
  { x: -55, z: 35, half: 7, baseY: GP, height: 90, tier: 'A', role: 'wizard' },
  { x: 58, z: 40, half: 6, baseY: GP, height: 75, tier: 'A', role: 'archive' },
  { x: -48, z: -40, half: 6, baseY: GP, height: 70, tier: 'B', role: 'garden-tower' },
  { x: 50, z: -45, half: 5, baseY: GP, height: 65, tier: 'B', role: 'watch' },
  { x: -90, z: 0, half: 5, baseY: G, height: 55, tier: 'B', role: 'wall-west' },
  { x: 90, z: 10, half: 5, baseY: G, height: 58, tier: 'B', role: 'wall-east' },
  { x: 0, z: 95, half: 6, baseY: G, height: 80, tier: 'B', role: 'north-watch' },
  { x: -30, z: 70, half: 4, baseY: GP, height: 50, tier: 'B', role: 'royal' },
  // Distant silhouette towers (Tier C)
  { x: -140, z: -60, half: 4, baseY: G - 10, height: 100, tier: 'C', role: 'distant-sw' },
  { x: 150, z: 40, half: 5, baseY: G - 8, height: 110, tier: 'C', role: 'distant-e' },
  { x: -20, z: -160, half: 3, baseY: G + 15, height: 70, tier: 'C', role: 'distant-s' },
  { x: 100, z: -120, half: 4, baseY: G, height: 85, tier: 'C', role: 'distant-se' },
];

export function buildSecondaryTowers(s: CitadelStamp): void {
  for (const t of TOWERS) {
    const top = t.baseY + t.height;
    hollowTower(s, t.x, t.z, t.half, t.baseY + 1, top, LIMESTONE, true);
    steepRoof(s, t.x, t.z, t.half + 1, top + 1, SLATE);
    pinnacle(s, t.x, top + t.half + 2, t.z, 6 + (t.tier === 'A' ? 4 : 0));

    if (t.tier === 'C') continue;

    // Floors every 10
    for (let y = t.baseY + 10; y < top - 5; y += 10) {
      s.slab(t.x - t.half + 1, t.z - t.half + 1, t.x + t.half - 1, t.z + t.half - 1, y, PLANKS);
      s.set(t.x, y + 1, t.z, LANTERN);
    }
    spiralStair(s, t.x + Math.max(1, t.half - 2), t.z, t.baseY + 2, top - 2, PLANKS, DEEPSLATE);
    // Door
    s.fill(t.x - 1, t.baseY + 2, t.z - t.half, t.x + 1, t.baseY + 4, t.z - t.half, AIR);

    if (t.tier === 'A') {
      balconyRing(s, t.x, t.z, t.half, top - 8, LIMESTONE);
      for (let y = t.baseY + 8; y < top - 10; y += 12) {
        pointedWindow(s, t.x - t.half, y, t.z, 5, 'x');
        pointedWindow(s, t.x + t.half, y, t.z, 5, 'x');
      }
      if (t.role === 'wizard') {
        s.set(t.x, top - 6, t.z, GLOWSTONE);
        s.set(t.x, top - 5, t.z, GOLD_TRIM);
      }
      if (t.role === 'archive') {
        for (let y = t.baseY + 12; y < top - 15; y += 10) {
          for (const dx of [-2, 2]) {
            s.fill(t.x + dx, y + 1, t.z - 2, t.x + dx, y + 3, t.z + 2, BOOKSHELF);
          }
        }
      }
    }
  }

  // Corner pinnacles on palace for skyline
  for (const [x, z] of [
    [KEEP.x0 - 2, KEEP.z0 - 2],
    [KEEP.x1 + 2, KEEP.z0 - 2],
    [KEEP.x0 - 2, KEEP.z1 + 2],
    [KEEP.x1 + 2, KEEP.z1 + 2],
  ] as const) {
    hollowTower(s, x, z, 3, FLOOR.roof - 20, FLOOR.roof + 25, LIMESTONE, true);
    steepRoof(s, x, z, 4, FLOOR.roof + 26, SLATE);
  }

  void CX;
  void CZ;
  void X0;
  void X1;
  void Z0;
  void Z1;
  void CARVED_LIMESTONE;
}

export { TOWERS };
