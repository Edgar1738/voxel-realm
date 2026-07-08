import { describe, it, expect } from 'vitest';
import { applyFogRange, fogRangeFor, SURFACE_FOG_START_RATIO } from '../src/render/fog';
import { createChunkMaterial } from '../src/render/ChunkMaterial';
import type { DataArrayTexture } from 'three';

describe('applyFogRange', () => {
  it('sets far to the boundary and near to the surface fog start ratio', () => {
    const m = createChunkMaterial({} as DataArrayTexture);
    applyFogRange([m], 128);
    expect(m.uniforms.uFogFar.value).toBe(128);
    expect(m.uniforms.uFogNear.value).toBeCloseTo(128 * SURFACE_FOG_START_RATIO, 5);
  });

  it('updates every material passed', () => {
    const a = createChunkMaterial({} as DataArrayTexture);
    const b = createChunkMaterial({} as DataArrayTexture);
    applyFogRange([a, b], 200);
    expect(a.uniforms.uFogFar.value).toBe(200);
    expect(b.uniforms.uFogFar.value).toBe(200);
  });

  it('uses the same clamped range helper as the render loop', () => {
    expect(fogRangeFor(0)).toEqual({ near: SURFACE_FOG_START_RATIO, far: 1 });
    expect(fogRangeFor(256)).toEqual({ near: 256 * SURFACE_FOG_START_RATIO, far: 256 });
  });
});
