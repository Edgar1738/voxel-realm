import { resolveSaveAction } from '../persistence/SaveGuard';
import type { WorldMeta } from '../persistence/SaveTypes';

/** Original terrain behavior used by saves created before universal underground generation. */
export const LEGACY_WORLDGEN_VERSION = 1;
/** High-ceiling caverns and deep volcanic geology. */
export const CURRENT_WORLDGEN_VERSION = 2;

/**
 * Existing compatible saves keep their recorded generator (or legacy v1 when the field is
 * absent). New/incompatible worlds use the current generator. This prevents a feature release
 * from silently reshaping the terrain underneath saved player edits.
 */
export function resolveWorldgenVersion(
  meta: WorldMeta | undefined,
  seed: number,
  saveVersion: number,
  preset: string,
): number {
  const action = resolveSaveAction(meta, seed, saveVersion, preset);
  if (action.kind !== 'load') return CURRENT_WORLDGEN_VERSION;
  return meta?.worldgenVersion === CURRENT_WORLDGEN_VERSION
    ? CURRENT_WORLDGEN_VERSION
    : LEGACY_WORLDGEN_VERSION;
}
