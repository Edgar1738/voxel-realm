import type { BlockId, Vec3 } from '../core/types';
import type { SetVoxel } from '../edit/EditTypes';

export interface EditResult {
  requested: number;
  applied: number;
  /** y outside the world height. */
  outOfWorld: number;
  /** Target chunk was not loaded. */
  unloaded: number;
  /** Loaded and in-world, but already had the requested block. */
  noChange: number;
  /** Chunk keys that were unloaded at apply time (deduped) — for self-diagnosing failed builds. */
  unloadedChunks: string[];
}

export interface BatchedEditResult extends EditResult {
  batches: EditResult[];
}

export interface TerrainPathPoint {
  x: number;
  y?: number;
  z: number;
}

export interface TerrainPathOptions {
  /** Radius around the centerline; 0 is one block wide, 1 is three blocks wide. */
  width?: number;
  block: BlockId;
  /** For elevated path points, fills from terrain+1 up to the path tile. */
  supportBlock?: BlockId;
  /** Adds a two-block marker post every N centerline points. */
  markerEvery?: number;
  markerBlock?: BlockId;
}

export interface Pose {
  pos: Vec3;
  yaw: number;
  pitch: number;
}

export function applyVoxelsInBatches(
  voxels: SetVoxel[],
  applyBatch: (batch: SetVoxel[]) => EditResult,
  maxBatchSize: number,
): BatchedEditResult {
  if (maxBatchSize < 1) throw new Error('maxBatchSize must be >= 1');
  const batches: EditResult[] = [];
  for (let i = 0; i < voxels.length; i += maxBatchSize) {
    batches.push(applyBatch(voxels.slice(i, i + maxBatchSize)));
  }
  return combineEditResults(batches);
}

export function buildTerrainPathVoxels(
  points: TerrainPathPoint[],
  opts: TerrainPathOptions,
  surfaceY: (x: number, z: number) => number,
): SetVoxel[] {
  const radius = Math.max(0, Math.floor(opts.width ?? 1));
  const centerline = interpolatePath(points);
  const out = new Map<string, SetVoxel>();
  const set = (voxel: SetVoxel): void => {
    out.set(`${voxel.x},${voxel.y},${voxel.z}`, voxel);
  };

  centerline.forEach((point, index) => {
    const axis = pathAxis(centerline, index);
    for (let offset = -radius; offset <= radius; offset++) {
      const x = point.x + (axis === 'z' ? offset : 0);
      const z = point.z + (axis === 'x' ? offset : 0);
      const terrainY = surfaceY(x, z);
      const pathY = point.y ?? terrainY;
      if (opts.supportBlock !== undefined) {
        for (let y = terrainY + 1; y < pathY; y++) set({ x, y, z, id: opts.supportBlock });
      }
      set({ x, y: pathY, z, id: opts.block });
    }
    const markerEvery = opts.markerEvery ?? 0;
    if (markerEvery > 0 && opts.markerBlock !== undefined && index % markerEvery === 0) {
      const y = point.y ?? surfaceY(point.x, point.z);
      set({ x: point.x, y: y + 1, z: point.z, id: opts.markerBlock });
      set({ x: point.x, y: y + 2, z: point.z, id: opts.markerBlock });
    }
  });

  return [...out.values()].sort(compareVoxels);
}

export function createMemoryBookmarks(getPose: () => Pose, setPose: (pose: Pose) => void) {
  const saved = new Map<string, Pose>();
  return {
    save(name: string): Pose {
      const pose = clonePose(getPose());
      saved.set(name, pose);
      return clonePose(pose);
    },
    go(name: string): Pose | undefined {
      const pose = saved.get(name);
      if (!pose) return undefined;
      const next = clonePose(pose);
      setPose(next);
      return clonePose(next);
    },
    list(): string[] {
      return [...saved.keys()].sort();
    },
  };
}

function combineEditResults(batches: EditResult[]): BatchedEditResult {
  const chunks = new Set<string>();
  for (const b of batches) for (const c of b.unloadedChunks) chunks.add(c);
  return {
    requested: sum(batches, 'requested'),
    applied: sum(batches, 'applied'),
    unloaded: sum(batches, 'unloaded'),
    outOfWorld: sum(batches, 'outOfWorld'),
    noChange: sum(batches, 'noChange'),
    unloadedChunks: [...chunks],
    batches,
  };
}

function interpolatePath(points: TerrainPathPoint[]): TerrainPathPoint[] {
  const out: TerrainPathPoint[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
    for (let step = 0; step <= steps; step++) {
      const t = steps === 0 ? 0 : step / steps;
      const point: TerrainPathPoint = {
        x: Math.round(a.x + (b.x - a.x) * t),
        z: Math.round(a.z + (b.z - a.z) * t),
      };
      const y = interpolateOptionalY(a, b, t);
      if (y !== undefined) point.y = y;
      const key = `${point.x},${point.z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(point);
    }
  }
  if (points.length === 1) out.push({ ...points[0] });
  return out;
}

function interpolateOptionalY(
  a: TerrainPathPoint,
  b: TerrainPathPoint,
  t: number,
): number | undefined {
  if (a.y === undefined && b.y === undefined) return undefined;
  const start = a.y ?? b.y;
  const end = b.y ?? a.y;
  return start === undefined || end === undefined
    ? undefined
    : Math.round(start + (end - start) * t);
}

function pathAxis(points: TerrainPathPoint[], index: number): 'x' | 'z' {
  const before = points[Math.max(0, index - 1)];
  const after = points[Math.min(points.length - 1, index + 1)];
  return Math.abs(after.x - before.x) >= Math.abs(after.z - before.z) ? 'x' : 'z';
}

function compareVoxels(a: SetVoxel, b: SetVoxel): number {
  return a.x - b.x || a.y - b.y || a.z - b.z || a.id - b.id;
}

type NumericEditKey = {
  [K in keyof EditResult]: EditResult[K] extends number ? K : never;
}[keyof EditResult];

function sum(results: EditResult[], key: NumericEditKey): number {
  return results.reduce((total, result) => total + (result[key] as number), 0);
}

function clonePose(pose: Pose): Pose {
  return { pos: { ...pose.pos }, yaw: pose.yaw, pitch: pose.pitch };
}
