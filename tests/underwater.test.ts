import { describe, it, expect } from 'vitest';
import { Color, Scene, DataArrayTexture, Vector3 } from 'three';
import {
  stepUnderwaterFactor,
  blendFog,
  applyUnderwater,
  UNDERWATER_FOG,
  type FogParams,
} from '../src/render/underwater';
import { createChunkMaterial } from '../src/render/ChunkMaterial';

const SURFACE: FogParams = { color: [0.5, 0.7, 0.9], near: 100, far: 200 };

describe('stepUnderwaterFactor', () => {
  it('rises toward 1 while submerged and falls back to 0 in air', () => {
    let f = 0;
    f = stepUnderwaterFactor(f, true, 0.016);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
    for (let i = 0; i < 200; i++) f = stepUnderwaterFactor(f, true, 0.016);
    expect(f).toBe(1);
    for (let i = 0; i < 200; i++) f = stepUnderwaterFactor(f, false, 0.016);
    expect(f).toBe(0);
  });

  it('snaps exactly to the target once close (no lingering fractional writes)', () => {
    expect(stepUnderwaterFactor(0.9999, true, 0.016)).toBe(1);
    expect(stepUnderwaterFactor(0.0001, false, 0.016)).toBe(0);
  });

  it('a large dt cannot overshoot the target', () => {
    expect(stepUnderwaterFactor(0, true, 10)).toBe(1);
    expect(stepUnderwaterFactor(1, false, 10)).toBe(0);
  });
});

function expectFogClose(actual: FogParams, expected: FogParams): void {
  expect(actual.near).toBeCloseTo(expected.near);
  expect(actual.far).toBeCloseTo(expected.far);
  for (let i = 0; i < 3; i++) expect(actual.color[i]).toBeCloseTo(expected.color[i]);
}

describe('blendFog', () => {
  it('returns the surface fog at 0 and the underwater fog at 1', () => {
    expectFogClose(blendFog(SURFACE, 0), SURFACE);
    expectFogClose(blendFog(SURFACE, 1), UNDERWATER_FOG);
  });

  it('clamps the factor', () => {
    expectFogClose(blendFog(SURFACE, -5), SURFACE);
    expectFogClose(blendFog(SURFACE, 5), UNDERWATER_FOG);
  });

  it('midpoint sits between the endpoints', () => {
    const mid = blendFog(SURFACE, 0.5);
    expect(mid.near).toBeCloseTo((SURFACE.near + UNDERWATER_FOG.near) / 2);
    expect(mid.far).toBeCloseTo((SURFACE.far + UNDERWATER_FOG.far) / 2);
  });
});

describe('applyUnderwater', () => {
  const tex = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);

  it('writes the blended fog band to the material uniforms and the scene background', () => {
    const material = createChunkMaterial(tex);
    const scene = new Scene();
    scene.background = new Color(0, 0, 0);

    applyUnderwater([material], scene, SURFACE, 1);
    expect(material.uniforms.uFogNear.value).toBe(UNDERWATER_FOG.near);
    expect(material.uniforms.uFogFar.value).toBe(UNDERWATER_FOG.far);
    const fogColor = material.uniforms.uFogColor.value as Vector3;
    expect(fogColor.x).toBeCloseTo(UNDERWATER_FOG.color[0]);
    expect((scene.background as Color).g).toBeCloseTo(UNDERWATER_FOG.color[1]);
  });

  it('restores the surface fog at factor 0', () => {
    const material = createChunkMaterial(tex);
    const scene = new Scene();
    scene.background = new Color(0, 0, 0);

    applyUnderwater([material], scene, SURFACE, 1);
    applyUnderwater([material], scene, SURFACE, 0);
    expect(material.uniforms.uFogNear.value).toBe(SURFACE.near);
    expect(material.uniforms.uFogFar.value).toBe(SURFACE.far);
    expect((scene.background as Color).r).toBeCloseTo(SURFACE.color[0]);
  });
});
