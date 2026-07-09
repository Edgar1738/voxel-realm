// src/worldgen/atlas/atlasWorld.ts
//
// Pure assembly of the master "atlas" world from the curated saves. Given each region's shipped
// base (its meta + per-chunk deltas), this:
//   1. translates every region's deltas by its chunk-aligned atlas offset (relative block
//      positions inside a region are preserved exactly — only the chunk key shifts),
//   2. merges them, asserting region footprints stay disjoint,
//   3. stamps a central spawn hub (plaza, beacon spire, per-region signposts, and a road toward
//      each region), and
//   4. synthesizes the atlas WorldMeta (curated spawn/look + a landmark and tour waypoint per
//      region) so the existing play-mode HUD, gold tour beacon, and intro panel just work.
//
// The result is a `ShippedWorldBase` — identical in shape to any single shipped world — so the
// boot path seeds it through the proven ShippedWorldStore + ChunkManager delta pipeline, and the
// regions still stream in lazily one chunk at a time (nothing is meshed until the player is near).
//
// This module is pure and deterministic: no fetch, no fs, no clock. Fetching the region bases and
// wrapping this into a SaveStore lives in src/persistence/atlasBase.ts.
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT, SEA_LEVEL } from '../../core/constants';
import {
  chunkKey,
  parseChunkKey,
  voxelIndex,
  indexToLocal,
  worldToChunkCoord,
  worldToLocal,
} from '../../core/coords';
import { packVoxel, SAVE_VERSION } from '../../persistence/SaveTypes';
import type { WorldDeltas, WorldMeta, MetaPoint } from '../../persistence/SaveTypes';
import type { ShippedWorldBase } from '../../persistence/ShippedWorldStore';
import {
  STONE,
  COBBLESTONE,
  GRAVEL,
  GLASS,
  GLOWSTONE,
  CRYSTAL,
  LANTERN,
  WOOD,
  BRICK,
  PLANKS,
  DEEPSLATE,
} from '../../blocks/blocks';
import {
  WORLD_ATLAS_REGIONS,
  ATLAS_HUB_POSITION,
  ATLAS_TITLE,
  ATLAS_DESCRIPTION,
  regionChunkOffset,
  type AtlasRegion,
} from './atlasRegions';

/**
 * The atlas world seed. Must match the boot SEED in Game.ts (1337) and the curated saves' own
 * seed so the save-compatibility guard loads the atlas base cleanly instead of discarding it.
 */
export const ATLAS_SEED = 1337;

/** The atlas base is flat-preset terrain, so grass sits at sea level and regions meet it seamlessly. */
export const ATLAS_PRESET = 'atlas';

/** One region's shipped base paired with its registry placement. */
export interface AtlasRegionSource {
  region: AtlasRegion;
  base: ShippedWorldBase;
}

/** An inclusive world-space XZ bounding box (block coordinates). */
interface WorldBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// --- hub geometry (all world-space blocks; the flat surface is grass-topped at SEA_LEVEL) ---
const SURFACE_Y = SEA_LEVEL; // the top solid (grass) block of flat terrain; players stand at SURFACE_Y + 1
const HUB_PLAZA_RADIUS = 14; // plaza spans [-14, 14] on X and Z
const HUB_MARKER_RADIUS = 12; // signpost distance from the beacon, along each region's axis
const HUB_BEACON_TOP = SURFACE_Y + 9; // glowstone spire height
const ROAD_HALF_WIDTH = 1; // roads are 3 blocks wide
const ROAD_GAP = 3; // stop the road this many blocks short of a region's footprint

/** Per-region signpost material, so each road head reads as "this way to X". */
const MARKER_BLOCK: Record<string, number> = {
  citadel: BRICK,
  harbor: PLANKS,
  caverns: DEEPSLATE,
};

/** Set one world voxel into a delta map (creating the chunk entry as needed); out-of-height is ignored. */
function setVoxel(deltas: WorldDeltas, wx: number, wy: number, wz: number, id: number): void {
  if (wy < 0 || wy >= WORLD_HEIGHT) return;
  const key = chunkKey(worldToChunkCoord(wx), worldToChunkCoord(wz));
  let map = deltas.get(key);
  if (!map) {
    map = new Map();
    deltas.set(key, map);
  }
  map.set(voxelIndex(worldToLocal(wx), wy, worldToLocal(wz)), packVoxel(id, 0));
}

/**
 * Translate a region's deltas by a whole-chunk offset (+ optional vertical shift). Because X/Z
 * offsets are whole chunks, the chunk key shifts but each voxel's in-chunk (x,z) is untouched, so
 * relative block positions are preserved. A vertical shift re-indexes within the (full-height)
 * chunk column and drops anything pushed out of the world.
 */
export function translateRegionDeltas(
  deltas: WorldDeltas,
  dcx: number,
  dcz: number,
  dy: number,
): WorldDeltas {
  const out: WorldDeltas = new Map();
  for (const [key, map] of deltas) {
    const { cx, cz } = parseChunkKey(key);
    const newKey = chunkKey(cx + dcx, cz + dcz);
    if (dy === 0) {
      out.set(newKey, new Map(map));
      continue;
    }
    const shifted = new Map<number, number>();
    for (const [index, packed] of map) {
      const { x, y, z } = indexToLocal(index);
      const ny = y + dy;
      if (ny < 0 || ny >= WORLD_HEIGHT) continue;
      shifted.set(voxelIndex(x, ny, z), packed);
    }
    out.set(newKey, shifted);
  }
  return out;
}

/** World-space XZ bounds covered by a set of chunk keys (chunk-granular, inclusive). */
function chunkBoundsToWorld(deltas: WorldDeltas): WorldBox {
  let minCx = Infinity;
  let maxCx = -Infinity;
  let minCz = Infinity;
  let maxCz = -Infinity;
  for (const key of deltas.keys()) {
    const { cx, cz } = parseChunkKey(key);
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cz < minCz) minCz = cz;
    if (cz > maxCz) maxCz = cz;
  }
  return {
    minX: minCx * CHUNK_SIZE_X,
    maxX: maxCx * CHUNK_SIZE_X + (CHUNK_SIZE_X - 1),
    minZ: minCz * CHUNK_SIZE_Z,
    maxZ: maxCz * CHUNK_SIZE_Z + (CHUNK_SIZE_Z - 1),
  };
}

/** Translate a source save point into atlas world space. */
function translatePoint(p: MetaPoint, region: AtlasRegion): MetaPoint {
  return {
    x: p.x + region.position.x,
    y: p.y + region.position.y,
    z: p.z + region.position.z,
  };
}

/**
 * Merge region deltas, throwing if two regions land in the same chunk (a placement bug — regions
 * must be spaced so their footprints never share a chunk). Returns the merged deltas and the set
 * of chunk keys the regions occupy (so the hub can assert it doesn't collide with them).
 */
function mergeRegions(sources: readonly AtlasRegionSource[]): {
  deltas: WorldDeltas;
  regionChunks: Set<string>;
} {
  const deltas: WorldDeltas = new Map();
  const owner = new Map<string, string>();
  for (const { region, base } of sources) {
    const { dcx, dcz } = regionChunkOffset(region);
    const translated = translateRegionDeltas(base.deltas, dcx, dcz, region.position.y);
    for (const [key, map] of translated) {
      const existing = owner.get(key);
      if (existing !== undefined && existing !== region.id) {
        throw new Error(
          `atlas: regions "${existing}" and "${region.id}" overlap at chunk ${key} — space them further apart`,
        );
      }
      owner.set(key, region.id);
      deltas.set(key, new Map(map));
    }
  }
  return { deltas, regionChunks: new Set(owner.keys()) };
}

/** Stamp the central hub: plaza floor, glowing beacon spire, corner lanterns, and per-region signposts + roads. */
export function buildHubDeltas(sources: readonly AtlasRegionSource[]): WorldDeltas {
  const deltas: WorldDeltas = new Map();
  const cx = ATLAS_HUB_POSITION.x;
  const cz = ATLAS_HUB_POSITION.z;

  // Plaza floor: a stone square framed by a cobblestone border, flush with the grass surface.
  for (let dx = -HUB_PLAZA_RADIUS; dx <= HUB_PLAZA_RADIUS; dx++) {
    for (let dz = -HUB_PLAZA_RADIUS; dz <= HUB_PLAZA_RADIUS; dz++) {
      const border = Math.abs(dx) === HUB_PLAZA_RADIUS || Math.abs(dz) === HUB_PLAZA_RADIUS;
      setVoxel(deltas, cx + dx, SURFACE_Y, cz + dz, border ? COBBLESTONE : STONE);
    }
  }

  // Central beacon: a glowstone spire sheathed in glass, capped with a crystal — a bright "you are here".
  for (let y = SURFACE_Y + 1; y <= HUB_BEACON_TOP; y++) {
    setVoxel(deltas, cx, y, cz, GLOWSTONE);
    for (const [ox, oz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      setVoxel(deltas, cx + ox, y, cz + oz, GLASS);
    }
  }
  setVoxel(deltas, cx, HUB_BEACON_TOP + 1, cz, CRYSTAL);

  // Corner lantern posts frame the plaza and light it at night.
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const px = cx + sx * (HUB_PLAZA_RADIUS - 2);
    const pz = cz + sz * (HUB_PLAZA_RADIUS - 2);
    for (let y = SURFACE_Y + 1; y <= SURFACE_Y + 3; y++) setVoxel(deltas, px, y, pz, WOOD);
    setVoxel(deltas, px, SURFACE_Y + 4, pz, LANTERN);
  }

  // Per-region signpost pillar + road toward that region.
  for (const source of sources) {
    const { region } = source;
    const { ux, uz } = axisUnit(region);
    const marker = MARKER_BLOCK[region.id] ?? STONE;
    const mx = cx + ux * HUB_MARKER_RADIUS;
    const mz = cz + uz * HUB_MARKER_RADIUS;
    for (let y = SURFACE_Y + 1; y <= SURFACE_Y + 4; y++) setVoxel(deltas, mx, y, mz, marker);
    setVoxel(deltas, mx, SURFACE_Y + 5, mz, GLOWSTONE);

    stampRoad(deltas, source, ux, uz);
  }

  return deltas;
}

/** The unit direction (one of ±X / ±Z) pointing from the hub toward a region. */
function axisUnit(region: AtlasRegion): { ux: number; uz: number } {
  return {
    ux: Math.sign(region.position.x),
    uz: Math.sign(region.position.z),
  };
}

/** Pave a straight gravel road from the plaza edge to just short of the region's footprint. */
function stampRoad(deltas: WorldDeltas, source: AtlasRegionSource, ux: number, uz: number): void {
  const { region, base } = source;
  const { dcx, dcz } = regionChunkOffset(region);
  const box = chunkBoundsToWorld(translateRegionDeltas(base.deltas, dcx, dcz, region.position.y));
  const start = HUB_PLAZA_RADIUS + 1; // first block outside the plaza
  // Distance from the hub to the region's near face along the travel axis.
  const nearFace = ux !== 0 ? (ux > 0 ? box.minX : -box.maxX) : uz > 0 ? box.minZ : -box.maxZ;
  const end = nearFace - ROAD_GAP;
  for (let d = start; d <= end; d++) {
    for (let off = -ROAD_HALF_WIDTH; off <= ROAD_HALF_WIDTH; off++) {
      // Along the axis by `d`; widen on the perpendicular axis by `off`.
      const wx = ATLAS_HUB_POSITION.x + ux * d + (ux === 0 ? off : 0);
      const wz = ATLAS_HUB_POSITION.z + uz * d + (uz === 0 ? off : 0);
      setVoxel(deltas, wx, SURFACE_Y, wz, GRAVEL);
    }
  }
}

/** Merge `src` into `dst` (per-voxel; `src` wins on any shared voxel). */
function mergeInto(dst: WorldDeltas, src: WorldDeltas): void {
  for (const [key, map] of src) {
    const existing = dst.get(key);
    if (!existing) {
      dst.set(key, new Map(map));
      continue;
    }
    for (const [index, packed] of map) existing.set(index, packed);
  }
}

/** Build the atlas WorldMeta: curated identity + a landmark and tour waypoint per region. */
export function buildAtlasMeta(sources: readonly AtlasRegionSource[]): WorldMeta {
  const spawn: MetaPoint = { x: 0.5, y: SURFACE_Y + 2, z: 12.5 };
  const landmarks: Array<{ name: string } & MetaPoint> = [
    { name: 'Spawn Hub', x: ATLAS_HUB_POSITION.x, y: SURFACE_Y + 1, z: ATLAS_HUB_POSITION.z },
  ];
  const tour: Array<{ name?: string } & MetaPoint> = [
    { name: 'Spawn Hub', x: ATLAS_HUB_POSITION.x, y: SURFACE_Y + 2, z: ATLAS_HUB_POSITION.z + 6 },
  ];

  for (const { region, base } of sources) {
    // Prefer the source save's authored arrival; fall back to the region anchor.
    const entrance = base.meta.spawn
      ? translatePoint(base.meta.spawn, region)
      : { x: region.position.x, y: SURFACE_Y + 2, z: region.position.z };
    landmarks.push({ name: region.name, ...entrance });
    tour.push({ name: region.name, ...entrance });
  }
  // Close the loop back at the hub so the tour has a clear finish.
  tour.push({
    name: 'Return to Hub',
    x: ATLAS_HUB_POSITION.x,
    y: SURFACE_Y + 2,
    z: ATLAS_HUB_POSITION.z + 6,
  });

  return {
    seed: ATLAS_SEED,
    version: SAVE_VERSION,
    preset: ATLAS_PRESET,
    title: ATLAS_TITLE,
    description: ATLAS_DESCRIPTION,
    spawn,
    look: { yaw: 0, pitch: 0.05 },
    landmarks,
    tour,
  };
}

/**
 * Assemble the whole atlas from its region sources. Pure and deterministic. Throws if the sources
 * are misconfigured (region footprints overlap, or the hub collides with a region).
 */
export function buildAtlasWorld(sources: readonly AtlasRegionSource[] = []): ShippedWorldBase {
  const { deltas, regionChunks } = mergeRegions(sources);

  const hub = buildHubDeltas(sources);
  for (const key of hub.keys()) {
    if (regionChunks.has(key)) {
      throw new Error(`atlas: hub overlaps a region at chunk ${key} — move the hub or the region`);
    }
  }
  mergeInto(deltas, hub);

  return { meta: buildAtlasMeta(sources), deltas };
}

/** The registry rows the assembler expects, exported for the fetch wrapper. */
export const ATLAS_SOURCES = WORLD_ATLAS_REGIONS;
