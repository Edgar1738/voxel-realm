/** Per-voxel orientation state, packed into one byte. Bits 0-1 facing, bit 2 half, 3-7 reserved. */
export const FACING = { N: 0, E: 1, S: 2, W: 3 } as const;

export function packState(facing: number, half: number): number {
  return (facing & 0b11) | ((half & 0b1) << 2);
}

export function unpackState(s: number): { facing: number; half: number } {
  return { facing: s & 0b11, half: (s >> 2) & 0b1 };
}

/** The 'open' bit of the state byte (bit 3) — used by gates/doors. */
export const OPEN_BIT = 0b1000;

export function isOpen(state: number): boolean {
  return (state & OPEN_BIT) !== 0;
}
export function setOpen(state: number, open: boolean): number {
  return open ? state | OPEN_BIT : state & ~OPEN_BIT;
}
export function toggleOpen(state: number): number {
  return state ^ OPEN_BIT;
}

/**
 * Rotate the facing bits by clockwise-from-above quarter turns (half/open bits preserved).
 * Matches Prefab.rotateY's position map (x,z) → (z, maxX−x): one turn sends N→W→S→E.
 */
export function rotateStateY(state: number, quarterTurns: number): number {
  const turns = ((quarterTurns % 4) + 4) % 4;
  const facing = ((state & 0b11) + 3 * turns) % 4;
  return (state & ~0b11) | facing;
}

/** Swap the facing across a horizontal mirror axis: 'x' flips E↔W, 'z' flips N↔S. */
export function mirrorStateAcross(state: number, axis: 'x' | 'z'): number {
  const facing = state & 0b11;
  const flipped =
    axis === 'x'
      ? facing === FACING.E
        ? FACING.W
        : facing === FACING.W
          ? FACING.E
          : facing
      : facing === FACING.N
        ? FACING.S
        : facing === FACING.S
          ? FACING.N
          : facing;
  return (state & ~0b11) | flipped;
}

/**
 * Horizontal facing (N/E/S/W) the player is looking toward, from camera yaw (radians).
 * Quadrant rounding; the exact N/E/S/W assignment is confirmed visually in the live smoke.
 */
export function facingFromYaw(yaw: number): number {
  const q = Math.round(yaw / (Math.PI / 2));
  return ((q % 4) + 4) % 4;
}

/**
 * The horizontal (dx,dz) each facing looks toward — the forward vector of the yaw that
 * {@link facingFromYaw} maps to that facing (yaw f·π/2 → (−sin, −cos)). Single source of
 * truth for facing↔direction conversions (ladder mounting, door panel edges).
 *
 * ⚠️ STAIR AUTHORS: do NOT derive a stair's orientation from these vectors — E/W here are
 * compass-inverted relative to a stair's low-side convention (`stairBoxes`), which cost a
 * worldgen pass two inverted stair runs. Use `stairState()` / `stairFacingToward()` from
 * app/stairFacing.ts, which are documented and capture-verified.
 */
export const FACING_DIR: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [-1, 0], // E
  [0, 1], // S
  [1, 0], // W
];

/** Facing whose {@link FACING_DIR} matches the horizontal unit direction, or undefined. */
export function facingFromDir(dx: number, dz: number): number | undefined {
  for (let f = 0; f < FACING_DIR.length; f++) {
    if (FACING_DIR[f][0] === dx && FACING_DIR[f][1] === dz) return f;
  }
  return undefined;
}

/** The opposite horizontal facing (N↔S, E↔W). */
export function oppositeFacing(facing: number): number {
  return (facing + 2) % 4;
}
