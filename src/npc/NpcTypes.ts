import type { AvatarStyle } from '../character/AvatarTextures';
import type {
  CharacterEasing,
  CharacterJointDefinition,
  CharacterJointTransform,
  CharacterTransform,
} from '../character/CharacterRig';
import type { EquipmentLoadout } from '../character/Equipment';
import type { Vec3 } from '../core/types';

export type NpcPartAnchor = 'root' | 'head';
export type NpcTransform = CharacterTransform;
export type NpcJointDefinition = CharacterJointDefinition;
export type NpcPoseJointTransform = CharacterJointTransform;

/** Named joint targets that an actor can blend toward. */
export interface NpcPoseDefinition {
  id: string;
  label: string;
  /** Internal keyframe poses can opt out of P-key cycling. */
  manual?: boolean;
  joints: Readonly<Record<string, NpcPoseJointTransform>>;
}

export interface NpcAnimationFrameDefinition {
  pose: string;
  transitionSeconds: number;
  holdSeconds: number;
  easing?: CharacterEasing;
}

/** A reusable sequence of named poses. Looping is the default. */
export interface NpcAnimationDefinition {
  id: string;
  label: string;
  frames: readonly NpcAnimationFrameDefinition[];
  loop?: boolean;
}

export interface NpcPosePlayback {
  transitionSeconds?: number;
  holdSeconds?: number;
  returnTo?: string;
  easing?: CharacterEasing;
}

export interface NpcAnimationPlayback {
  returnTo?: string;
}

export interface NpcPoseState {
  npcId: string;
  name: string;
  pose?: string;
  animation?: string;
  poses: ReadonlyArray<{ id: string; label: string }>;
  animations: ReadonlyArray<{ id: string; label: string }>;
}

/** One box in a data-driven NPC model. Positions are local to the selected anchor. */
export interface NpcPartDefinition {
  id: string;
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  slot: string;
  anchor?: NpcPartAnchor;
  /** Optional skeletal joint; when present, `pos` and `rotation` are joint-local. */
  joint?: string;
  rotation?: NpcTransform;
  style?: AvatarStyle;
}

export type CrownCircuitState = 'inactive' | 'active' | 'complete';

export interface NpcDialogueContext {
  challengeRunning: boolean;
  challengeBestSeconds?: number;
  crownCircuitState: CrownCircuitState;
  crownFound: number;
  crownTotal: number;
}

export type NpcDialogueEffect = 'close' | 'start-tour' | 'start-three-flag' | 'start-crown-circuit';

export interface NpcDialogueAction {
  id: string;
  label: string;
  next?: string;
  effect?: NpcDialogueEffect;
  visible?: (context: NpcDialogueContext) => boolean;
}

export interface NpcDialogueNode {
  id: string;
  message: string | ((context: NpcDialogueContext) => string);
  actions: readonly NpcDialogueAction[];
}

export interface NpcDialogueTree {
  start: string;
  nodes: readonly NpcDialogueNode[];
}

export interface NpcDefinition {
  id: string;
  name: string;
  role: string;
  position: Vec3;
  /** Model yaw; zero faces world -Z, matching the player avatar. */
  yaw: number;
  palette: Readonly<Record<string, number>>;
  parts: readonly NpcPartDefinition[];
  joints?: readonly NpcJointDefinition[];
  poses?: readonly NpcPoseDefinition[];
  animations?: readonly NpcAnimationDefinition[];
  defaultPose?: string;
  /** Optional items mounted to the NPC's right/left wrist joints. */
  equipment?: EquipmentLoadout;
  /** Optional joint parent and local position for the head-tracking pivot. */
  headJoint?: string;
  headPos?: NpcTransform;
  dialogue: NpcDialogueTree;
  /** Interaction target half-extents around `position`. */
  targetHalf?: Vec3;
  /** Physical half-extents around `position`; omit for an intangible NPC. */
  collisionHalf?: Vec3;
}

export interface ResolvedDialogueAction {
  id: string;
  label: string;
  next?: string;
  effect?: NpcDialogueEffect;
}

export interface ResolvedDialogueNode {
  id: string;
  message: string;
  actions: ResolvedDialogueAction[];
}
