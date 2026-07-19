import type { Object3D } from 'three';
import type { AABB } from '../blocks/shapeBoxes';
import type { Vec3 } from '../core/types';
import {
  isEquipmentId,
  type EquipmentId,
  type EquipmentLoadout,
  type EquipmentSlot,
} from '../character/Equipment';
import type { CharacterJointState, CharacterJointTransform } from '../character/CharacterRig';
import type { SpawnedNpcSave } from '../persistence/SaveTypes';
import { NpcActor } from './NpcActor';
import { npcCatalogEntry } from './NpcCatalog';
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

export interface NpcSystemOptions {
  spawned?: readonly SpawnedNpcSave[];
  /** Injectable for deterministic tests; collisions still receive a numeric suffix. */
  idFactory?: () => string;
  onSpawnedChange?: () => void;
}

const defaultIdFactory = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

/** Owns authored NPCs plus mutable, save-backed creative NPC instances. */
export class NpcSystem {
  private readonly activeDefinitions: NpcDefinition[] = [];
  private readonly actors: NpcActor[] = [];
  private readonly authoredIds = new Set<string>();
  private readonly spawnedTypes = new Map<string, string>();
  private readonly idFactory: () => string;
  private onSpawnedChange: (() => void) | undefined;
  private addToScene: ((object: Object3D) => void) | undefined;

  constructor(definitions: readonly NpcDefinition[], options: NpcSystemOptions = {}) {
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.onSpawnedChange = options.onSpawnedChange;
    for (const definition of definitions) {
      if (this.authoredIds.has(definition.id)) continue;
      this.authoredIds.add(definition.id);
      this.addActor(definition);
    }
    for (const state of options.spawned ?? []) this.restore(state);
  }

  get definitions(): readonly NpcDefinition[] {
    return this.activeDefinitions;
  }

  setOnSpawnedChange(callback: (() => void) | undefined): void {
    this.onSpawnedChange = callback;
  }

  attach(add: (object: Object3D) => void): void {
    this.addToScene = add;
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
    const changed = this.actor(npcId)?.playPose(poseId, playback) ?? false;
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  cyclePose(npcId: string, direction: 1 | -1 = 1): { id: string; label: string } | undefined {
    const changed = this.actor(npcId)?.cyclePose(direction);
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  playAnimation(npcId: string, animationId: string, playback: NpcAnimationPlayback = {}): boolean {
    const changed = this.actor(npcId)?.playAnimation(animationId, playback) ?? false;
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  cycleAnimation(npcId: string, direction: 1 | -1 = 1): { id: string; label: string } | undefined {
    const changed = this.actor(npcId)?.cycleAnimation(direction);
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  stopAnimation(npcId: string, returnTo?: string): boolean {
    const changed = this.actor(npcId)?.stopAnimation(returnTo) ?? false;
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  equipmentState(npcId: string): EquipmentLoadout | undefined {
    return this.actor(npcId)?.equipmentState();
  }

  equip(npcId: string, slot: EquipmentSlot, id: EquipmentId): boolean {
    const changed = this.actor(npcId)?.equip(slot, id) ?? false;
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  unequip(npcId: string, slot: EquipmentSlot): boolean {
    const changed = this.actor(npcId)?.unequip(slot) ?? false;
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  jointState(npcId: string): CharacterJointState[] | undefined {
    return this.actor(npcId)?.jointState();
  }

  setJointTransform(npcId: string, jointId: string, transform: CharacterJointTransform): boolean {
    const changed = this.actor(npcId)?.setJointTransform(jointId, transform) ?? false;
    if (changed) this.notifySpawned(npcId);
    return changed;
  }

  resetJoints(npcId: string): boolean {
    const actor = this.actor(npcId);
    if (!actor) return false;
    actor.resetJoints();
    this.notifySpawned(npcId);
    return true;
  }

  exportPose(npcId: string): Record<string, CharacterJointTransform> | undefined {
    return this.actor(npcId)?.exportPose();
  }

  target(origin: Vec3, direction: Vec3, obstacleDistance = Infinity): NpcDefinition | undefined {
    return findNpcTarget(this.definitions, origin, direction, undefined, obstacleDistance);
  }

  spawn(type: string, position: Vec3, yaw = 0): NpcDefinition {
    const entry = npcCatalogEntry(type);
    if (!entry) throw new Error(`unknown NPC type: ${type}`);
    if (![position.x, position.y, position.z, yaw].every(Number.isFinite)) {
      throw new Error('NPC position and rotation must be finite');
    }
    const base = `spawned-${entry.type}-${this.cleanIdPart(this.idFactory())}`;
    let id = base;
    let suffix = 2;
    while (this.definition(id)) id = `${base}-${suffix++}`;
    const definition: NpcDefinition = {
      ...entry.definition,
      id,
      position: { ...position },
      yaw,
    };
    this.spawnedTypes.set(id, entry.type);
    this.addActor(definition);
    this.onSpawnedChange?.();
    return definition;
  }

  remove(npcId: string): boolean {
    if (!this.spawnedTypes.has(npcId)) return false;
    const index = this.activeDefinitions.findIndex(({ id }) => id === npcId);
    if (index < 0) return false;
    const [actor] = this.actors.splice(index, 1);
    this.activeDefinitions.splice(index, 1);
    this.spawnedTypes.delete(npcId);
    actor.group.removeFromParent();
    actor.dispose();
    this.onSpawnedChange?.();
    return true;
  }

  isSpawned(npcId: string): boolean {
    return this.spawnedTypes.has(npcId);
  }

  spawnedStates(): SpawnedNpcSave[] {
    const states: SpawnedNpcSave[] = [];
    for (const [id, type] of this.spawnedTypes) {
      const actor = this.actor(id);
      if (!actor) continue;
      const pose = actor.poseState();
      states.push({
        id,
        type,
        position: { ...actor.definition.position },
        yaw: actor.definition.yaw,
        ...(pose.pose ? { pose: pose.pose } : {}),
        ...(pose.animation ? { animation: pose.animation } : {}),
        equipment: actor.equipmentState(),
      });
    }
    return states;
  }

  spawnedState(npcId: string): SpawnedNpcSave | undefined {
    return this.spawnedStates().find(({ id }) => id === npcId);
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

  intersectsBox(center: Vec3, half: Vec3, ignoreId?: string): boolean {
    const box: AABB = [
      center.x - half.x,
      center.y - half.y,
      center.z - half.z,
      center.x + half.x,
      center.y + half.y,
      center.z + half.z,
    ];
    for (const npc of this.definitions) {
      if (npc.id === ignoreId) continue;
      const other = collisionBox(npc);
      if (!other) continue;
      if (
        box[0] < other[3] &&
        box[3] > other[0] &&
        box[1] < other[4] &&
        box[4] > other[1] &&
        box[2] < other[5] &&
        box[5] > other[2]
      ) {
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    for (const actor of this.actors) {
      actor.group.removeFromParent();
      actor.dispose();
    }
    this.actors.length = 0;
    this.activeDefinitions.length = 0;
    this.spawnedTypes.clear();
  }

  private actor(npcId: string): NpcActor | undefined {
    return this.actors.find((actor) => actor.definition.id === npcId);
  }

  private definition(npcId: string): NpcDefinition | undefined {
    return this.activeDefinitions.find(({ id }) => id === npcId);
  }

  private addActor(definition: NpcDefinition): NpcActor {
    const actor = new NpcActor(definition);
    this.activeDefinitions.push(definition);
    this.actors.push(actor);
    if (this.addToScene) actor.attach(this.addToScene);
    return actor;
  }

  private restore(state: SpawnedNpcSave): void {
    if (
      !state ||
      typeof state.id !== 'string' ||
      !state.id ||
      typeof state.type !== 'string' ||
      this.definition(state.id) ||
      !state.position ||
      ![state.position.x, state.position.y, state.position.z, state.yaw].every(Number.isFinite)
    ) {
      return;
    }
    const entry = npcCatalogEntry(state.type);
    if (!entry) return;
    const definition: NpcDefinition = {
      ...entry.definition,
      id: state.id,
      position: { ...state.position },
      yaw: state.yaw,
    };
    this.spawnedTypes.set(state.id, entry.type);
    const actor = this.addActor(definition);
    if (state.pose) actor.playPose(state.pose, { transitionSeconds: 0 });
    if (state.animation) actor.playAnimation(state.animation);
    if (state.equipment) {
      const equipment: EquipmentLoadout = {};
      if (state.equipment.main && isEquipmentId(state.equipment.main)) {
        equipment.main = state.equipment.main;
      }
      if (state.equipment.off && isEquipmentId(state.equipment.off)) {
        equipment.off = state.equipment.off;
      }
      actor.setEquipment(equipment);
    }
  }

  private notifySpawned(npcId: string): void {
    if (this.spawnedTypes.has(npcId)) this.onSpawnedChange?.();
  }

  private cleanIdPart(value: string): string {
    const clean = value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return clean || Date.now().toString(36);
  }
}
