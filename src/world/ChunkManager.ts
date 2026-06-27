import {
  VIEW_DISTANCE,
  GEN_BUDGET,
  MESH_BUDGET,
  WORLD_HEIGHT,
  CHUNK_SIZE_X,
  CHUNK_SIZE_Z,
} from '../core/constants';
import {
  chunkKey,
  parseChunkKey,
  voxelIndex,
  indexToLocal,
  worldToChunkCoord,
  worldToLocal,
} from '../core/coords';
import { ChunkStore, ChunkState } from './ChunkStore';
import { ChunkData } from './ChunkData';
import { VoxelView } from './VoxelView';
import { applyOverlays } from '../worldgen/Generator';
import { opaquePass, transparentPass, type MeshPass } from '../mesh/MeshPass';
import { WATER, AIR } from '../blocks/blocks';
import type { Generator, Overlay } from '../worldgen/Generator';
import type { GreedyMesher } from '../mesh/GreedyMesher';
import type { ChunkMeshes } from '../mesh/MeshTypes';
import type { WorldSeed, BlockId } from '../core/types';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { SetVoxel, VoxelChange, WorldVoxel } from '../edit/EditTypes';

/** Pure seam to the renderer: upload/dispose chunk meshes by key. */
export interface ChunkSink {
  upload(key: string, meshes: ChunkMeshes): void;
  dispose(key: string): void;
}

export interface ChunkManagerOptions {
  viewDistance: number;
  genBudget: number;
  meshBudget: number;
}

/** In-memory edit deltas: chunk key -> (voxelIndex -> blockId), each a diff from base terrain. */
export type WorldDeltas = Map<string, Map<number, BlockId>>;

const EDGE_NEIGHBORS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Diffs the desired set (chunks within view distance of the camera column) against the
 * loaded set each update: disposes chunks that left range, then generates and meshes
 * newly desired chunks under a per-frame budget, nearest first. When a chunk meshes,
 * its already-meshed edge neighbors re-mesh so border seams resolve.
 *
 * Edits are batched: `applyEdits` mutates all voxels, then re-meshes each touched chunk (and
 * any touched border neighbor) exactly once and notifies persistence once per touched chunk.
 * Deltas are stored as diffs from generated terrain, so reverting a voxel to its terrain
 * value removes the delta.
 */
export class ChunkManager {
  private readonly store = new ChunkStore();
  private readonly baseChunks = new Map<string, ChunkData>();
  private readonly deltas: WorldDeltas;
  private readonly opts: ChunkManagerOptions;
  private readonly opaquePass: MeshPass;
  private readonly transparentPass: MeshPass;

  /** Notified once per touched chunk after a batch, with that chunk's sorted delta entries. */
  onChunkDeltaChanged?: (key: string, entries: ReadonlyArray<[number, BlockId]>) => void;

  constructor(
    private readonly generator: Generator,
    private readonly mesher: GreedyMesher,
    private readonly registry: BlockRegistry,
    private readonly sink: ChunkSink,
    private readonly seed: WorldSeed,
    private readonly overlays: Overlay[],
    options?: Partial<ChunkManagerOptions>,
    savedDeltas?: WorldDeltas,
  ) {
    this.deltas = new Map(
      [...(savedDeltas ?? new Map()).entries()].map(([key, value]) => [key, new Map(value)]),
    );
    this.opts = {
      viewDistance: options?.viewDistance ?? VIEW_DISTANCE,
      genBudget: options?.genBudget ?? GEN_BUDGET,
      meshBudget: options?.meshBudget ?? MESH_BUDGET,
    };
    this.opaquePass = opaquePass(this.registry);
    this.transparentPass = transparentPass(this.registry);
  }

  update(centerCx: number, centerCz: number): void {
    const desired = this.desiredSet(centerCx, centerCz);

    // Unload chunks that left range.
    for (const key of [...this.store.keys()]) {
      if (!desired.has(key)) {
        const { cx, cz } = parseChunkKey(key);
        this.sink.dispose(key);
        this.store.delete(cx, cz);
        this.baseChunks.delete(key);
      }
    }

    // Nearest-first ordering for pleasant load-in.
    const ordered = [...desired.values()].sort(
      (a, b) =>
        (a.cx - centerCx) ** 2 +
        (a.cz - centerCz) ** 2 -
        ((b.cx - centerCx) ** 2 + (b.cz - centerCz) ** 2),
    );

    // Generate pass.
    let gen = 0;
    for (const { cx, cz } of ordered) {
      if (gen >= this.opts.genBudget) break;
      if (this.ensureGenerated(cx, cz)) gen++;
    }

    // Mesh pass.
    let meshed = 0;
    for (const { cx, cz } of ordered) {
      if (meshed >= this.opts.meshBudget) break;
      const entry = this.store.get(cx, cz);
      if (!entry || entry.state !== ChunkState.Generated) continue;
      this.meshChunk(cx, cz);
      meshed++;
      // Re-mesh meshed neighbors so the shared border resolves.
      for (const [dx, dz] of EDGE_NEIGHBORS) {
        const nb = this.store.get(cx + dx, cz + dz);
        if (nb && nb.state === ChunkState.Meshed) this.meshChunk(cx + dx, cz + dz);
      }
    }
  }

  /**
   * Whether the voxel at world coords blocks the player. Below the world is solid (so
   * the player never falls out); above it is air; a not-yet-loaded chunk is solid (so
   * the player never falls through unstreamed terrain); otherwise sample the block.
   */
  isSolid(wx: number, wy: number, wz: number): boolean {
    if (wy < 0) return true;
    if (wy >= WORLD_HEIGHT) return false;
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return true;
    return this.registry.isOpaque(entry.data.get(worldToLocal(wx), wy, worldToLocal(wz)));
  }

  /** Whether the voxel at world coords is water (true only for loaded water voxels). */
  isWater(wx: number, wy: number, wz: number): boolean {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return false;
    return entry.data.get(worldToLocal(wx), wy, worldToLocal(wz)) === WATER;
  }

  /** Reads a loaded voxel; AIR for out-of-world or unloaded chunks. */
  getBlock(wx: number, wy: number, wz: number): BlockId {
    if (wy < 0 || wy >= WORLD_HEIGHT) return AIR;
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return AIR;
    return entry.data.get(worldToLocal(wx), wy, worldToLocal(wz));
  }

  /**
   * Applies a batch of voxel edits: mutates all loaded, in-range voxels, then re-meshes each
   * touched chunk (and any touched border neighbor) exactly once and notifies persistence
   * once per touched chunk. Returns only the voxels that actually changed (with before/after).
   */
  applyEdits(edits: SetVoxel[]): VoxelChange[] {
    const changes: VoxelChange[] = [];
    const editedChunks = new Set<string>();
    const remeshKeys = new Set<string>();

    for (const edit of edits) {
      if (edit.y < 0 || edit.y >= WORLD_HEIGHT) continue;
      const cx = worldToChunkCoord(edit.x);
      const cz = worldToChunkCoord(edit.z);
      const entry = this.store.get(cx, cz);
      if (!entry) continue; // can only edit loaded chunks

      const lx = worldToLocal(edit.x);
      const lz = worldToLocal(edit.z);
      const before = entry.data.get(lx, edit.y, lz);
      if (before === edit.id) continue;

      entry.data.set(lx, edit.y, lz, edit.id);
      this.updateDelta(cx, cz, lx, edit.y, lz, edit.id);
      changes.push({ x: edit.x, y: edit.y, z: edit.z, before, after: edit.id });

      const key = chunkKey(cx, cz);
      editedChunks.add(key);
      remeshKeys.add(key);
      if (lx === 0) remeshKeys.add(chunkKey(cx - 1, cz));
      if (lx === CHUNK_SIZE_X - 1) remeshKeys.add(chunkKey(cx + 1, cz));
      if (lz === 0) remeshKeys.add(chunkKey(cx, cz - 1));
      if (lz === CHUNK_SIZE_Z - 1) remeshKeys.add(chunkKey(cx, cz + 1));
    }

    for (const key of remeshKeys) {
      const { cx, cz } = parseChunkKey(key);
      if (this.store.get(cx, cz)) this.meshChunk(cx, cz);
    }
    for (const key of editedChunks) {
      this.onChunkDeltaChanged?.(key, this.getChunkDelta(key));
    }
    return changes;
  }

  /** Convenience single-voxel edit; returns whether the voxel changed. */
  setBlock(wx: number, wy: number, wz: number, id: BlockId): boolean {
    return this.applyEdits([{ x: wx, y: wy, z: wz, id }]).length > 0;
  }

  /** Whether the chunk covering world column (wx,wz) is loaded (so it can be edited/scanned). */
  isLoaded(wx: number, wz: number): boolean {
    return this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz)) !== undefined;
  }

  /**
   * Synchronously generates + meshes every chunk within `radius` chunks of (centerCx,centerCz),
   * bypassing the per-frame budget so scripted edits/scans don't have to wait on the (often
   * throttled) render loop. Chunks outside the player's view distance are still disposed by the
   * next `update`, so call this after teleporting near the area. Returns how many chunks loaded.
   */
  preload(
    centerCx: number,
    centerCz: number,
    radius: number,
  ): { generated: number; meshed: number } {
    let generated = 0;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (this.ensureGenerated(centerCx + dx, centerCz + dz)) generated++;
      }
    }
    let meshed = 0;
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const entry = this.store.get(centerCx + dx, centerCz + dz);
        if (entry && entry.state === ChunkState.Generated) {
          this.meshChunk(centerCx + dx, centerCz + dz);
          meshed++;
        }
      }
    }
    return { generated, meshed };
  }

  /** Whether every voxel lies in a loaded, in-range chunk, so an edit/undo can actually apply. */
  canApply(voxels: readonly WorldVoxel[]): boolean {
    return voxels.every(
      (v) =>
        v.y >= 0 &&
        v.y < WORLD_HEIGHT &&
        this.store.get(worldToChunkCoord(v.x), worldToChunkCoord(v.z)) !== undefined,
    );
  }

  /** A chunk's edit delta as stable, sorted [voxelIndex, blockId] entries (for persistence). */
  getChunkDelta(key: string): ReadonlyArray<[number, BlockId]> {
    return [...(this.deltas.get(key)?.entries() ?? [])].sort((a, b) => a[0] - b[0]);
  }

  private updateDelta(
    cx: number,
    cz: number,
    lx: number,
    y: number,
    lz: number,
    id: BlockId,
  ): void {
    const key = chunkKey(cx, cz);
    const index = voxelIndex(lx, y, lz);
    const baseId = this.baseChunks.get(key)?.get(lx, y, lz);
    let delta = this.deltas.get(key);
    if (baseId === id) {
      // Reverted to generated terrain: drop the delta entry.
      delta?.delete(index);
    } else {
      if (!delta) {
        delta = new Map();
        this.deltas.set(key, delta);
      }
      delta.set(index, id);
    }
    if (delta && delta.size === 0) this.deltas.delete(key);
  }

  private applySavedDeltas(chunk: ChunkData, key: string): void {
    const delta = this.deltas.get(key);
    if (!delta) return;
    for (const [index, id] of delta) {
      const { x, y, z } = indexToLocal(index);
      chunk.set(x, y, z, id);
    }
  }

  private desiredSet(centerCx: number, centerCz: number): Map<string, { cx: number; cz: number }> {
    const vd = this.opts.viewDistance;
    const desired = new Map<string, { cx: number; cz: number }>();
    for (let dz = -vd; dz <= vd; dz++) {
      for (let dx = -vd; dx <= vd; dx++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        desired.set(chunkKey(cx, cz), { cx, cz });
      }
    }
    return desired;
  }

  /** Generates, stores, and applies saved deltas to a chunk if absent. Returns whether it was new. */
  private ensureGenerated(cx: number, cz: number): boolean {
    if (this.store.has(cx, cz)) return false;
    const data = this.generator.generateBaseChunk(this.seed, cx, cz);
    applyOverlays(data, cx, cz, this.seed, this.overlays);
    const key = chunkKey(cx, cz);
    this.baseChunks.set(key, cloneChunk(data));
    this.applySavedDeltas(data, key);
    this.store.set(cx, cz, data, ChunkState.Generated);
    return true;
  }

  private meshChunk(cx: number, cz: number): void {
    const entry = this.store.get(cx, cz);
    if (!entry) return;
    const view = new VoxelView(entry.data, (dcx, dcz) => this.neighborData(cx + dcx, cz + dcz));
    const meshes: ChunkMeshes = {
      opaque: this.mesher.mesh(view, this.opaquePass),
      transparent: this.mesher.mesh(view, this.transparentPass),
    };
    this.sink.upload(chunkKey(cx, cz), meshes);
    this.store.setState(cx, cz, ChunkState.Meshed);
  }

  private neighborData(cx: number, cz: number): ChunkData | undefined {
    return this.store.get(cx, cz)?.data;
  }
}

function cloneChunk(chunk: ChunkData): ChunkData {
  return new ChunkData(chunk.cx, chunk.cz, new Uint8Array(chunk.data));
}
