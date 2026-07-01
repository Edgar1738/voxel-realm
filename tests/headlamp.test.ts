import { describe, it, expect } from 'vitest';
import { DataArrayTexture } from 'three';
import {
  createChunkMaterial,
  createTransparentMaterial,
  createCutoutMaterial,
  HEADLAMP_RADIUS,
} from '../src/render/ChunkMaterial';
import { applyHeadlamp } from '../src/render/headlamp';

const tex = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);

describe('headlamp', () => {
  it('every chunk material starts with the lamp off and a positive reach', () => {
    for (const m of [
      createChunkMaterial(tex),
      createTransparentMaterial(tex),
      createCutoutMaterial(tex),
    ]) {
      expect(m.uniforms.uTorch.value).toBe(0);
      expect(m.uniforms.uTorchRadius.value).toBe(HEADLAMP_RADIUS);
    }
    expect(HEADLAMP_RADIUS).toBeGreaterThan(0);
  });

  it('applyHeadlamp toggles uTorch across all materials', () => {
    const materials = [createChunkMaterial(tex), createTransparentMaterial(tex)];
    applyHeadlamp(materials, true);
    expect(materials.map((m) => m.uniforms.uTorch.value)).toEqual([1, 1]);
    applyHeadlamp(materials, false);
    expect(materials.map((m) => m.uniforms.uTorch.value)).toEqual([0, 0]);
  });

  it('the fragment shader consumes the headlamp uniforms', () => {
    const m = createChunkMaterial(tex);
    expect(m.fragmentShader).toContain('uTorch');
    expect(m.fragmentShader).toContain('uTorchRadius');
  });
});
