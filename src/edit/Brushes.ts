import type { WorldVoxel } from './EditTypes';

function sortVoxels(a: WorldVoxel, b: WorldVoxel): number {
  return a.x - b.x || a.y - b.y || a.z - b.z;
}

export function boxVoxels(a: WorldVoxel, b: WorldVoxel): WorldVoxel[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const minZ = Math.min(a.z, b.z);
  const maxZ = Math.max(a.z, b.z);

  const result: WorldVoxel[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        result.push({ x, y, z });
      }
    }
  }
  return result.sort(sortVoxels);
}

export function sphereVoxels(center: WorldVoxel, radius: number): WorldVoxel[] {
  const r2 = radius * radius;
  const result: WorldVoxel[] = [];

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dy * dy + dz * dz <= r2) {
          result.push({ x: center.x + dx, y: center.y + dy, z: center.z + dz });
        }
      }
    }
  }
  return result.sort(sortVoxels);
}

export type BrushGesture = 'single' | 'stroke' | 'line' | 'tunnel';
export type BrushShape = 'voxel' | 'sphere' | 'box' | 'cylinder' | 'disc' | 'ring';
export type BrushAction = 'clear' | 'fill' | 'replace';
export type BrushAxis = 'x' | 'y' | 'z';

/** Composable power-brush state shared by the HUD and the input engine. */
export interface BrushConfig {
  gesture: BrushGesture;
  shape: BrushShape;
  action: BrushAction;
  /** Radius / half-extent in blocks. Ignored by the one-voxel shape and Tunnel preset. */
  size: number;
  shell: boolean;
  noise: boolean;
}

export const BRUSH_GESTURES: readonly Exclude<BrushGesture, 'tunnel'>[] = [
  'single',
  'stroke',
  'line',
];
export const BRUSH_SHAPES: readonly BrushShape[] = [
  'voxel',
  'sphere',
  'box',
  'cylinder',
  'disc',
  'ring',
];
export const BRUSH_ACTIONS: readonly BrushAction[] = ['clear', 'fill', 'replace'];
export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 8;

/** Returns the dominant axis of a direction; ties intentionally prefer x, then y, then z. */
export function brushAxis(direction: WorldVoxel): BrushAxis {
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  const absZ = Math.abs(direction.z);
  if (absX >= absY && absX >= absZ) return 'x';
  return absY >= absZ ? 'y' : 'z';
}

/** Clamps a brush size to the safe UI range. */
export function clampBrushSize(size: number): number {
  return Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(size)));
}

/** Integer voxel centers between two points, inclusive, using a 3D DDA. */
export function lineVoxels(a: WorldVoxel, b: WorldVoxel): WorldVoxel[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if (steps === 0) return [{ ...a }];

  const result: WorldVoxel[] = [];
  let lastKey = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const voxel = {
      x: Math.round(a.x + dx * t),
      y: Math.round(a.y + dy * t),
      z: Math.round(a.z + dz * t),
    };
    const key = `${voxel.x},${voxel.y},${voxel.z}`;
    if (key === lastKey) continue;
    lastKey = key;
    result.push(voxel);
  }
  return result;
}

function radialStamp(
  center: WorldVoxel,
  radius: number,
  axis: BrushAxis,
  halfLength: number,
  ring: boolean,
): WorldVoxel[] {
  const result: WorldVoxel[] = [];
  const r2 = radius * radius;
  const inner2 = Math.max(0, radius - 1) ** 2;
  for (let along = -halfLength; along <= halfLength; along++) {
    for (let a = -radius; a <= radius; a++) {
      for (let b = -radius; b <= radius; b++) {
        const d2 = a * a + b * b;
        if (d2 > r2 || (ring && d2 <= inner2)) continue;
        const voxel = { ...center };
        voxel[axis] += along;
        if (axis === 'x') {
          voxel.y += a;
          voxel.z += b;
        } else if (axis === 'y') {
          voxel.x += a;
          voxel.z += b;
        } else {
          voxel.x += a;
          voxel.y += b;
        }
        result.push(voxel);
      }
    }
  }
  return result.sort(sortVoxels);
}

/** Generates one shape stamp centered on `center` and aligned to `axis`. */
export function brushStampVoxels(
  center: WorldVoxel,
  shape: BrushShape,
  size: number,
  axis: BrushAxis,
): WorldVoxel[] {
  const radius = clampBrushSize(size);
  if (shape === 'voxel') return [{ ...center }];
  if (shape === 'sphere') return sphereVoxels(center, radius);
  if (shape === 'box') {
    return boxVoxels(
      { x: center.x - radius, y: center.y - radius, z: center.z - radius },
      { x: center.x + radius, y: center.y + radius, z: center.z + radius },
    );
  }
  if (shape === 'cylinder') return radialStamp(center, radius, axis, radius, false);
  if (shape === 'disc') return radialStamp(center, radius, axis, 0, false);
  return radialStamp(center, radius, axis, 0, true);
}

function uniqueVoxels(voxels: readonly WorldVoxel[]): WorldVoxel[] {
  const unique = new Map<string, WorldVoxel>();
  for (const voxel of voxels) unique.set(`${voxel.x},${voxel.y},${voxel.z}`, voxel);
  return [...unique.values()].sort(sortVoxels);
}

/** Sweeps a brush shape between two centers, producing a gap-free voxel stroke. */
export function sweptBrushVoxels(
  a: WorldVoxel,
  b: WorldVoxel,
  shape: BrushShape,
  size: number,
  axis: BrushAxis,
): WorldVoxel[] {
  return uniqueVoxels(
    lineVoxels(a, b).flatMap((center) => brushStampVoxels(center, shape, size, axis)),
  );
}

const NEIGHBORS: readonly WorldVoxel[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

function voxelKey(v: WorldVoxel): string {
  return `${v.x},${v.y},${v.z}`;
}

function surfaceMask(voxels: readonly WorldVoxel[]): { set: Set<string>; surface: Set<string> } {
  const set = new Set(voxels.map(voxelKey));
  const surface = new Set<string>();
  for (const voxel of voxels) {
    if (NEIGHBORS.some((n) => !set.has(`${voxel.x + n.x},${voxel.y + n.y},${voxel.z + n.z}`))) {
      surface.add(voxelKey(voxel));
    }
  }
  return { set, surface };
}

function coordinateHash(voxel: WorldVoxel): number {
  let h =
    Math.imul(voxel.x, 73856093) ^ Math.imul(voxel.y, 19349663) ^ Math.imul(voxel.z, 83492791);
  h ^= h >>> 13;
  return Math.abs(h);
}

/** Applies hollow-shell and deterministic rough-edge modifiers to a generated brush volume. */
export function applyBrushModifiers(
  voxels: readonly WorldVoxel[],
  modifiers: Pick<BrushConfig, 'shell' | 'noise'>,
): WorldVoxel[] {
  const unique = uniqueVoxels(voxels);
  if ((!modifiers.shell && !modifiers.noise) || unique.length < 8) return unique;

  const { surface } = surfaceMask(unique);
  let result = modifiers.shell ? unique.filter((voxel) => surface.has(voxelKey(voxel))) : unique;
  if (modifiers.noise) {
    // Remove roughly one fifth of boundary cells. Interiors stay solid, making the edge organic
    // without turning a large brush into disconnected confetti.
    result = result.filter((voxel) => {
      if (!surface.has(voxelKey(voxel))) return true;
      return coordinateHash(voxel) % 5 !== 0;
    });
  }
  return result.sort(sortVoxels);
}

export type TunnelSize = 1 | 2 | 3;
export type TunnelLength = 4 | 8 | 16;
export type TunnelPath = 'straight' | 'up' | 'down';

/** Player-configurable tunnel shape: cross-section size, forward length, and stair path. */
export interface TunnelConfig {
  size: TunnelSize;
  length: TunnelLength;
  path: TunnelPath;
}

export const TUNNEL_SIZES: readonly TunnelSize[] = [1, 2, 3];
export const TUNNEL_LENGTHS: readonly TunnelLength[] = [4, 8, 16];
export const TUNNEL_PATHS: readonly TunnelPath[] = ['straight', 'up', 'down'];

/** Centered lateral offsets for a cross-section of `size` blocks (size 2 biases positive). */
function lateralOffsets(size: number): number[] {
  const first = -Math.floor((size - 1) / 2);
  return Array.from({ length: size }, (_, i) => first + i);
}

/**
 * Config-driven tunnel volume starting one step beyond `start` along the dominant axis of
 * `direction`. Horizontal tunnels are `size` wide (centered) and `size` tall with their floor
 * at the entry level, so the result is walkable. `path: 'up' | 'down'` shifts each forward
 * step one block vertically after the first, carving a traversable stair ramp. Vertical
 * tunnels (looking straight up/down) use a centered square cross-section and ignore `path`.
 */
export function tunnelConfigVoxels(
  start: WorldVoxel,
  direction: WorldVoxel,
  config: TunnelConfig,
): WorldVoxel[] {
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  const absZ = Math.abs(direction.z);

  let dominantAxis: 'x' | 'y' | 'z';
  if (absX >= absY && absX >= absZ) {
    dominantAxis = 'x';
  } else if (absY >= absZ) {
    dominantAxis = 'y';
  } else {
    dominantAxis = 'z';
  }

  const axisValue = direction[dominantAxis];
  const step = axisValue === 0 ? 1 : Math.sign(axisValue);
  const offsets = lateralOffsets(config.size);
  const result: WorldVoxel[] = [];

  if (dominantAxis === 'y') {
    // Straight vertical shaft; stair paths are meaningless when digging up/down.
    for (let i = 1; i <= config.length; i++) {
      const y = start.y + step * i;
      for (const dx of offsets) {
        for (const dz of offsets) {
          result.push({ x: start.x + dx, y, z: start.z + dz });
        }
      }
    }
    return result.sort(sortVoxels);
  }

  const lateralAxis = dominantAxis === 'x' ? 'z' : 'x';
  const yDelta = config.path === 'up' ? 1 : config.path === 'down' ? -1 : 0;

  for (let i = 1; i <= config.length; i++) {
    const along = start[dominantAxis] + step * i;
    const floorY = start.y + yDelta * (i - 1);
    for (const lat of offsets) {
      const lateral = start[lateralAxis] + lat;
      for (let v = 0; v < config.size; v++) {
        const voxel = { x: 0, y: floorY + v, z: 0 };
        voxel[dominantAxis] = along;
        voxel[lateralAxis] = lateral;
        result.push(voxel);
      }
    }
  }
  return result.sort(sortVoxels);
}

export function tunnelVoxels(
  start: WorldVoxel,
  direction: WorldVoxel,
  length: number,
  radius: number,
): WorldVoxel[] {
  const absX = Math.abs(direction.x);
  const absY = Math.abs(direction.y);
  const absZ = Math.abs(direction.z);

  // Dominant axis: largest absolute component; tie-break x over y over z
  let dominantAxis: 'x' | 'y' | 'z';
  if (absX >= absY && absX >= absZ) {
    dominantAxis = 'x';
  } else if (absY >= absZ) {
    dominantAxis = 'y';
  } else {
    dominantAxis = 'z';
  }

  const axisValue = direction[dominantAxis];
  const step = axisValue === 0 ? 1 : Math.sign(axisValue);

  const result: WorldVoxel[] = [];

  for (let i = 1; i <= length; i++) {
    const center: WorldVoxel = { ...start };
    center[dominantAxis] = start[dominantAxis] + step * i;

    // Cross-section: vary the two non-dominant axes from -radius..+radius
    if (dominantAxis === 'x') {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          result.push({ x: center.x, y: center.y + dy, z: center.z + dz });
        }
      }
    } else if (dominantAxis === 'y') {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          result.push({ x: center.x + dx, y: center.y, z: center.z + dz });
        }
      }
    } else {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          result.push({ x: center.x + dx, y: center.y + dy, z: center.z });
        }
      }
    }
  }
  return result.sort(sortVoxels);
}
