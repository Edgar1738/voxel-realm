import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { Face } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { VoxelView } from '../world/VoxelView';
import type { MeshData } from './MeshTypes';

interface Buf {
  positions: number[];
  normals: number[];
  uvs: number[];
  layers: number[];
  ao: number[];
  light: number[];
  indices: number[];
  verts: number;
}

const emptyBuf = (): Buf => ({
  positions: [],
  normals: [],
  uvs: [],
  layers: [],
  ao: [],
  light: [],
  indices: [],
  verts: 0,
});

const toMesh = (b: Buf): MeshData => ({
  positions: new Float32Array(b.positions),
  normals: new Float32Array(b.normals),
  uvs: new Float32Array(b.uvs),
  layers: new Float32Array(b.layers),
  ao: new Float32Array(b.ao),
  light: new Float32Array(b.light),
  indices: new Uint32Array(b.indices),
});

function packLight(view: VoxelView, x: number, y: number, z: number): number {
  return view.skyLight(x, y, z) * 16 + view.blockLight(x, y, z);
}

/**
 * Pushes one axis-aligned quad of the box [lo..hi] on the given (axis, sign) face. Uses the same
 * u=(axis+1)%3, v=(axis+2)%3 corner ordering and sign-based winding as GreedyMesher.emitQuad, so
 * the slab front faces match the cube convention (single-sided opaque material).
 */
function pushBoxFace(
  buf: Buf,
  axis: number,
  sign: number,
  lo: [number, number, number],
  hi: [number, number, number],
  layer: number,
  light: number,
): void {
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const d = sign > 0 ? hi[axis] : lo[axis];
  const corner = (uu: number, vv: number): [number, number, number] => {
    const p: [number, number, number] = [0, 0, 0];
    p[axis] = d;
    p[u] = uu;
    p[v] = vv;
    return p;
  };
  const ps = [
    corner(lo[u], lo[v]),
    corner(hi[u], lo[v]),
    corner(hi[u], hi[v]),
    corner(lo[u], hi[v]),
  ];
  const w = hi[u] - lo[u];
  const h = hi[v] - lo[v];
  const uvs: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const normal: [number, number, number] = [0, 0, 0];
  normal[axis] = sign;
  const n = buf.verts;
  for (let k = 0; k < 4; k++) {
    buf.positions.push(ps[k][0], ps[k][1], ps[k][2]);
    buf.normals.push(normal[0], normal[1], normal[2]);
    buf.uvs.push(uvs[k][0], uvs[k][1]);
    buf.layers.push(layer);
    buf.ao.push(1); // slabs use flat AO in E1
    buf.light.push(light);
  }
  const tri = sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const t of tri) buf.indices.push(n + t);
  buf.verts += 4;
}

/** (axis, sign, Face) for the 6 box faces. */
const FACES: ReadonlyArray<[number, number, Face]> = [
  [0, 1, Face.PosX],
  [0, -1, Face.NegX],
  [1, 1, Face.PosY],
  [1, -1, Face.NegY],
  [2, 1, Face.PosZ],
  [2, -1, Face.NegZ],
];

function emitSlab(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const lo: [number, number, number] = [x, y, z];
  const hi: [number, number, number] = [x + 1, y + 0.5, z + 1];
  for (const [axis, sign, face] of FACES) {
    // The top face (y+0.5) never sits flush against the voxel above (y+1), so always emit it.
    const isTop = axis === 1 && sign > 0;
    const nx = x + (axis === 0 ? sign : 0);
    const ny = y + (axis === 1 ? sign : 0);
    const nz = z + (axis === 2 ? sign : 0);
    if (!isTop && registry.occludes(view.get(nx, ny, nz))) continue; // flush against a full cube
    pushBoxFace(buf, axis, sign, lo, hi, registry.faceLayer(id, face), packLight(view, nx, ny, nz));
  }
}

/** Two crossed billboard quads spanning the voxel. Double-sided (the cutout material) + no AO. */
function emitCross(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const layer = registry.faceLayer(id, Face.PosX);
  const light = packLight(view, x, y, z);
  const quads: [number, number, number][][] = [
    [
      [x, y, z],
      [x + 1, y, z + 1],
      [x + 1, y + 1, z + 1],
      [x, y + 1, z],
    ],
    [
      [x + 1, y, z],
      [x, y, z + 1],
      [x, y + 1, z + 1],
      [x + 1, y + 1, z],
    ],
  ];
  const uvs: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (const q of quads) {
    const n = buf.verts;
    for (let k = 0; k < 4; k++) {
      buf.positions.push(q[k][0], q[k][1], q[k][2]);
      buf.normals.push(0, 1, 0); // constant up-normal so both billboard sides light evenly
      buf.uvs.push(uvs[k][0], uvs[k][1]);
      buf.layers.push(layer);
      buf.ao.push(1);
      buf.light.push(light);
    }
    buf.indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
    buf.verts += 4;
  }
}

/** Emits slab boxes (→ opaque mesh) and cross billboards (→ cutout mesh) for one chunk. */
export function emitShaped(
  view: VoxelView,
  registry: BlockRegistry,
): { slabs: MeshData; cross: MeshData } {
  const slabs = emptyBuf();
  const cross = emptyBuf();
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE_Z; z++) {
      for (let x = 0; x < CHUNK_SIZE_X; x++) {
        const id = view.get(x, y, z);
        const shape = registry.shape(id);
        if (shape === 'slab') emitSlab(slabs, view, registry, id, x, y, z);
        else if (shape === 'cross') emitCross(cross, view, registry, id, x, y, z);
      }
    }
  }
  return { slabs: toMesh(slabs), cross: toMesh(cross) };
}

function concatF32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Concatenates two MeshData buffers, offsetting b's indices by a's vertex count. */
export function mergeMeshData(a: MeshData, b: MeshData): MeshData {
  if (b.positions.length === 0) return a;
  if (a.positions.length === 0) return b;
  const vertsA = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices, 0);
  for (let i = 0; i < b.indices.length; i++) indices[a.indices.length + i] = b.indices[i] + vertsA;
  return {
    positions: concatF32(a.positions, b.positions),
    normals: concatF32(a.normals, b.normals),
    uvs: concatF32(a.uvs, b.uvs),
    layers: concatF32(a.layers, b.layers),
    ao: concatF32(a.ao, b.ao),
    light: concatF32(a.light, b.light),
    indices,
  };
}
