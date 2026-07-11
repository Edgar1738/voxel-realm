import {
  AIR,
  STONE,
  COBBLESTONE,
  BRICK,
  PLANKS,
  GLASS,
  GRAVEL,
  SAND,
  DEEPSLATE,
  TERRACOTTA,
  LANTERN,
  GLOWSTONE,
  CRYSTAL,
  BOOKSHELF,
  FURNACE,
  OAK_FENCE,
  COBBLE_WALL,
  STONEBRICK_WALL,
  STAIRS_STONE,
  STAIRS_COBBLE,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
import { ASHEN, ASHEN_ROAD, ashenSurfaceAt } from './EmberSpireGenerator';
import { deadTree, obelisk } from './wildsPrefabs';
import {
  buildArrivalTunnel,
  buildCraterGate,
  buildGateDistrict,
} from './emberSpireDistrict';
import { buildEmberSpireM2, buildCeremonialApproach } from './emberSpireTower';
import {
  buildCliffMonastery,
  buildDrownedRuins,
  buildAshMinesM2,
  buildCliffEmbeddedRuin,
} from './emberSpireSecondaries';
import type { Overlay } from './Generator';
import type { Prefab } from '../core/Prefab';
import type { WorldSeed } from '../core/types';
import { SEA_LEVEL } from '../core/constants';

// ── Frame ──────────────────────────────────────────────────────────────────────────────────────
const VY = ASHEN.village.benchY; // 68 — district deck level
const SHORE = ASHEN.shoreY; // 63

/** Stamp a prefab (min-corner) with orientation state preserved. */
function stampPrefab(s: CitadelStamp, p: Prefab, ox: number, oy: number, oz: number): void {
  for (const b of p.blocks) {
    const id = b[3];
    if (id === AIR) continue;
    const state = b.length === 5 ? b[4] : 0;
    s.set(ox + b[0], oy + b[1], oz + b[2], id, state);
  }
}

// ── Plaza flagstones (overlaid under Gate District avenues) ────────────────────────────────────
const PLAZA = { x0: -10, z0: -14, x1: 26, z1: 18 } as const;

function pavePlaza(s: CitadelStamp): void {
  s.fill(PLAZA.x0, VY - 1, PLAZA.z0, PLAZA.x1, VY - 1, PLAZA.z1, DEEPSLATE);
  const ax = Math.max(PLAZA.x0, s.wx0);
  const bx = Math.min(PLAZA.x1, s.wx1);
  const az = Math.max(PLAZA.z0, s.wz0);
  const bz = Math.min(PLAZA.z1, s.wz1);
  for (let wz = az; wz <= bz; wz++) {
    for (let wx = ax; wx <= bx; wx++) {
      const r = hash2(wx, wz, 0xa51);
      s.set(wx, VY, wz, r < 0.18 ? BRICK : r < 0.32 ? TERRACOTTA : r < 0.4 ? STONE : COBBLESTONE);
    }
  }
}

// ── Ember path: plaza → shore → fissure bridge → rim climb → observatory ───────────────────────
function distToRoad(wx: number, wz: number): { dist: number; t: number } {
  let best = Infinity;
  let bestT = 0;
  let acc = 0;
  for (let i = 0; i < ASHEN_ROAD.length - 1; i++) {
    const a = ASHEN_ROAD[i];
    const b = ASHEN_ROAD[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2) || 1;
    let u = ((wx - a.x) * dx + (wz - a.z) * dz) / len2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = a.x + dx * u;
    const pz = a.z + dz * u;
    const d = Math.hypot(wx - px, wz - pz);
    if (d < best) {
      best = d;
      bestT = acc + u * len;
    }
    acc += len;
  }
  return { dist: best, t: bestT };
}

function paveRoad(s: CitadelStamp, seed: WorldSeed): void {
  for (let wz = s.wz0; wz <= s.wz1; wz++) {
    for (let wx = s.wx0; wx <= s.wx1; wx++) {
      const { dist } = distToRoad(wx, wz);
      const width = 2.2 + hash2(wx, wz, 0x70ad) * 0.7;
      if (dist > width) continue;
      const h = ashenSurfaceAt(seed, wx, wz);
      // Don't pave underwater or deep in the fissure.
      if (h < SHORE - 1) continue;
      const m = hash2(wx, wz, 0x9a7e);
      s.set(wx, h, wz, m < 0.45 ? COBBLESTONE : m < 0.75 ? GRAVEL : BRICK);
      // Clear headroom along the road (cut overhangs / tree stumps).
      s.fill(wx, h + 1, wz, wx, h + 3, wz, AIR);
      // Occasional lantern posts along the edge.
      if (dist > width - 0.55 && dist <= width && hash2(wx, wz, 0x1a77) < 0.045) {
        s.set(wx, h + 1, wz, COBBLE_WALL);
        s.set(wx, h + 2, wz, LANTERN);
      }
    }
  }
}

/**
 * Place stairs on road segments that climb more than one block so foot traversal stays reliable
 * without flying the rim approach.
 */
function stairRoadClimbs(s: CitadelStamp, seed: WorldSeed): void {
  for (let i = 0; i < ASHEN_ROAD.length - 1; i++) {
    const a = ASHEN_ROAD[i];
    const b = ASHEN_ROAD[i + 1];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z), 1);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const wx = Math.round(a.x + (b.x - a.x) * t);
      const wz = Math.round(a.z + (b.z - a.z) * t);
      if (wx < s.wx0 || wx > s.wx1 || wz < s.wz0 || wz > s.wz1) continue;
      const h = ashenSurfaceAt(seed, wx, wz);
      const hNext = ashenSurfaceAt(
        seed,
        Math.round(a.x + (b.x - a.x) * Math.min(1, (k + 1) / steps)),
        Math.round(a.z + (b.z - a.z) * Math.min(1, (k + 1) / steps)),
      );
      if (hNext > h) {
        // Climbing toward +z or +x of the segment — face stairs uphill.
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const face =
          Math.abs(dx) > Math.abs(dz)
            ? dx > 0
              ? FACING.E
              : FACING.W
            : dz > 0
              ? FACING.S
              : FACING.N;
        s.set(wx, h, wz, STAIRS_COBBLE, packState(face as 0 | 1 | 2 | 3, 0));
        s.fill(wx, h + 1, wz, wx, h + 3, wz, AIR);
      }
    }
  }
}

// ── Magma fissure + ash bridge ─────────────────────────────────────────────────────────────────
function buildFissureAndBridge(s: CitadelStamp): void {
  const { cx, cz, halfLen, halfW } = ASHEN.fissure;
  // Glowstone "magma" bed + crystal flecks in the trench.
  for (let z = cz - halfLen; z <= cz + halfLen; z++) {
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      const edge =
        Math.max(Math.abs(x - cx) / halfW, Math.abs(z - cz) / halfLen);
      const bedY = SHORE - 6 - Math.floor((1 - edge) * 3);
      for (let y = bedY; y <= SHORE - 3; y++) {
        const r = hash2(x + y, z, 0xf155);
        s.set(x, y, z, r < 0.55 ? GLOWSTONE : r < 0.75 ? CRYSTAL : DEEPSLATE);
      }
      // Steam: occasional crystal "spouts" above the bed.
      if (hash2(x, z, 0x57ea) < 0.08) s.set(x, SHORE - 2, z, CRYSTAL);
    }
  }

  // Stone bridge deck spanning the fissure north–south at shore height + 1.
  const deckY = SHORE + 2;
  const x0 = cx - halfW - 2;
  const x1 = cx + halfW + 2;
  s.fill(x0, deckY, cz - halfLen - 2, x1, deckY, cz + halfLen + 2, STONE);
  // Rails
  for (let z = cz - halfLen - 2; z <= cz + halfLen + 2; z++) {
    s.set(x0, deckY + 1, z, STONEBRICK_WALL);
    s.set(x1, deckY + 1, z, STONEBRICK_WALL);
    if ((z - cz) % 4 === 0) {
      s.set(x0, deckY + 2, z, LANTERN);
      s.set(x1, deckY + 2, z, LANTERN);
    }
  }
  // Support piers into the trench.
  for (const z of [cz - halfLen + 2, cz, cz + halfLen - 2]) {
    s.fill(cx - 1, deckY - 1, z, cx + 1, SHORE - 8, z, DEEPSLATE);
  }
}

// ── Ember vents around the lake ────────────────────────────────────────────────────────────────
const VENTS: ReadonlyArray<{ x: number; z: number; r: number }> = [
  { x: -18, z: 58, r: 4 },
  { x: 28, z: 52, r: 3 },
  { x: -36, z: 88, r: 5 },
  { x: 22, z: 128, r: 4 },
  { x: -8, z: 140, r: 3 },
  { x: 60, z: 100, r: 4 },
];

function buildVents(s: CitadelStamp, seed: WorldSeed): void {
  for (const v of VENTS) {
    for (let dz = -v.r - 1; dz <= v.r + 1; dz++) {
      for (let dx = -v.r - 1; dx <= v.r + 1; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > v.r + 0.6) continue;
        const wx = v.x + dx;
        const wz = v.z + dz;
        const base = ashenSurfaceAt(seed, wx, wz);
        const rise = Math.max(0, Math.floor((1 - d / (v.r + 0.6)) * 4));
        // Cone of gravel/deepslate with glowing heart.
        for (let y = 1; y <= rise; y++) {
          s.set(wx, base + y, wz, y === rise && d < 1.2 ? GLOWSTONE : d < 1 ? DEEPSLATE : GRAVEL);
        }
        if (d < 0.8) {
          s.set(wx, base + rise + 1, wz, CRYSTAL);
          if (hash2(wx, wz, 0x7e17) < 0.5) s.set(wx, base + rise + 2, wz, GLOWSTONE);
        }
      }
    }
  }
}

// ── Shore dock ─────────────────────────────────────────────────────────────────────────────────
function buildShoreDock(s: CitadelStamp, seed: WorldSeed): void {
  // Cobble jetty on the north shore looking into the crater lake / Ember Spire.
  // Seat every column on the real surface so we never bury the deck under sand.
  const z0 = 48;
  const z1 = 60;
  const x = 8;
  for (let z = z0 - 4; z <= z1; z++) {
    for (let dx = -3; dx <= 3; dx++) {
      const wx = x + dx;
      const h = ashenSurfaceAt(seed, wx, z);
      const deck = Math.max(h, SHORE);
      // Clear headroom, pave deck, carry stilts down.
      s.fill(wx, deck + 1, z, wx, deck + 4, z, AIR);
      s.set(wx, deck, z, Math.abs(dx) <= 1 && z >= z0 ? COBBLESTONE : GRAVEL);
      s.fill(wx, deck - 1, z, wx, deck - 10, z, DEEPSLATE);
      if (Math.abs(dx) === 1 && z >= z0) s.set(wx, deck + 1, z, OAK_FENCE);
    }
  }
  const hEnd = Math.max(ashenSurfaceAt(seed, x, z1), SHORE);
  const hStart = Math.max(ashenSurfaceAt(seed, x, z0), SHORE);
  s.set(x, hEnd + 1, z1, LANTERN);
  s.set(x, hStart + 1, z0, LANTERN);
  // Steps from village bench down toward the dock along the vista corridor.
  for (let i = 0; i <= VY - SHORE + 2; i++) {
    const z = 38 + i;
    const y = VY - Math.min(i, VY - SHORE);
    s.fill(x - 1, y + 1, z, x + 1, y + 6, z, AIR);
    s.set(x, y, z, STAIRS_COBBLE, packState(FACING.S, 0));
    s.fill(x - 1, y - 1, z, x + 1, y - 8, z, COBBLESTONE);
  }
  // Vista-corridor lanterns at player height — atmospheric path markers, not aerial clutter.
  for (const z of [20, 28, 36, 44]) {
    s.set(x - 2, VY + 1, z, COBBLE_WALL);
    s.set(x - 2, VY + 2, z, LANTERN);
    s.set(x + 2, VY + 1, z, COBBLE_WALL);
    s.set(x + 2, VY + 2, z, LANTERN);
  }
}

/**
 * Caldera overlook at the south lip of the plaza: low parapet + framed opening that makes the
 * first southward view intentional (spire through a stone window) rather than accidental.
 */
function buildCalderaOverlook(s: CitadelStamp): void {
  const z = 20;
  const y = VY;
  // Retaining wall band with a 5-wide viewing gap on the vista corridor.
  for (let x = -6; x <= 22; x++) {
    if (x >= 5 && x <= 11) continue; // open vista
    s.fill(x, y + 1, z, x, y + 2, z, DEEPSLATE);
    if ((x + 6) % 4 === 0) s.set(x, y + 3, z, LANTERN);
  }
  // Paved overlook apron.
  s.fill(4, y, z - 2, 12, y, z + 1, STONE);
  // Two framing pillars either side of the gap — composition anchors at player height.
  for (const x of [4, 12]) {
    s.fill(x, y + 1, z, x, y + 5, z + 1, DEEPSLATE);
    s.set(x, y + 6, z, GLOWSTONE);
  }
  // Low wall seat on the gap edges.
  s.set(5, y + 1, z, STONEBRICK_WALL);
  s.set(11, y + 1, z, STONEBRICK_WALL);
}

/**
 * Walkable causeway: dock → Ember Spire island. Hero is reachable on foot (swim optional, not
 * required). Deck sits one block above sea level with rail lanterns and a glow strip below.
 */
function buildSpireCauseway(s: CitadelStamp, seed: WorldSeed): void {
  // From north-shore dock tip (8, 62) into the island north door (0, ~88).
  const x0 = 8;
  const z0 = 62;
  const x1 = 0;
  const z1 = 88;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0), 1);
  const deckY = SEA_LEVEL + 1; // 63 — above water, matches shore
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cz = Math.round(z0 + (z1 - z0) * t);
    // 3-wide deck.
    for (let dx = -1; dx <= 1; dx++) {
      // Perpendicular to path (mostly +z travel, offset on x).
      const wx = cx + dx;
      const wz = cz;
      s.fill(wx, deckY + 1, wz, wx, deckY + 3, wz, AIR);
      s.set(wx, deckY, wz, dx === 0 ? STONE : COBBLESTONE);
      // Piers into the lake bed.
      s.fill(wx, deckY - 1, wz, wx, SEA_LEVEL - 8, wz, DEEPSLATE);
      // Ember glow under the deck (visible from the side at player height).
      if (dx === 0 && i % 3 === 0) s.set(wx, SEA_LEVEL - 1, wz, GLOWSTONE);
    }
    // Rails + lanterns.
    s.set(cx - 1, deckY + 1, cz, STONEBRICK_WALL);
    s.set(cx + 1, deckY + 1, cz, STONEBRICK_WALL);
    if (i % 5 === 0) {
      s.set(cx - 1, deckY + 2, cz, LANTERN);
      s.set(cx + 1, deckY + 2, cz, LANTERN);
    }
  }
  // Island landing pad north of the spire door — rocky apron so the tower is framed by ground.
  const icx = ASHEN.spireIsland.cx;
  const icz = ASHEN.spireIsland.cz;
  const baseY = Math.max(ashenSurfaceAt(seed, icx, icz), ASHEN.spireIsland.topY - 1);
  for (let dz = -10; dz <= -4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dz * dz > 100) continue;
      const wx = icx + dx;
      const wz = icz + dz;
      s.fill(wx, SEA_LEVEL - 4, wz, wx, baseY, wz, DEEPSLATE);
      s.set(wx, baseY, wz, Math.abs(dx) + Math.abs(dz) > 5 ? GRAVEL : STONE);
      s.fill(wx, baseY + 1, wz, wx, baseY + 3, wz, AIR);
    }
  }
  // Ember crystals along the landing edge — atmospheric detail at foot level.
  for (const [dx, dz] of [
    [-3, -8],
    [3, -8],
    [-2, -6],
    [2, -6],
    [0, -9],
  ] as const) {
    s.set(icx + dx, baseY + 1, icz + dz, CRYSTAL);
  }
}

// ── Observatory on the west rim ────────────────────────────────────────────────────────────────
function buildObservatory(s: CitadelStamp, seed: WorldSeed): void {
  const { cx, cz, y } = ASHEN.observatory;
  const floorY = Math.max(y - 2, ashenSurfaceAt(seed, cx, cz));

  // Circular basalt plinth.
  for (let dz = -8; dz <= 8; dz++) {
    for (let dx = -8; dx <= 8; dx++) {
      if (dx * dx + dz * dz > 64) continue;
      s.fill(cx + dx, floorY - 12, cz + dz, cx + dx, floorY, cz + dz, DEEPSLATE);
      s.set(cx + dx, floorY, cz + dz, STONE);
    }
  }

  // Tower drum.
  const r = 5;
  const wallTop = floorY + 14;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r || d2 < (r - 1) * (r - 1)) continue;
      s.fill(cx + dx, floorY + 1, cz + dz, cx + dx, wallTop, cz + dz, DEEPSLATE);
    }
  }
  // Interior floors + spiral.
  s.slab(cx - r + 1, cz - r + 1, cx + r - 1, cz + r - 1, floorY + 1, PLANKS);
  s.slab(cx - r + 1, cz - r + 1, cx + r - 1, cz + r - 1, floorY + 8, PLANKS);
  // Clear spiral shaft then build it.
  s.fill(cx - 1, floorY + 2, cz - 1, cx + 1, wallTop, cz + 1, AIR);
  spiralStair(s, cx, cz, floorY + 2, wallTop, STAIRS_STONE, DEEPSLATE);

  // Door facing east (toward the caldera).
  s.fill(cx + r, floorY + 1, cz, cx + r, floorY + 3, cz, AIR);
  s.set(cx + r - 1, floorY + 2, cz - 2, LANTERN);

  // Windows
  for (const [dx, dz] of [
    [0, -r],
    [0, r],
    [-r, 0],
  ] as const) {
    s.set(cx + dx, floorY + 5, cz + dz, GLASS);
    s.set(cx + dx, floorY + 11, cz + dz, GLASS);
  }

  // Glass + crystal dome with glowstone beacon.
  for (let dy = 0; dy <= 5; dy++) {
    const rr = r - Math.floor(dy * 0.7);
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr || d2 < (rr - 1) * (rr - 1)) continue;
        s.set(cx + dx, wallTop + 1 + dy, cz + dz, dy < 3 ? GLASS : CRYSTAL);
      }
    }
  }
  s.set(cx, wallTop + 7, cz, GLOWSTONE);
  s.set(cx, wallTop + 8, cz, GLOWSTONE);

  // Study clutter.
  s.set(cx - 3, floorY + 2, cz - 3, BOOKSHELF);
  s.set(cx - 3, floorY + 2, cz - 2, BOOKSHELF);
  s.set(cx + 3, floorY + 2, cz + 3, FURNACE);
  s.set(cx - 2, floorY + 9, cz + 2, LANTERN);

  // Approach stairs from the road (east of the knoll).
  for (let i = 0; i < 10; i++) {
    const x = cx + r + 2 + i;
    const z = cz;
    const y = floorY - i;
    s.fill(x, y + 1, z - 1, x, y + 5, z + 1, AIR);
    s.set(x, y, z, STAIRS_STONE, packState(FACING.W, 0));
    s.fill(x, y - 1, z - 1, x, y - 8, z + 1, DEEPSLATE);
  }

  // Rim parapet ring around the plinth.
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(ang) * 8);
    const pz = Math.round(cz + Math.sin(ang) * 8);
    s.set(px, floorY + 1, pz, STONEBRICK_WALL);
    if (a % 4 === 0) s.set(px, floorY + 2, pz, LANTERN);
  }
}

// ── Sparse outer wilds only (no random scatter in the district) ────────────────────────────────
function buildWilds(s: CitadelStamp, seed: WorldSeed): void {
  stampPrefab(s, obelisk(), 8, ashenSurfaceAt(seed, 8, 160) + 1, 160);
  // Few dead trees only outside the rim — intentional markers, not scatter fill.
  for (const [tx, tz] of [
    [-120, 40],
    [110, 80],
    [-30, 190],
  ] as const) {
    const h = ashenSurfaceAt(seed, tx, tz);
    if (h < SHORE + 2) continue;
    stampPrefab(s, deadTree(), tx, h + 1, tz);
  }
}

// ── Dockside sandbar & lake edge polish ────────────────────────────────────────────────────────
function polishShore(s: CitadelStamp): void {
  // Occasional sand/gravel scatter on the beach ring so it isn't uniform.
  for (let wz = s.wz0; wz <= s.wz1; wz++) {
    for (let wx = s.wx0; wx <= s.wx1; wx++) {
      const dx = (wx - ASHEN.caldera.cx) / 1.08;
      const dz = (wz - ASHEN.caldera.cz) / 0.96;
      const d = Math.hypot(dx, dz);
      if (d < ASHEN.lake.r || d > ASHEN.lake.r + ASHEN.beachWidth) continue;
      if (hash2(wx, wz, 0xbc11) < 0.12) s.set(wx, SHORE, wz, GRAVEL);
      else if (hash2(wx, wz, 0x5a0d) < 0.08) s.set(wx, SHORE, wz, SAND);
    }
  }
}

/**
 * Ember Spire site overlay (Milestone 2):
 * Arrival tunnel → Crater Gate → Gate District → lakefront → ceremonial causeway →
 * Ember Spire (full climb) + secondaries (monastery, drowned ruins, ash mines, cliff ruin).
 */
export function emberSpireSite(): Overlay {
  return (chunk, cx, cz, seed) => {
    const s = new CitadelStamp(chunk, cx, cz);
    buildArrivalTunnel(s);
    buildCraterGate(s);
    buildGateDistrict(s, seed);
    pavePlaza(s);
    buildCalderaOverlook(s);
    paveRoad(s, seed);
    stairRoadClimbs(s, seed);
    buildFissureAndBridge(s);
    buildVents(s, seed);
    buildShoreDock(s, seed);
    buildCeremonialApproach(s, seed);
    buildSpireCauseway(s, seed);
    buildEmberSpireM2(s, seed);
    buildObservatory(s, seed);
    buildAshMinesM2(s, seed);
    buildCliffMonastery(s, seed);
    buildDrownedRuins(s, seed);
    buildCliffEmbeddedRuin(s, seed);
    buildWilds(s, seed);
    polishShore(s);
  };
}
