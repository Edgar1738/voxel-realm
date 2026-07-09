// src/worldgen/atlas/atlasRegions.ts
//
// The World Atlas registry: a declarative map from shipped save snapshots (public/worlds/<slug>.json)
// to world-space positions inside one master "atlas" world. Each entry becomes an explorable region
// placed as a "prefab" around a central spawn hub. The registry is the single source of truth the
// assembler (atlasWorld.ts) reads to translate + merge region deltas; keeping it pure and declarative
// lets tests assert the invariants (unique ids, chunk-aligned + non-overlapping placement, source
// saves that actually exist) without touching the renderer or any I/O.
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../../core/constants';

/** A world-space anchor. A region's own origin (its save's block 0,0,0) lands here in the atlas. */
export interface AtlasPosition {
  x: number;
  y: number;
  z: number;
}

/** One placed region in the master atlas world. */
export interface AtlasRegion {
  /** Stable, unique atlas id (URL/log-safe). */
  id: string;
  /** Player-facing display name (landmark + tour label). */
  name: string;
  /**
   * The shipped save this region is a placed copy of — a slug under public/worlds/ and a
   * matching world-manifest.json entry. The save's blocks are translated by {@link position}.
   */
  sourceSave: string;
  /**
   * World-space offset added to every block of the source save. X and Z MUST be multiples of the
   * chunk size so a region maps whole-chunk to whole-chunk (its in-chunk voxel indices are
   * preserved exactly, so relative block positions are never disturbed). Y is normally 0: the
   * curated saves are all flat-preset builds sitting at sea level, and the atlas base is the same
   * flat terrain, so a zero Y offset keeps each region at its native elevation.
   */
  position: AtlasPosition;
  /** Compass direction from the hub, used to aim the hub's signpost + road toward the region. */
  direction: 'north' | 'south' | 'east' | 'west';
  /** Short blurb shown on the atlas intro panel / docs. */
  blurb: string;
}

/** The world name (`?save=<name>`) that boots the master atlas world. */
export const ATLAS_WORLD_NAME = 'atlas';

/** Player-facing identity of the master world (surfaced in meta.title/description). */
export const ATLAS_TITLE = 'World Atlas';
export const ATLAS_DESCRIPTION =
  'A master world that gathers the curated realms into one map. Spawn at the central hub, ' +
  'follow a signpost road east to the Moonspire Citadel, west to Tidewreck Cove, or north ' +
  'to the Glow Caverns — each a full saved world placed as its own district.';

/**
 * The atlas hub sits at the world origin. Regions are pushed far out along the compass axes so
 * their chunk footprints never overlap each other or the hub, leaving clean flat terrain (and a
 * signpost road) to travel across between districts — and plenty of room to add more later.
 */
export const ATLAS_HUB_POSITION: AtlasPosition = { x: 0, y: 0, z: 0 };

/**
 * World Atlas V1. Three curated saves, placed on the E/W/N axes. Giza and Washington Park are
 * intentionally left out of V1: at ~8 MB each their snapshots are too heavy to fetch eagerly at
 * boot. See docs/worlds/atlas.md for how to add another saved world.
 *
 * Placement math (chunk = 16 blocks): each `position` is chunk-aligned (x,z % 16 === 0) and far
 * enough out that translated footprints stay disjoint — moonspire spans ~17x16 chunks, the others
 * ~8 chunks, so a 640-block (40-chunk) reach on each axis leaves a wide, empty buffer.
 */
export const WORLD_ATLAS_REGIONS: readonly AtlasRegion[] = [
  {
    id: 'citadel',
    name: 'Moonspire Citadel',
    sourceSave: 'moonspire-realm',
    position: { x: 640, y: 0, z: 0 },
    direction: 'east',
    blurb: 'A moated fortress-kingdom: drawbridge, keep, and the Moonspire beyond the walls.',
  },
  {
    id: 'harbor',
    name: 'Tidewreck Cove',
    sourceSave: 'tidewreck-cove',
    position: { x: -640, y: 0, z: 0 },
    direction: 'west',
    blurb: 'A cliff-ringed fishing harbor with a striped lighthouse and a smugglers’ sea cave.',
  },
  {
    id: 'caverns',
    name: 'Glow Caverns',
    sourceSave: 'caverns',
    position: { x: 0, y: 0, z: -640 },
    direction: 'north',
    blurb: 'A ruined tower over a vast crystal cavern, waterfall, and hidden hamlet below.',
  },
];

/** The whole-chunk offset (in chunk units) a region's blocks shift by. Assumes chunk-aligned X/Z. */
export function regionChunkOffset(region: AtlasRegion): { dcx: number; dcz: number } {
  return { dcx: region.position.x / CHUNK_SIZE_X, dcz: region.position.z / CHUNK_SIZE_Z };
}

/**
 * Structural problems with the registry (empty = valid), independent of any snapshot data:
 * unique ids/saves, chunk-aligned X/Z placement, finite Y, and a minimum chunk gap between
 * anchors so translated footprints can't collide. The data-aware check (real footprints don't
 * overlap, referenced saves exist) lives in the assembler + tests, which have the snapshots.
 */
export function atlasRegionProblems(
  regions: readonly AtlasRegion[] = WORLD_ATLAS_REGIONS,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const saves = new Set<string>();
  for (const r of regions) {
    if (!r.id.trim()) problems.push('a region has an empty id');
    else if (ids.has(r.id)) problems.push(`duplicate region id "${r.id}"`);
    ids.add(r.id);

    if (saves.has(r.sourceSave)) problems.push(`duplicate sourceSave "${r.sourceSave}"`);
    saves.add(r.sourceSave);

    if (!r.name.trim()) problems.push(`region "${r.id}" has an empty name`);
    if (r.position.x % CHUNK_SIZE_X !== 0)
      problems.push(`region "${r.id}" position.x ${r.position.x} is not chunk-aligned`);
    if (r.position.z % CHUNK_SIZE_Z !== 0)
      problems.push(`region "${r.id}" position.z ${r.position.z} is not chunk-aligned`);
    if (!Number.isFinite(r.position.y)) problems.push(`region "${r.id}" position.y is not finite`);
  }
  return problems;
}
