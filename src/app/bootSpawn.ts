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

/** Resolve the boot spawn/look, applying override > meta > fallback per field. */
export function resolveSpawn(
  meta: Pick<WorldMeta, 'spawn' | 'look'> | undefined,
  overrides: SpawnOverrides,
  fallback: SpawnState,
): SpawnState {
  return {
    spawn: overrides.spawn ?? meta?.spawn ?? fallback.spawn,
    look: overrides.look ?? meta?.look ?? fallback.look,
  };
}

/**
 * Clamp the spawn `y` into `[0, worldHeight]` so a wild curated `y` can't fling the
 * camera into the void. Boot starts the player flying, so no solidity check is needed.
 */
export function clampSpawnY(state: SpawnState, worldHeight: number): SpawnState {
  const y = Math.max(0, Math.min(worldHeight, state.spawn.y));
  if (y === state.spawn.y) return state;
  return { spawn: { ...state.spawn, y }, look: state.look };
}
