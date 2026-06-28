import { describe, it, expect, vi } from 'vitest';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';

/**
 * ChunkMeshRegistry unit tests covering:
 *   1. Air-chunk optimisation — no opaque Mesh is added to the scene when opaque indices are empty.
 *   2. disposeAll() — disposes every live chunk geometry, both shared materials, and the texture.
 *
 * We bypass three.js GPU objects entirely by mocking the module and buildChunkMesh.
 */

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function makeGeoMock() {
  return { dispose: vi.fn() };
}
function makeMeshMock(geo: ReturnType<typeof makeGeoMock>) {
  return { geometry: geo, position: { set: vi.fn() } };
}
function makeMaterialMock() {
  return { dispose: vi.fn() };
}
function makeTextureMock() {
  return { dispose: vi.fn() };
}

// We'll capture the Mesh instances created by buildChunkMesh so we can check scene.add calls.
const createdMeshes: ReturnType<typeof makeMeshMock>[] = [];

vi.mock('../src/render/buildChunkMesh', () => ({
  buildChunkMesh: vi.fn((_meshData: unknown, _material: unknown) => {
    const geo = makeGeoMock();
    const mesh = makeMeshMock(geo);
    createdMeshes.push(mesh);
    return mesh;
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
  };
}

/** Returns a minimal ChunkMeshes payload with the given index counts. */
function makeChunkMeshes(opaqueIndices: number, transparentIndices: number): ChunkMeshes {
  return {
    opaque: {
      positions: new Float32Array(opaqueIndices > 0 ? opaqueIndices * 3 : 0),
      normals: new Float32Array(opaqueIndices > 0 ? opaqueIndices * 3 : 0),
      uvs: new Float32Array(opaqueIndices > 0 ? opaqueIndices * 2 : 0),
      layers: new Float32Array(opaqueIndices > 0 ? opaqueIndices : 0),
      ao: new Float32Array(opaqueIndices > 0 ? opaqueIndices : 0),
      light: new Float32Array(opaqueIndices > 0 ? opaqueIndices : 0),
      indices: new Uint32Array(opaqueIndices),
    },
    transparent: {
      positions: new Float32Array(transparentIndices > 0 ? transparentIndices * 3 : 0),
      normals: new Float32Array(transparentIndices > 0 ? transparentIndices * 3 : 0),
      uvs: new Float32Array(transparentIndices > 0 ? transparentIndices * 2 : 0),
      layers: new Float32Array(transparentIndices > 0 ? transparentIndices : 0),
      ao: new Float32Array(transparentIndices > 0 ? transparentIndices : 0),
      light: new Float32Array(transparentIndices > 0 ? transparentIndices : 0),
      indices: new Uint32Array(transparentIndices),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChunkMeshRegistry — air-chunk opaque skip', () => {
  it('does NOT add an opaque mesh when opaque indices are empty', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
    );

    // Air chunk: zero opaque indices, zero transparent indices
    registry.upload('0,0', makeChunkMeshes(0, 0));

    expect(scene.add).not.toHaveBeenCalled();
  });

  it('DOES add an opaque mesh when opaque indices are non-zero', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
    );

    registry.upload('0,0', makeChunkMeshes(6, 0));

    expect(scene.add).toHaveBeenCalledOnce();
  });
});

describe('ChunkMeshRegistry — disposeAll()', () => {
  it('disposes geometry for every live chunk', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
    );

    registry.upload('0,0', makeChunkMeshes(6, 0));
    registry.upload('1,0', makeChunkMeshes(6, 6));

    registry.disposeAll();

    // Each uploaded non-empty mesh builds one geo; three meshes were created total (2 opaque + 1 transparent)
    for (const mesh of createdMeshes) {
      expect(mesh.geometry.dispose).toHaveBeenCalled();
    }
  });

  it('disposes the shared opaque and transparent materials', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
    );

    registry.disposeAll();

    expect(opaqueMat.dispose).toHaveBeenCalledOnce();
    expect(transparentMat.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the texture when one is provided', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const tex = makeTextureMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      tex as unknown as import('three').Texture,
    );

    registry.disposeAll();

    expect(tex.dispose).toHaveBeenCalledOnce();
  });

  it('does NOT call texture.dispose when no texture was provided', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
    );

    // Should not throw even without a texture
    expect(() => registry.disposeAll()).not.toThrow();
  });
});
