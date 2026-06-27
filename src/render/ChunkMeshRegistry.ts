import { type Scene, type Material, type Mesh } from 'three';
import { buildChunkMesh } from './buildChunkMesh';
import { parseChunkKey } from '../core/coords';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import type { ChunkSink } from '../world/ChunkManager';
import type { ChunkMeshes } from '../mesh/MeshTypes';

interface Entry {
  opaque: Mesh;
  transparent?: Mesh;
}

/** Owns each chunk's opaque + (optional) transparent THREE.Meshes; positions and disposes them. */
export class ChunkMeshRegistry implements ChunkSink {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly scene: Scene,
    private readonly opaqueMaterial: Material,
    private readonly transparentMaterial: Material,
  ) {}

  upload(key: string, meshes: ChunkMeshes): void {
    this.remove(key);
    const { cx, cz } = parseChunkKey(key);
    const ox = cx * CHUNK_SIZE_X;
    const oz = cz * CHUNK_SIZE_Z;

    const opaque = buildChunkMesh(meshes.opaque, this.opaqueMaterial);
    opaque.position.set(ox, 0, oz);
    this.scene.add(opaque);

    const entry: Entry = { opaque };
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

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.scene.remove(entry.opaque);
    entry.opaque.geometry.dispose();
    if (entry.transparent) {
      this.scene.remove(entry.transparent);
      entry.transparent.geometry.dispose();
    }
    this.entries.delete(key);
  }
}
