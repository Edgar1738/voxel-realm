import { type Scene, type Material, type Texture, type Mesh } from 'three';
import { buildChunkMesh } from './buildChunkMesh';
import { parseChunkKey } from '../core/coords';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z } from '../core/constants';
import type { ChunkSink } from '../world/ChunkManager';
import type { ChunkMeshes } from '../mesh/MeshTypes';

interface Entry {
  opaque?: Mesh;
  transparent?: Mesh;
  water?: Mesh;
  lava?: Mesh;
  cutout?: Mesh;
  /** Chunk coords parsed once at upload time so sortTransparent never re-parses the key per frame. */
  cx: number;
  cz: number;
}

/** Owns each chunk's opaque + (optional) transparent + (optional) cutout THREE.Meshes; positions and disposes them. */
export class ChunkMeshRegistry implements ChunkSink {
  private readonly entries = new Map<string, Entry>();

  /** Camera x/z used by the last sort that actually ran; undefined until the first sort. */
  private lastSortX?: number;
  private lastSortZ?: number;
  /** Set whenever the transparent-mesh set changes (add/remove); forces the next sort to run. */
  private transparentSetDirty = false;

  constructor(
    private readonly scene: Scene,
    private readonly opaqueMaterial: Material,
    private readonly transparentMaterial: Material,
    private readonly cutoutMaterial: Material,
    private readonly texture?: Texture,
    private readonly waterMaterial: Material = transparentMaterial,
    private readonly lavaMaterial: Material = transparentMaterial,
  ) {}

  upload(key: string, meshes: ChunkMeshes): void {
    this.remove(key);
    const { cx, cz } = parseChunkKey(key);
    const ox = cx * CHUNK_SIZE_X;
    const oz = cz * CHUNK_SIZE_Z;

    const entry: Entry = { cx, cz };

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
      this.transparentSetDirty = true; // new transparent mesh needs a renderOrder on the next sort
    }

    if (meshes.water.indices.length > 0) {
      const water = buildChunkMesh(meshes.water, this.waterMaterial);
      water.position.set(ox, 0, oz);
      this.scene.add(water);
      entry.water = water;
      this.transparentSetDirty = true;
    }

    if (meshes.lava.indices.length > 0) {
      const lava = buildChunkMesh(meshes.lava, this.lavaMaterial);
      lava.position.set(ox, 0, oz);
      this.scene.add(lava);
      entry.lava = lava;
      this.transparentSetDirty = true;
    }

    if (meshes.cutout.indices.length > 0) {
      const cutout = buildChunkMesh(meshes.cutout, this.cutoutMaterial);
      cutout.position.set(ox, 0, oz);
      this.scene.add(cutout);
      entry.cutout = cutout;
    }

    this.entries.set(key, entry);
  }

  /**
   * Sets each transparent mesh's `renderOrder` to the negative squared camera distance so that
   * farther chunks (smaller renderOrder) are drawn before nearer ones. Call once per frame before
   * the scene render.
   */
  sortTransparent(camera: { x: number; z: number }): void {
    // Skip the per-frame recompute unless the transparent set changed or the camera has moved at
    // least half a chunk on either axis since the last sort. The first sort always runs because
    // lastSortX/Z start undefined.
    const moved =
      this.lastSortX === undefined ||
      this.lastSortZ === undefined ||
      Math.abs(camera.x - this.lastSortX) >= CHUNK_SIZE_X / 2 ||
      Math.abs(camera.z - this.lastSortZ) >= CHUNK_SIZE_Z / 2;
    if (!moved && !this.transparentSetDirty) return;

    for (const entry of this.entries.values()) {
      const dx = (entry.cx + 0.5) * CHUNK_SIZE_X - camera.x;
      const dz = (entry.cz + 0.5) * CHUNK_SIZE_Z - camera.z;
      const order = -(dx * dx + dz * dz); // farther = smaller = drawn first
      for (const mesh of [entry.transparent, entry.water, entry.lava]) {
        if (mesh) mesh.renderOrder = order;
      }
    }

    this.transparentSetDirty = false;
    this.lastSortX = camera.x;
    this.lastSortZ = camera.z;
  }

  /** Test accessor: returns the transparent mesh's renderOrder for the given chunk key, or null. */
  transparentRenderOrder(key: string): number | null {
    return this.entries.get(key)?.transparent?.renderOrder ?? null;
  }

  dispose(key: string): void {
    this.remove(key);
  }

  /**
   * Releases every live chunk geometry, the shared opaque/transparent/cutout materials, and the
   * texture (if one was passed to the constructor). Call when the registry is no longer needed.
   */
  disposeAll(): void {
    for (const key of [...this.entries.keys()]) {
      this.remove(key);
    }
    for (const material of new Set([
      this.opaqueMaterial,
      this.transparentMaterial,
      this.cutoutMaterial,
      this.waterMaterial,
      this.lavaMaterial,
    ])) {
      material.dispose();
    }
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
      this.transparentSetDirty = true; // the transparent set shrank; force the next sort to run
    }
    if (entry.water) {
      this.scene.remove(entry.water);
      entry.water.geometry.dispose();
      this.transparentSetDirty = true;
    }
    if (entry.lava) {
      this.scene.remove(entry.lava);
      entry.lava.geometry.dispose();
      this.transparentSetDirty = true;
    }
    if (entry.cutout) {
      this.scene.remove(entry.cutout);
      entry.cutout.geometry.dispose();
    }
    this.entries.delete(key);
  }
}
