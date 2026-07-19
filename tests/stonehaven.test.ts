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
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL, WORLD_HEIGHT } from '../src/core/constants';
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
} from '../src/blocks/blocks';

const SEED = 1337;

/** A whole-world sampler: generates (and overlays) chunks on demand and reads by world coords. */
function makeSampler(seed = SEED): {
  at: (wx: number, wy: number, wz: number) => number;
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
  return { at, chunkOf };
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
      for (let y = 0; y < WORLD_HEIGHT; y += 7) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          for (let z = 0; z < CHUNK_SIZE_Z; z++) {
            expect(ca.get(x, y, z)).toBe(cb.get(x, y, z));
          }
        }
      }
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
    const { at } = makeSampler();
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
    const { at } = makeSampler();
    const b = STONEHAVEN_SITES.bridge;
    const midX = Math.round((b.x0 + b.x1) / 2);
    const midZ = Math.round((b.z0 + b.z1) / 2);
    expect(at(midX, b.deckY, midZ)).toBe(STONE); // the deck
    expect(at(b.x0, b.deckY + 1, midZ)).toBe(COBBLE_WALL); // a parapet
    expect(at(midX, b.deckY - 2, midZ)).toBe(AIR); // the open span beneath
    // The terrain gap is real: the groove passes well under the deck…
    expect(stonehavenSurfaceAt(SEED, midX, midZ)).toBeLessThan(b.deckY - 4);
    // …and the graded road meets the deck flush at the north approach.
    expect(Math.abs(stonehavenSurfaceAt(SEED, 100, 104) - b.deckY)).toBeLessThanOrEqual(1);
  });

  it('builds the harbor quay and a lamplit pier at the waterfront', () => {
    const { at } = makeSampler();
    const hb = STONEHAVEN_SITES.harbor;
    const pier = hb.pier;
    expect(at(pier.x, hb.apronY, pier.z1)).toBe(PLANKS); // pier head deck
    expect(at(pier.x, hb.apronY - 1, pier.z1)).toBe(WATER); // standing over the lake
    expect(at(pier.x - 1, hb.apronY + 2, pier.z1)).toBe(LANTERN); // head lamps
    // The esplanade is paved at apron level (sampled west of the road ramp's blend zone).
    expect([STONE, COBBLESTONE]).toContain(at(hb.cx - 8, hb.apronY, hb.cz + 1));
  });

  it('raises fortress massing: keep above the knoll, walls, and a lit gate over the road', () => {
    const { at } = makeSampler();
    const w = STONEHAVEN_SITES.ward;
    const k = w.keep;
    const kx = Math.round((k.x0 + k.x1) / 2);
    const kz = Math.round((k.z0 + k.z1) / 2);
    expect(at(kx, k.topY, kz)).toBe(STONE); // the keep mass tops out at the authored height
    expect(at(kx, k.topY + 2, kz)).toBe(AIR); // …and is a rimmed roof, not a spike of fill
    // Curtain wall stands above the plateau on the east edge.
    expect(at(w.x1, w.wallTopY, Math.round((w.z0 + w.z1) / 2))).toBe(STONE);
    // The gate passage is walkable air over the road surface, under a stone lintel.
    const g = w.gate;
    const gh = stonehavenSurfaceAt(SEED, -66, g.z);
    expect(at(-66, gh + 1, g.z)).toBe(AIR);
    expect(at(-66, gh + 2, g.z)).toBe(AIR);
    expect(at(-66, gh + 4, g.z)).toBe(STONE);
    // The ward court is paved where the climb arrives.
    const hC = stonehavenSurfaceAt(SEED, -58, 132);
    expect([STONE, COBBLESTONE]).toContain(at(-58, hC, 132));
    expect(at(-58, hC + 2, 132)).toBe(LANTERN); // the waymark plinth
  });

  it('paves the road with a solid cobble center line', () => {
    const { at } = makeSampler();
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
    const { at } = makeSampler();
    for (const vp of STONEHAVEN_SITES.viewpoints) {
      const h = stonehavenSurfaceAt(SEED, vp.x, vp.z);
      expect([STONE, COBBLESTONE, GRAVEL]).toContain(at(vp.x, h, vp.z));
    }
  });

  it('keeps trees out of the village square and off the lake', () => {
    const { at } = makeSampler();
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
