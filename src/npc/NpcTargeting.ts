import type { AABB } from '../blocks/shapeBoxes';
import type { Vec3 } from '../core/types';
import type { NpcDefinition } from './NpcTypes';

export const NPC_INTERACTION_RANGE = 5;

/** Distance from a ray origin to an AABB, or undefined when the ray misses. */
export function rayAabbDistance(origin: Vec3, direction: Vec3, box: AABB): number | undefined {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (len < 1e-8) return undefined;
  const dir = { x: direction.x / len, y: direction.y / len, z: direction.z / len };
  const mins = [box[0], box[1], box[2]];
  const maxs = [box[3], box[4], box[5]];
  const origins = [origin.x, origin.y, origin.z];
  const dirs = [dir.x, dir.y, dir.z];
  let near = -Infinity;
  let far = Infinity;

  for (let axis = 0; axis < 3; axis++) {
    const d = dirs[axis];
    if (Math.abs(d) < 1e-8) {
      if (origins[axis] < mins[axis] || origins[axis] > maxs[axis]) return undefined;
      continue;
    }
    let t0 = (mins[axis] - origins[axis]) / d;
    let t1 = (maxs[axis] - origins[axis]) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return undefined;
  }
  if (far < 0) return undefined;
  return Math.max(0, near);
}

export function npcTargetBox(npc: NpcDefinition): AABB {
  const half = npc.targetHalf ?? { x: 0.48, y: 1.02, z: 0.42 };
  return [
    npc.position.x - half.x,
    npc.position.y - half.y,
    npc.position.z - half.z,
    npc.position.x + half.x,
    npc.position.y + half.y,
    npc.position.z + half.z,
  ];
}

/** Selects the nearest aimed NPC, stopping at the first solid voxel when supplied. */
export function findNpcTarget(
  npcs: readonly NpcDefinition[],
  origin: Vec3,
  direction: Vec3,
  maxDistance = NPC_INTERACTION_RANGE,
  obstacleDistance = Infinity,
): NpcDefinition | undefined {
  let best: NpcDefinition | undefined;
  let bestDistance = Math.min(maxDistance, obstacleDistance - 1e-3);
  for (const npc of npcs) {
    const distance = rayAabbDistance(origin, direction, npcTargetBox(npc));
    if (distance === undefined || distance > bestDistance) continue;
    best = npc;
    bestDistance = distance;
  }
  return best;
}
