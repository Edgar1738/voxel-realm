import { describe, it, expect } from 'vitest';
import {
  fairyFountain,
  fountainPlacement,
  scatterFairyFountains,
  FOUNTAIN_DEPTH,
  FOUNTAIN_MOUTH,
  type FountainTheme,
} from '../src/worldgen/fairyFountainPrefabs';
import { ChunkData } from '../src/world/ChunkData';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, SEA_LEVEL } from '../src/core/constants';
import {
  AIR,
  WATER,
  LAVA,
  GLOWSTONE,
  COBBLESTONE,
  CRYSTAL,
  STONE,
  LEAVES,
  FLOWER,
  TALL_GRASS,
} from '../src/blocks/blocks';
import { citadelSurfaceAt } from '../src/worldgen/CitadelGenerator';
import { grandKeepSurfaceAt } from '../src/worldgen/GrandKeepGenerator';
import { cloudspireSurfaceAt } from '../src/worldgen/CloudspireGenerator';
import { ashenReachSurfaceAt } from '../src/worldgen/AshenReachGenerator';
import { harborSurfaceAt } from '../src/worldgen/HarborGenerator';
import { stonehavenSurfaceAt } from '../src/worldgen/StonehavenGenerator';

const THEMES: FountainTheme[] = ['crystal', 'verdant', 'ember'];
const POOL_BLOCK: Record<FountainTheme, number> = { crystal: WATER, verdant: WATER, ember: LAVA };

const SURFACE = 64;
const flatAt = (_seed: number, _x: number, _z: number): number => SURFACE;

/** Stamp the overlay chunk-by-chunk over solid stone and answer world-coordinate lookups. */
function stampWorld(seed: number, minX: number, maxX: number, minZ: number, maxZ: number) {
  const overlay = scatterFairyFountains(flatAt, { cellSize: 128, density: 1 });
  const chunks = new Map<string, ChunkData>();
  for (let cx = Math.floor(minX / CHUNK_SIZE_X); cx <= Math.floor(maxX / CHUNK_SIZE_X); cx++) {
    for (let cz = Math.floor(minZ / CHUNK_SIZE_Z); cz <= Math.floor(maxZ / CHUNK_SIZE_Z); cz++) {
      const chunk = new ChunkData(cx, cz);
      for (let z = 0; z < CHUNK_SIZE_Z; z++)
        for (let x = 0; x < CHUNK_SIZE_X; x++)
          for (let y = 0; y <= SURFACE; y++) chunk.set(x, y, z, STONE);
      overlay(chunk, cx, cz, seed);
      chunks.set(`${cx},${cz}`, chunk);
    }
  }
  return (wx: number, wy: number, wz: number): number => {
    const cx = Math.floor(wx / CHUNK_SIZE_X);
    const cz = Math.floor(wz / CHUNK_SIZE_Z);
    const chunk = chunks.get(`${cx},${cz}`);
    if (!chunk) throw new Error(`no chunk at ${cx},${cz}`);
    return chunk.get(wx - cx * CHUNK_SIZE_X, wy, wz - cz * CHUNK_SIZE_Z);
  };
}

describe.each(THEMES)('fairyFountain prefab (%s)', (theme) => {
  const prefab = fairyFountain(theme);
  const pool = POOL_BLOCK[theme];
  const byKey = new Map<string, number>();
  for (const [x, y, z, id] of prefab.blocks) byKey.set(`${x},${y},${z}`, id);

  it('contains the pool: every fluid voxel is sealed on all sides and below', () => {
    const at = (x: number, y: number, z: number): number => byKey.get(`${x},${y},${z}`) ?? -1;
    let fluidCount = 0;
    for (const [x, y, z, id] of prefab.blocks) {
      if (id !== pool) continue;
      fluidCount++;
      for (const [nx, ny, nz] of [
        [x + 1, y, z],
        [x - 1, y, z],
        [x, y, z + 1],
        [x, y, z - 1],
        [x, y - 1, z],
      ]) {
        const n = at(nx, ny, nz);
        expect(n, `pool at ${x},${y},${z} leaks toward ${nx},${ny},${nz}`).not.toBe(AIR);
        expect(n, `pool at ${x},${y},${z} borders unlisted terrain`).not.toBe(-1);
      }
    }
    expect(fluidCount).toBeGreaterThan(20);
  });

  it('keeps a walkable descent: solid floor, 3-high headroom, steps of at most 1', () => {
    // Walk like the player: from each floor, the next column's floor is the highest solid at or
    // below one step up — never scanning above head height, so ceilings don't read as floors.
    const solidFloorBelow = (x: number, z: number, from: number): number => {
      for (let y = from; y >= 0; y--) {
        const id = byKey.get(`${x},${y},${z}`);
        if (id !== undefined && id !== AIR) return y;
      }
      return -1;
    };
    const [mx] = FOUNTAIN_MOUTH;
    let prev = FOUNTAIN_DEPTH;
    for (let z = 44; z >= 12; z--) {
      const fy = solidFloorBelow(mx, z, prev + 1);
      expect(fy, `no floor under x=${mx}, z=${z}`).toBeGreaterThanOrEqual(0);
      for (let y = fy + 1; y <= fy + 3; y++) {
        const id = byKey.get(`${mx},${y},${z}`) ?? AIR;
        expect(id === AIR || id === pool, `headroom blocked at ${mx},${y},${z} (id ${id})`).toBe(
          true,
        );
      }
      if (prev >= 0)
        expect(Math.abs(prev - fy), `step >1 between z=${z + 1} and z=${z}`).toBeLessThanOrEqual(1);
      prev = fy;
    }
  });

  it('dresses to its theme: plants only where alive, garlands only when verdant', () => {
    const ids = new Set(prefab.blocks.map((b) => b[3]));
    expect(ids.has(pool)).toBe(true);
    if (theme === 'ember') {
      expect(ids.has(FLOWER) || ids.has(TALL_GRASS)).toBe(false);
      expect(ids.has(WATER)).toBe(false);
    } else {
      expect(ids.has(FLOWER)).toBe(true);
      expect(ids.has(TALL_GRASS)).toBe(true);
      expect(ids.has(LAVA)).toBe(false);
    }
    expect(ids.has(LEAVES)).toBe(theme === 'verdant');
  });
});

describe('scatterFairyFountains', () => {
  it('skips placements whose mouth would sit at or below sea level', () => {
    const wet = (_seed: number, _x: number, _z: number): number => SEA_LEVEL;
    expect(fountainPlacement(1, 0, 0, 128, 1, wet)).toBeNull();
  });

  it('skips placements whose chamber would breach the surface', () => {
    // The candidate's (ox, oz) roll is independent of terrain, so learn it on flat ground first,
    // then re-query with a slope that keeps the mouth high but drops the ground over the chamber.
    const p = fountainPlacement(7, 0, 0, 128, 1, flatAt);
    expect(p).not.toBeNull();
    if (!p) return;
    const [, mz] = FOUNTAIN_MOUTH;
    const sloped = (_seed: number, _x: number, z: number): number =>
      z === p.oz + mz ? SURFACE : FOUNTAIN_DEPTH + 4;
    expect(fountainPlacement(7, 0, 0, 128, 1, sloped)).toBeNull();
  });

  it('stamps the prefab byte-identically across chunk borders', () => {
    const seed = 1337;
    const p = fountainPlacement(seed, 0, 0, 128, 1, flatAt);
    expect(p).not.toBeNull();
    if (!p) return;
    const prefab = fairyFountain();
    const at = stampWorld(seed, p.ox, p.ox + 23, p.oz, p.oz + 45);
    for (const [dx, dy, dz, id] of prefab.blocks) {
      expect(
        at(p.ox + dx, p.oy + dy, p.oz + dz),
        `mismatch at prefab offset ${dx},${dy},${dz}`,
      ).toBe(id);
    }
  });

  it('anchors the tunnel mouth at the terrain surface with an open doorway', () => {
    const seed = 1337;
    const p = fountainPlacement(seed, 0, 0, 128, 1, flatAt);
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p.oy).toBe(SURFACE - FOUNTAIN_DEPTH);
    const at = stampWorld(seed, p.ox, p.ox + 23, p.oz, p.oz + 45);
    const [mx, mz] = FOUNTAIN_MOUTH;
    expect(at(p.ox + mx, SURFACE, p.oz + mz)).toBe(COBBLESTONE);
    for (let y = SURFACE + 1; y <= SURFACE + 3; y++) expect(at(p.ox + mx, y, p.oz + mz)).toBe(AIR);
  });

  it('buries a glowing chamber: water over glowstone, crystals, and carved air', () => {
    const seed = 1337;
    const p = fountainPlacement(seed, 0, 0, 128, 1, flatAt);
    expect(p).not.toBeNull();
    if (!p) return;
    const at = stampWorld(seed, p.ox, p.ox + 23, p.oz, p.oz + 45);
    const cx = p.ox + 11;
    const cz = p.oz + 11;
    expect(at(cx + 1, p.oy + 3, cz)).toBe(WATER);
    expect(at(cx + 1, p.oy + 2, cz)).toBe(GLOWSTONE);
    expect(at(cx, p.oy + 8, cz)).toBe(CRYSTAL); // spire crown
    expect(at(cx + 7, p.oy + 4, cz)).toBe(AIR); // carved chamber air
    expect(at(cx, SURFACE - 1, cz)).toBe(STONE); // chamber stays buried under terrain
  });
});

describe('authored showcase fountains', () => {
  // Must mirror the fairyFountainAt calls in Presets.ts exactly.
  const SITES: Array<[string, (seed: number, x: number, z: number) => number, number, number]> = [
    ['citadel', citadelSurfaceAt, -161, -74],
    ['grand-keep', grandKeepSurfaceAt, 232, -24],
    ['cloudspire-citadel', cloudspireSurfaceAt, -11, 196],
    ['ashen-reach', ashenReachSurfaceAt, -161, -54],
    ['harbor', harborSurfaceAt, -131, -14],
    ['stonehaven', stonehavenSurfaceAt, -95, -14],
  ];
  const GAME_SEED = 1337; // the fixed boot seed in Game.ts

  it.each(SITES)('%s: mouth on dry land and chamber fully buried', (_name, surfaceAt, ox, oz) => {
    const [mx, mz] = FOUNTAIN_MOUTH;
    const mouthSurface = Math.round(surfaceAt(GAME_SEED, ox + mx, oz + mz));
    expect(mouthSurface, 'mouth must sit above the waterline').toBeGreaterThan(SEA_LEVEL + 1);
    const oy = mouthSurface - FOUNTAIN_DEPTH;
    expect(oy).toBeGreaterThanOrEqual(1);
    // Same cover rule the random scatter enforces: dome top (local 15) + 2 blocks of terrain.
    for (const [dx, dz] of [
      [11, 11],
      [4, 4],
      [18, 4],
      [4, 18],
      [18, 18],
    ]) {
      expect(
        Math.round(surfaceAt(GAME_SEED, ox + dx, oz + dz)) - oy,
        `thin cover over chamber column +${dx},+${dz}`,
      ).toBeGreaterThanOrEqual(17);
    }
  });
});
