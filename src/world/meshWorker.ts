import { BlockRegistry } from '../blocks/BlockRegistry';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { opaquePass, transparentPass } from '../mesh/MeshPass';
import { runMeshJob, meshTransferables, type MeshJob, type MeshJobResult } from './meshJob';

/**
 * Mesh worker (P6): reads chunk voxels/light directly from SharedArrayBuffers and runs
 * the exact same meshing code path as the main thread (`runMeshJob`). The registry,
 * mesher, and passes are rebuilt here from the same static block defs — zero transfer,
 * byte-identical output. Result buffers are freshly allocated per job, so they transfer
 * (move) back to the main thread instead of copying.
 */

const registry = new BlockRegistry();
const mesher = new GreedyMesher(registry);
const opaque = opaquePass(registry);
const transparent = transparentPass(registry);

self.onmessage = (event: MessageEvent<MeshJob>) => {
  const job = event.data;
  const meshes = runMeshJob(job, mesher, registry, opaque, transparent);
  const result: MeshJobResult = { key: job.key, gen: job.gen, meshes };
  (self as unknown as Worker).postMessage(result, meshTransferables(meshes));
};
