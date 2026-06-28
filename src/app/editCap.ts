/** Maximum voxels that a single edit operation may touch. Guards against runaway selections. */
export const MAX_EDIT_VOXELS = 8192;

/**
 * Returns true if the edit count is within the allowed cap (inclusive).
 * A count exactly equal to the cap is permitted; one over is rejected.
 *
 * Extracted from the inline `run()` guard in Game.boot so it can be unit-tested
 * without instantiating any game objects.
 */
export function withinEditCap(count: number, cap: number): boolean {
  return count <= cap;
}
