import type { Vec3 } from '../core/types';
import type { VoxelRaycastHit } from '../edit/VoxelRaycast';
import type { NpcDefinition } from './NpcTypes';

export const NPC_ROTATION_STEP = Math.PI / 4;
export const DEFAULT_NPC_COLLISION_HALF: Vec3 = { x: 0.34, y: 0.9, z: 0.3 };

export interface NpcPlacementSelection {
  type: string;
  name: string;
  yaw: number;
}

/** Small UI/input state holder kept independent from DOM and rendering for deterministic tests. */
export class NpcPlacementState {
  selection?: NpcPlacementSelection;

  select(type: string, name: string, yaw = 0): NpcPlacementSelection {
    this.selection = { type, name, yaw: wrapYaw(yaw) };
    return this.selection;
  }

  rotate(direction: 1 | -1): NpcPlacementSelection | undefined {
    if (!this.selection) return undefined;
    this.selection.yaw = wrapYaw(this.selection.yaw + direction * NPC_ROTATION_STEP);
    return this.selection;
  }

  cancel(): boolean {
    const active = this.selection !== undefined;
    delete this.selection;
    return active;
  }
}

export interface NpcPlacementCandidate {
  position: Vec3;
  yaw: number;
  valid: boolean;
  reason?: string;
}

export interface NpcPlacementChecks {
  isLoaded(x: number, z: number): boolean;
  /** Highest walkable support top in the aimed voxel, in world Y coordinates. */
  supportTopAt(x: number, y: number, z: number): number | undefined;
  bodyClear(position: Vec3, half: Vec3): boolean;
  playerClear(position: Vec3, half: Vec3): boolean;
  npcClear(position: Vec3, half: Vec3): boolean;
}

export function npcCollisionHalf(definition: NpcDefinition): Vec3 {
  return definition.collisionHalf ?? DEFAULT_NPC_COLLISION_HALF;
}

/** Resolves an aimed top face into a centered, feet-on-support, safe NPC placement. */
export function resolveNpcPlacement(
  hit: VoxelRaycastHit,
  definition: NpcDefinition,
  yaw: number,
  checks: NpcPlacementChecks,
): NpcPlacementCandidate {
  const half = npcCollisionHalf(definition);
  const x = hit.block.x + 0.5;
  const z = hit.block.z + 0.5;
  const supportTop = checks.supportTopAt(hit.block.x, hit.block.y, hit.block.z);
  const position = {
    x,
    y: (supportTop ?? hit.block.y + 1) + half.y,
    z,
  };
  const invalid = (reason: string): NpcPlacementCandidate => ({
    position,
    yaw: wrapYaw(yaw),
    valid: false,
    reason,
  });

  if (!checks.isLoaded(hit.block.x, hit.block.z)) return invalid('Ground is not loaded');
  if (hit.normal.y <= 0) return invalid('Aim at the top of walkable ground');
  if (supportTop === undefined) return invalid('Aim at solid walkable ground');
  if (!checks.bodyClear(position, half)) return invalid('NPC would overlap solid blocks');
  if (!checks.playerClear(position, half)) return invalid('NPC would overlap the player');
  if (!checks.npcClear(position, half)) return invalid('NPC would overlap another NPC');
  return { position, yaw: wrapYaw(yaw), valid: true };
}

export function boxesOverlap(a: Vec3, aHalf: Vec3, b: Vec3, bHalf: Vec3): boolean {
  return (
    Math.abs(a.x - b.x) < aHalf.x + bHalf.x &&
    Math.abs(a.y - b.y) < aHalf.y + bHalf.y &&
    Math.abs(a.z - b.z) < aHalf.z + bHalf.z
  );
}

export function wrapYaw(yaw: number): number {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}
