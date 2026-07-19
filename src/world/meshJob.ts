import { ChunkData } from './ChunkData';
import { VoxelView } from './VoxelView';
import { emitShaped, mergeMeshData } from '../mesh/emitShaped';
import type { GreedyMesher } from '../mesh/GreedyMesher';
import type { MeshPass } from '../mesh/MeshPass';
import { lavaPass, waterPass } from '../mesh/MeshPass';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ChunkMeshes, MeshData } from '../mesh/MeshTypes';

/**
 * The ONE meshing code path (P6): ChunkManager's synchronous mesh, the worker, and the
 * golden tests all call this, so on-thread and in-worker output stay byte-identical.
 */

/** One chunk's buffer + the metadata a worker needs to reconstruct it (`ChunkData.overBuffer`). */
export interface ChunkPayload {
  cx: number;
  cz: number;
  buffer: ArrayBufferLike;
  hasShaped: boolean;
  maxSolidY: number;
}

/** A mesh request: the center chunk and its 8 horizontal neighbors (null where unloaded). */
export interface MeshJob {
  key: string;
  /** Staleness tag: results are dropped unless this still matches the chunk's current generation. */
  gen: number;
  center: ChunkPayload;
  /** Indexed by (dcx + 1) * 3 + (dcz + 1); the center slot [4] is unused. */
  neighbors: ReadonlyArray<ChunkPayload | null>;
}

export interface MeshJobResult {
  key: string;
  gen: number;
  meshes: ChunkMeshes;
}

function payloadOf(chunk: ChunkData): ChunkPayload {
  return {
    cx: chunk.cx,
    cz: chunk.cz,
    buffer: chunk.buffer,
    hasShaped: chunk.hasShaped,
    maxSolidY: chunk.maxSolidY,
  };
}

/** Captures a mesh job from live main-thread chunks (buffers are passed by reference). */
export function buildMeshJob(
  key: string,
  gen: number,
  center: ChunkData,
  neighbor: (dcx: number, dcz: number) => ChunkData | undefined,
): MeshJob {
  const neighbors: Array<ChunkPayload | null> = new Array(9).fill(null) as Array<null>;
  for (let dcx = -1; dcx <= 1; dcx++) {
    for (let dcz = -1; dcz <= 1; dcz++) {
      if (dcx === 0 && dcz === 0) continue;
      const nb = neighbor(dcx, dcz);
      if (nb) neighbors[(dcx + 1) * 3 + (dcz + 1)] = payloadOf(nb);
    }
  }
  return { key, gen, center: payloadOf(center), neighbors };
}

/** Greedy + shaped meshing of one VoxelView into the chunk's three mesh buckets. */
export function meshChunkView(
  view: VoxelView,
  mesher: GreedyMesher,
  registry: BlockRegistry,
  opaque: MeshPass,
  transparent: MeshPass,
  hasShaped: boolean,
  capY: number,
): ChunkMeshes {
  const shaped = emitShaped(view, registry, hasShaped, capY);
  return {
    opaque: mergeMeshData(mesher.mesh(view, opaque, capY), shaped.slabs),
    transparent: mesher.mesh(view, transparent, capY),
    water: mesher.mesh(view, waterPass(registry), capY),
    lava: mesher.mesh(view, lavaPass(registry), capY),
    cutout: shaped.cross,
  };
}

/** Runs a captured job: reconstructs chunk views over the job's buffers and meshes them. */
export function runMeshJob(
  job: MeshJob,
  mesher: GreedyMesher,
  registry: BlockRegistry,
  opaque: MeshPass,
  transparent: MeshPass,
): ChunkMeshes {
  const center = ChunkData.overBuffer(job.center.cx, job.center.cz, job.center.buffer, job.center);
  const chunks = job.neighbors.map((p) =>
    p ? ChunkData.overBuffer(p.cx, p.cz, p.buffer, p) : undefined,
  );
  const view = new VoxelView(center, (dcx, dcz) => chunks[(dcx + 1) * 3 + (dcz + 1)]);
  return meshChunkView(
    view,
    mesher,
    registry,
    opaque,
    transparent,
    center.hasShaped,
    center.maxSolidY,
  );
}

/** The result buffers a worker moves (not copies) back to the main thread. */
export function meshTransferables(meshes: ChunkMeshes): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const bucket of [
    meshes.opaque,
    meshes.transparent,
    meshes.water,
    meshes.lava,
    meshes.cutout,
  ]) {
    for (const arr of Object.values(bucket) as Array<Float32Array | Uint32Array>) {
      if (arr.buffer instanceof ArrayBuffer && arr.buffer.byteLength > 0) buffers.add(arr.buffer);
    }
  }
  return [...buffers];
}

/** Type guard for a mesh result bucket (used when receiving a worker message). */
export function isMeshData(value: unknown): value is MeshData {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MeshData).positions instanceof Float32Array &&
    (value as MeshData).indices instanceof Uint32Array
  );
}
