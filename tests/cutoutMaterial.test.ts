import { describe, it, expect } from 'vitest';
import { DataArrayTexture, DoubleSide } from 'three';
import { createCutoutMaterial, createChunkMaterial } from '../src/render/ChunkMaterial';

const tex = new DataArrayTexture(new Uint8Array(4), 1, 1, 1);

describe('createCutoutMaterial', () => {
  it('is opaque, depth-writing, double-sided with an alpha-test uniform', () => {
    const m = createCutoutMaterial(tex);
    expect(m.transparent).toBe(false);
    expect(m.depthWrite).toBe(true);
    expect(m.side).toBe(DoubleSide);
    expect(m.uniforms.uAlphaTest.value).toBeGreaterThan(0);
  });
  it('leaves the opaque material with no alpha test (unchanged behaviour)', () => {
    const m = createChunkMaterial(tex);
    expect(m.uniforms.uAlphaTest.value).toBe(0);
    expect(m.transparent).toBe(false);
  });
});
