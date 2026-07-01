import type { RawShaderMaterial } from 'three';

/**
 * Turns the player headlamp on or off across the chunk materials. The lamp is a
 * camera-centered glow computed in the fragment shader (uTorch/uTorchRadius), so
 * toggling it is a uniform write — no relighting or remeshing.
 */
export function applyHeadlamp(materials: readonly RawShaderMaterial[], on: boolean): void {
  for (const m of materials) {
    m.uniforms.uTorch.value = on ? 1 : 0;
  }
}
