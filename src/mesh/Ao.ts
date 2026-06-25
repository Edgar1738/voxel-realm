/**
 * Standard voxel vertex AO. `side1`/`side2` are the two edge-adjacent occluders and
 * `corner` is the diagonal one (each 1 if opaque, else 0). Returns 0 (dark) .. 3 (lit).
 */
export function vertexAO(side1: number, side2: number, corner: number): number {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

const AO_BRIGHTNESS = [0.45, 0.65, 0.85, 1.0];

/** Maps an AO level (0..3) to a brightness multiplier baked into the mesh. */
export function aoBrightness(level: number): number {
  return AO_BRIGHTNESS[level];
}
