import type { Object3D } from 'three';
import type { AABB } from '../blocks/shapeBoxes';
import type { Vec3 } from '../core/types';
import type { EquipmentId, EquipmentLoadout, EquipmentSlot } from '../character/Equipment';
import type { CharacterJointState, CharacterJointTransform } from '../character/CharacterRig';
import { NpcActor } from './NpcActor';
import { findNpcTarget } from './NpcTargeting';
import type {
  NpcAnimationPlayback,
  NpcDefinition,
  NpcPosePlayback,
  NpcPoseState,
} from './NpcTypes';

function collisionBox(npc: NpcDefinition): AABB | undefined {
  const half = npc.collisionHalf;
  if (!half) return undefined;
  return [
    npc.position.x - half.x,
    npc.position.y - half.y,
    npc.position.z - half.z,
    npc.position.x + half.x,
    npc.position.y + half.y,
    npc.position.z + half.z,
  ];
}

/** Owns the small set of authored NPCs active in the current world. */
export class NpcSystem {
  readonly definitions: readonly NpcDefinition[];
  private readonly actors: NpcActor[];

  constructor(definitions: readonly NpcDefinition[]) {
    this.definitions = definitions;
    this.actors = definitions.map((definition) => new NpcActor(definition));
  }

  attach(add: (object: Object3D) => void): void {
    for (const actor of this.actors) actor.attach(add);
  }

  update(dt: number, player: Vec3): void {
    for (const actor of this.actors) actor.update(dt, player);
  }

  poseStates(): NpcPoseState[] {
    return this.actors.map((actor) => actor.poseState());
  }

  poseState(npcId: string): NpcPoseState | undefined {
    return this.actor(npcId)?.poseState();
  }

  playPose(npcId: string, poseId: string, playback: NpcPosePlayback = {}): boolean {
    return this.actor(npcId)?.playPose(poseId, playback) ?? false;
  }

  cyclePose(npcId: string, direction: 1 | -1 = 1): { id: string; label: string } | undefined {
    return this.actor(npcId)?.cyclePose(direction);
  }

  playAnimation(npcId: string, animationId: string, playback: NpcAnimationPlayback = {}): boolean {
    return this.actor(npcId)?.playAnimation(animationId, playback) ?? false;
  }

  cycleAnimation(npcId: string, direction: 1 | -1 = 1): { id: string; label: string } | undefined {
    return this.actor(npcId)?.cycleAnimation(direction);
  }

  stopAnimation(npcId: string, returnTo?: string): boolean {
    return this.actor(npcId)?.stopAnimation(returnTo) ?? false;
  }

  equipmentState(npcId: string): EquipmentLoadout | undefined {
    return this.actor(npcId)?.equipmentState();
  }

  equip(npcId: string, slot: EquipmentSlot, id: EquipmentId): boolean {
    return this.actor(npcId)?.equip(slot, id) ?? false;
  }

  unequip(npcId: string, slot: EquipmentSlot): boolean {
    return this.actor(npcId)?.unequip(slot) ?? false;
  }

  jointState(npcId: string): CharacterJointState[] | undefined {
    return this.actor(npcId)?.jointState();
  }

  setJointTransform(npcId: string, jointId: string, transform: CharacterJointTransform): boolean {
    return this.actor(npcId)?.setJointTransform(jointId, transform) ?? false;
  }

  resetJoints(npcId: string): boolean {
    const actor = this.actor(npcId);
    if (!actor) return false;
    actor.resetJoints();
    return true;
  }

  exportPose(npcId: string): Record<string, CharacterJointTransform> | undefined {
    return this.actor(npcId)?.exportPose();
  }

  target(origin: Vec3, direction: Vec3, obstacleDistance = Infinity): NpcDefinition | undefined {
    return findNpcTarget(this.definitions, origin, direction, undefined, obstacleDistance);
  }

  /**
   * Returns an NPC box from every voxel cell it overlaps, so the collision sweep finds it no
   * matter which side the player approaches from. Duplicate reports across cells are harmless:
   * the axis sweep clamps against each box independently, so re-testing the same box is
   * idempotent.
   */
  collisionBoxesAt(wx: number, wy: number, wz: number): AABB[] {
    const boxes: AABB[] = [];
    for (const npc of this.definitions) {
      const box = collisionBox(npc);
      if (!box) continue;
      if (
        wx < box[3] &&
        wx + 1 > box[0] &&
        wy < box[4] &&
        wy + 1 > box[1] &&
        wz < box[5] &&
        wz + 1 > box[2]
      ) {
        boxes.push(box);
      }
    }
    return boxes;
  }

  intersectsVoxel(wx: number, wy: number, wz: number): boolean {
    for (const npc of this.definitions) {
      const box = collisionBox(npc);
      if (!box) continue;
      if (
        wx < box[3] &&
        wx + 1 > box[0] &&
        wy < box[4] &&
        wy + 1 > box[1] &&
        wz < box[5] &&
        wz + 1 > box[2]
      ) {
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    for (const actor of this.actors) actor.dispose();
  }

  private actor(npcId: string): NpcActor | undefined {
    return this.actors.find((actor) => actor.definition.id === npcId);
  }
}
