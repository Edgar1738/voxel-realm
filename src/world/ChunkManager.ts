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
import { computeChunkLight, applyBorderBlockLight, borderLightExport } from './Lighting';
import { opaquePass, transparentPass, type MeshPass } from '../mesh/MeshPass';
import { emitShaped, mergeMeshData } from '../mesh/emitShaped';
import { WATER, AIR } from '../blocks/blocks';
import type { AABB } from '../blocks/shapeBoxes';
import type { Generator, Overlay } from '../worldgen/Generator';
import type { GreedyMesher } from '../mesh/GreedyMesher';
import type { ChunkMeshes } from '../mesh/MeshTypes';
import type { WorldSeed, BlockId } from '../core/types';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { SetVoxel, VoxelChange, WorldVoxel } from '../edit/EditTypes';
import { packVoxel, voxelId, voxelState } from '../persistence/SaveTypes';
import type { ChunkDeltaEntries, WorldDeltas } from '../persistence/SaveTypes';

/** Pure seam to the renderer: upload/dispose chunk meshes by key. */
export interface ChunkSink {
  upload(key: string, meshes: ChunkMeshes): void;
  dispose(key: string): void;
}

export interface ChunkManagerOptions {
  viewDistance: number;
  genBudget: number;
  meshBudget: number;
  /** Soft per-frame wall-clock ceiling (ms) for streaming work (P5). */
  frameWorkMs: number;
}

/** Per-frame streaming work counters for the dev profiler (P0 roam-smoothness spike). */
export interface ChunkFrameStats {
  /** Chunks generated during the last update(). */
  genCount: number;
  /** meshChunk calls during the last update() (includes unbudgeted neighbor remeshes). */
  meshCount: number;
  /** Wall-clock time spent inside the last update() (ms). */
  updateMs: number;
}

const EDGE_NEIGHBORS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Shapes handled by the shaped-mesh pass; a chunk with none can skip it (P3). */
const SHAPED_SHAPES: ReadonlySet<string> = new Set([
  'slab',
  'stair',
  'fence',
  'wall',
  'gate',
  'cross',
]);

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
  /**
   * Tracks the last-computed border block-light export for each chunk key.
   * Shape: [west_max, east_max, north_max, south_max] — the maximum block-light
   * values on the four border face columns. Used to detect when a chunk's outgoing
   * light changes so adjacent chunks can be re-lit (without infinite ping-pong).
   */
  private readonly borderExports = new Map<string, readonly [number, number, number, number]>();
  private readonly opts: ChunkManagerOptions;
  private readonly opaquePass: MeshPass;
  private readonly transparentPass: MeshPass;
  private frameGen = 0;
  private frameMesh = 0;
  private lastStats: ChunkFrameStats = { genCount: 0, meshCount: 0, updateMs: 0 };
  // P1: the desired chunk set is rebuilt + sorted only when the center chunk changes;
  // `hasPendingWork` keeps draining the gen/mesh backlog across same-center frames.
  private lastCenterCx: number | undefined;
  private lastCenterCz: number | undefined;
  private ordered: ReadonlyArray<{ cx: number; cz: number }> = [];
  private hasPendingWork = false;
  // P5: legit neighbor remeshes that overflowed the per-frame budget; drained next frame(s).
  private readonly pendingRemesh = new Set<string>();

  /** Notified once per touched chunk after a batch, with that chunk's sorted delta entries. */
  onChunkDeltaChanged?: (key: string, entries: ChunkDeltaEntries) => void;

  /** Notified after every non-empty edit batch with the voxels that actually changed (drives the block ticker). */
  onEditsApplied?: (changes: readonly VoxelChange[]) => void;

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
      // Default: no wall-clock ceiling (the count budgets bound per-frame work). Production
      // (Game.boot) opts into a soft ms ceiling; tests stay deterministic on the count budget.
      frameWorkMs: options?.frameWorkMs ?? Infinity,
    };
    this.opaquePass = opaquePass(this.registry);
    this.transparentPass = transparentPass(this.registry);
  }

  /** Snapshot of the most recent update()'s streaming work (dev profiler, P0). */
  get lastFrameStats(): Readonly<ChunkFrameStats> {
    return this.lastStats;
  }

  /** Whether chunks are still streaming in (generation/mesh backlog not yet drained). */
  get streaming(): boolean {
    return this.hasPendingWork;
  }

  /** Current loaded radius (Chebyshev chunk radius around the camera column). */
  get viewDistance(): number {
    return this.opts.viewDistance;
  }

  /**
   * Sets the loaded radius at runtime. Forces a desired-set rebuild on the next update() so
   * chunks that left range are disposed and newly desired chunks stream in. No-op if unchanged.
   */
  setViewDistance(vd: number): void {
    const clamped = Math.max(1, Math.floor(vd));
    if (clamped === this.opts.viewDistance) return;
    this.opts.viewDistance = clamped;
    this.lastCenterCx = undefined;
    this.lastCenterCz = undefined;
    this.hasPendingWork = true;
  }

  /** Sets the per-frame streaming budgets (used to burst the cold-start fill, then settle). */
  setStreamingBudgets(genBudget: number, meshBudget: number, frameWorkMs: number): void {
    this.opts.genBudget = genBudget;
    this.opts.meshBudget = meshBudget;
    this.opts.frameWorkMs = frameWorkMs;
  }

  update(centerCx: number, centerCz: number): void {
    const updateStart = performance.now();
    this.frameGen = 0;
    this.frameMesh = 0;

    const centerChanged = centerCx !== this.lastCenterCx || centerCz !== this.lastCenterCz;
    if (centerChanged) {
      this.lastCenterCx = centerCx;
      this.lastCenterCz = centerCz;
      this.recomputeDesired(centerCx, centerCz);
      this.hasPendingWork = true;
    } else if (!this.hasPendingWork) {
      // Idle: center unchanged and no backlog — skip the desired-set rebuild + sort.
      this.lastStats = { genCount: 0, meshCount: 0, updateMs: performance.now() - updateStart };
      return;
    }

    // Generate pass (P5: also yields once the per-frame time ceiling is hit).
    const overTime = (): boolean => performance.now() - updateStart >= this.opts.frameWorkMs;
    let gen = 0;
    const generatedThisFrame: Array<{ cx: number; cz: number }> = [];
    const generatedThisFrameKeys = new Set<string>();
    for (const { cx, cz } of this.ordered) {
      if (gen >= this.opts.genBudget || overTime()) break;
      if (this.ensureGenerated(cx, cz)) {
        gen++;
        generatedThisFrame.push({ cx, cz });
        generatedThisFrameKeys.add(chunkKey(cx, cz));
      }
    }
    // Light-settling: chunks generated earlier in the loop above never saw a sibling
    // generated later in the same pass (and any emitter it holds), since `ensureGenerated`
    // lights each chunk as it's created, one at a time. Re-light the whole same-frame
    // batch now that they all exist, before any of them mesh.
    this.relightSettled(generatedThisFrame);

    // Mesh pass. P5: a single budget (frameMesh) counts main + neighbor + drained remeshes,
    // plus a wall-clock ceiling; overflow legit neighbor remeshes defer to pendingRemesh.
    const meshedThisFrame = new Set<string>(); // P2a: dedup remeshes within this frame
    const overBudget = (): boolean => this.frameMesh >= this.opts.meshBudget || overTime();

    // Drain previously-deferred neighbor remeshes first (oldest seam work, FIFO).
    for (const key of [...this.pendingRemesh]) {
      if (overBudget()) break;
      this.pendingRemesh.delete(key);
      const { cx, cz } = parseChunkKey(key);
      const nb = this.store.get(cx, cz);
      if (!nb || nb.state !== ChunkState.Meshed) continue; // unloaded / not yet meshed -> drop
      this.recomputeLight(nb.data);
      this.meshChunk(cx, cz);
      meshedThisFrame.add(key);
    }

    for (const { cx, cz } of this.ordered) {
      if (overBudget()) break;
      const entry = this.store.get(cx, cz);
      if (!entry || entry.state !== ChunkState.Generated) continue;
      this.meshChunk(cx, cz);
      meshedThisFrame.add(chunkKey(cx, cz));
      // A newly-meshed chunk changes the seam of its already-meshed neighbors, so they
      // re-mesh. P2a: skip a neighbor already meshed this frame IF it was also generated
      // this frame — the pre-mesh light-settling pass above already relit this frame's
      // newly-generated chunks against each other, so re-meshing it here would be
      // byte-identical. A neighbor meshed this frame but generated in an EARLIER frame
      // (drained from pendingRemesh) was never settled against this chunk, since it
      // didn't exist at settle time — P2b: only re-light such a neighbor when this chunk
      // actually exports block light to it; pure terrain contributes none, so the
      // relight is a no-op.
      for (const [dx, dz] of EDGE_NEIGHBORS) {
        const nbKey = chunkKey(cx + dx, cz + dz);
        if (meshedThisFrame.has(nbKey) && generatedThisFrameKeys.has(nbKey)) continue;
        const nb = this.store.get(cx + dx, cz + dz);
        if (!nb || nb.state !== ChunkState.Meshed) continue;
        if (overBudget()) {
          this.pendingRemesh.add(nbKey); // defer the legit seam remesh to a later frame
          continue;
        }
        // Not part of this frame's settled batch, so only relight if light can actually change.
        if (this.feedsBlockLight(cx, cz)) this.recomputeLight(nb.data);
        this.meshChunk(cx + dx, cz + dz);
        meshedThisFrame.add(nbKey);
      }
    }

    this.hasPendingWork = this.hasWorkRemaining();

    this.lastStats = {
      genCount: this.frameGen,
      meshCount: this.frameMesh,
      updateMs: performance.now() - updateStart,
    };
  }

  /** Unloads out-of-range chunks and rebuilds the nearest-first desired order (P1). */
  private recomputeDesired(centerCx: number, centerCz: number): void {
    const desired = this.desiredSet(centerCx, centerCz);
    for (const key of [...this.store.keys()]) {
      if (!desired.has(key)) {
        const { cx, cz } = parseChunkKey(key);
        this.sink.dispose(key);
        this.store.delete(cx, cz);
        this.baseChunks.delete(key);
        this.borderExports.delete(key);
      }
    }
    this.ordered = [...desired.values()].sort(
      (a, b) =>
        (a.cx - centerCx) ** 2 +
        (a.cz - centerCz) ** 2 -
        ((b.cx - centerCx) ** 2 + (b.cz - centerCz) ** 2),
    );
  }

  /** Scans a chunk for any shaped (non-cube) voxel so meshing can skip the shaped pass (P3). */
  private scanHasShaped(data: ChunkData): boolean {
    const ids = data.data;
    for (let i = 0; i < ids.length; i++) {
      if (SHAPED_SHAPES.has(this.registry.shape(ids[i]))) return true;
    }
    return false;
  }

  /** Whether chunk (cx,cz) exports any block light to a neighbor (P2b relight guard). */
  private feedsBlockLight(cx: number, cz: number): boolean {
    const e = this.borderExports.get(chunkKey(cx, cz));
    return !e || e[0] > 0 || e[1] > 0 || e[2] > 0 || e[3] > 0;
  }

  /** Whether any desired chunk still needs generation/meshing, or a deferred remesh is queued (P1/P5). */
  private hasWorkRemaining(): boolean {
    if (this.pendingRemesh.size > 0) return true;
    for (const { cx, cz } of this.ordered) {
      const entry = this.store.get(cx, cz);
      if (!entry || entry.state === ChunkState.Generated) return true;
    }
    return false;
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

  /** World-space collision boxes for a voxel. Below-world/unloaded read solid (full cube). */
  collisionBoxesAt(wx: number, wy: number, wz: number): AABB[] {
    if (wy < 0) return [[wx, wy, wz, wx + 1, wy + 1, wz + 1]];
    if (wy >= WORLD_HEIGHT) return [];
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return [[wx, wy, wz, wx + 1, wy + 1, wz + 1]];
    const lx = worldToLocal(wx);
    const lz = worldToLocal(wz);
    const id = entry.data.get(lx, wy, lz);
    if (!this.registry.isOpaque(id)) return [];
    const state = entry.data.getState(lx, wy, lz);
    const shape = this.registry.shape(id);
    const boxes =
      shape === 'fence' || shape === 'wall'
        ? this.registry.connectedCollisionAABBs(id, state, (dx, dz) =>
            this.getBlock(wx + dx, wy, wz + dz),
          )
        : this.registry.collisionAABBs(id, state);
    return boxes.map(
      (b) => [wx + b[0], wy + b[1], wz + b[2], wx + b[3], wy + b[4], wz + b[5]] as AABB,
    );
  }

  /** Orientation/open state at a world coord; 0 for out-of-world or unloaded chunks. */
  getState(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return 0;
    return entry.data.getState(worldToLocal(wx), wy, worldToLocal(wz));
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
   * Reads the baked block-light level at a world coordinate; 0 for unloaded chunks or
   * out-of-world positions. Used primarily by tests to verify cross-chunk propagation.
   */
  getBlockLight(wx: number, wy: number, wz: number): number {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
    const entry = this.store.get(worldToChunkCoord(wx), worldToChunkCoord(wz));
    if (!entry) return 0;
    return entry.data.getBlockLight(worldToLocal(wx), wy, worldToLocal(wz));
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
      const beforeState = entry.data.getState(lx, edit.y, lz);
      const nextState = edit.state ?? 0;
      if (before === edit.id && beforeState === nextState) continue;

      entry.data.set(lx, edit.y, lz, edit.id);
      entry.data.setState(lx, edit.y, lz, nextState);
      if (SHAPED_SHAPES.has(this.registry.shape(edit.id))) entry.data.hasShaped = true;
      this.updateDelta(cx, cz, lx, edit.y, lz, edit.id, nextState);
      changes.push({
        x: edit.x,
        y: edit.y,
        z: edit.z,
        before,
        after: edit.id,
        beforeState,
        afterState: nextState,
      });

      const key = chunkKey(cx, cz);
      editedChunks.add(key);
      remeshKeys.add(key);
      if (lx === 0) remeshKeys.add(chunkKey(cx - 1, cz));
      if (lx === CHUNK_SIZE_X - 1) remeshKeys.add(chunkKey(cx + 1, cz));
      if (lz === 0) remeshKeys.add(chunkKey(cx, cz - 1));
      if (lz === CHUNK_SIZE_Z - 1) remeshKeys.add(chunkKey(cx, cz + 1));
    }

    // Re-light in two passes to avoid circular stale-read artefacts when multiple
    // chunks in the same batch exchange border light:
    //
    // Pass 1 — base light only: recompute each chunk's local emitter + sky light
    //           WITHOUT reading any neighbor's blockLight (border seed reads 0 for
    //           all chunks in the current batch). This gives every chunk a correct
    //           locally-sourced light value before anyone reads their neighbor.
    //
    // Pass 2 — border seed: now that every chunk in the batch has correct local
    //           light, run the full border-seed pass (which reads neighbor blockLight).
    //           Chunks outside the batch already have stable values from previous frames.
    //
    // After both passes, re-mesh all affected chunks and propagate export changes
    // to their outer-ring neighbors (which were NOT in the batch).

    // Build set of chunk coords in the batch for the stale-read guard.
    const batchKeys = remeshKeys;

    // Pass 1: local light only — border seed skips neighbors in the batch.
    for (const key of batchKeys) {
      const { cx, cz } = parseChunkKey(key);
      const entry = this.store.get(cx, cz);
      if (!entry) continue;
      const input = {
        isOpaque: (x: number, y: number, z: number) =>
          this.registry.isOpaque(entry.data.get(x, y, z)),
        emission: (x: number, y: number, z: number) =>
          this.registry.emission(entry.data.get(x, y, z)),
      };
      const field = computeChunkLight(input);
      entry.data.skyLight.set(field.sky);
      entry.data.blockLight.set(field.block);
    }

    // Pass 2: border seed — safe to read all neighbors since local light is stable.
    const borderChangedKeys = new Set<string>();
    for (const key of batchKeys) {
      const { cx, cz } = parseChunkKey(key);
      const entry = this.store.get(cx, cz);
      if (!entry) continue;
      const input = {
        isOpaque: (x: number, y: number, z: number) =>
          this.registry.isOpaque(entry.data.get(x, y, z)),
        emission: (x: number, y: number, z: number) =>
          this.registry.emission(entry.data.get(x, y, z)),
      };
      // Re-apply border seed from neighbors (now all locally stable).
      applyBorderBlockLight(entry.data.blockLight, input, (dcx, dcz, lx, y, lz) => {
        const nb = this.store.get(cx + dcx, cz + dcz)?.data;
        return nb ? nb.getBlockLight(lx, y, lz) : 0;
      });
      // Update the border export and check for changes.
      const newExport = borderLightExport(entry.data.blockLight);
      const old = this.borderExports.get(key);
      const exportChanged =
        old === undefined ||
        old[0] !== newExport[0] ||
        old[1] !== newExport[1] ||
        old[2] !== newExport[2] ||
        old[3] !== newExport[3];
      this.borderExports.set(key, newExport);
      this.meshChunk(cx, cz);
      if (exportChanged) borderChangedKeys.add(key);
    }

    // Propagate export changes to outer-ring neighbors (not in the batch).
    for (const key of borderChangedKeys) {
      const { cx, cz } = parseChunkKey(key);
      for (const [dx, dz] of EDGE_NEIGHBORS) {
        const nbKey = chunkKey(cx + dx, cz + dz);
        if (batchKeys.has(nbKey)) continue; // already handled in batch
        const nb = this.store.get(cx + dx, cz + dz);
        if (nb) {
          const nbExportChanged = this.recomputeLight(nb.data);
          this.meshChunk(cx + dx, cz + dz);
          if (nbExportChanged) {
            this.relightNeighbors(cx + dx, cz + dz);
          }
        }
      }
    }

    for (const key of editedChunks) {
      this.onChunkDeltaChanged?.(key, this.getChunkDelta(key));
    }
    if (changes.length > 0) this.onEditsApplied?.(changes);
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

  /** Number of streamed/generated chunks currently held by the manager, regardless of mesh state. */
  loadedChunkCount(): number {
    return [...this.store.keys()].length;
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
    const newlyGenerated: Array<{ cx: number; cz: number }> = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        if (this.ensureGenerated(cx, cz)) {
          generated++;
          newlyGenerated.push({ cx, cz });
        }
      }
    }
    // Light-settling pass: a chunk generated early in the loop above computed its light
    // before later-generated neighbors (and any emitters they hold) existed, so its border
    // seed may have missed light arriving from them. Re-light every newly-generated chunk
    // now that all of them exist, mirroring applyEdits' two-pass approach.
    this.relightSettled(newlyGenerated);
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

  /** Preload every chunk overlapping the world-space XZ box [minX..maxX] x [minZ..maxZ]. */
  preloadBox(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ): { generated: number; meshed: number } {
    const cx0 = worldToChunkCoord(Math.min(minX, maxX));
    const cx1 = worldToChunkCoord(Math.max(minX, maxX));
    const cz0 = worldToChunkCoord(Math.min(minZ, maxZ));
    const cz1 = worldToChunkCoord(Math.max(minZ, maxZ));
    const MAX_CHUNKS = 256; // guard against a pathological AABB
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > MAX_CHUNKS) {
      throw new Error('preloadBox region too large (>256 chunks)');
    }
    // Pass 1: generate every chunk in the box so all neighbors exist before any mesh runs.
    let generated = 0;
    const newlyGenerated: Array<{ cx: number; cz: number }> = [];
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (this.ensureGenerated(cx, cz)) {
          generated++;
          newlyGenerated.push({ cx, cz });
        }
      }
    }
    // Light-settling pass: a chunk generated earlier in the cz/cx scan above never saw a
    // later emitter's light (its border seed ran before that neighbor existed). Re-light
    // every newly-generated chunk now that the whole box is present, mirroring applyEdits'
    // two-pass approach, before meshing.
    this.relightSettled(newlyGenerated);
    // Pass 2: mesh every now-generated chunk (neighbors are all present, so no stale seams).
    let meshed = 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const entry = this.store.get(cx, cz);
        if (entry && entry.state === ChunkState.Generated) {
          this.meshChunk(cx, cz);
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

  /** A chunk's edit delta as stable, sorted [voxelIndex, blockId] or [voxelIndex, blockId, state] entries (for persistence). */
  getChunkDelta(key: string): ChunkDeltaEntries {
    return [...(this.deltas.get(key)?.entries() ?? [])]
      .sort((a, b) => a[0] - b[0])
      .map(([index, packed]): [number, number] | [number, number, number] => {
        const state = voxelState(packed);
        return state === 0 ? [index, voxelId(packed)] : [index, voxelId(packed), state];
      });
  }

  private updateDelta(
    cx: number,
    cz: number,
    lx: number,
    y: number,
    lz: number,
    id: BlockId,
    state: number,
  ): void {
    const key = chunkKey(cx, cz);
    const index = voxelIndex(lx, y, lz);
    const base = this.baseChunks.get(key);
    const baseId = base?.get(lx, y, lz);
    const baseState = base?.getState(lx, y, lz) ?? 0;
    let delta = this.deltas.get(key);
    if (baseId === id && baseState === state) {
      // Reverted to generated terrain (both id and state match): drop the delta entry.
      delta?.delete(index);
    } else {
      if (!delta) {
        delta = new Map();
        this.deltas.set(key, delta);
      }
      delta.set(index, packVoxel(id, state));
    }
    if (delta && delta.size === 0) this.deltas.delete(key);
  }

  private applySavedDeltas(chunk: ChunkData, key: string): void {
    const delta = this.deltas.get(key);
    if (!delta) return;
    for (const [index, packed] of delta) {
      const { x, y, z } = indexToLocal(index);
      chunk.set(x, y, z, voxelId(packed));
      chunk.setState(x, y, z, voxelState(packed));
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
    data.hasShaped = this.scanHasShaped(data);
    data.recomputeMaxSolidY();
    this.recomputeLight(data);
    this.store.set(cx, cz, data, ChunkState.Generated);
    this.frameGen++;
    return true;
  }

  /**
   * Recomputes a chunk's baked sky + block light from its voxels (run before meshing).
   * Also applies the border-seed pass to propagate block light arriving from already-lit
   * horizontal neighbors, then updates the stored border export for change detection.
   * Returns true if the chunk's border export changed (so the caller can re-light
   * adjacent chunks that may receive more or less light from this chunk).
   */
  private recomputeLight(data: ChunkData): boolean {
    const input = {
      isOpaque: (x: number, y: number, z: number) => this.registry.isOpaque(data.get(x, y, z)),
      emission: (x: number, y: number, z: number) => this.registry.emission(data.get(x, y, z)),
    };
    const field = computeChunkLight(input);
    data.skyLight.set(field.sky);
    data.blockLight.set(field.block);

    // Border-seed pass: pull light arriving from each already-computed neighbor.
    applyBorderBlockLight(data.blockLight, input, (dcx, dcz, lx, y, lz) => {
      const nb = this.store.get(data.cx + dcx, data.cz + dcz)?.data;
      return nb ? nb.getBlockLight(lx, y, lz) : 0;
    });

    // Check whether the outgoing border export changed.
    const key = `${data.cx},${data.cz}`;
    const newExport = borderLightExport(data.blockLight);
    const old = this.borderExports.get(key);
    const exportChanged =
      old === undefined ||
      old[0] !== newExport[0] ||
      old[1] !== newExport[1] ||
      old[2] !== newExport[2] ||
      old[3] !== newExport[3];
    this.borderExports.set(key, newExport);
    return exportChanged;
  }

  /**
   * Neighbor re-lighting: for each of the 4 horizontal neighbors of (cx,cz), if the
   * neighbor is already lit (Generated or Meshed), re-light it and re-mesh it so it
   * can pick up the updated border contribution from (cx,cz). Guards against infinite
   * ping-pong by only triggering when the neighbor's own border export actually changes
   * (recomputeLight returns true).
   *
   * Only called when THIS chunk's export changed, and only propagates ONE level out
   * (the re-lit neighbor's own export change is handled in its own recomputeLight call,
   * which will trigger its own round for its neighbors if needed — but since block light
   * attenuates by 1 per step, the cascade naturally terminates within 15 chunks).
   */
  private relightNeighbors(cx: number, cz: number): void {
    for (const [dx, dz] of EDGE_NEIGHBORS) {
      const nb = this.store.get(cx + dx, cz + dz);
      if (!nb) continue;
      // Re-light and only re-mesh if the neighbor's border export actually changed.
      const exportChanged = this.recomputeLight(nb.data);
      if (exportChanged) {
        this.meshChunk(cx + dx, cz + dz);
      }
    }
  }

  /**
   * Re-lights a batch of just-generated chunks (preload/preloadBox) so emitters placed in
   * a chunk generated later in the scan still reach a neighbor generated earlier in the
   * scan. `ensureGenerated` computes each chunk's light (incl. border-seed) as it's
   * generated, one at a time — so a chunk generated first never sees a same-batch
   * neighbor's emitter, since that neighbor didn't exist yet. Cheap in the common case
   * (no emitters in the batch): skips entirely unless some chunk in the batch actually
   * exports block light.
   */
  private relightSettled(batch: ReadonlyArray<{ cx: number; cz: number }>): void {
    if (!batch.some(({ cx, cz }) => this.feedsBlockLight(cx, cz))) return;
    for (const { cx, cz } of batch) {
      const entry = this.store.get(cx, cz);
      if (entry) this.recomputeLight(entry.data);
    }
  }

  private meshChunk(cx: number, cz: number): void {
    const entry = this.store.get(cx, cz);
    if (!entry) return;
    this.frameMesh++;
    const capY = entry.data.maxSolidY; // height-cap: never sweep empty air above the tallest voxel
    const view = new VoxelView(entry.data, (dcx, dcz) => this.neighborData(cx + dcx, cz + dcz));
    const shaped = emitShaped(view, this.registry, entry.data.hasShaped, capY);
    const meshes: ChunkMeshes = {
      opaque: mergeMeshData(this.mesher.mesh(view, this.opaquePass, capY), shaped.slabs),
      transparent: this.mesher.mesh(view, this.transparentPass, capY),
      cutout: shaped.cross,
    };
    this.sink.upload(chunkKey(cx, cz), meshes);
    this.store.setState(cx, cz, ChunkState.Meshed);
  }

  private neighborData(cx: number, cz: number): ChunkData | undefined {
    return this.store.get(cx, cz)?.data;
  }
}

function cloneChunk(chunk: ChunkData): ChunkData {
  const copy = new ChunkData(chunk.cx, chunk.cz, new Uint8Array(chunk.data));
  copy.state.set(chunk.state);
  return copy;
}
