import type { BlockId } from './types';
import { rotateStateY, mirrorStateAcross } from '../world/VoxelState';

/** A non-air voxel offset from the prefab's min corner: [dx, dy, dz, id] or [dx, dy, dz, id, state]. */
export type PrefabVoxel =
  | [number, number, number, BlockId]
  | [number, number, number, BlockId, number];

const MAX_PREFAB_BLOCKS = 200000;

/** Named composition point inside a prefab. Sockets are connection targets; anchors are origins. */
export interface PrefabPoint {
  id: string;
  pos: [number, number, number];
  /** Optional N/E/S/W orientation using the same facing convention as voxel state. */
  facing?: number;
}

/** The orientation state of a prefab voxel, or undefined for a plain 4-tuple. */
function voxelStateOf(b: PrefabVoxel): number | undefined {
  return b.length === 5 ? b[4] : undefined;
}

/** Build a prefab voxel, including the state element only when defined. */
function prefabVoxel(dx: number, dy: number, dz: number, id: BlockId, state?: number): PrefabVoxel {
  return state === undefined ? [dx, dy, dz, id] : [dx, dy, dz, id, state];
}

/** Structural validation for an untrusted Prefab. Returns null if valid, else a reason. */
export function validatePrefab(p: unknown): string | null {
  if (typeof p !== 'object' || p === null) return 'prefab must be an object';
  const o = p as { dims?: unknown; blocks?: unknown; anchors?: unknown; sockets?: unknown };
  if (
    !Array.isArray(o.dims) ||
    o.dims.length !== 3 ||
    !o.dims.every((d) => Number.isInteger(d) && (d as number) > 0)
  ) {
    return 'dims must be three positive integers';
  }
  const [sx, sy, sz] = o.dims as number[];
  if (!Array.isArray(o.blocks)) return 'blocks must be an array';
  if (o.blocks.length > MAX_PREFAB_BLOCKS) return `too many blocks (>${MAX_PREFAB_BLOCKS})`;
  for (const b of o.blocks) {
    if (!Array.isArray(b) || (b.length !== 4 && b.length !== 5))
      return 'each block must be [dx,dy,dz,id] or [dx,dy,dz,id,state]';
    const [dx, dy, dz, id] = b as number[];
    if (![dx, dy, dz, id].every(Number.isInteger)) return 'block fields must be integers';
    if (dx < 0 || dy < 0 || dz < 0 || dx >= sx || dy >= sy || dz >= sz)
      return `block offset out of dims range`;
    if (id < 0 || id > 255) return `block id ${id} out of 0..255`;
    if (b.length === 5) {
      const state = (b as number[])[4];
      if (!Number.isInteger(state) || state < 0 || state > 255)
        return `block state ${state} out of 0..255`;
    }
  }
  for (const [label, points] of [
    ['anchors', o.anchors],
    ['sockets', o.sockets],
  ] as const) {
    if (points === undefined) continue;
    if (!Array.isArray(points)) return `${label} must be an array`;
    const ids = new Set<string>();
    for (const point of points) {
      if (typeof point !== 'object' || point === null) return `${label} entries must be objects`;
      const q = point as { id?: unknown; pos?: unknown; facing?: unknown };
      if (typeof q.id !== 'string' || q.id.trim() === '') return `${label} id must be non-empty`;
      if (ids.has(q.id)) return `${label} id "${q.id}" is duplicated`;
      ids.add(q.id);
      if (
        !Array.isArray(q.pos) ||
        q.pos.length !== 3 ||
        !q.pos.every(Number.isInteger) ||
        q.pos.some((v, i) => (v as number) < 0 || (v as number) >= [sx, sy, sz][i])
      )
        return `${label} position must be an integer cell inside dims`;
      if (
        q.facing !== undefined &&
        (!Number.isInteger(q.facing) || (q.facing as number) < 0 || (q.facing as number) > 3)
      )
        return `${label} facing must be 0..3`;
    }
  }
  return null;
}

/** Portable, position-independent block group. Identical shape to a dev Blueprint. */
export interface Prefab {
  dims: [number, number, number];
  blocks: PrefabVoxel[];
  anchors?: PrefabPoint[];
  sockets?: PrefabPoint[];
}

function mapPoints(
  points: PrefabPoint[] | undefined,
  map: (pos: PrefabPoint['pos'], facing: number | undefined) => PrefabPoint,
): PrefabPoint[] | undefined {
  return points?.map((point) => ({ ...map(point.pos, point.facing), id: point.id }));
}

/** Re-anchor so the min corner is the origin and dims tightly bound the blocks. */
export function normalize(p: Prefab): Prefab {
  if (p.blocks.length === 0) return { dims: [0, 0, 0], blocks: [] };
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const [x, y, z] of p.blocks) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const blocks: PrefabVoxel[] = p.blocks.map((b) =>
    prefabVoxel(b[0] - minX, b[1] - minY, b[2] - minZ, b[3], voxelStateOf(b)),
  );
  const shiftPoint = (pos: PrefabPoint['pos'], facing: number | undefined): PrefabPoint => ({
    id: '',
    pos: [pos[0] - minX, pos[1] - minY, pos[2] - minZ],
    ...(facing === undefined ? {} : { facing }),
  });
  return {
    dims: [maxX - minX + 1, maxY - minY + 1, maxZ - minZ + 1],
    blocks,
    ...(p.anchors ? { anchors: mapPoints(p.anchors, shiftPoint)! } : {}),
    ...(p.sockets ? { sockets: mapPoints(p.sockets, shiftPoint)! } : {}),
  };
}

/** Transform a voxel's state (facing rotation/flip), leaving stateless 4-tuples untouched. */
function mapState(b: PrefabVoxel, f: (state: number) => number): number | undefined {
  const state = voxelStateOf(b);
  return state === undefined ? undefined : f(state);
}

/**
 * Rotate about the Y axis in 90-degree steps (positive = clockwise viewed from +Y).
 * Oriented voxels (stairs/gates) rotate their facing bits along with their position.
 */
export function rotateY(p: Prefab, quarterTurns: number): Prefab {
  const turns = ((quarterTurns % 4) + 4) % 4;
  if (turns === 0) return normalize(p);
  const [sx, , sz] = p.dims;
  let blocks: PrefabVoxel[] = p.blocks;
  let dimX = sx,
    dimZ = sz;
  let anchors = p.anchors;
  let sockets = p.sockets;
  for (let t = 0; t < turns; t++) {
    const maxX = dimX - 1;
    blocks = blocks.map((b) =>
      prefabVoxel(
        b[2],
        b[1],
        maxX - b[0],
        b[3],
        mapState(b, (s) => rotateStateY(s, 1)),
      ),
    );
    const rotatePoint = (pos: PrefabPoint['pos'], facing: number | undefined): PrefabPoint => ({
      id: '',
      pos: [pos[2], pos[1], maxX - pos[0]],
      ...(facing === undefined ? {} : { facing: rotateStateY(facing, 1) & 0b11 }),
    });
    anchors = mapPoints(anchors, rotatePoint);
    sockets = mapPoints(sockets, rotatePoint);
    [dimX, dimZ] = [dimZ, dimX];
  }
  return normalize({
    dims: [dimX, p.dims[1], dimZ],
    blocks,
    ...(anchors ? { anchors } : {}),
    ...(sockets ? { sockets } : {}),
  });
}

/**
 * Reflect across the given horizontal axis. Oriented voxels flip their facing with the
 * reflection (x flips E↔W, z flips N↔S).
 */
export function mirror(p: Prefab, axis: 'x' | 'z'): Prefab {
  const [sx, , sz] = p.dims;
  const blocks: PrefabVoxel[] = p.blocks.map((b) =>
    axis === 'x'
      ? prefabVoxel(
          sx - 1 - b[0],
          b[1],
          b[2],
          b[3],
          mapState(b, (s) => mirrorStateAcross(s, 'x')),
        )
      : prefabVoxel(
          b[0],
          b[1],
          sz - 1 - b[2],
          b[3],
          mapState(b, (s) => mirrorStateAcross(s, 'z')),
        ),
  );
  const mirrorPoint = (pos: PrefabPoint['pos'], facing: number | undefined): PrefabPoint => ({
    id: '',
    pos: axis === 'x' ? [sx - 1 - pos[0], pos[1], pos[2]] : [pos[0], pos[1], sz - 1 - pos[2]],
    ...(facing === undefined ? {} : { facing: mirrorStateAcross(facing, axis) & 0b11 }),
  });
  return normalize({
    dims: p.dims,
    blocks,
    ...(p.anchors ? { anchors: mapPoints(p.anchors, mirrorPoint)! } : {}),
    ...(p.sockets ? { sockets: mapPoints(p.sockets, mirrorPoint)! } : {}),
  });
}

/** Tile the prefab into an nx*ny*nz grid, each copy offset by `stride`. */
export function repeat(
  p: Prefab,
  nx: number,
  ny: number,
  nz: number,
  stride: [number, number, number],
): Prefab {
  const MAX_REPEAT = 200000;
  if (nx * ny * nz * p.blocks.length > MAX_REPEAT)
    throw new Error(`repeat too large (>${MAX_REPEAT})`);
  const blocks: PrefabVoxel[] = [];
  const anchors: PrefabPoint[] = [];
  const sockets: PrefabPoint[] = [];
  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        for (const b of p.blocks) {
          blocks.push(
            prefabVoxel(
              b[0] + ix * stride[0],
              b[1] + iy * stride[1],
              b[2] + iz * stride[2],
              b[3],
              voxelStateOf(b),
            ),
          );
        }
        for (const [kind, points] of [
          [anchors, p.anchors],
          [sockets, p.sockets],
        ] as const)
          for (const point of points ?? [])
            kind.push({
              ...point,
              id: `${point.id}@${ix},${iy},${iz}`,
              pos: [
                point.pos[0] + ix * stride[0],
                point.pos[1] + iy * stride[1],
                point.pos[2] + iz * stride[2],
              ],
            });
      }
    }
  }
  return normalize({
    dims: p.dims,
    blocks,
    ...(p.anchors ? { anchors } : {}),
    ...(p.sockets ? { sockets } : {}),
  });
}

/**
 * Attach one prefab's named anchor to a socket on another prefab. When both points declare a
 * facing, the addition is quarter-turned so its anchor faces back into the target socket.
 * Overlapping cells use the attached prefab, which makes doorway/road join pieces deterministic.
 */
export function connectPrefabs(
  base: Prefab,
  socketId: string,
  addition: Prefab,
  anchorId: string,
): Prefab {
  const socket = base.sockets?.find((point) => point.id === socketId);
  if (!socket) throw new Error(`Unknown prefab socket "${socketId}"`);
  const sourceAnchor = addition.anchors?.find((point) => point.id === anchorId);
  if (!sourceAnchor) throw new Error(`Unknown prefab anchor "${anchorId}"`);

  let attached = addition;
  if (socket.facing !== undefined && sourceAnchor.facing !== undefined) {
    const wanted = (socket.facing + 2) & 0b11;
    for (let turns = 0; turns < 4; turns++) {
      const candidate = rotateY(addition, turns);
      if (candidate.anchors?.find((point) => point.id === anchorId)?.facing === wanted) {
        attached = candidate;
        break;
      }
    }
  }
  const anchor = attached.anchors?.find((point) => point.id === anchorId);
  if (!anchor) throw new Error(`Prefab anchor "${anchorId}" was lost during transform`);
  const offset: [number, number, number] = [
    socket.pos[0] - anchor.pos[0],
    socket.pos[1] - anchor.pos[1],
    socket.pos[2] - anchor.pos[2],
  ];

  const keyed = new Map<string, PrefabVoxel>();
  const addBlock = (b: PrefabVoxel, dx = 0, dy = 0, dz = 0): void => {
    const moved = prefabVoxel(b[0] + dx, b[1] + dy, b[2] + dz, b[3], voxelStateOf(b));
    keyed.set(`${moved[0]},${moved[1]},${moved[2]}`, moved);
  };
  base.blocks.forEach((block) => addBlock(block));
  attached.blocks.forEach((block) => addBlock(block, ...offset));

  const movePoints = (
    points: PrefabPoint[] | undefined,
    consumedId: string,
    translate: boolean,
  ): PrefabPoint[] =>
    (points ?? [])
      .filter((point) => point.id !== consumedId)
      .map((point) => ({
        ...point,
        pos: translate
          ? [point.pos[0] + offset[0], point.pos[1] + offset[1], point.pos[2] + offset[2]]
          : [...point.pos],
      }));

  return normalize({
    dims: base.dims,
    blocks: [...keyed.values()],
    anchors: [
      ...movePoints(base.anchors, '', false),
      ...movePoints(attached.anchors, anchorId, true),
    ],
    sockets: [
      ...movePoints(base.sockets, socketId, false),
      ...movePoints(attached.sockets, '', true),
    ],
  });
}
