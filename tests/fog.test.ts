import { describe, it, expect } from 'vitest';
import { applyFogRange } from '../src/render/fog';
import { createChunkMaterial } from '../src/render/ChunkMaterial';
import type { DataArrayTexture } from 'three';

describe('applyFogRange', () => {
  it('sets far to the boundary and near to 55% of it', () => {
    const m = createChunkMaterial({} as DataArrayTexture);
    applyFogRange([m], 128);
    expect(m.uniforms.uFogFar.value).toBe(128);
    expect(m.uniforms.uFogNear.value).toBeCloseTo(70.4, 5);
  });

  it('updates every material passed', () => {
    const a = createChunkMaterial({} as DataArrayTexture);
    const b = createChunkMaterial({} as DataArrayTexture);
    applyFogRange([a, b], 200);
    expect(a.uniforms.uFogFar.value).toBe(200);
    expect(b.uniforms.uFogFar.value).toBe(200);
  });
});
