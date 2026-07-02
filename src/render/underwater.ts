import { Color, Vector3, type RawShaderMaterial, type Scene } from 'three';

/** Fog band + tint the world blends toward while the camera is submerged. */
export interface FogParams {
  color: readonly [number, number, number];
  near: number;
  far: number;
}

/** Deep lake-water look: short murky fog in a desaturated blue. */
export const UNDERWATER_FOG: FogParams = { color: [0.11, 0.25, 0.42], near: 2, far: 26 };

/** Smoothing rate for the submerge transition (per second); ~0.3s to fully fade. */
export const UNDERWATER_FADE_RATE = 6;

/**
 * Advances the submerge factor toward 0 (air) or 1 (water) with an exponential ease,
 * so surfacing/diving fades instead of popping. Pure — drives {@link applyUnderwater}.
 */
export function stepUnderwaterFactor(factor: number, submerged: boolean, dt: number): number {
  const target = submerged ? 1 : 0;
  const blend = Math.min(1, dt * UNDERWATER_FADE_RATE);
  const next = factor + (target - factor) * blend;
  // Snap the tail so the uniform writes become exact 0/1 and stop dirtying state.
  if (Math.abs(next - target) < 0.001) return target;
  return next;
}

/** Linearly blends the surface fog params toward {@link UNDERWATER_FOG} by `factor`. Pure. */
export function blendFog(surface: FogParams, factor: number): FogParams {
  const t = Math.max(0, Math.min(1, factor));
  const mix = (a: number, b: number): number => a + (b - a) * t;
  return {
    color: [
      mix(surface.color[0], UNDERWATER_FOG.color[0]),
      mix(surface.color[1], UNDERWATER_FOG.color[1]),
      mix(surface.color[2], UNDERWATER_FOG.color[2]),
    ],
    near: mix(surface.near, UNDERWATER_FOG.near),
    far: mix(surface.far, UNDERWATER_FOG.far),
  };
}

/**
 * Writes the blended fog band onto the chunk materials and the scene background.
 * Call every frame *after* DayNight (which owns the surface sky color) so the
 * underwater tint wins while submerged. `surface` is the fog the world would have
 * in air this frame: the current sky color and the view-distance fog band.
 */
export function applyUnderwater(
  materials: readonly RawShaderMaterial[],
  scene: Scene,
  surface: FogParams,
  factor: number,
): void {
  const fog = blendFog(surface, factor);
  for (const m of materials) {
    (m.uniforms.uFogColor.value as Vector3).set(fog.color[0], fog.color[1], fog.color[2]);
    m.uniforms.uFogNear.value = fog.near;
    m.uniforms.uFogFar.value = fog.far;
  }
  if (scene.background instanceof Color) {
    scene.background.setRGB(fog.color[0], fog.color[1], fog.color[2]);
  }
}
