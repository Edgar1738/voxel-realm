/** Per-voxel orientation state, packed into one byte. Bits 0-1 facing, bit 2 half, 3-7 reserved. */
export const FACING = { N: 0, E: 1, S: 2, W: 3 } as const;

export function packState(facing: number, half: number): number {
  return (facing & 0b11) | ((half & 0b1) << 2);
}

export function unpackState(s: number): { facing: number; half: number } {
  return { facing: s & 0b11, half: (s >> 2) & 0b1 };
}

/**
 * Horizontal facing (N/E/S/W) the player is looking toward, from camera yaw (radians).
 * Quadrant rounding; the exact N/E/S/W assignment is confirmed visually in the live smoke.
 */
export function facingFromYaw(yaw: number): number {
  const q = Math.round(yaw / (Math.PI / 2));
  return ((q % 4) + 4) % 4;
}
