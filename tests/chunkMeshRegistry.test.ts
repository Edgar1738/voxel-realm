import { describe, it, expect, vi } from 'vitest';
import type { ChunkMeshes } from '../src/mesh/MeshTypes';

/**
 * ChunkMeshRegistry unit tests covering:
 *   1. Air-chunk optimisation — no opaque Mesh is added to the scene when opaque indices are empty.
 *   2. disposeAll() — disposes every live chunk geometry, all shared materials, and the texture.
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

function emptyMeshData() {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    layers: new Float32Array(0),
    ao: new Float32Array(0),
    light: new Float32Array(0),
    tint: new Float32Array(0),
    indices: new Uint32Array(0),
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
      tint: new Float32Array(opaqueIndices > 0 ? opaqueIndices * 3 : 0),
      indices: new Uint32Array(opaqueIndices),
    },
    transparent: {
      positions: new Float32Array(transparentIndices > 0 ? transparentIndices * 3 : 0),
      normals: new Float32Array(transparentIndices > 0 ? transparentIndices * 3 : 0),
      uvs: new Float32Array(transparentIndices > 0 ? transparentIndices * 2 : 0),
      layers: new Float32Array(transparentIndices > 0 ? transparentIndices : 0),
      ao: new Float32Array(transparentIndices > 0 ? transparentIndices : 0),
      light: new Float32Array(transparentIndices > 0 ? transparentIndices : 0),
      tint: new Float32Array(transparentIndices > 0 ? transparentIndices * 3 : 0),
      indices: new Uint32Array(transparentIndices),
    },
    cutout: emptyMeshData(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChunkMeshRegistry — sortTransparent()', () => {
  it('sortTransparent orders farther chunks before nearer ones', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const cutoutMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      cutoutMat as unknown as import('three').Material,
    );

    registry.upload('0,0', makeChunkMeshes(0, 6)); // near origin
    registry.upload('5,5', makeChunkMeshes(0, 6)); // far from origin
    registry.sortTransparent({ x: 0, z: 0 });

    const near = registry.transparentRenderOrder('0,0');
    const far = registry.transparentRenderOrder('5,5');
    expect(far).toBeLessThan(near!); // farther drawn first (smaller renderOrder)
  });

  it('does NOT recompute when called twice without camera movement or entry changes', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      makeMaterialMock() as unknown as import('three').Material,
      makeMaterialMock() as unknown as import('three').Material,
      makeMaterialMock() as unknown as import('three').Material,
    );

    registry.upload('0,0', makeChunkMeshes(0, 6));
    registry.sortTransparent({ x: 0, z: 0 }); // first sort runs

    // Poison the renderOrder with a sentinel; a second sort that early-returns must leave it.
    const transparent = createdMeshes[createdMeshes.length - 1] as unknown as {
      renderOrder: number;
    };
    transparent.renderOrder = 12345;
    registry.sortTransparent({ x: 0, z: 0 }); // no movement, no entry change → early return

    expect(registry.transparentRenderOrder('0,0')).toBe(12345);
  });

  it('recomputes on the next sort after a new transparent chunk is uploaded, even without camera movement', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      makeMaterialMock() as unknown as import('three').Material,
      makeMaterialMock() as unknown as import('three').Material,
      makeMaterialMock() as unknown as import('three').Material,
    );

    registry.upload('0,0', makeChunkMeshes(0, 6));
    registry.sortTransparent({ x: 0, z: 0 }); // first sort

    // Sentinel-poison the existing entry, then add a NEW transparent chunk (sets dirty flag).
    const first = createdMeshes[createdMeshes.length - 1] as unknown as { renderOrder: number };
    first.renderOrder = 12345;
    registry.upload('5,5', makeChunkMeshes(0, 6));

    registry.sortTransparent({ x: 0, z: 0 }); // dirty flag forces recompute despite no movement

    // The poisoned entry was recomputed (no longer the sentinel) and the new one is correct.
    expect(registry.transparentRenderOrder('0,0')).not.toBe(12345);
    expect(registry.transparentRenderOrder('5,5')).not.toBeNull();
    expect(registry.transparentRenderOrder('5,5')).toBeLessThan(
      registry.transparentRenderOrder('0,0')!,
    );
  });

  it('recomputes when the camera moves at least half a chunk but not for a tiny move', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      makeMaterialMock() as unknown as import('three').Material,
      makeMaterialMock() as unknown as import('three').Material,
      makeMaterialMock() as unknown as import('three').Material,
    );

    registry.upload('0,0', makeChunkMeshes(0, 6));
    registry.sortTransparent({ x: 0, z: 0 }); // first sort

    const mesh = createdMeshes[createdMeshes.length - 1] as unknown as { renderOrder: number };

    // Tiny move (< half a chunk = 8) → early return, sentinel preserved.
    mesh.renderOrder = 12345;
    registry.sortTransparent({ x: 1, z: 1 });
    expect(registry.transparentRenderOrder('0,0')).toBe(12345);

    // Move >= half a chunk on the x axis → recompute, sentinel overwritten.
    mesh.renderOrder = 12345;
    registry.sortTransparent({ x: 8, z: 1 });
    expect(registry.transparentRenderOrder('0,0')).not.toBe(12345);
  });
});

describe('ChunkMeshRegistry — air-chunk opaque skip', () => {
  it('does NOT add an opaque mesh when opaque indices are empty', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const cutoutMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      cutoutMat as unknown as import('three').Material,
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
    const cutoutMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      cutoutMat as unknown as import('three').Material,
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
    const cutoutMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      cutoutMat as unknown as import('three').Material,
    );

    registry.upload('0,0', makeChunkMeshes(6, 0));
    registry.upload('1,0', makeChunkMeshes(6, 6));

    registry.disposeAll();

    // Each uploaded non-empty mesh builds one geo; three meshes were created total (2 opaque + 1 transparent)
    for (const mesh of createdMeshes) {
      expect(mesh.geometry.dispose).toHaveBeenCalled();
    }
  });

  it('disposes the shared opaque, transparent, and cutout materials', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const cutoutMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      cutoutMat as unknown as import('three').Material,
    );

    registry.disposeAll();

    expect(opaqueMat.dispose).toHaveBeenCalledOnce();
    expect(transparentMat.dispose).toHaveBeenCalledOnce();
    expect(cutoutMat.dispose).toHaveBeenCalledOnce();
  });

  it('disposes the texture when one is provided', async () => {
    vi.clearAllMocks();
    createdMeshes.length = 0;

    const { ChunkMeshRegistry } = await import('../src/render/ChunkMeshRegistry');
    const scene = makeScene();
    const opaqueMat = makeMaterialMock();
    const transparentMat = makeMaterialMock();
    const cutoutMat = makeMaterialMock();
    const tex = makeTextureMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      cutoutMat as unknown as import('three').Material,
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
    const cutoutMat = makeMaterialMock();
    const registry = new ChunkMeshRegistry(
      scene as unknown as import('three').Scene,
      opaqueMat as unknown as import('three').Material,
      transparentMat as unknown as import('three').Material,
      cutoutMat as unknown as import('three').Material,
    );

    // Should not throw even without a texture
    expect(() => registry.disposeAll()).not.toThrow();
  });
});
