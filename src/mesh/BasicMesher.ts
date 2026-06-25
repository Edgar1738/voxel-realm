import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { AIR, Face } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { ChunkData } from '../world/ChunkData';
import type { MeshData } from './MeshTypes';

interface FaceSpec {
  face: Face;
  /** Neighbor offset to test for visibility. */
  dir: [number, number, number];
  normal: [number, number, number];
  /** Four CCW corner offsets (unit cube, min corner at the voxel origin). */
  corners: [number, number, number][];
}

// Corners are wound CCW when viewed from outside so front faces point outward.
const FACES: FaceSpec[] = [
  {
    face: Face.PosX,
    dir: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    face: Face.NegX,
    dir: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    face: Face.PosY,
    dir: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    face: Face.NegY,
    dir: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    face: Face.PosZ,
    dir: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    face: Face.NegZ,
    dir: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];

const FACE_UVS: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/**
 * Naive per-voxel mesher: emits a quad for each solid-voxel face whose neighbor is
 * non-opaque. Out-of-chunk neighbors read as AIR (border faces acceptable in M1A).
 * Greedy merging + AO arrive in M1B.
 */
export class BasicMesher {
  constructor(private readonly registry: BlockRegistry) {}

  mesh(chunk: ChunkData): MeshData {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const layers: number[] = [];
    const indices: number[] = [];
    let vertCount = 0;

    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE_Z; z++) {
        for (let x = 0; x < CHUNK_SIZE_X; x++) {
          const id = chunk.get(x, y, z);
          if (id === AIR) continue;

          for (const spec of FACES) {
            const nx = x + spec.dir[0];
            const ny = y + spec.dir[1];
            const nz = z + spec.dir[2];
            // Visible if the neighbor is not opaque (air, or out-of-bounds => air).
            if (this.registry.isOpaque(chunk.get(nx, ny, nz))) continue;

            const layer = this.registry.faceLayer(id, spec.face);
            for (let i = 0; i < 4; i++) {
              const c = spec.corners[i];
              positions.push(x + c[0], y + c[1], z + c[2]);
              normals.push(spec.normal[0], spec.normal[1], spec.normal[2]);
              uvs.push(FACE_UVS[i][0], FACE_UVS[i][1]);
              layers.push(layer);
            }
            indices.push(
              vertCount,
              vertCount + 1,
              vertCount + 2,
              vertCount,
              vertCount + 2,
              vertCount + 3,
            );
            vertCount += 4;
          }
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      layers: new Float32Array(layers),
      indices: new Uint32Array(indices),
    };
  }
}
