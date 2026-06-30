import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../core/constants';
import { Face } from '../blocks/blocks';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import type { VoxelView } from '../world/VoxelView';
import type { MeshData } from './MeshTypes';
import { unpackState, FACING } from '../world/VoxelState';

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

/**
 * Emits one axis-aligned box [lo..hi] inside voxel (vx,vy,vz). A face is culled only when it lies
 * exactly on the voxel boundary AND the neighbour voxel in that direction is a full-cube occluder
 * (mid-voxel faces — slab tops, stair risers — are always emitted). Generalizes the slab box.
 */
function emitBoxCulled(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  vx: number,
  vy: number,
  vz: number,
  lo: [number, number, number],
  hi: [number, number, number],
): void {
  const vMin = [vx, vy, vz];
  const vMax = [vx + 1, vy + 1, vz + 1];
  for (const [axis, sign, face] of FACES) {
    const d = sign > 0 ? hi[axis] : lo[axis];
    const onBoundary = d === (sign > 0 ? vMax[axis] : vMin[axis]);
    const nx = vx + (axis === 0 ? sign : 0);
    const ny = vy + (axis === 1 ? sign : 0);
    const nz = vz + (axis === 2 ? sign : 0);
    if (onBoundary && registry.occludes(view.get(nx, ny, nz))) continue;
    pushBoxFace(buf, axis, sign, lo, hi, registry.faceLayer(id, face), packLight(view, nx, ny, nz));
  }
}

function emitSlab(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  emitBoxCulled(buf, view, registry, id, x, y, z, [x, y, z], [x + 1, y + 0.5, z + 1]);
}

/** The two boxes (bottom half-box + back upper-half box) of a stair, by facing + half. */
function stairBoxes(
  x: number,
  y: number,
  z: number,
  facing: number,
  half: number,
): Array<[[number, number, number], [number, number, number]]> {
  const yFullLo = half === 1 ? y + 0.5 : y;
  const yFullHi = half === 1 ? y + 1 : y + 0.5;
  const yStepLo = half === 1 ? y : y + 0.5;
  const yStepHi = half === 1 ? y + 0.5 : y + 1;
  let sx0 = x;
  let sx1 = x + 1;
  let sz0 = z;
  let sz1 = z + 1;
  if (facing === FACING.N)
    sz0 = z + 0.5; // N → step on the south half
  else if (facing === FACING.S)
    sz1 = z + 0.5; // S → north half
  else if (facing === FACING.E)
    sx1 = x + 0.5; // E → west half
  else sx0 = x + 0.5; // W → east half
  return [
    [
      [x, yFullLo, z],
      [x + 1, yFullHi, z + 1],
    ],
    [
      [sx0, yStepLo, sz0],
      [sx1, yStepHi, sz1],
    ],
  ];
}

function emitStair(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const { facing, half } = unpackState(view.getState(x, y, z));
  for (const [lo, hi] of stairBoxes(x, y, z, facing, half)) {
    emitBoxCulled(buf, view, registry, id, x, y, z, lo, hi);
  }
}

/** Box dimensions for a connecting shape, in local voxel units (0..1). */
interface ConnProfile {
  /** Central post box [lo, hi] (local). */
  post: [[number, number, number], [number, number, number]];
  /** The post's low/high edge on the x/z axes (where arms start). */
  postLo: number;
  postHi: number;
  /** Half-thickness of an arm on its perpendicular horizontal axis. */
  armHalf: number;
  /** [yLo, yHi] for each rail of an arm (fence = two rails, wall = one bar). */
  rails: Array<[number, number]>;
}

const FENCE_PROFILE: ConnProfile = {
  post: [
    [0.375, 0, 0.375],
    [0.625, 1, 0.625],
  ],
  postLo: 0.375,
  postHi: 0.625,
  armHalf: 0.1,
  rails: [
    [0.35, 0.55],
    [0.7, 0.9],
  ],
};

const WALL_PROFILE: ConnProfile = {
  post: [
    [0.25, 0, 0.25],
    [0.75, 1, 0.75],
  ],
  postLo: 0.25,
  postHi: 0.75,
  armHalf: 0.2,
  rails: [[0, 0.8]],
};

/** The 4 horizontal connection directions as (dx, dz). */
const CONN_DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Arm rail boxes reaching from the post toward boundary (dx,dz), centred on the perpendicular axis. */
function armBoxes(
  x: number,
  y: number,
  z: number,
  dx: number,
  dz: number,
  p: ConnProfile,
): Array<[[number, number, number], [number, number, number]]> {
  const c = 0.5; // perpendicular centre
  return p.rails.map(([yLo, yHi]): [[number, number, number], [number, number, number]] => {
    if (dx === 1)
      return [
        [x + p.postHi, y + yLo, z + c - p.armHalf],
        [x + 1, y + yHi, z + c + p.armHalf],
      ];
    if (dx === -1)
      return [
        [x, y + yLo, z + c - p.armHalf],
        [x + p.postLo, y + yHi, z + c + p.armHalf],
      ];
    if (dz === 1)
      return [
        [x + c - p.armHalf, y + yLo, z + p.postHi],
        [x + c + p.armHalf, y + yHi, z + 1],
      ];
    return [
      [x + c - p.armHalf, y + yLo, z],
      [x + c + p.armHalf, y + yHi, z + p.postLo],
    ];
  });
}

/** Emits a fence/wall: a central post + an arm toward each connected horizontal neighbour. */
function emitConnected(
  buf: Buf,
  view: VoxelView,
  registry: BlockRegistry,
  id: number,
  x: number,
  y: number,
  z: number,
): void {
  const p = registry.shape(id) === 'wall' ? WALL_PROFILE : FENCE_PROFILE;
  emitBoxCulled(
    buf,
    view,
    registry,
    id,
    x,
    y,
    z,
    [x + p.post[0][0], y + p.post[0][1], z + p.post[0][2]],
    [x + p.post[1][0], y + p.post[1][1], z + p.post[1][2]],
  );
  for (const [dx, dz] of CONN_DIRS) {
    if (!registry.connectsTo(id, view.get(x + dx, y, z + dz))) continue;
    for (const [lo, hi] of armBoxes(x, y, z, dx, dz, p)) {
      emitBoxCulled(buf, view, registry, id, x, y, z, lo, hi);
    }
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
        else if (shape === 'stair') emitStair(slabs, view, registry, id, x, y, z);
        else if (shape === 'fence' || shape === 'wall')
          emitConnected(slabs, view, registry, id, x, y, z);
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
