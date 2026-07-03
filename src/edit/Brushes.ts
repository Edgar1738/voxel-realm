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
