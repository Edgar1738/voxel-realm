import {
  AIR,
  COBBLESTONE,
  GRAVEL,
  STONE,
  PLANKS,
  WOOD,
  OAK_FENCE,
  LANTERN,
  COBBLE_WALL,
  GLOWSTONE,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { superellipseT, polylineProject } from './fields';
import {
  stonehavenRoad,
  stonehavenSurfaceAt,
  STONEHAVEN_SITES,
  STONEHAVEN_STREAM,
} from './StonehavenGenerator';
import type { Overlay } from './Generator';
import type { WorldSeed } from '../core/types';

/**
 * The Stonehaven site overlay — the Milestone 3 composition anchors, stamped on ground the
 * terrain generator already shaped to receive them (aprons, the bridge gap, the graded road):
 * village plaza + harbor quay (arrival), the stone bridge over the stream gorge (midpoint),
 * fortress massing on the crag (destination), and two framed road pullouts (glimpses between).
 * Massing only — big readable silhouettes, no interior architecture yet.
 */

/** True when a feature's world-space bounding box touches this chunk (cheap whole-feature cull). */
function overlaps(s: CitadelStamp, x0: number, z0: number, x1: number, z1: number): boolean {
  return x1 >= s.wx0 && x0 <= s.wx1 && z1 >= s.wz0 && z0 <= s.wz1;
}

/** True when a column belongs to this chunk — guards per-column surface evaluations. */
function owned(s: CitadelStamp, wx: number, wz: number): boolean {
  return wx >= s.wx0 && wx <= s.wx1 && wz >= s.wz0 && wz <= s.wz1;
}

/** A wayside lamp: fence post + lantern, seated on the local surface. */
function lampPost(s: CitadelStamp, seed: WorldSeed, wx: number, wz: number): void {
  if (!owned(s, wx, wz)) return;
  const h = stonehavenSurfaceAt(seed, wx, wz);
  s.set(wx, h + 1, wz, OAK_FENCE);
  s.set(wx, h + 2, wz, OAK_FENCE);
  s.set(wx, h + 3, wz, LANTERN);
}

/**
 * The old kingdom road, with a material hierarchy instead of per-column confetti: a worn solid
 * cobble center line, gravel shoulders with sparse cobbles, and a frayed outer edge. The bridge
 * span is skipped — its stone deck (stamped below) carries the road over the gorge.
 */
function paveRoad(s: CitadelStamp, seed: WorldSeed): void {
  const road = stonehavenRoad();
  for (let wz = s.wz0; wz <= s.wz1; wz++) {
    for (let wx = s.wx0; wx <= s.wx1; wx++) {
      const hit = road.project(wx, wz);
      const width = 2.2 + hash2(wx, wz, 0x70ad) * 0.8;
      if (hit.dist > width) continue;
      // Near the gorge the terrain gap opens under the road; the bridge deck carries it there,
      // so ground paving would only land on the gorge walls beneath.
      if (wx > 40 && wz > 60 && wx < 170 && wz < 150) {
        if (polylineProject(wx, wz, STONEHAVEN_STREAM).dist < 7) continue;
      }
      const h = stonehavenSurfaceAt(seed, wx, wz);
      if (hit.dist < 1.3) s.set(wx, h, wz, COBBLESTONE);
      else s.set(wx, h, wz, hash2(wx, wz, 0x9a7e) < 0.8 ? GRAVEL : COBBLESTONE);
    }
  }
}

/** The village plaza: a bordered cobble square at the road's first step, with flanking lamps. */
function buildPlaza(s: CitadelStamp, seed: WorldSeed): void {
  const p = STONEHAVEN_SITES.plaza;
  if (!overlaps(s, p.cx - p.r, p.cz - p.r, p.cx + p.r, p.cz + p.r)) return;
  for (let wz = p.cz - p.r; wz <= p.cz + p.r; wz++) {
    for (let wx = p.cx - p.r; wx <= p.cx + p.r; wx++) {
      if (!owned(s, wx, wz)) continue;
      const d = Math.hypot(wx - p.cx, wz - p.cz);
      if (d > p.r) continue;
      const h = stonehavenSurfaceAt(seed, wx, wz);
      s.set(wx, h, wz, d > p.r - 1.2 ? STONE : COBBLESTONE);
    }
  }
  lampPost(s, seed, p.cx - 5, p.cz + 3);
  lampPost(s, seed, p.cx + 5, p.cz + 3);
}

/**
 * The harbor: a stone quay wall along the apron's waterfront, a bordered esplanade, and a plank
 * pier reaching into the lake on wood pilings, lamplit at its head — the arrival composition the
 * bare shoreline lacked.
 */
function buildHarbor(s: CitadelStamp, seed: WorldSeed): void {
  const hb = STONEHAVEN_SITES.harbor;
  const y = hb.apronY;
  if (!overlaps(s, hb.cx - hb.rx - 1, hb.cz - 8, hb.cx + hb.rx + 1, hb.pier.z1 + 1)) return;

  // Esplanade: pave the level apron; the one-block rim up to the village bench reads as a curb.
  for (let wz = hb.cz - 7; wz <= hb.cz + 7; wz++) {
    for (let wx = hb.cx - hb.rx; wx <= hb.cx + hb.rx; wx++) {
      if (!owned(s, wx, wz)) continue;
      if (superellipseT(wx - hb.cx, wz - hb.cz, hb.rx, hb.rz, 3) > 1) continue;
      const h = stonehavenSurfaceAt(seed, wx, wz);
      if (h === y) s.set(wx, h, wz, STONE);
      else if (h === y + 1) s.set(wx, h, wz, COBBLESTONE);
    }
  }

  // Quay wall: for each column, drop a stone face at the first water-side step past the apron,
  // flush with the deck — a straight built edge instead of a shelving shingle beach.
  for (let wx = hb.cx - 9; wx <= hb.cx + 9; wx++) {
    if (wx < s.wx0 || wx > s.wx1) continue;
    for (let wz = hb.cz + 2; wz <= hb.cz + 8; wz++) {
      const h = stonehavenSurfaceAt(seed, wx, wz);
      if (h < y) {
        if (wz >= s.wz0 && wz <= s.wz1) {
          s.fill(wx, Math.max(h - 1, y - 6), wz, wx, y, wz, STONE);
          if (((wx % 4) + 4) % 4 === 0) s.set(wx, y + 1, wz, OAK_FENCE); // mooring bollards
        }
        break;
      }
    }
  }

  // Pier: a 3-wide plank deck one block above the water, corner pilings sunk to the lakebed,
  // fence railings, and twin lanterns at the head.
  const pier = hb.pier;
  for (let wz = pier.z0; wz <= pier.z1; wz++) {
    for (let wx = pier.x - 1; wx <= pier.x + 1; wx++) s.set(wx, y, wz, PLANKS);
  }
  for (const [px, pz] of [
    [pier.x - 1, pier.z1],
    [pier.x + 1, pier.z1],
    [pier.x - 1, pier.z0 + 5],
    [pier.x + 1, pier.z0 + 5],
  ] as const) {
    if (!owned(s, px, pz)) continue;
    const bed = stonehavenSurfaceAt(seed, px, pz);
    s.fill(px, bed - 1, pz, px, y - 1, pz, WOOD);
  }
  for (let wz = pier.z0 + 2; wz < pier.z1; wz += 3) {
    s.set(pier.x - 1, y + 1, wz, OAK_FENCE);
    s.set(pier.x + 1, y + 1, wz, OAK_FENCE);
  }
  s.set(pier.x - 1, y + 1, pier.z1, OAK_FENCE);
  s.set(pier.x + 1, y + 1, pier.z1, OAK_FENCE);
  s.set(pier.x - 1, y + 2, pier.z1, LANTERN);
  s.set(pier.x + 1, y + 2, pier.z1, LANTERN);
}

/**
 * The stone bridge: a deck flush with the graded road at both ends, cobble-wall parapets, and
 * headwall abutments seated on the gorge floor — the stream passes beneath through the open span.
 */
function buildBridge(s: CitadelStamp, seed: WorldSeed): void {
  const b = STONEHAVEN_SITES.bridge;
  if (!overlaps(s, b.x0, b.z0, b.x1, b.z1)) return;
  s.slab(b.x0, b.z0, b.x1, b.z1, b.deckY, STONE);
  s.fill(b.x0, b.deckY + 1, b.z0, b.x0, b.deckY + 1, b.z1, COBBLE_WALL);
  s.fill(b.x1, b.deckY + 1, b.z0, b.x1, b.deckY + 1, b.z1, COBBLE_WALL);
  for (const wz of [b.z0, b.z0 + 1, b.z1 - 1, b.z1]) {
    for (let wx = b.x0; wx <= b.x1; wx++) {
      if (!owned(s, wx, wz)) continue;
      const bed = stonehavenSurfaceAt(seed, wx, wz);
      if (bed < b.deckY) s.fill(wx, bed - 1, wz, wx, b.deckY - 1, wz, STONE);
    }
  }
}

/**
 * Fortress massing on the crag: curtain wall with merlons, three corner bastions, a lamplit twin-
 * tower gatehouse over the road, the keep block + beacon turret on the knoll, and a paved ward
 * court where the road arrives. Silhouette-first blockout; interiors come in a later milestone.
 */
function buildFortress(s: CitadelStamp, seed: WorldSeed): void {
  const w = STONEHAVEN_SITES.ward;
  if (!overlaps(s, w.keep.x0 - 3, w.z0 - 3, w.x1 + 3, w.z1 + 3)) return;

  const wallCol = (wx: number, wz: number, topY: number): void => {
    if (!owned(s, wx, wz)) return;
    const h = stonehavenSurfaceAt(seed, wx, wz);
    if (h >= topY) return; // the knoll face outruns the curtain here
    s.fill(wx, h - 1, wz, wx, topY, wz, STONE);
    if ((((wx + wz) % 2) + 2) % 2 === 0) s.set(wx, topY + 1, wz, STONE); // merlon
  };
  const inGate = (wx: number): boolean => wx >= w.gate.x0 && wx <= w.gate.x1;
  for (let wx = w.x0; wx <= w.x1; wx++) {
    wallCol(wx, w.z0, w.wallTopY);
    if (!inGate(wx)) wallCol(wx, w.z1, w.wallTopY);
  }
  for (let wz = w.z0 + 1; wz <= w.z1 - 1; wz++) {
    wallCol(w.x0, wz, w.wallTopY);
    wallCol(w.x1, wz, w.wallTopY);
  }

  // Corner bastions (the keep holds the northwest corner itself).
  for (const [bx, bz] of [
    [w.x1, w.z0],
    [w.x1, w.z1],
    [w.x0, w.z1],
  ] as const) {
    for (let wz = bz - 2; wz <= bz + 2; wz++) {
      for (let wx = bx - 2; wx <= bx + 2; wx++) {
        if (!owned(s, wx, wz)) continue;
        const h = stonehavenSurfaceAt(seed, wx, wz);
        s.fill(wx, h - 1, wz, wx, w.towerTopY, wz, STONE);
      }
    }
    s.outline(bx - 2, bz - 2, bx + 2, bz + 2, w.towerTopY + 1, STONE);
  }

  // Gatehouse: twin towers flanking the road, a lintel over the opening, lanterns marking the
  // gate after dark — the "destination glimpse" the journey needed at night.
  const g = w.gate;
  for (const [tx0, tx1] of [
    [g.x0 - 3, g.x0 - 1],
    [g.x1 + 1, g.x1 + 3],
  ] as const) {
    for (let wx = tx0; wx <= tx1; wx++) {
      for (let wz = w.z1 - 1; wz <= w.z1 + 1; wz++) {
        if (!owned(s, wx, wz)) continue;
        const h = stonehavenSurfaceAt(seed, wx, wz);
        s.fill(wx, h - 1, wz, wx, w.wallTopY + 3, wz, STONE);
      }
    }
  }
  s.set(g.x0 - 2, w.wallTopY + 4, w.z1, LANTERN);
  s.set(g.x1 + 2, w.wallTopY + 4, w.z1, LANTERN);
  // Passage: clear headroom over the road surface, then span the opening with a stone lintel
  // up to the wall top so the gate reads as an arch, not a missing tooth.
  for (let wx = g.x0; wx <= g.x1; wx++) {
    if (wx < s.wx0 || wx > s.wx1) continue;
    const h = stonehavenSurfaceAt(seed, wx, g.z);
    for (let wz = g.z - 1; wz <= g.z + 1; wz++) {
      if (wz < s.wz0 || wz > s.wz1) continue;
      for (let wy = h + 1; wy <= h + 3; wy++) s.set(wx, wy, wz, AIR);
    }
    s.fill(wx, h + 4, g.z, wx, w.wallTopY, g.z, STONE);
  }

  // The keep: a solid massing block on the knoll with a crenellated rim, and a lake-facing
  // beacon turret whose lantern is visible from the village across the water.
  const k = w.keep;
  for (let wz = k.z0; wz <= k.z1; wz++) {
    for (let wx = k.x0; wx <= k.x1; wx++) {
      if (!owned(s, wx, wz)) continue;
      const h = stonehavenSurfaceAt(seed, wx, wz);
      s.fill(wx, h - 1, wz, wx, k.topY, wz, STONE);
    }
  }
  s.outline(k.x0, k.z0, k.x1, k.z1, k.topY + 1, STONE);
  const t = w.turret;
  for (let wz = t.z0; wz <= t.z1; wz++) {
    for (let wx = t.x0; wx <= t.x1; wx++) s.fill(wx, k.topY, wz, wx, t.topY, wz, STONE);
  }
  s.outline(t.x0, t.z0, t.x1, t.z1, t.topY + 1, STONE);
  // The beacon: a glowstone fire-basin inside the turret's parapet — a single lantern reads as
  // a two-pixel speck across the lake at night, but this burns visibly from the harbor.
  s.fill(t.x0 + 1, t.topY + 1, t.z0 + 1, t.x0 + 2, t.topY + 1, t.z0 + 2, GLOWSTONE);

  // Ward court: the paved arrival circle at the road's end, with a lit waymark plinth — the
  // climb's payoff is a made place now, not an empty meadow.
  const court = { cx: -58, cz: 132, r: 8 };
  for (let wz = court.cz - court.r; wz <= court.cz + court.r; wz++) {
    for (let wx = court.cx - court.r; wx <= court.cx + court.r; wx++) {
      if (!owned(s, wx, wz)) continue;
      const d = Math.hypot(wx - court.cx, wz - court.cz);
      if (d > court.r) continue;
      const h = stonehavenSurfaceAt(seed, wx, wz);
      s.set(wx, h, wz, d > court.r - 1.2 ? STONE : COBBLESTONE);
    }
  }
  if (owned(s, court.cx, court.cz)) {
    const hC = stonehavenSurfaceAt(seed, court.cx, court.cz);
    s.fill(court.cx - 1, hC + 1, court.cz - 1, court.cx + 1, hC + 1, court.cz + 1, STONE);
    s.set(court.cx, hC + 2, court.cz, LANTERN);
  }
}

/**
 * Road pullouts: a paved half-walled overlook off the road's view side, joined by a short gravel
 * spur — a reason to stop where the composition wants the player to look up and see the fortress.
 */
function buildViewpoints(s: CitadelStamp, seed: WorldSeed): void {
  const road = stonehavenRoad();
  for (const vp of STONEHAVEN_SITES.viewpoints) {
    if (!overlaps(s, vp.x - vp.r - 8, vp.z - vp.r - 8, vp.x + vp.r + 8, vp.z + vp.r + 8)) continue;
    // Outward = away from the road: the parapet wall goes on the view side, the spur on the other.
    const hit = road.project(vp.x, vp.z);
    const foot = road.pointAt(hit.along);
    const olen = Math.max(1e-6, Math.hypot(vp.x - foot.x, vp.z - foot.z));
    const ox = (vp.x - foot.x) / olen;
    const oz = (vp.z - foot.z) / olen;

    for (let wz = vp.z - vp.r; wz <= vp.z + vp.r; wz++) {
      for (let wx = vp.x - vp.r; wx <= vp.x + vp.r; wx++) {
        if (!owned(s, wx, wz)) continue;
        const d = Math.hypot(wx - vp.x, wz - vp.z);
        if (d > vp.r) continue;
        const h = stonehavenSurfaceAt(seed, wx, wz);
        s.set(wx, h, wz, d > vp.r - 1.2 ? STONE : COBBLESTONE);
        // Low parapet along the outward rim — frames the view without hiding it.
        const outward = (wx - vp.x) * ox + (wz - vp.z) * oz;
        if (d > vp.r - 1.2 && outward > vp.r * 0.3) s.set(wx, h + 1, wz, COBBLE_WALL);
      }
    }
    // Gravel spur from the road shoulder to the pullout.
    const steps = Math.ceil(olen * 2);
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(foot.x + (vp.x - foot.x) * (i / steps));
      const pz = Math.round(foot.z + (vp.z - foot.z) * (i / steps));
      for (let wz = pz - 1; wz <= pz + 1; wz++) {
        for (let wx = px - 1; wx <= px + 1; wx++) {
          if (!owned(s, wx, wz)) continue;
          if (Math.hypot(wx - px, wz - pz) > 1.4) continue;
          const h = stonehavenSurfaceAt(seed, wx, wz);
          s.set(wx, h, wz, GRAVEL);
        }
      }
    }
    lampPost(s, seed, Math.round(vp.x - ox * (vp.r - 1)), Math.round(vp.z - oz * (vp.r - 1)));
  }
}

/** The Stonehaven site overlay: everything authored on top of the terrain, clipped per chunk. */
export function stonehavenSite(): Overlay {
  return (chunk, cx, cz, seed) => {
    const s = new CitadelStamp(chunk, cx, cz);
    // Viewpoint spurs go down first so the road's own surface wins where a spur joins it.
    buildViewpoints(s, seed);
    paveRoad(s, seed);
    buildPlaza(s, seed);
    buildHarbor(s, seed);
    buildBridge(s, seed);
    buildFortress(s, seed);
  };
}
