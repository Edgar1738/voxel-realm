import {
  BoxGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  type Material,
  type Object3D,
} from 'three';
import { AVATAR_TILE, paintAvatarTile, styleForSlot } from '../character/AvatarTextures';
import {
  CharacterRig,
  characterEase,
  type CharacterEasing,
  type CharacterJointState,
  type CharacterJointTransform,
  type CharacterPoseSnapshot,
} from '../character/CharacterRig';
import {
  EquipmentRig,
  type EquipmentId,
  type EquipmentLoadout,
  type EquipmentSlot,
} from '../character/Equipment';
import type { Vec3 } from '../core/types';
import type {
  NpcAnimationDefinition,
  NpcAnimationPlayback,
  NpcDefinition,
  NpcPoseDefinition,
  NpcPosePlayback,
  NpcPoseState,
} from './NpcTypes';

const TRACK_DISTANCE = 8;
const VISIBLE_DISTANCE = 96;
const HEAD_TURN_LIMIT = 0.62;

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

interface PoseBlend {
  elapsed: number;
  duration: number;
  easing: CharacterEasing;
  from: CharacterPoseSnapshot;
  to: CharacterPoseSnapshot;
}

interface AnimationState {
  definition: NpcAnimationDefinition;
  frame: number;
  returnTo: string | undefined;
}

/** A stationary, data-driven block character with a breathing idle and gentle head tracking. */
export class NpcActor {
  readonly group = new Group();
  private readonly headPivot = new Group();
  private readonly rig: CharacterRig;
  private readonly equipment: EquipmentRig;
  private readonly disposables: (BoxGeometry | Material)[] = [];
  private readonly styleTextures = new Map<string, DataTexture>();
  private time = 0;
  private headYaw = 0;
  private readonly idlePhase: number;
  private poseBlend: PoseBlend | undefined;
  private activePoseId: string | undefined;
  private holdRemaining: number | undefined;
  private returnPoseId: string | undefined;
  private animationState: AnimationState | undefined;

  constructor(readonly definition: NpcDefinition) {
    this.group.name = `npc:${definition.id}`;
    this.group.rotation.y = definition.yaw;
    this.headPivot.position.set(...(definition.headPos ?? [0, 0.68, 0]));
    this.idlePhase = [...definition.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.07;

    this.rig = new CharacterRig(this.group, definition.joints ?? []);

    const headParent = definition.headJoint ? this.rig.joint(definition.headJoint) : this.group;
    if (!headParent) {
      throw new Error(
        `NPC ${definition.id}: head references missing joint ${definition.headJoint}`,
      );
    }
    headParent.add(this.headPivot);

    for (const part of definition.parts) {
      const geometry = new BoxGeometry(...part.size);
      const color = definition.palette[part.slot] ?? 0xffffff;
      const style = part.style ?? styleForSlot(part.slot);
      const material = new MeshLambertMaterial();
      if (style === 'plain') {
        material.color.setHex(color);
      } else {
        material.map = this.styleTexture(color, style);
        material.color.setHex(0xffffff);
      }
      const mesh = new Mesh(geometry, material);
      mesh.name = part.id;
      mesh.position.set(...part.pos);
      if (part.rotation) mesh.rotation.set(...part.rotation);
      const parent = part.joint
        ? this.rig.joint(part.joint)
        : part.anchor === 'head'
          ? this.headPivot
          : this.group;
      if (!parent) {
        throw new Error(
          `NPC ${definition.id}: part ${part.id} references missing joint ${part.joint}`,
        );
      }
      parent.add(mesh);
      this.disposables.push(geometry, material);
    }

    const rightWrist = this.rig.joint('right-wrist');
    const leftWrist = this.rig.joint('left-wrist');
    this.equipment = new EquipmentRig(
      {
        ...(rightWrist ? { main: rightWrist } : {}),
        ...(leftWrist ? { off: leftWrist } : {}),
      },
      {
        material: 'lit',
        transforms: {
          main: {
            pos: [0.04, -0.03, -0.04],
            rotation: [0.08, 0, Math.PI - 0.12],
            scale: 0.75,
          },
          off: {
            pos: [-0.04, -0.03, -0.04],
            rotation: [0.08, 0, Math.PI + 0.12],
            scale: 0.75,
          },
        },
      },
    );
    this.equipment.setLoadout(definition.equipment ?? {});

    this.group.position.set(definition.position.x, definition.position.y, definition.position.z);
    if (definition.defaultPose) {
      this.playPose(definition.defaultPose, { transitionSeconds: 0 });
    }
  }

  attach(add: (object: Object3D) => void): void {
    add(this.group);
  }

  update(dt: number, player: Vec3): void {
    this.time += dt;
    this.updatePose(dt);
    const dx = player.x - this.definition.position.x;
    const dy = player.y - this.definition.position.y;
    const dz = player.z - this.definition.position.z;
    const distance = Math.hypot(dx, dy, dz);
    this.group.visible = distance <= VISIBLE_DISTANCE;
    if (!this.group.visible) return;

    this.group.position.y =
      this.definition.position.y + Math.sin(this.time * 1.8 + this.idlePhase) * 0.012;
    let targetYaw = 0;
    if (Math.hypot(dx, dz) <= TRACK_DISTANCE && Math.abs(dy) < 3) {
      const worldYaw = Math.atan2(-dx, -dz);
      targetYaw = Math.max(
        -HEAD_TURN_LIMIT,
        Math.min(HEAD_TURN_LIMIT, wrapAngle(worldYaw - this.definition.yaw)),
      );
    }
    this.headYaw += (targetYaw - this.headYaw) * Math.min(1, dt * 6);
    this.headPivot.rotation.y = this.headYaw;
  }

  poseState(): NpcPoseState {
    return {
      npcId: this.definition.id,
      name: this.definition.name,
      ...(this.activePoseId ? { pose: this.activePoseId } : {}),
      ...(this.animationState ? { animation: this.animationState.definition.id } : {}),
      poses: (this.definition.poses ?? [])
        .filter((pose) => pose.manual !== false)
        .map(({ id, label }) => ({ id, label })),
      animations: (this.definition.animations ?? []).map(({ id, label }) => ({ id, label })),
    };
  }

  equipmentState(): EquipmentLoadout {
    return this.equipment.state();
  }

  equip(slot: EquipmentSlot, id: EquipmentId): boolean {
    return this.equipment.equip(slot, id);
  }

  unequip(slot: EquipmentSlot): boolean {
    return this.equipment.unequip(slot);
  }

  jointState(): CharacterJointState[] {
    return this.rig.state();
  }

  setJointTransform(id: string, transform: CharacterJointTransform): boolean {
    if (!this.rig.joint(id)) return false;
    this.animationState = undefined;
    this.poseBlend = undefined;
    this.holdRemaining = undefined;
    this.returnPoseId = undefined;
    this.activePoseId = undefined;
    return this.rig.set(id, transform);
  }

  resetJoints(): void {
    this.animationState = undefined;
    this.poseBlend = undefined;
    this.holdRemaining = undefined;
    this.returnPoseId = undefined;
    this.activePoseId = undefined;
    this.rig.reset();
  }

  exportPose(): Record<string, CharacterJointTransform> {
    return this.rig.exportPose();
  }

  playPose(poseId: string, playback: NpcPosePlayback = {}): boolean {
    if (!this.definition.poses?.some((pose) => pose.id === poseId)) return false;
    this.animationState = undefined;
    return this.beginPose(poseId, playback);
  }

  playAnimation(animationId: string, playback: NpcAnimationPlayback = {}): boolean {
    const definition = this.definition.animations?.find(
      (candidate) => candidate.id === animationId,
    );
    if (!definition || definition.frames.length === 0) return false;
    if (
      definition.frames.some(
        (frame) => !this.definition.poses?.some((pose) => pose.id === frame.pose),
      )
    ) {
      return false;
    }
    this.animationState = {
      definition,
      frame: 0,
      returnTo: playback.returnTo ?? this.definition.defaultPose,
    };
    this.beginAnimationFrame();
    return true;
  }

  stopAnimation(returnTo = this.definition.defaultPose): boolean {
    if (!this.animationState) return false;
    this.animationState = undefined;
    this.holdRemaining = undefined;
    this.returnPoseId = undefined;
    if (returnTo) this.beginPose(returnTo);
    return true;
  }

  private beginPose(poseId: string, playback: NpcPosePlayback = {}): boolean {
    const pose = this.definition.poses?.find((candidate) => candidate.id === poseId);
    if (!pose) return false;
    const to = this.poseTarget(pose);
    const duration = Math.max(0, playback.transitionSeconds ?? 0.28);
    if (duration === 0) {
      this.applyJointSnapshots(to, 1);
      this.poseBlend = undefined;
    } else {
      this.poseBlend = {
        elapsed: 0,
        duration,
        easing: playback.easing ?? 'smoothstep',
        from: this.rig.capture(),
        to,
      };
    }
    this.activePoseId = pose.id;
    this.holdRemaining = playback.holdSeconds;
    this.returnPoseId = playback.returnTo;
    return true;
  }

  cyclePose(direction: 1 | -1 = 1): { id: string; label: string } | undefined {
    const poses = (this.definition.poses ?? []).filter((pose) => pose.manual !== false);
    if (poses.length === 0) return undefined;
    const current = poses.findIndex((pose) => pose.id === this.activePoseId);
    const base = current >= 0 ? current : direction > 0 ? -1 : 0;
    const index = (base + direction + poses.length) % poses.length;
    const next = poses[index];
    this.playPose(next.id);
    return { id: next.id, label: next.label };
  }

  cycleAnimation(direction: 1 | -1 = 1): { id: string; label: string } | undefined {
    const animations = this.definition.animations ?? [];
    if (animations.length === 0) return undefined;
    const current = animations.findIndex(
      (animation) => animation.id === this.animationState?.definition.id,
    );
    const base = current >= 0 ? current : direction > 0 ? -1 : 0;
    const index = (base + direction + animations.length) % animations.length;
    const next = animations[index];
    this.playAnimation(next.id);
    return { id: next.id, label: next.label };
  }

  private poseTarget(pose: NpcPoseDefinition): CharacterPoseSnapshot {
    return this.rig.target(pose.joints);
  }

  private applyJointSnapshots(target: CharacterPoseSnapshot, amount: number): void {
    this.rig.apply(target, amount, this.poseBlend?.from);
  }

  private updatePose(dt: number): void {
    if (this.poseBlend) {
      this.poseBlend.elapsed += dt;
      const amount = characterEase(
        this.poseBlend.easing,
        Math.min(1, this.poseBlend.elapsed / this.poseBlend.duration),
      );
      this.applyJointSnapshots(this.poseBlend.to, amount);
      if (amount >= 1) this.poseBlend = undefined;
      return;
    }
    if (this.holdRemaining === undefined) return;
    this.holdRemaining -= dt;
    if (this.holdRemaining > 0) return;
    if (this.animationState) {
      const nextFrame = this.animationState.frame + 1;
      if (nextFrame < this.animationState.definition.frames.length) {
        this.animationState.frame = nextFrame;
        this.beginAnimationFrame();
        return;
      }
      if (this.animationState.definition.loop !== false) {
        this.animationState.frame = 0;
        this.beginAnimationFrame();
        return;
      }
      const returnTo = this.animationState.returnTo;
      this.animationState = undefined;
      this.holdRemaining = undefined;
      if (returnTo) this.beginPose(returnTo);
      return;
    }
    const returnTo = this.returnPoseId;
    this.holdRemaining = undefined;
    this.returnPoseId = undefined;
    if (returnTo) this.playPose(returnTo);
  }

  private beginAnimationFrame(): void {
    const animation = this.animationState;
    if (!animation) return;
    const frame = animation.definition.frames[animation.frame];
    this.beginPose(frame.pose, {
      transitionSeconds: frame.transitionSeconds,
      holdSeconds: frame.holdSeconds,
      ...(frame.easing ? { easing: frame.easing } : {}),
    });
  }

  private styleTexture(
    color: number,
    style: Exclude<ReturnType<typeof styleForSlot>, 'plain'>,
  ): DataTexture {
    const key = `${style}:${color}`;
    let texture = this.styleTextures.get(key);
    if (!texture) {
      const data = new Uint8Array(AVATAR_TILE * AVATAR_TILE * 4);
      paintAvatarTile(data, color, style);
      texture = new DataTexture(data, AVATAR_TILE, AVATAR_TILE, RGBAFormat);
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      this.styleTextures.set(key, texture);
    }
    return texture;
  }

  dispose(): void {
    this.equipment.dispose();
    for (const disposable of this.disposables) disposable.dispose();
    for (const texture of this.styleTextures.values()) texture.dispose();
    this.styleTextures.clear();
  }
}
