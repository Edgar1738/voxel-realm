import type { RawShaderMaterial } from 'three';

/**
 * Start surface fog late enough that scenic vistas stay readable, while the final loaded chunks
 * still fade into the sky before the streaming boundary becomes a hard edge.
 */
export const SURFACE_FOG_START_RATIO = 0.82;

export interface FogRange {
  near: number;
  far: number;
}

export function fogRangeFor(farBlocks: number): FogRange {
  const far = Math.max(1, farBlocks);
  return { near: far * SURFACE_FOG_START_RATIO, far };
}

/**
 * Sets the distance-fog band on the chunk materials so terrain fades into the sky right at the
 * view-distance boundary. `farBlocks` is the visible radius in blocks (viewDistance * CHUNK_SIZE_X);
 * fog starts near the edge and saturates at the boundary, masking chunk pop-in as the radius changes.
 */
export function applyFogRange(materials: readonly RawShaderMaterial[], farBlocks: number): void {
  const { near, far } = fogRangeFor(farBlocks);
  for (const m of materials) {
    m.uniforms.uFogNear.value = near;
    m.uniforms.uFogFar.value = far;
  }
}
