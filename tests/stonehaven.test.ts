import { describe, it, expect } from 'vitest';
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
import {
  STONEHAVEN,
  STONEHAVEN_STREAM,
  STONEHAVEN_SITES,
  stonehavenSurfaceAt,
  stonehavenCapAt,
  stonehavenRoad,
} from '../src/worldgen/StonehavenGenerator';
import { applyOverlays } from '../src/worldgen/Generator';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../src/core/constants';
import {
  AIR,
  WATER,
  GRASS,
  SNOW,
  STONE,
  SAND,
  GRAVEL,
  COBBLESTONE,
  PLANKS,
  LANTERN,
  COBBLE_WALL,
  CARVED_LIMESTONE,
  GLOWSTONE,
  OAK_DOOR,
  STAIRS_SLATE,
  STAIRS_STONE,
} from '../src/blocks/blocks';
import { FACING } from '../src/world/VoxelState';

const SEED = 1337;

/** Index of the first mismatching byte between two arrays, or -1 when identical. */
function firstDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

/** A whole-world sampler: generates (and overlays) chunks on demand and reads by world coords. */
function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
  stateAt: (wx: number, wy: number, wz: number) => number;
  chunkOf: (cx: number, cz: number) => ChunkData;
} {
  const { generator, overlays } = createGenerator('stonehaven');
  const cache = new Map<string, ChunkData>();
  const chunkOf = (cx: number, cz: number): ChunkData => {
    const key = `${cx},${cz}`;
    let c = cache.get(key);
    if (!c) {
      c = generator.generateBaseChunk(seed, cx, cz);
      applyOverlays(c, cx, cz, seed, overlays);
      cache.set(key, c);
    }
    return c;
  };
  const at = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return chunkOf(cx, cz).get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
  const stateAt = (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    return chunkOf(cx, cz).getState(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
  return { at, stateAt, chunkOf };
}

// One shared sampler for all read-only block assertions: each authored-feature test touches the
// same handful of chunks, and regenerating them per test made this file heavy enough to starve
// the rest of the suite (the authored field is many fBm evaluations per column).
let sharedSampler: ReturnType<typeof makeSampler> | undefined;
function sampler(): ReturnType<typeof makeSampler> {
  sharedSampler ??= makeSampler();
  return sharedSampler;
}

describe('stonehaven preset registration', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('stonehaven')).toBe(true);
    expect(WORLD_PRESETS).toContain('stonehaven');
  });

  it('resolves to a generator with forest + site + decoration overlays', () => {
    const { generator, overlays } = createGenerator('stonehaven');
    expect(typeof generator.generateBaseChunk).toBe('function');
    expect(overlays.length).toBe(4); // broadleaf belt + conifer belt + site + decorations
  });
});

describe('stonehaven terrain composition', () => {
  it('is deterministic: two generators produce identical chunks', () => {
    const a = createGenerator('stonehaven');
    const b = createGenerator('stonehaven');
    for (const [cx, cz] of [
      [0, 0],
      [-4, 8],
      [6, 4],
    ] as const) {
      const ca = a.generator.generateBaseChunk(SEED, cx, cz);
      const cb = b.generator.generateBaseChunk(SEED, cx, cz);
      applyOverlays(ca, cx, cz, SEED, a.overlays);
      applyOverlays(cb, cx, cz, SEED, b.overlays);
      // Every voxel AND every state byte (stair facings), compared on the raw arrays — a
      // per-voxel expect() here is ~400k slow assertions and times the suite out.
      expect(firstDiff(ca.data, cb.data)).toBe(-1);
      expect(firstDiff(ca.state, cb.state)).toBe(-1);
    }
  });

  it('keeps the village bench near-level around the spawn origin', () => {
    // z stops at 4: south of that the harbor apron intentionally steps down to the quay level.
    for (let x = -20; x <= 20; x += 5) {
      for (let z = -16; z <= 4; z += 4) {
        const h = stonehavenSurfaceAt(SEED, x, z);
        expect(Math.abs(h - STONEHAVEN.village.benchY)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('digs a deep flooded lake south of the village', () => {
    const { at } = sampler();
    const { cx, cz } = STONEHAVEN.valley;
    const floor = stonehavenSurfaceAt(SEED, cx, cz);
    expect(floor).toBeLessThanOrEqual(STONEHAVEN.lake.floorY + 4);
    // Water fills from just above the floor to the waterline.
    expect(at(cx, floor + 1, cz)).toBe(WATER);
    expect(at(cx, SEA_LEVEL, cz)).toBe(WATER);
    expect(at(cx, SEA_LEVEL + 1, cz)).toBe(AIR);
  });

  it('raises a flat fortress plateau with a higher keep knoll', () => {
    const { crag } = STONEHAVEN;
    expect(
      Math.abs(stonehavenSurfaceAt(SEED, crag.cx, crag.cz) - crag.plateauY),
    ).toBeLessThanOrEqual(1);
    // The plateau core is buildable-flat away from the knoll and the road's gate notch (SW).
    for (const [dx, dz] of [
      [12, -6],
      [14, 6],
      [0, -16],
    ] as const) {
      const h = stonehavenSurfaceAt(SEED, crag.cx + dx, crag.cz + dz);
      expect(Math.abs(h - crag.plateauY)).toBeLessThanOrEqual(1);
    }
    const k = crag.knoll;
    expect(Math.abs(stonehavenSurfaceAt(SEED, k.cx, k.cz) - k.y)).toBeLessThanOrEqual(1);
  });

  it('rings the valley with high mountains, lower at the northwest notch', () => {
    const { cx, cz } = STONEHAVEN.valley;
    const at = (theta: number, r: number): number =>
      stonehavenSurfaceAt(
        SEED,
        Math.round(cx + r * Math.cos(theta)),
        Math.round(cz + r * Math.sin(theta)),
      );
    const east = at(0, 240);
    const south = at(Math.PI / 2, 240);
    const notch = at((-3 * Math.PI) / 4, 260);
    expect(east).toBeGreaterThan(130);
    expect(south).toBeGreaterThan(130);
    expect(notch).toBeLessThan(east - 25);
  });

  it('caps high slopes with snow somewhere on the ring', () => {
    let snow = 0;
    for (let i = 0; i < 40; i++) {
      const theta = (i / 40) * Math.PI * 2;
      const wx = Math.round(STONEHAVEN.valley.cx + 235 * Math.cos(theta));
      const wz = Math.round(STONEHAVEN.valley.cz + 235 * Math.sin(theta));
      if (stonehavenCapAt(SEED, wx, wz) === SNOW) snow++;
    }
    expect(snow).toBeGreaterThan(5);
  });

  it('incises a dry stream groove on the upper slope (clear of road and bench)', () => {
    // Midpoint of the uppermost stream segment: no road corridor or falls bench influence here.
    const px = Math.round((STONEHAVEN_STREAM[0].x + STONEHAVEN_STREAM[1].x) / 2);
    const pz = Math.round((STONEHAVEN_STREAM[0].z + STONEHAVEN_STREAM[1].z) / 2);
    const bed = stonehavenSurfaceAt(SEED, px, pz);
    const rimA = stonehavenSurfaceAt(SEED, px, pz + 13);
    const rimB = stonehavenSurfaceAt(SEED, px, pz - 13);
    // Compare against the interpolated hillside so the cross-slope tilt doesn't mask the notch.
    expect(bed).toBeLessThan((rimA + rimB) / 2 - 3);
    expect(bed).toBeGreaterThan(SEA_LEVEL); // dry until the lake mouth
  });

  it('paints believable caps: grass bench, beach at the waterline, rock on cliffs', () => {
    // North of the plaza — (8,8) now sits on the harbor apron's shingle edge by design.
    expect(stonehavenCapAt(SEED, 0, -6)).toBe(GRASS);
    // North crag face (toward the lake) is a cliff.
    const cliffCap = stonehavenCapAt(SEED, STONEHAVEN.crag.cx + 4, STONEHAVEN.crag.cz - 30);
    expect([STONE, GRAVEL]).toContain(cliffCap);
    // Somewhere along the south village waterfront there is shore material.
    let shore = 0;
    for (let x = -20; x <= 20; x += 2) {
      for (let z = 8; z <= 26; z += 2) {
        const h = stonehavenSurfaceAt(SEED, x, z);
        if (h >= SEA_LEVEL - 1 && h <= SEA_LEVEL + 1) {
          const cap = stonehavenCapAt(SEED, x, z);
          if (cap === SAND || cap === GRAVEL) shore++;
        }
      }
    }
    expect(shore).toBeGreaterThan(3);
  });

  it('grades a walkable, dry road from the square to the outer ward', () => {
    const road = stonehavenRoad();
    const b = STONEHAVEN_SITES.bridge;
    let prev: number | undefined;
    for (let a = 0; a <= road.length; a += 1) {
      const p = road.pointAt(a);
      const px = Math.round(p.x);
      const pz = Math.round(p.z);
      // Over the gorge the terrain intentionally opens under the road; the stamped bridge deck
      // carries the walk there (asserted in the milestone-3 anchor tests below).
      if (px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1) {
        prev = undefined;
        continue;
      }
      const h = stonehavenSurfaceAt(SEED, px, pz);
      expect(h).toBeGreaterThan(SEA_LEVEL); // never underwater
      if (prev !== undefined) {
        expect(Math.abs(h - prev)).toBeLessThanOrEqual(1); // single-block steps at worst
      }
      prev = h;
    }
    // The road actually climbs: it ends on the outer-ward plateau.
    const end = STONEHAVEN_ROAD_END();
    expect(end).toBeGreaterThanOrEqual(STONEHAVEN.crag.plateauY - 1);

    function STONEHAVEN_ROAD_END(): number {
      const p = road.pts[road.pts.length - 1];
      return stonehavenSurfaceAt(SEED, p.x, p.z);
    }
  });

  it('spans the stream gorge with a stone bridge over an open arch', () => {
    const { at } = sampler();
    const b = STONEHAVEN_SITES.bridge;
    const midX = Math.round((b.x0 + b.x1) / 2);
    const midZ = Math.round((b.z0 + b.z1) / 2);
    expect(at(midX, b.deckY, midZ)).toBe(STONE); // the deck
    expect(at(b.x0, b.deckY + 1, midZ)).toBe(COBBLE_WALL); // a parapet
    expect(at(midX, b.deckY - 2, midZ)).toBe(AIR); // the open span beneath
    // The terrain gap is real: the groove passes well under the deck…
    expect(stonehavenSurfaceAt(SEED, midX, midZ)).toBeLessThan(b.deckY - 4);
    // …and the graded road meets the deck flush at BOTH approaches.
    expect(Math.abs(stonehavenSurfaceAt(SEED, 100, 104) - b.deckY)).toBeLessThanOrEqual(1); // north
    expect(Math.abs(stonehavenSurfaceAt(SEED, 104, 118) - b.deckY)).toBeLessThanOrEqual(1); // south
  });

  it('offers a continuous post-overlay walking surface through the bridge area', () => {
    const { at } = sampler();
    const road = stonehavenRoad();
    // Topmost solid block in the plausible walking band — deck or graded road, whichever exists.
    const topSolid = (px: number, pz: number): number => {
      for (let y = 100; y >= 78; y--) {
        const id = at(px, y, pz);
        if (id !== AIR && id !== WATER) return y;
      }
      return -1;
    };
    let prev: number | undefined;
    let samples = 0;
    for (let a = 0; a <= road.length; a += 1) {
      const p = road.pointAt(a);
      const px = Math.round(p.x);
      const pz = Math.round(p.z);
      if (px < 97 || px > 107 || pz < 98 || pz > 124) {
        prev = undefined;
        continue;
      }
      const h = topSolid(px, pz);
      expect(h).toBeGreaterThan(0);
      if (prev !== undefined) expect(Math.abs(h - prev)).toBeLessThanOrEqual(1);
      prev = h;
      samples++;
    }
    expect(samples).toBeGreaterThan(20); // the walk really crossed the gorge section
  });

  it('generates authored features identically regardless of chunk generation order', () => {
    // The bridge + falls-bench chunk (6,7) spans authored features that cross chunk borders.
    // Generate it alone, and generate it after its neighbors, from independent generators —
    // any cross-chunk ordering dependency in terrain or overlays would diverge the bytes.
    const alone = makeSampler();
    const afterNeighbors = makeSampler();
    afterNeighbors.chunkOf(6, 6);
    afterNeighbors.chunkOf(7, 7);
    afterNeighbors.chunkOf(5, 7);
    const ca = alone.chunkOf(6, 7);
    const cb = afterNeighbors.chunkOf(6, 7);
    expect(firstDiff(ca.data, cb.data)).toBe(-1);
    expect(firstDiff(ca.state, cb.state)).toBe(-1);
  });

  it('builds the harbor quay and a lamplit pier at the waterfront', () => {
    const { at } = sampler();
    const hb = STONEHAVEN_SITES.harbor;
    const pier = hb.pier;
    expect(at(pier.x, hb.apronY, pier.z1)).toBe(PLANKS); // pier head deck
    expect(at(pier.x, hb.apronY - 1, pier.z1)).toBe(WATER); // standing over the lake
    expect(at(pier.x - 1, hb.apronY + 2, pier.z1)).toBe(LANTERN); // head lamps
    // The esplanade is paved at apron level (sampled west of the road ramp's blend zone).
    expect([STONE, COBBLESTONE]).toContain(at(hb.cx - 8, hb.apronY, hb.cz + 1));
  });

  it('raises masonry fortress massing distinct from the natural crag', () => {
    const { at } = sampler();
    const w = STONEHAVEN_SITES.ward;
    const k = w.keep;
    // Curtain wall: cobblestone masonry (not natural stone) above the plinth on the east edge.
    expect(at(w.x1, w.wallTopY, Math.round((w.z0 + w.z1) / 2))).toBe(COBBLESTONE);
    // Bastion crown: pale limestone ring at the tower top (the long-range architecture cue).
    expect(at(w.x1 + 2, w.towerTopY + 1, w.z1)).toBe(CARVED_LIMESTONE);
    // Keep: cobble body, limestone quoin, set-back upper storey topping out at its own height.
    expect(at(k.x1, 126, k.z1)).toBe(CARVED_LIMESTONE); // corner quoin column
    const u = k.upper;
    // Sampled off-center: the spiral-stair shaft (M5) rises through the middle of the roof.
    expect(at(-72, u.topY, 122)).toBe(COBBLESTONE); // upper storey mass
    expect(at(-72, u.topY + 2, 122)).toBe(AIR); // rimmed roof, not a spike of fill
    // The fire tower rises past the upper storey with the glowstone basin on top.
    const b = w.beacon;
    expect(b.topY).toBeGreaterThan(u.topY + 4);
    expect(at(b.x0 + 1, b.topY + 1, b.z0 + 1)).toBe(GLOWSTONE);
    // The ward court is paved where the climb arrives, with the lit waymark plinth.
    const hC = stonehavenSurfaceAt(SEED, -58, 132);
    expect([STONE, COBBLESTONE]).toContain(at(-58, hC, 132));
    expect(at(-58, hC + 2, 132)).toBe(LANTERN);
  });

  it('frames a traversable gate: level floor, headroom across the full width, limestone arch', () => {
    const { at } = sampler();
    const g = STONEHAVEN_SITES.ward.gate;
    let prev: number | undefined;
    for (let wx = g.x0; wx <= g.x1; wx++) {
      const h = stonehavenSurfaceAt(SEED, wx, g.z);
      if (prev !== undefined) expect(Math.abs(h - prev)).toBeLessThanOrEqual(1); // level threshold
      prev = h;
      for (let wz = g.z - 1; wz <= g.z + 1; wz++) {
        for (let wy = h + 1; wy <= h + 3; wy++) {
          expect(at(wx, wy, wz)).toBe(AIR); // full-width, full-depth headroom
        }
      }
      expect(at(wx, h + 5, g.z)).toBe(CARVED_LIMESTONE); // the arch lintel overhead
    }
    // Limestone jambs flank the opening.
    const jh = stonehavenSurfaceAt(SEED, g.x0 - 1, g.z);
    expect(at(g.x0 - 1, jh + 2, g.z)).toBe(CARVED_LIMESTONE);
  });

  it('keeps the pier deck walkable and dry over open water', () => {
    const { at } = sampler();
    const hb = STONEHAVEN_SITES.harbor;
    const pier = hb.pier;
    for (let wz = pier.z0; wz <= pier.z1; wz++) {
      expect(at(pier.x, hb.apronY, wz)).toBe(PLANKS); // continuous center deck
      expect(at(pier.x, hb.apronY + 1, wz)).toBe(AIR); // clear walking headroom
      expect(at(pier.x, hb.apronY + 2, wz)).toBe(AIR);
    }
    expect(at(pier.x, hb.apronY - 1, Math.round((pier.z0 + pier.z1) / 2 + 3))).toBe(WATER);
  });

  it('frames the harbor with village masses while keeping the lake corridor open', () => {
    const { at } = sampler();
    const v = STONEHAVEN_SITES.village;
    // Harbormaster's house: cobble base wall, oak door facing the plaza, slate roof above.
    expect(at(v.harbormaster.x0, v.harbormaster.floorY + 2, 1)).toBe(COBBLESTONE);
    expect(at(v.harbormaster.door.x, v.harbormaster.floorY + 1, v.harbormaster.door.z)).toBe(
      OAK_DOOR,
    );
    // Inn: plank upper storey on the north side of the plaza.
    expect(at(v.inn.x0, v.inn.floorY + 5, Math.round((v.inn.z0 + v.inn.z1) / 2))).toBe(PLANKS);
    // Boathouse: open mouth toward the water (south face air at walking height).
    const bMidX = Math.round((v.boathouse.x0 + v.boathouse.x1) / 2);
    expect(at(bMidX, v.boathouse.floorY + 1, v.boathouse.z1)).toBe(AIR);
    // The plaza-to-quay corridor stays walkable: nothing solid at head height down the middle.
    for (let wz = 5; wz <= 15; wz++) {
      const h = stonehavenSurfaceAt(SEED, 16, wz);
      expect(at(16, h + 1, wz)).toBe(AIR);
      expect(at(16, h + 2, wz)).toBe(AIR);
    }
  });

  it('paves the road with a solid cobble center line', () => {
    const { at } = sampler();
    for (const p of [
      { x: 56, z: 16 },
      { x: 83, z: 52 },
      { x: 42, z: 168 },
    ]) {
      const h = stonehavenSurfaceAt(SEED, p.x, p.z);
      expect(at(p.x, h, p.z)).toBe(COBBLESTONE);
    }
  });

  it('paves both viewpoint pullouts', () => {
    const { at } = sampler();
    for (const vp of STONEHAVEN_SITES.viewpoints) {
      const h = stonehavenSurfaceAt(SEED, vp.x, vp.z);
      expect([STONE, COBBLESTONE, GRAVEL]).toContain(at(vp.x, h, vp.z));
    }
  });

  it('pitches village roofs with oriented slate stairs', () => {
    const { at, stateAt } = sampler();
    const v = STONEHAVEN_SITES.village;
    const midX = Math.round((v.harbormaster.x0 + v.harbormaster.x1) / 2);
    const eaveY = v.harbormaster.floorY + 6; // wallTop + 1
    expect(at(midX, eaveY, v.harbormaster.z0 - 1)).toBe(STAIRS_SLATE);
    expect(stateAt(midX, eaveY, v.harbormaster.z0 - 1) & 0b11).toBe(FACING.S); // rises to ridge
    expect(at(midX, eaveY, v.harbormaster.z1 + 1)).toBe(STAIRS_SLATE);
    expect(stateAt(midX, eaveY, v.harbormaster.z1 + 1) & 0b11).toBe(FACING.N);
  });

  it('opens the keep: hall, framed entrance stair, spiral to the roof hatch', () => {
    const { at } = sampler();
    const k = STONEHAVEN_SITES.ward.keep;
    expect(at(-72, 121, 122)).toBe(AIR); // great hall interior
    expect(at(-72, 137, 122)).toBe(AIR); // upper hall interior
    expect(at(-74, 125, 120)).toBe(STONE); // spiral newel post rising through the hall
    expect(at(-68, 120, 120)).toBe(AIR); // door tunnel through the east face
    expect(at(k.x1, 123, 120)).toBe(CARVED_LIMESTONE); // door lintel
    expect(at(-74, 141, 120)).toBe(STONE); // the stair emerges through the roof hatch
    // The grand stair climbs the knoll one rise per column, all the way to the door.
    for (let i = 0; i <= 9; i++) {
      expect(at(-59 - i, 109 + i, 120)).toBe(STAIRS_STONE);
      expect(at(-59 - i, 110 + i, 120)).toBe(AIR); // headroom over each step
    }
  });

  it('provides a protected wall-walk with stair access from the ward', () => {
    const { at } = sampler();
    const w = STONEHAVEN_SITES.ward;
    const lane = w.x1 - 1;
    expect(at(lane, w.wallTopY - 1, 124)).toBe(COBBLESTONE); // the walk lane
    expect(at(lane, w.wallTopY + 1, 124)).toBe(AIR); // open head height on the lane
    expect(at(w.x1, w.wallTopY, 124)).toBe(COBBLESTONE); // parapet wall beside it
    expect(at(lane, 109, 134)).toBe(STAIRS_STONE); // first step up from the ward level
  });

  it('sends the stream over the bench face as a cascade into a rimmed splash pool', () => {
    const { at } = sampler();
    // Cascade: water laid into the groove on the descent face.
    let cascade = 0;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const wx = Math.round(84 - 18 * t);
      const wz = Math.round(104 - 8 * t);
      for (let y = 66; y <= 84; y++) if (at(wx, y, wz) === WATER) cascade++;
    }
    expect(cascade).toBeGreaterThan(5);
    // Pool: contained water one block above the lake, over a stone floor.
    expect(at(66, 63, 96)).toBe(WATER);
    expect(at(66, 62, 96)).toBe(STONE);
    expect(at(66, 64, 96)).toBe(AIR);
    expect(at(62, 63, 96)).toBe(STONE); // the rim holds the west edge
  });

  it('keeps trees out of the village square and off the lake', () => {
    const { at } = sampler();
    // Scan the two chunks covering the square for any wood above the bench.
    for (const [cx, cz] of [
      [0, 0],
      [-1, -1],
    ] as const) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        for (let z = 0; z < CHUNK_SIZE_Z; z++) {
          const wx = cx * CHUNK_SIZE_X + x;
          const wz = cz * CHUNK_SIZE_Z + z;
          for (let y = STONEHAVEN.village.benchY + 1; y < STONEHAVEN.village.benchY + 12; y++) {
            const id = at(wx, y, wz);
            expect(id === AIR || id === WATER || id < 5 || id > 6).toBe(true);
          }
        }
      }
    }
  });
});
