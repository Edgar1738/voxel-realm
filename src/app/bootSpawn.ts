/**
 * Pure boot spawn/look resolution, extracted from `Game.boot` so it can be unit-tested.
 * Precedence is per-field: URL query override > saved world meta > the fixed default.
 */
import type { MetaPoint, WorldMeta } from '../persistence/SaveTypes';

export interface SpawnState {
  spawn: MetaPoint;
  look: { yaw: number; pitch: number };
}

export interface SpawnOverrides {
  spawn?: MetaPoint;
  look?: { yaw: number; pitch: number };
}

/** Resumed position/look/flying from a prior session (see resumeState.ts). */
export interface ResumeSpawn {
  spawn?: MetaPoint;
  look?: { yaw: number; pitch: number };
  flying?: boolean;
}

/** Which source won a spawn/look field, so the caller can e.g. only ground-settle the default. */
export type SpawnSource = 'url' | 'resume' | 'meta' | 'default';

export interface ResolvedSpawn extends SpawnState {
  positionSource: SpawnSource;
  lookSource: SpawnSource;
  /** Boot flying-state — defined only when the resumed position won, else undefined (boot flies). */
  flying: boolean | undefined;
}

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n);
}

/** Parse a comma-separated list of exactly `count` finite numbers, or undefined. */
function parseNumbers(raw: string | null, count: number): number[] | undefined {
  if (raw === null) return undefined;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== count || !parts.every(isFiniteNumber)) return undefined;
  return parts;
}

/** Parse `?spawn=x,y,z` and `?look=yaw,pitch` from a URL search string, ignoring malformed values. */
export function parseSpawnOverrides(search: string): SpawnOverrides {
  const params = new URLSearchParams(search);
  const overrides: SpawnOverrides = {};

  const spawn = parseNumbers(params.get('spawn'), 3);
  if (spawn) overrides.spawn = { x: spawn[0], y: spawn[1], z: spawn[2] };

  const look = parseNumbers(params.get('look'), 2);
  if (look) overrides.look = { yaw: look[0], pitch: look[1] };

  return overrides;
}

/**
 * Resolve the boot spawn/look with per-field precedence: URL override > resume > saved meta >
 * fallback. Position and look are resolved independently, so `?spawn=` can override a resumed
 * position while the resumed look survives (and vice versa). Reports the winning source per field;
 * `flying` is set only when the resumed position won, so a normal boot still starts flying.
 */
export function resolveSpawn(
  meta: Pick<WorldMeta, 'spawn' | 'look'> | undefined,
  overrides: SpawnOverrides,
  resume: ResumeSpawn | undefined,
  fallback: SpawnState,
): ResolvedSpawn {
  let spawn: MetaPoint;
  let positionSource: SpawnSource;
  if (overrides.spawn) {
    spawn = overrides.spawn;
    positionSource = 'url';
  } else if (resume?.spawn) {
    spawn = resume.spawn;
    positionSource = 'resume';
  } else if (meta?.spawn) {
    spawn = meta.spawn;
    positionSource = 'meta';
  } else {
    spawn = fallback.spawn;
    positionSource = 'default';
  }

  let look: { yaw: number; pitch: number };
  let lookSource: SpawnSource;
  if (overrides.look) {
    look = overrides.look;
    lookSource = 'url';
  } else if (resume?.look) {
    look = resume.look;
    lookSource = 'resume';
  } else if (meta?.look) {
    look = meta.look;
    lookSource = 'meta';
  } else {
    look = fallback.look;
    lookSource = 'default';
  }

  return {
    spawn,
    look,
    positionSource,
    lookSource,
    flying: positionSource === 'resume' ? resume?.flying : undefined,
  };
}

/**
 * Body-center Y for a player standing on the highest solid block of the (x, z) column, or
 * undefined when the column has no solid block. Used to settle the default hovering spawn
 * onto the terrain once the initial chunk burst has loaded it.
 */
export function groundSpawnY(
  isSolid: (x: number, y: number, z: number) => boolean,
  x: number,
  z: number,
  worldHeight: number,
  halfHeight: number,
): number | undefined {
  for (let y = worldHeight - 1; y >= 0; y--) {
    if (isSolid(x, y, z)) return y + 1 + halfHeight;
  }
  return undefined;
}

/**
 * Clamp the spawn `y` into `[0, worldHeight]` so a wild curated `y` can't fling the
 * camera into the void. Boot starts the player flying, so no solidity check is needed.
 */
export function clampSpawnY<T extends SpawnState>(state: T, worldHeight: number): T {
  const y = Math.max(0, Math.min(worldHeight, state.spawn.y));
  if (y === state.spawn.y) return state;
  return { ...state, spawn: { ...state.spawn, y } };
}
