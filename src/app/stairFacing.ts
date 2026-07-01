import { FACING, packState } from '../world/VoxelState';

/**
 * Compass facing of a stair's low/front side — the direction you'd walk up it. This matches a
 * player-placed stair (a player looking north drops an 'n'-facing stair), so builders can reason
 * about orientation the same way in-hand and from a script.
 *
 * In world axes: 'n' = low side toward -z, 's' = +z, 'e' = +x, 'w' = -x (the tall riser is on the
 * opposite side). Confirmed against `stairBoxes` and a live capture.
 */
export type StairFacing = 'n' | 'e' | 's' | 'w';

const CODE_BY_NAME: Record<StairFacing, number> = {
  n: FACING.N,
  e: FACING.E,
  s: FACING.S,
  w: FACING.W,
};

/** Packed facing code (0..3) for a StairFacing name (case-insensitive). Throws on anything else. */
export function stairFacingCode(facing: string): number {
  const code = CODE_BY_NAME[facing.toLowerCase() as StairFacing];
  if (code === undefined) throw new Error(`invalid stair facing "${facing}" (use n/e/s/w)`);
  return code;
}

/** Packed voxel state for a stair with the given facing; `top: true` flips it upside-down (half bit). */
export function stairState(facing: string, opts: { top?: boolean } = {}): number {
  return packState(stairFacingCode(facing), opts.top ? 1 : 0);
}

/**
 * The stair facing whose low/front side points along the dominant of (dx, dz) — i.e. "outward".
 * Point a roof edge away from the ridge, or ramp toward a direction of travel: pass the outward
 * vector and place stairs with the returned facing. -z => 'n', +z => 's', +x => 'e', -x => 'w'.
 * Ties (|dx| === |dz|) resolve to the z axis.
 */
export function stairFacingToward(dx: number, dz: number): StairFacing {
  if (Math.abs(dx) > Math.abs(dz)) return dx >= 0 ? 'e' : 'w';
  return dz >= 0 ? 's' : 'n';
}
