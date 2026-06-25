import { VIEW_DISTANCE, GEN_BUDGET, MESH_BUDGET } from '../core/constants';
import { chunkKey, parseChunkKey } from '../core/coords';
import { ChunkStore, ChunkState } from './ChunkStore';
import { VoxelView } from './VoxelView';
import { applyOverlays } from '../worldgen/Generator';
import type { Generator, Overlay } from '../worldgen/Generator';
import type { GreedyMesher } from '../mesh/GreedyMesher';
import type { MeshData } from '../mesh/MeshTypes';
import type { WorldSeed } from '../core/types';
import type { ChunkData } from './ChunkData';

/** Pure seam to the renderer: upload/dispose chunk meshes by key. */
export interface ChunkSink {
  upload(key: string, mesh: MeshData): void;
  dispose(key: string): void;
}

export interface ChunkManagerOptions {
  viewDistance: number;
  genBudget: number;
  meshBudget: number;
}

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
 */
export class ChunkManager {
  private readonly store = new ChunkStore();
  private readonly opts: ChunkManagerOptions;

  constructor(
    private readonly generator: Generator,
    private readonly mesher: GreedyMesher,
    private readonly sink: ChunkSink,
    private readonly seed: WorldSeed,
    private readonly overlays: Overlay[],
    options?: Partial<ChunkManagerOptions>,
  ) {
    this.opts = {
      viewDistance: options?.viewDistance ?? VIEW_DISTANCE,
      genBudget: options?.genBudget ?? GEN_BUDGET,
      meshBudget: options?.meshBudget ?? MESH_BUDGET,
    };
  }

  update(centerCx: number, centerCz: number): void {
    const desired = this.desiredSet(centerCx, centerCz);

    // Unload chunks that left range.
    for (const key of [...this.store.keys()]) {
      if (!desired.has(key)) {
        const { cx, cz } = parseChunkKey(key);
        this.sink.dispose(key);
        this.store.delete(cx, cz);
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
      if (this.store.has(cx, cz)) continue;
      const data = this.generator.generateBaseChunk(this.seed, cx, cz);
      applyOverlays(data, cx, cz, this.seed, this.overlays);
      this.store.set(cx, cz, data, ChunkState.Generated);
      gen++;
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

  private desiredSet(
    centerCx: number,
    centerCz: number,
  ): Map<string, { cx: number; cz: number }> {
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

  private meshChunk(cx: number, cz: number): void {
    const entry = this.store.get(cx, cz);
    if (!entry) return;
    const view = new VoxelView(entry.data, (dcx, dcz) =>
      this.neighborData(cx + dcx, cz + dcz),
    );
    const mesh = this.mesher.mesh(view);
    this.sink.upload(chunkKey(cx, cz), mesh);
    this.store.setState(cx, cz, ChunkState.Meshed);
  }

  private neighborData(cx: number, cz: number): ChunkData | undefined {
    return this.store.get(cx, cz)?.data;
  }
}
