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
  CARVED_LIMESTONE,
  SLATE,
  GLASS,
  OAK_DOOR,
  STAIRS_SLATE,
  STAIRS_STONE,
  WATER,
  BOOKSHELF,
  FURNACE,
  PLANK_SLAB,
  CYAN_GLASS,
  STAIRS_PLANK,
  STONE_SLAB,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, hash2, spiralStair } from './CitadelStamp';
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
      const h = stonehavenSurfaceAt(seed, wx, wz);
      // Near the gorge the terrain gap opens under the road; skip only the columns that truly
      // dropped into it (the bridge deck carries the road there). Columns still at road level
      // are the bridge APPROACHES and must be paved — unpaved grass there sprouted plants in
      // the middle of the road.
      if (wx > 40 && wz > 60 && wx < 170 && wz < 150) {
        if (
          polylineProject(wx, wz, STONEHAVEN_STREAM).dist < 7 &&
          h < STONEHAVEN_SITES.bridge.deckY - 2
        ) {
          continue;
        }
      }
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
  // fence railings, and twin lanterns at the head. The corridor above the deck is cleared
  // first — the shore lip sits one block higher than the apron in places, and the pier cuts
  // through that bank instead of dead-ending into it.
  const pier = hb.pier;
  s.fill(pier.x - 1, y + 1, pier.z0, pier.x + 1, y + 4, pier.z1, AIR);
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

interface ShellBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floorY: number;
}

/**
 * A stepped slate hip roof with a 1-block eave, closing to a ridge cap. M5: the ring edges are
 * slate STAIRS facing uphill (toward the ridge) with solid slate corners, so the pitch reads as
 * a smooth roof plane instead of chunky full-block terraces.
 */
function hipRoof(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  baseY: number,
): void {
  let ax = x0 - 1;
  let az = z0 - 1;
  let bx = x1 + 1;
  let bz = z1 + 1;
  let y = baseY;
  while (ax <= bx && az <= bz) {
    if (bx - ax <= 1 || bz - az <= 1) {
      s.fill(ax, y, az, bx, y, bz, SLATE); // ridge cap
      return;
    }
    for (let x = ax + 1; x < bx; x++) {
      s.set(x, y, az, STAIRS_SLATE, packState(FACING.S, 0)); // north eave rises toward +z
      s.set(x, y, bz, STAIRS_SLATE, packState(FACING.N, 0)); // south eave rises toward -z
    }
    for (let z = az + 1; z < bz; z++) {
      s.set(ax, y, z, STAIRS_SLATE, packState(FACING.W, 0)); // west eave rises toward +x
      s.set(bx, y, z, STAIRS_SLATE, packState(FACING.E, 0)); // east eave rises toward -x
    }
    s.set(ax, y, az, SLATE); // solid hips at the corners
    s.set(bx, y, az, SLATE);
    s.set(ax, y, bz, SLATE);
    s.set(bx, y, bz, SLATE);
    ax++;
    az++;
    bx--;
    bz--;
    y++;
  }
}

/**
 * A small village building: cobblestone base courses under a plank upper, hollow walkable
 * interior, glass windows, an oak door, a hanging lantern, and a slate hip roof. Massing-scale
 * cottages — enough frontage to make the waterfront feel inhabited, not a residential district.
 */
function buildingShell(
  s: CitadelStamp,
  box: ShellBox,
  opts: { door?: { x: number; z: number }; openFace?: 'south'; tall?: boolean },
): void {
  // `tall` raises the shell three courses for a second storey (the inn's sleeping loft).
  const wallTop = box.floorY + (opts.tall ? 8 : 5);
  s.slab(box.x0, box.z0, box.x1, box.z1, box.floorY, COBBLESTONE); // floor
  // Walls: 3 cobble courses under plank courses to the top.
  for (const [y0, y1, id] of [
    [box.floorY + 1, box.floorY + 3, COBBLESTONE],
    [box.floorY + 4, wallTop, PLANKS],
  ] as const) {
    s.walls(box.x0, y0, box.z0, box.x1, y1, box.z1, id);
  }
  // Hollow interior.
  s.fill(box.x0 + 1, box.floorY + 1, box.z0 + 1, box.x1 - 1, wallTop, box.z1 - 1, AIR);
  if (opts.openFace === 'south') {
    // Boathouse mouth: the whole south face opens toward the water.
    s.fill(box.x0 + 1, box.floorY + 1, box.z1, box.x1 - 1, wallTop - 1, box.z1, AIR);
  }
  // Windows: one per long face at sill height (both storeys when tall).
  const midX = Math.round((box.x0 + box.x1) / 2);
  const midZ = Math.round((box.z0 + box.z1) / 2);
  const sills = opts.tall ? [box.floorY + 3, box.floorY + 6] : [box.floorY + 3];
  for (const sy of sills) {
    s.set(midX, sy, box.z0, GLASS);
    if (opts.openFace !== 'south') s.set(midX, sy, box.z1, GLASS);
    s.set(box.x0, sy, midZ, GLASS);
    s.set(box.x1, sy, midZ, GLASS);
  }
  if (opts.door) {
    s.fill(opts.door.x, box.floorY + 1, opts.door.z, opts.door.x, box.floorY + 2, opts.door.z, AIR);
    s.set(opts.door.x, box.floorY + 1, opts.door.z, OAK_DOOR);
  }
  s.set(midX, wallTop, midZ, LANTERN); // hanging light
  hipRoof(s, box.x0, box.z0, box.x1, box.z1, wallTop + 1);
}

/** The waterfront village: harbormaster's house + inn flanking the plaza, boathouse on the quay. */
function buildVillage(s: CitadelStamp): void {
  const v = STONEHAVEN_SITES.village;
  if (!overlaps(s, v.harbormaster.x0 - 1, v.inn.z0 - 1, v.inn.x1 + 1, v.boathouse.z1 + 1)) return;
  buildingShell(s, v.harbormaster, { door: v.harbormaster.door });
  buildingShell(s, v.inn, { door: v.inn.door, tall: true }); // two storeys: the loft (M8)
  buildingShell(s, v.boathouse, { openFace: 'south' });

  // M7: the shells get lives. The harbormaster keeps a stove, ledgers, and a chart desk; the
  // inn earns its name with a hearth and a long common table with benches down both sides.
  const hFloor = v.harbormaster.floorY + 1; // 66: standing level inside
  s.set(3, hFloor, 2, FURNACE); // stove against the west wall
  s.fill(3, hFloor, -2, 4, hFloor, -2, BOOKSHELF); // the ledgers
  s.set(7, hFloor, 3, OAK_FENCE); // chart desk in the south-east corner
  s.set(7, hFloor + 1, 3, PLANK_SLAB);
  s.set(6, hFloor, 3, PLANK_SLAB); // a stool beside it

  const iFloor = v.inn.floorY + 1; // 66
  s.set(30, iFloor, -8, FURNACE); // kitchen hearth in the north-east corner
  s.set(26, iFloor, -6, OAK_FENCE); // the common table: trestles + plank top
  s.set(30, iFloor, -6, OAK_FENCE);
  s.fill(26, iFloor + 1, -6, 30, iFloor + 1, -6, PLANK_SLAB);
  s.fill(27, iFloor, -7, 29, iFloor, -7, PLANK_SLAB); // benches down both sides
  s.fill(27, iFloor, -5, 29, iFloor, -5, PLANK_SLAB);
  // The sleeping loft (M8): a plank floor over the common room, reached by a straight plank
  // stair along the south wall — a clear run from the door, no side-entry squeeze.
  const loftY = v.inn.floorY + 5; // floor blocks at 70, stand on 71
  s.fill(25, loftY, v.inn.z0 + 1, v.inn.x1 - 1, loftY, -4, PLANKS); // open stairwell over z -3
  for (let i = 0; i <= 4; i++) {
    const sx = 26 + i;
    const sy = iFloor + i;
    if (sy - 1 >= iFloor) s.fill(sx, iFloor, -3, sx, sy - 1, -3, PLANKS); // step support
    s.set(sx, sy, -3, STAIRS_PLANK, packState(FACING.W, 0)); // rises toward +x, up to the loft
  }
  s.fill(27, loftY + 1, -4, 28, loftY + 1, -4, PLANK_SLAB); // cot one
  s.fill(29, loftY + 1, v.inn.z0 + 1, 30, loftY + 1, v.inn.z0 + 1, PLANK_SLAB); // cot two
  // The shell's ceiling lantern now lights the loft; hang one under the loft floor so the
  // common room below stays warm too.
  s.set(28, loftY - 1, -6, LANTERN);

  // Door transoms (M8): a lit lantern set into the wall above each cottage door, so the
  // village windows glow warm from outside after dark.
  s.set(v.harbormaster.door.x, v.harbormaster.floorY + 3, v.harbormaster.door.z, LANTERN);
  s.set(v.inn.door.x, v.inn.floorY + 3, v.inn.door.z, LANTERN);
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
 * Fortress massing on the crag, M4 readability pass. The M3 finding: solid natural STONE merged
 * with the crag and read as terrain. Now every built face is masonry — cobblestone bodies over a
 * two-course natural-stone plinth (so the fortress still grows out of the rock), with pale
 * carved-limestone trim (bastion crowns, gate frame, keep quoins) that separates architecture
 * from geology at long range. The curtain rises higher with buttress ribs for rhythm, the keep
 * carries a set-back crenellated upper storey and shadow-slit windows, and the beacon burns on
 * its own taller fire tower so it clears the keep's skyline.
 */
function buildFortress(s: CitadelStamp, seed: WorldSeed): void {
  const w = STONEHAVEN_SITES.ward;
  if (!overlaps(s, w.keep.x0 - 3, w.z0 - 3, w.x1 + 3, w.z1 + 3)) return;

  // One masonry wall column: stone plinth into the ground, cobblestone body, cobble merlon.
  const wallCol = (wx: number, wz: number, topY: number): void => {
    if (!owned(s, wx, wz)) return;
    const h = stonehavenSurfaceAt(seed, wx, wz);
    if (h >= topY) return; // the knoll face outruns the curtain here
    s.fill(wx, h - 1, wz, wx, Math.min(h + 1, topY), wz, STONE);
    if (h + 2 <= topY) s.fill(wx, h + 2, wz, wx, topY, wz, COBBLESTONE);
    if ((((wx + wz) % 2) + 2) % 2 === 0) s.set(wx, topY + 1, wz, COBBLESTONE); // merlon
  };
  // Buttress ribs every 6th column: a natural-stone pier proud of the curtain's outer face —
  // vertical rhythm that also ties the masonry back into the crag.
  const buttress = (wx: number, wz: number, topY: number): void => {
    if (!owned(s, wx, wz)) return;
    const h = stonehavenSurfaceAt(seed, wx, wz);
    if (h >= topY - 2) return;
    s.fill(wx, h - 1, wz, wx, topY - 2, wz, STONE);
  };
  const inGate = (wx: number): boolean => wx >= w.gate.x0 && wx <= w.gate.x1;
  for (let wx = w.x0; wx <= w.x1; wx++) {
    wallCol(wx, w.z0, w.wallTopY);
    if (wx % 6 === 0) buttress(wx, w.z0 - 1, w.wallTopY);
    if (!inGate(wx)) {
      wallCol(wx, w.z1, w.wallTopY);
      if (wx % 6 === 0) buttress(wx, w.z1 + 1, w.wallTopY);
    }
  }
  for (let wz = w.z0 + 1; wz <= w.z1 - 1; wz++) {
    wallCol(w.x0, wz, w.wallTopY);
    wallCol(w.x1, wz, w.wallTopY);
    if (wz % 6 === 0) {
      buttress(w.x0 - 1, wz, w.wallTopY);
      buttress(w.x1 + 1, wz, w.wallTopY);
    }
  }

  // Corner bastions (the keep holds the northwest corner itself): cobble drums with a pale
  // limestone crown ring that catches the light at distance.
  for (const [bx, bz] of [
    [w.x1, w.z0],
    [w.x1, w.z1],
    [w.x0, w.z1],
  ] as const) {
    for (let wz = bz - 2; wz <= bz + 2; wz++) {
      for (let wx = bx - 2; wx <= bx + 2; wx++) {
        if (!owned(s, wx, wz)) continue;
        const h = stonehavenSurfaceAt(seed, wx, wz);
        s.fill(wx, h - 1, wz, wx, Math.min(h + 1, w.towerTopY), wz, STONE);
        if (h + 2 <= w.towerTopY) s.fill(wx, h + 2, wz, wx, w.towerTopY, wz, COBBLESTONE);
      }
    }
    s.outline(bx - 2, bz - 2, bx + 2, bz + 2, w.towerTopY + 1, CARVED_LIMESTONE);
  }

  // Gatehouse: cobble twin towers with carved-limestone jambs framing the opening and a
  // limestone lintel — the entrance is the palest thing on the wall, discoverable from below.
  const g = w.gate;
  for (const [tx0, tx1] of [
    [g.x0 - 3, g.x0 - 1],
    [g.x1 + 1, g.x1 + 3],
  ] as const) {
    for (let wx = tx0; wx <= tx1; wx++) {
      for (let wz = w.z1 - 1; wz <= w.z1 + 1; wz++) {
        if (!owned(s, wx, wz)) continue;
        const h = stonehavenSurfaceAt(seed, wx, wz);
        s.fill(wx, h - 1, wz, wx, Math.min(h + 1, w.wallTopY + 4), wz, STONE);
        s.fill(wx, h + 2, wz, wx, w.wallTopY + 4, wz, COBBLESTONE);
      }
    }
  }
  // Jambs: the tower columns immediately flanking the opening go full-height limestone.
  for (const jx of [g.x0 - 1, g.x1 + 1]) {
    if (jx >= s.wx0 && jx <= s.wx1) {
      const h = stonehavenSurfaceAt(seed, jx, g.z);
      s.fill(jx, h, g.z - 1, jx, w.wallTopY + 4, g.z + 1, CARVED_LIMESTONE);
    }
  }
  s.set(g.x0 - 2, w.wallTopY + 5, w.z1, LANTERN);
  s.set(g.x1 + 2, w.wallTopY + 5, w.z1, LANTERN);
  // Passage: 4 blocks of headroom over the road across the full opening, then a carved-limestone
  // lintel up to the wall top so the gate reads as a bright arch, not a missing tooth.
  for (let wx = g.x0; wx <= g.x1; wx++) {
    if (wx < s.wx0 || wx > s.wx1) continue;
    const h = stonehavenSurfaceAt(seed, wx, g.z);
    for (let wz = g.z - 1; wz <= g.z + 1; wz++) {
      if (wz < s.wz0 || wz > s.wz1) continue;
      for (let wy = h + 1; wy <= h + 4; wy++) s.set(wx, wy, wz, AIR);
    }
    s.fill(wx, h + 5, g.z, wx, w.wallTopY, g.z, CARVED_LIMESTONE);
  }

  // The keep: masonry block on the knoll — stone plinth, cobble body, limestone corner quoins,
  // shadow-slit windows, a crenellated rim, and a set-back upper storey that breaks the cube.
  const k = w.keep;
  for (let wz = k.z0; wz <= k.z1; wz++) {
    for (let wx = k.x0; wx <= k.x1; wx++) {
      if (!owned(s, wx, wz)) continue;
      const h = stonehavenSurfaceAt(seed, wx, wz);
      s.fill(wx, h - 1, wz, wx, Math.min(h + 1, k.topY), wz, STONE);
      if (h + 2 <= k.topY) s.fill(wx, h + 2, wz, wx, k.topY, wz, COBBLESTONE);
    }
  }
  for (const [qx, qz] of [
    [k.x0, k.z0],
    [k.x1, k.z0],
    [k.x0, k.z1],
    [k.x1, k.z1],
  ] as const) {
    if (owned(s, qx, qz)) {
      const h = stonehavenSurfaceAt(seed, qx, qz);
      s.fill(qx, h, qz, qx, k.topY, qz, CARVED_LIMESTONE);
    }
  }
  // Window slits on the lake-facing (north) and court-facing (east) walls: 1x2 recesses at two
  // storey lines; the shadowed niche reads as a dark slit from across the water.
  for (const slitY of [k.topY - 10, k.topY - 5]) {
    for (let wx = k.x0 + 2; wx <= k.x1 - 2; wx += 3) {
      s.set(wx, slitY, k.z0, AIR);
      s.set(wx, slitY + 1, k.z0, AIR);
    }
    for (let wz = k.z0 + 2; wz <= k.z1 - 2; wz += 3) {
      s.set(k.x1, slitY, wz, AIR);
      s.set(k.x1, slitY + 1, wz, AIR);
    }
  }
  s.outline(k.x0, k.z0, k.x1, k.z1, k.topY + 1, COBBLESTONE);
  // Upper storey: inset, cobble, limestone quoins, its own crenellated rim.
  const u = k.upper;
  for (let wz = u.z0; wz <= u.z1; wz++) {
    for (let wx = u.x0; wx <= u.x1; wx++) s.fill(wx, k.topY, wz, wx, u.topY, wz, COBBLESTONE);
  }
  for (const [qx, qz] of [
    [u.x0, u.z0],
    [u.x1, u.z0],
    [u.x0, u.z1],
    [u.x1, u.z1],
  ] as const) {
    s.fill(qx, k.topY, qz, qx, u.topY, qz, CARVED_LIMESTONE);
  }
  s.outline(u.x0, u.z0, u.x1, u.z1, u.topY + 1, COBBLESTONE);
  // The fire tower: a slender cobble shaft off the keep's lake corner rising past the upper
  // storey, limestone crown, and a 2x2 glowstone basin — the beacon now clears the skyline.
  const b = w.beacon;
  for (let wz = b.z0; wz <= b.z1; wz++) {
    for (let wx = b.x0; wx <= b.x1; wx++) s.fill(wx, k.topY, wz, wx, b.topY, wz, COBBLESTONE);
  }
  s.outline(b.x0, b.z0, b.x1, b.z1, b.topY + 1, CARVED_LIMESTONE);
  s.fill(b.x0 + 1, b.topY + 1, b.z0 + 1, b.x0 + 2, b.topY + 1, b.z0 + 2, GLOWSTONE);

  // ── M5: the keep opens up ──────────────────────────────────────────────────────────────────
  // Great hall carved into the lower body, an upper hall in the set-back storey, and a central
  // spiral stair climbing hall → upper hall → roof hatch. Floors are the solid fill below each
  // hollow, so nothing floats; lanterns light both halls.
  s.fill(k.x0 + 2, 119, k.z0 + 2, k.x1 - 2, 127, k.z1 - 2, AIR); // great hall (stand on 119)
  s.fill(u.x0 + 1, 135, u.z0 + 1, u.x1 - 1, 139, u.z1 - 1, AIR); // upper hall (stand on 135)
  s.fill(-75, 119, 119, -73, 141, 121, AIR); // the stair shaft, up through the roof hatch
  spiralStair(s, -74, 120, 119, 141, STONE, STONE);
  s.set(k.x0 + 2, 123, k.z0 + 2, LANTERN);
  s.set(k.x1 - 2, 123, k.z1 - 2, LANTERN);
  s.set(u.x0 + 1, 138, u.z1 - 1, LANTERN);

  // M6 furnishing — the hall reads lived-in, not carved-and-left. Everything keeps clear of
  // the door lane (z 119..121, east of the shaft) and the shaft itself.
  // Hearth: a cobble chimney breast on the north wall with a working furnace at its heart.
  s.fill(-78, 119, k.z0 + 2, -76, 122, k.z0 + 2, COBBLESTONE);
  s.set(-77, 119, k.z0 + 2, FURNACE);
  // Library: a two-high bookshelf wall along the south side.
  s.fill(k.x0 + 2, 119, k.z1 - 2, k.x1 - 2, 120, k.z1 - 2, BOOKSHELF);
  // The long table: plank top on fence trestles, floor-slab benches alongside.
  s.set(-77, 119, 122, OAK_FENCE);
  s.set(-72, 119, 122, OAK_FENCE);
  s.fill(-77, 120, 122, -72, 120, 122, PLANK_SLAB);
  s.fill(-76, 119, 123, -73, 119, 123, PLANK_SLAB);
  // Upper hall: a study — bookshelves along the north wall, a reading table by the lantern,
  // and (M7) a cyan-glass window in the north face looking out over the lake to the village.
  s.fill(u.x0 + 1, 135, u.z0 + 1, u.x1 - 1, 135, u.z0 + 1, BOOKSHELF);
  s.set(-72, 135, 122, OAK_FENCE);
  s.set(-72, 136, 122, PLANK_SLAB);
  s.fill(-74, 136, u.z0, -73, 137, u.z0, CYAN_GLASS);

  // The summit overlook (M8) — the journey's final payoff where the spiral emerges: the roof's
  // north rim opens into a see-through crenel rail, with a slab bench and a lamp beside it,
  // looking back down the whole valley — falls, bridge, village, harbor.
  s.fill(-75, u.topY + 1, u.z0, -72, u.topY + 1, u.z0, COBBLE_WALL);
  s.set(-74, u.topY + 1, u.z0 + 1, STONE_SLAB);
  s.set(-72, u.topY + 1, u.z0 + 1, STONE_SLAB);
  s.set(-76, u.topY + 2, u.z0, LANTERN);

  // Entrance: a limestone-framed doorway in the east face, reached by a grand stone stair
  // cut up the knoll from the ward court (one rise per column — walkable by construction).
  s.fill(k.x1 - 1, 119, 119, k.x1, 122, 121, AIR); // door tunnel through the east wall
  s.fill(k.x1, 119, 118, k.x1, 123, 118, CARVED_LIMESTONE); // jambs + lintel frame
  s.fill(k.x1, 119, 122, k.x1, 123, 122, CARVED_LIMESTONE);
  s.fill(k.x1, 123, 119, k.x1, 123, 121, CARVED_LIMESTONE);
  for (let i = 0; i <= 9; i++) {
    const sx = -59 - i;
    const sy = 109 + i;
    if (sx < s.wx0 || sx > s.wx1) continue;
    for (let sz = 119; sz <= 121; sz++) {
      if (sz < s.wz0 || sz > s.wz1) continue;
      const hh = stonehavenSurfaceAt(seed, sx, sz);
      if (sy - 1 >= hh - 1) s.fill(sx, hh - 1, sz, sx, sy - 1, sz, COBBLESTONE); // step support
      for (let wy = sy + 1; wy <= sy + 3; wy++) s.set(sx, wy, sz, AIR); // cutting through the toe
      s.set(sx, sy, sz, STAIRS_STONE, packState(FACING.E, 0)); // rises toward -x, to the door
    }
  }

  // Wall-walk: an inner cobble lane along the east curtain (its top sits below the merlon line,
  // so the parapet protects the walk), with a stone stair up from the ward level and lanterns.
  // The lane runs the northern stretch only (to z 128); the access stair climbs z 134 → 129
  // and lands on its end, so the approach from the ward stays open ground.
  for (let wz = w.z0 + 2; wz <= 128; wz++) {
    if (w.x1 - 1 < s.wx0 || w.x1 - 1 > s.wx1 || wz < s.wz0 || wz > s.wz1) continue;
    const hh = stonehavenSurfaceAt(seed, w.x1 - 1, wz);
    if (hh >= w.wallTopY - 1) continue;
    s.fill(w.x1 - 1, hh - 1, wz, w.x1 - 1, w.wallTopY - 1, wz, COBBLESTONE);
    // Lanterns sit on the parapet crest, not on the walk itself — a lamp on the lane blocks it.
    if (wz % 8 === 2) s.set(w.x1, w.wallTopY + 1, wz, LANTERN);
  }
  for (let i = 0; i <= 5; i++) {
    const sz = 134 - i;
    const sy = 109 + i;
    if (w.x1 - 1 < s.wx0 || w.x1 - 1 > s.wx1 || sz < s.wz0 || sz > s.wz1) continue;
    const hh = stonehavenSurfaceAt(seed, w.x1 - 1, sz);
    if (sy - 1 >= hh - 1) s.fill(w.x1 - 1, hh - 1, sz, w.x1 - 1, sy - 1, sz, COBBLESTONE); // support
    for (let wy = sy + 1; wy <= sy + 3; wy++) s.set(w.x1 - 1, wy, sz, AIR); // headroom
    s.set(w.x1 - 1, sy, sz, STAIRS_STONE, packState(FACING.N, 0)); // rises toward -z, up the lane
  }

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

/**
 * The falls (M5): the stream's final descent down the bench face becomes a real cascade —
 * static source water laid flush into the groove bed over a stone seal (so the gravity ticker
 * can't drop sand/gravel out from under it), ending in a stone-rimmed splash pool on the shore
 * beside the lake. Authored like Cloudspire's contained falls: the fluid ticker is edit-driven,
 * so undisturbed worldgen water holds its shape.
 */
function buildFalls(s: CitadelStamp, seed: WorldSeed): void {
  if (!overlaps(s, 58, 88, 90, 106)) return;
  // The cascade follows the stream's last segment, (84,104) → (66,96), 2 wide across the groove.
  const A = { x: 84, z: 104 };
  const B = { x: 66, z: 96 };
  const steps = Math.ceil(Math.hypot(A.x - B.x, A.z - B.z));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.round(A.x + (B.x - A.x) * t);
    const cz = Math.round(A.z + (B.z - A.z) * t);
    // 3 wide on the upper face (where the M5 sheet read thin from the village), narrowing to
    // 2 as it nears the shore.
    const wide = [
      [0, -1],
      [0, 0],
      [0, 1],
    ] as const;
    const narrow = [
      [0, 0],
      [0, 1],
    ] as const;
    for (const [ox, oz] of t < 0.75 ? wide : narrow) {
      const wx = cx + ox;
      const wz = cz + oz;
      if (!owned(s, wx, wz)) continue;
      const h = stonehavenSurfaceAt(seed, wx, wz);
      if (h <= 64 || h > 84) continue; // only the descent face; the pool takes over at the shore
      s.set(wx, h - 1, wz, STONE); // seal the bed
      s.set(wx, h, wz, WATER); // water flush with the ground line
    }
  }
  // Header pool at the top of the descent: a stone-rimmed basin the cascade visibly pours from.
  const head = { cx: 85, cz: 104, r: 2.4 };
  const hH = stonehavenSurfaceAt(seed, head.cx, head.cz);
  for (let wz = head.cz - 4; wz <= head.cz + 4; wz++) {
    for (let wx = head.cx - 4; wx <= head.cx + 4; wx++) {
      if (!owned(s, wx, wz)) continue;
      const d = Math.hypot(wx - head.cx, wz - head.cz);
      if (d <= head.r) {
        s.set(wx, hH - 1, wz, STONE);
        s.set(wx, hH, wz, WATER);
        s.set(wx, hH + 1, wz, AIR);
      } else if (d <= head.r + 1.2) {
        // The west arc is the spill notch: water instead of rim, so the pool visibly pours
        // toward the cascade (and the fall reads from the village side).
        if (wx <= head.cx - 2) {
          s.set(wx, hH - 1, wz, STONE);
          s.set(wx, hH, wz, WATER);
        } else {
          s.set(wx, hH, wz, STONE);
        }
      }
    }
  }
  // Splash pool: stone floor and rim one block above the lake, water at shore level.
  const pool = { cx: 66, cz: 96, r: 3.5 };
  for (let wz = pool.cz - 4; wz <= pool.cz + 4; wz++) {
    for (let wx = pool.cx - 4; wx <= pool.cx + 4; wx++) {
      if (!owned(s, wx, wz)) continue;
      const d = Math.hypot(wx - pool.cx, wz - pool.cz);
      if (d <= pool.r) {
        s.set(wx, 62, wz, STONE);
        s.set(wx, 63, wz, WATER);
        s.set(wx, 64, wz, AIR);
      } else if (d <= pool.r + 1.2) {
        s.set(wx, 63, wz, STONE); // containing rim, flush with the water surface
      }
    }
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
    buildVillage(s);
    buildBridge(s, seed);
    buildFortress(s, seed);
    buildFalls(s, seed);
  };
}
