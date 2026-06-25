import { type Scene, type Material, type Mesh } from 'three';
import { buildChunkMesh } from './buildChunkMesh';
import { parseChunkKey } from '../core/coords';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import type { ChunkSink } from '../world/ChunkManager';
import type { MeshData } from '../mesh/MeshTypes';

/** Owns chunk THREE.Meshes; positions them at their world origin; disposes geometry. */
export class ChunkMeshRegistry implements ChunkSink {
  private readonly meshes = new Map<string, Mesh>();

  constructor(
    private readonly scene: Scene,
    private readonly material: Material,
  ) {}

  upload(key: string, mesh: MeshData): void {
    this.remove(key); // replace any prior mesh for this chunk
    const obj = buildChunkMesh(mesh, this.material);
    const { cx, cz } = parseChunkKey(key);
    obj.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
    this.meshes.set(key, obj);
    this.scene.add(obj);
  }

  dispose(key: string): void {
    this.remove(key);
  }

  private remove(key: string): void {
    const existing = this.meshes.get(key);
    if (!existing) return;
    this.scene.remove(existing);
    existing.geometry.dispose();
    this.meshes.delete(key);
  }
}
