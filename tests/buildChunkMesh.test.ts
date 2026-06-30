import { describe, it, expect } from 'vitest';
import { buildChunkMesh } from '../src/render/buildChunkMesh';
import { MeshBasicMaterial } from 'three';
import type { MeshData } from '../src/mesh/MeshTypes';

function quad(): MeshData {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    layers: new Float32Array([0, 0, 0, 0]),
    ao: new Float32Array([1, 1, 1, 1]),
    light: new Float32Array([255, 255, 255, 255]),
    tint: new Float32Array([1, 1, 1, 0.6, 0.7, 0.4, 1, 1, 1, 1, 1, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}

describe('buildChunkMesh tint attribute', () => {
  it('sets a tint attribute with itemSize 3 and one rgb per vertex', () => {
    const mesh = buildChunkMesh(quad(), new MeshBasicMaterial());
    const attr = mesh.geometry.getAttribute('tint');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBe(4);
  });
});
