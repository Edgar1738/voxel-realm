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
