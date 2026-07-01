import type { RawShaderMaterial } from 'three';

/**
 * Sets the distance-fog band on the chunk materials so terrain fades into the sky right at the
 * view-distance boundary. `farBlocks` is the visible radius in blocks (viewDistance * CHUNK_SIZE_X);
 * fog starts at 55% of that and saturates at the edge, masking chunk pop-in as the radius changes.
 */
export function applyFogRange(materials: readonly RawShaderMaterial[], farBlocks: number): void {
  const far = Math.max(1, farBlocks);
  const near = far * 0.55;
  for (const m of materials) {
    m.uniforms.uFogNear.value = near;
    m.uniforms.uFogFar.value = far;
  }
}
