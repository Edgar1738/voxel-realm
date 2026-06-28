import { type Scene, type Material, type Texture, type Mesh } from 'three';
import { buildChunkMesh } from './buildChunkMesh';
import { parseChunkKey } from '../core/coords';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import type { ChunkSink } from '../world/ChunkManager';
import type { ChunkMeshes } from '../mesh/MeshTypes';

interface Entry {
  opaque?: Mesh;
  transparent?: Mesh;
}

/** Owns each chunk's opaque + (optional) transparent THREE.Meshes; positions and disposes them. */
export class ChunkMeshRegistry implements ChunkSink {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly scene: Scene,
    private readonly opaqueMaterial: Material,
    private readonly transparentMaterial: Material,
    private readonly texture?: Texture,
  ) {}

  upload(key: string, meshes: ChunkMeshes): void {
    this.remove(key);
    const { cx, cz } = parseChunkKey(key);
    const ox = cx * CHUNK_SIZE_X;
    const oz = cz * CHUNK_SIZE_Z;

    const entry: Entry = {};

    // Skip the opaque mesh entirely when the chunk is air (no indices) — avoids a
    // zero-triangle draw call, mirroring the existing transparent-pass guard below.
    if (meshes.opaque.indices.length > 0) {
      const opaque = buildChunkMesh(meshes.opaque, this.opaqueMaterial);
      opaque.position.set(ox, 0, oz);
      this.scene.add(opaque);
      entry.opaque = opaque;
    }

    if (meshes.transparent.indices.length > 0) {
      const transparent = buildChunkMesh(meshes.transparent, this.transparentMaterial);
      transparent.position.set(ox, 0, oz);
      this.scene.add(transparent);
      entry.transparent = transparent;
    }
    this.entries.set(key, entry);
  }

  dispose(key: string): void {
    this.remove(key);
  }

  /**
   * Releases every live chunk geometry, the shared opaque/transparent materials, and the texture
   * (if one was passed to the constructor). Call when the registry is no longer needed.
   */
  disposeAll(): void {
    for (const key of [...this.entries.keys()]) {
      this.remove(key);
    }
    this.opaqueMaterial.dispose();
    this.transparentMaterial.dispose();
    this.texture?.dispose();
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.opaque) {
      this.scene.remove(entry.opaque);
      entry.opaque.geometry.dispose();
    }
    if (entry.transparent) {
      this.scene.remove(entry.transparent);
      entry.transparent.geometry.dispose();
    }
    this.entries.delete(key);
  }
}
