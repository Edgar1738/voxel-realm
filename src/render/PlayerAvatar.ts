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
import {
  AVATAR_TILE,
  paintAvatarTile,
  styleForSlot,
  type AvatarStyle,
} from '../character/AvatarTextures';
import type { Vec3 } from '../core/types';
import {
  resolvePlayerSkin,
  type PlayerAccessoryId,
  type PlayerSkin,
  type PlayerSkinSlot,
} from '../character/PlayerSkins';
import {
  EquipmentRig,
  type EquipmentId,
  type EquipmentLoadout,
  type EquipmentSlot,
} from '../character/Equipment';
import {
  CharacterAnimator,
  CharacterRig,
  type CharacterAnimationClip,
  type CharacterJointDefinition,
  type CharacterJointState,
  type CharacterJointTransform,
} from '../character/CharacterRig';

/** A blocky box part in local avatar space (origin = body center, +Y up, faces -Z at yaw 0). */
interface Part {
  id: string;
  size: [number, number, number];
  pos: [number, number, number];
  slot: PlayerSkinSlot;
  joint: string;
  accessory?: PlayerAccessoryId;
  rotation?: [number, number, number];
}

// Character V2: a stepped voxel sculpture assembled from smaller, articulated masses. The part
// grid stays crisp and deliberately block-built, but the jaw, waist, forearms, calves, hands and
// layered clothing break the old six-box silhouette.
const PARTS: readonly Part[] = [
  { id: 'head', size: [0.42, 0.38, 0.4], pos: [0, 0.01, 0], slot: 'skin', joint: 'head' },
  { id: 'jaw', size: [0.34, 0.12, 0.36], pos: [0, -0.2, -0.01], slot: 'skin', joint: 'head' },
  {
    id: 'right-ear',
    size: [0.07, 0.12, 0.08],
    pos: [0.235, -0.04, 0],
    slot: 'skin',
    joint: 'head',
  },
  {
    id: 'left-ear',
    size: [0.07, 0.12, 0.08],
    pos: [-0.235, -0.04, 0],
    slot: 'skin',
    joint: 'head',
  },
  {
    id: 'right-eye',
    size: [0.1, 0.08, 0.025],
    pos: [0.1, 0.03, -0.205],
    slot: 'eye',
    joint: 'head',
  },
  {
    id: 'left-eye',
    size: [0.1, 0.08, 0.025],
    pos: [-0.1, 0.03, -0.205],
    slot: 'eye',
    joint: 'head',
  },
  {
    id: 'right-pupil',
    size: [0.045, 0.05, 0.025],
    pos: [0.09, 0.025, -0.222],
    slot: 'pupil',
    joint: 'head',
  },
  {
    id: 'left-pupil',
    size: [0.045, 0.05, 0.025],
    pos: [-0.09, 0.025, -0.222],
    slot: 'pupil',
    joint: 'head',
  },
  { id: 'nose', size: [0.065, 0.09, 0.07], pos: [0, -0.055, -0.235], slot: 'skin', joint: 'head' },
  {
    id: 'mouth',
    size: [0.13, 0.035, 0.025],
    pos: [0, -0.145, -0.205],
    slot: 'pupil',
    joint: 'head',
  },
  {
    id: 'brow',
    size: [0.3, 0.045, 0.025],
    pos: [0, 0.105, -0.21],
    slot: 'hair',
    joint: 'head',
    accessory: 'brow',
  },
  {
    id: 'hair',
    size: [0.48, 0.13, 0.46],
    pos: [0, 0.22, 0.015],
    slot: 'hair',
    joint: 'head',
    accessory: 'hair',
  },
  {
    id: 'hair-back',
    size: [0.4, 0.25, 0.11],
    pos: [0, 0.04, 0.205],
    slot: 'hair',
    joint: 'head',
    accessory: 'hair',
  },
  {
    id: 'hood',
    size: [0.54, 0.48, 0.41],
    pos: [0, 0.01, 0.055],
    slot: 'hood',
    joint: 'head',
    accessory: 'hood',
  },
  {
    id: 'helmet',
    size: [0.54, 0.2, 0.52],
    pos: [0, 0.18, 0],
    slot: 'metal',
    joint: 'head',
    accessory: 'helmet',
  },
  { id: 'torso', size: [0.54, 0.3, 0.3], pos: [0, -0.12, 0], slot: 'tunic', joint: 'chest' },
  {
    id: 'torso-waist',
    size: [0.44, 0.22, 0.27],
    pos: [0, 0.01, 0],
    slot: 'tunic',
    joint: 'spine-lower',
  },
  {
    id: 'chest-trim',
    size: [0.56, 0.1, 0.32],
    pos: [0, 0.025, -0.01],
    slot: 'trim',
    joint: 'chest',
  },
  { id: 'hip-cloth', size: [0.45, 0.18, 0.29], pos: [0, -0.04, 0], slot: 'pants', joint: 'pelvis' },
  { id: 'belt', size: [0.5, 0.09, 0.32], pos: [0, 0.075, 0], slot: 'belt', joint: 'pelvis' },
  {
    id: 'right-arm',
    size: [0.18, 0.3, 0.23],
    pos: [0, -0.15, 0],
    slot: 'sleeves',
    joint: 'right-shoulder',
  },
  {
    id: 'right-forearm',
    size: [0.16, 0.27, 0.21],
    pos: [0, -0.135, 0],
    slot: 'sleeves',
    joint: 'right-elbow',
  },
  {
    id: 'right-glove',
    size: [0.18, 0.14, 0.22],
    pos: [0, -0.07, -0.01],
    slot: 'gloves',
    joint: 'right-wrist',
  },
  {
    id: 'left-arm',
    size: [0.18, 0.3, 0.23],
    pos: [0, -0.15, 0],
    slot: 'sleeves',
    joint: 'left-shoulder',
  },
  {
    id: 'left-forearm',
    size: [0.16, 0.27, 0.21],
    pos: [0, -0.135, 0],
    slot: 'sleeves',
    joint: 'left-elbow',
  },
  {
    id: 'left-glove',
    size: [0.18, 0.14, 0.22],
    pos: [0, -0.07, -0.01],
    slot: 'gloves',
    joint: 'left-wrist',
  },
  {
    id: 'right-leg',
    size: [0.22, 0.32, 0.24],
    pos: [0, -0.16, 0],
    slot: 'pants',
    joint: 'right-hip',
  },
  {
    id: 'right-knee',
    size: [0.21, 0.1, 0.245],
    pos: [0, -0.03, -0.005],
    slot: 'pants',
    joint: 'right-knee',
  },
  {
    id: 'right-calf',
    size: [0.19, 0.28, 0.22],
    pos: [0, -0.18, 0.015],
    slot: 'pants',
    joint: 'right-knee',
  },
  {
    id: 'right-boot',
    size: [0.23, 0.17, 0.3],
    pos: [0, -0.06, -0.035],
    slot: 'boots',
    joint: 'right-ankle',
  },
  {
    id: 'left-leg',
    size: [0.22, 0.32, 0.24],
    pos: [0, -0.16, 0],
    slot: 'pants',
    joint: 'left-hip',
  },
  {
    id: 'left-knee',
    size: [0.21, 0.1, 0.245],
    pos: [0, -0.03, -0.005],
    slot: 'pants',
    joint: 'left-knee',
  },
  {
    id: 'left-calf',
    size: [0.19, 0.28, 0.22],
    pos: [0, -0.18, 0.015],
    slot: 'pants',
    joint: 'left-knee',
  },
  {
    id: 'left-boot',
    size: [0.23, 0.17, 0.3],
    pos: [0, -0.06, -0.035],
    slot: 'boots',
    joint: 'left-ankle',
  },
  {
    id: 'satchel',
    size: [0.18, 0.22, 0.12],
    pos: [-0.34, 0.08, 0.15],
    slot: 'leather',
    joint: 'pelvis',
    accessory: 'satchel',
  },
  {
    id: 'tool-pouch',
    size: [0.16, 0.16, 0.12],
    pos: [0.33, 0.0, 0.15],
    slot: 'leather',
    joint: 'pelvis',
    accessory: 'tool-belt',
  },
  {
    id: 'backpack',
    size: [0.42, 0.5, 0.12],
    pos: [0, -0.14, 0.23],
    slot: 'leather',
    joint: 'chest',
    accessory: 'backpack',
  },
  {
    id: 'cloak',
    size: [0.58, 0.72, 0.08],
    pos: [0, -0.27, 0.22],
    slot: 'cloak',
    joint: 'chest',
    accessory: 'cloak',
  },
  {
    id: 'mantle',
    size: [0.62, 0.16, 0.38],
    pos: [0, 0.02, 0],
    slot: 'trim',
    joint: 'chest',
    accessory: 'mantle',
  },
  // Plated shoulders, one box over each arm's shoulder joint (root-mounted; they don't swing).
  {
    id: 'right-pauldron',
    size: [0.24, 0.14, 0.3],
    pos: [0.3, 0.04, 0],
    slot: 'metal',
    joint: 'chest',
    accessory: 'pauldrons',
  },
  {
    id: 'left-pauldron',
    size: [0.24, 0.14, 0.3],
    pos: [-0.3, 0.04, 0],
    slot: 'metal',
    joint: 'chest',
    accessory: 'pauldrons',
  },
  // Pointed hat as three stacked, shrinking boxes: brim, crown, tip.
  {
    id: 'hat-brim',
    size: [0.62, 0.06, 0.62],
    pos: [0, 0.25, 0],
    slot: 'hood',
    joint: 'head',
    accessory: 'wizard-hat',
  },
  {
    id: 'hat-crown',
    size: [0.36, 0.2, 0.36],
    pos: [0, 0.37, 0],
    slot: 'hood',
    joint: 'head',
    accessory: 'wizard-hat',
  },
  {
    id: 'hat-tip',
    size: [0.22, 0.2, 0.22],
    pos: [0, 0.57, 0],
    slot: 'hood',
    joint: 'head',
    accessory: 'wizard-hat',
  },
  // Arrow quiver over the left shoulder blade, outside any cloak.
  {
    id: 'quiver',
    size: [0.16, 0.52, 0.16],
    pos: [-0.2, -0.03, 0.3],
    slot: 'leather',
    joint: 'chest',
    accessory: 'quiver',
  },
  {
    id: 'scout-scarf',
    size: [0.38, 0.09, 0.36],
    pos: [0, -0.03, 0],
    slot: 'trim',
    joint: 'neck',
    accessory: 'scout-kit',
  },
  {
    id: 'scout-strap',
    size: [0.09, 0.48, 0.035],
    pos: [0.07, -0.13, -0.17],
    slot: 'leather',
    joint: 'chest',
    accessory: 'scout-kit',
    rotation: [0, 0, -0.48],
  },
  {
    id: 'scout-right-kneepad',
    size: [0.23, 0.12, 0.07],
    pos: [0, -0.03, -0.145],
    slot: 'leather',
    joint: 'right-knee',
    accessory: 'scout-kit',
  },
  {
    id: 'scout-left-kneepad',
    size: [0.23, 0.12, 0.07],
    pos: [0, -0.03, -0.145],
    slot: 'leather',
    joint: 'left-knee',
    accessory: 'scout-kit',
  },
];

export const PLAYER_AVATAR_PART_IDS: readonly string[] = PARTS.map((part) => part.id);

const PLAYER_JOINTS: readonly CharacterJointDefinition[] = [
  { id: 'root', objectName: 'animation:root' },
  { id: 'pelvis', parent: 'root', pos: [0, -0.2, 0], objectName: 'animation:hips' },
  { id: 'spine-lower', parent: 'pelvis', pos: [0, 0.12, 0], objectName: 'animation:upper-body' },
  { id: 'chest', parent: 'spine-lower', pos: [0, 0.28, 0] },
  { id: 'neck', parent: 'chest', pos: [0, 0.3, 0] },
  { id: 'head', parent: 'neck', pos: [0, 0.17, 0] },
  { id: 'right-shoulder', parent: 'chest', pos: [0.35, 0.16, 0] },
  { id: 'right-elbow', parent: 'right-shoulder', pos: [0, -0.3, 0] },
  { id: 'right-wrist', parent: 'right-elbow', pos: [0, -0.27, 0] },
  { id: 'left-shoulder', parent: 'chest', pos: [-0.35, 0.16, 0] },
  { id: 'left-elbow', parent: 'left-shoulder', pos: [0, -0.3, 0] },
  { id: 'left-wrist', parent: 'left-elbow', pos: [0, -0.27, 0] },
  { id: 'right-hip', parent: 'pelvis', pos: [0.13, -0.04, 0] },
  { id: 'right-knee', parent: 'right-hip', pos: [0, -0.32, 0] },
  { id: 'right-ankle', parent: 'right-knee', pos: [0, -0.3, 0] },
  { id: 'left-hip', parent: 'pelvis', pos: [-0.13, -0.04, 0] },
  { id: 'left-knee', parent: 'left-hip', pos: [0, -0.32, 0] },
  { id: 'left-ankle', parent: 'left-knee', pos: [0, -0.3, 0] },
];

/** Motion this frame, driving the walk cycle. `dh` = horizontal distance moved, `dt` = seconds. */
export interface AvatarMotion {
  dh: number;
  dt: number;
}

export type PlayerAnimationId = 'hip-thrust-loop' | 'jump-cheer-loop';

export interface PlayerAnimationState {
  animation?: PlayerAnimationId;
  animations: ReadonlyArray<{ id: PlayerAnimationId; label: string }>;
}

export const PLAYER_ANIMATIONS: ReadonlyArray<{ id: PlayerAnimationId; label: string }> = [
  { id: 'hip-thrust-loop', label: 'Hip thrust' },
  { id: 'jump-cheer-loop', label: 'Jump cheer' },
];

const PLAYER_ANIMATION_IDS = new Set<string>(PLAYER_ANIMATIONS.map(({ id }) => id));

export function isPlayerAnimationId(id: string): id is PlayerAnimationId {
  return PLAYER_ANIMATION_IDS.has(id);
}

/** Radians of stride phase advanced per block of ground covered (a full swing every ~1.1 blocks). */
const STRIDE_PER_BLOCK = 2.8;
/** Peak limb swing (radians ≈ 29°). */
const MAX_SWING = 0.5;
/** Above this horizontal speed (blocks/s) the walk cycle engages. */
const MOVING_SPEED = 0.6;
/** How fast the swing amplitude eases in/out (per second). */
const SWING_EASE = 10;

const PLAYER_CLIPS: readonly CharacterAnimationClip[] = [
  {
    id: 'hip-thrust-loop',
    label: 'Hip thrust',
    duration: 1,
    mask: ['pelvis', 'spine-lower', 'chest'],
    tracks: [
      {
        joint: 'pelvis',
        mode: 'additive',
        keyframes: [
          { time: 0, pos: [0, 0, 0], rotation: [0, 0, 0], easing: 'smoothstep' },
          { time: 0.24, pos: [0, 0, -0.18], rotation: [0.22, 0, 0], easing: 'smoothstep' },
          { time: 0.5, pos: [0, 0, 0], rotation: [0, 0, 0], easing: 'smoothstep' },
          { time: 0.74, pos: [0, 0, 0.16], rotation: [-0.18, 0, 0], easing: 'smoothstep' },
          { time: 1, pos: [0, 0, 0], rotation: [0, 0, 0] },
        ],
      },
      {
        joint: 'spine-lower',
        mode: 'additive',
        keyframes: [
          { time: 0, rotation: [0, 0, 0], easing: 'smoothstep' },
          { time: 0.24, rotation: [-0.09, 0, 0], easing: 'smoothstep' },
          { time: 0.5, rotation: [0, 0, 0], easing: 'smoothstep' },
          { time: 0.74, rotation: [0.075, 0, 0], easing: 'smoothstep' },
          { time: 1, rotation: [0, 0, 0] },
        ],
      },
      {
        joint: 'chest',
        mode: 'additive',
        keyframes: [
          { time: 0, rotation: [0, 0, 0], easing: 'ease-in-out' },
          { time: 0.24, rotation: [-0.035, 0.02, 0], easing: 'ease-in-out' },
          { time: 0.5, rotation: [0, 0, 0], easing: 'ease-in-out' },
          { time: 0.74, rotation: [0.03, -0.02, 0], easing: 'ease-in-out' },
          { time: 1, rotation: [0, 0, 0] },
        ],
      },
    ],
  },
  {
    id: 'jump-cheer-loop',
    label: 'Jump cheer',
    duration: 1.2,
    mask: [
      'root',
      'pelvis',
      'spine-lower',
      'right-shoulder',
      'right-elbow',
      'left-shoulder',
      'left-elbow',
      'right-hip',
      'right-knee',
      'left-hip',
      'left-knee',
    ],
    tracks: [
      {
        joint: 'root',
        mode: 'additive',
        keyframes: [
          { time: 0, pos: [0, 0, 0], easing: 'ease-in' },
          { time: 0.18, pos: [0, -0.08, 0], easing: 'ease-out' },
          { time: 0.52, pos: [0, 0.44, 0], easing: 'ease-in' },
          { time: 0.94, pos: [0, -0.04, 0], easing: 'ease-out' },
          { time: 1.2, pos: [0, 0, 0] },
        ],
      },
      {
        joint: 'pelvis',
        mode: 'additive',
        keyframes: [
          { time: 0, rotation: [0, 0, 0], easing: 'smoothstep' },
          { time: 0.18, rotation: [0.13, 0, 0], easing: 'smoothstep' },
          { time: 0.52, rotation: [-0.08, 0, 0], easing: 'smoothstep' },
          { time: 0.94, rotation: [0.08, 0, 0], easing: 'smoothstep' },
          { time: 1.2, rotation: [0, 0, 0] },
        ],
      },
      {
        joint: 'spine-lower',
        mode: 'additive',
        keyframes: [
          { time: 0, rotation: [0, 0, 0], easing: 'smoothstep' },
          { time: 0.18, rotation: [-0.1, 0, 0], easing: 'smoothstep' },
          { time: 0.52, rotation: [0.14, 0, 0], easing: 'smoothstep' },
          { time: 0.94, rotation: [-0.08, 0, 0], easing: 'smoothstep' },
          { time: 1.2, rotation: [0, 0, 0] },
        ],
      },
      ...(['right', 'left'] as const).flatMap((side) => {
        const sign = side === 'right' ? 1 : -1;
        return [
          {
            joint: `${side}-shoulder`,
            mode: 'additive' as const,
            keyframes: [
              { time: 0, rotation: [0, 0, 0] as const, easing: 'smoothstep' as const },
              { time: 0.18, rotation: [0.3, 0, sign * 0.35] as const, easing: 'ease-out' as const },
              {
                time: 0.52,
                rotation: [-0.12, 0, sign * 2.58] as const,
                easing: 'smoothstep' as const,
              },
              {
                time: 0.94,
                rotation: [0.2, 0, sign * 0.45] as const,
                easing: 'smoothstep' as const,
              },
              { time: 1.2, rotation: [0, 0, 0] as const },
            ],
          },
          {
            joint: `${side}-elbow`,
            mode: 'additive' as const,
            keyframes: [
              { time: 0, rotation: [0, 0, 0] as const, easing: 'smoothstep' as const },
              { time: 0.52, rotation: [0, 0, -sign * 0.3] as const, easing: 'smoothstep' as const },
              { time: 1.2, rotation: [0, 0, 0] as const },
            ],
          },
          {
            joint: `${side}-hip`,
            mode: 'additive' as const,
            keyframes: [
              { time: 0, rotation: [0, 0, 0] as const, easing: 'smoothstep' as const },
              {
                time: 0.18,
                rotation: [-0.35, 0, sign * 0.05] as const,
                easing: 'smoothstep' as const,
              },
              {
                time: 0.52,
                rotation: [0.12, 0, sign * 0.08] as const,
                easing: 'smoothstep' as const,
              },
              { time: 0.94, rotation: [-0.25, 0, 0] as const, easing: 'smoothstep' as const },
              { time: 1.2, rotation: [0, 0, 0] as const },
            ],
          },
          {
            joint: `${side}-knee`,
            mode: 'additive' as const,
            keyframes: [
              { time: 0, rotation: [0, 0, 0] as const, easing: 'smoothstep' as const },
              { time: 0.18, rotation: [0.72, 0, 0] as const, easing: 'smoothstep' as const },
              { time: 0.52, rotation: [0.2, 0, 0] as const, easing: 'smoothstep' as const },
              { time: 0.94, rotation: [0.5, 0, 0] as const, easing: 'smoothstep' as const },
              { time: 1.2, rotation: [0, 0, 0] as const },
            ],
          },
        ];
      }),
    ],
  },
];

/**
 * Visible blocky player character for third-person view. Built once; update() mutates position,
 * yaw, visibility and — driven by how far the player moved — a contralateral arm/leg walk swing.
 * Arm/leg limbs live under pivot groups at the shoulder/hip so they swing from the joint (gloves and
 * boots ride along). Hidden in first-person. Skin changes recolor/show-hide prebuilt parts.
 */
export class PlayerAvatar {
  readonly group = new Group();
  private readonly rig: CharacterRig;
  private readonly animator: CharacterAnimator;
  private readonly disposables: (BoxGeometry | Material)[] = [];
  private readonly partMeshes = new Map<string, Mesh<BoxGeometry, MeshLambertMaterial>>();
  private readonly styleTextures = new Map<string, DataTexture>();
  private readonly equipment: EquipmentRig;
  private readonly manualPose = new Map<string, CharacterJointTransform>();
  private phase = 0;
  private swingAmp = 0;

  constructor(skinId?: string) {
    this.rig = new CharacterRig(this.group, PLAYER_JOINTS);
    this.animator = new CharacterAnimator(this.rig, PLAYER_CLIPS);

    for (const part of PARTS) {
      const geometry = new BoxGeometry(...part.size);
      const material = new MeshLambertMaterial();
      const mesh = new Mesh(geometry, material);
      mesh.name = part.id;
      mesh.position.set(...part.pos);
      if (part.rotation) mesh.rotation.set(...part.rotation);
      const parent = this.rig.joint(part.joint);
      if (!parent) throw new Error(`player part ${part.id} references missing joint ${part.joint}`);
      parent.add(mesh);
      this.partMeshes.set(part.id, mesh);
      this.disposables.push(geometry, material);
    }

    this.equipment = new EquipmentRig(
      {
        main: this.rig.joint('right-wrist')!,
        off: this.rig.joint('left-wrist')!,
      },
      {
        material: 'lit',
        transforms: {
          main: { pos: [0.04, -0.03, 0], rotation: [0.08, 0, Math.PI - 0.12], scale: 0.75 },
          off: { pos: [-0.04, -0.03, 0], rotation: [0.08, 0, Math.PI + 0.12], scale: 0.75 },
        },
      },
    );

    this.setSkin(skinId);
    this.group.visible = false;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.group);
  }

  /**
   * Places the avatar at the body center with the given look yaw and advances the walk cycle from
   * this frame's motion; hides it in first-person. With no motion the limbs ease back to rest.
   */
  update(center: Vec3, yaw: number, visible: boolean, motion?: AvatarMotion): void {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(center.x, center.y, center.z);
    this.group.rotation.y = yaw;

    const dh = motion?.dh ?? 0;
    const dt = motion?.dt ?? 0;
    this.animator.update(dt);
    // Phase tracks distance covered, so the stride matches ground speed and freezes when still.
    this.phase += dh * STRIDE_PER_BLOCK;
    const speed = dt > 0 ? dh / dt : 0;
    const targetAmp = speed > MOVING_SPEED ? MAX_SWING : 0;
    this.swingAmp += (targetAmp - this.swingAmp) * Math.min(1, dt * SWING_EASE);
    const swing = Math.sin(this.phase) * this.swingAmp;
    if (!this.animator.activeId() && this.manualPose.size === 0) {
      // Legs lead; arms counter-swing. Absolute writes (rest rotation is zero for these
      // joints): the idle animator no longer resets the rig every frame.
      this.rig.joint('right-hip')!.rotation.x = swing;
      this.rig.joint('left-hip')!.rotation.x = -swing;
      this.rig.joint('right-shoulder')!.rotation.x = -swing;
      this.rig.joint('left-shoulder')!.rotation.x = swing;
    }
    for (const [id, transform] of this.manualPose) this.rig.set(id, transform);
  }

  playAnimation(id: string): boolean {
    if (!isPlayerAnimationId(id)) return false;
    this.manualPose.clear();
    return this.animator.play(id);
  }

  stopAnimation(): boolean {
    return this.animator.stop();
  }

  cycleAnimation(direction: 1 | -1 = 1): PlayerAnimationState {
    const sequence: Array<PlayerAnimationId | undefined> = [
      undefined,
      ...PLAYER_ANIMATIONS.map(({ id }) => id),
    ];
    const current = sequence.indexOf(this.animator.activeId() as PlayerAnimationId | undefined);
    const next = (current + direction + sequence.length) % sequence.length;
    const animation = sequence[next];
    if (animation) this.playAnimation(animation);
    else this.stopAnimation();
    return this.animationState();
  }

  animationState(): PlayerAnimationState {
    const active = this.animator.activeId();
    return {
      ...(active && isPlayerAnimationId(active) ? { animation: active } : {}),
      animations: PLAYER_ANIMATIONS.map(({ id, label }) => ({ id, label })),
    };
  }

  /**
   * Applies one of the built-in skins; unknown ids fall back to the default Realm Scout.
   * Cloth/leather/metal slots get a tiny procedural texture baked from the palette color
   * (material color stays white so the texel colors aren't double-tinted); plain slots
   * (skin, hair, eyes) keep the flat Lambert color.
   */
  setSkin(skinId?: string): PlayerSkin {
    const skin = resolvePlayerSkin(skinId);
    const accessories = new Set<PlayerAccessoryId>(skin.accessories);
    for (const part of PARTS) {
      const mesh = this.partMeshes.get(part.id);
      if (!mesh) continue;
      const color = skin.palette[part.slot];
      const style = styleForSlot(part.slot);
      if (style === 'plain') {
        mesh.material.map = null;
        mesh.material.color.setHex(color);
      } else {
        mesh.material.map = this.styleTexture(color, style);
        mesh.material.color.setHex(0xffffff);
      }
      mesh.material.needsUpdate = true;
      mesh.visible = part.accessory === undefined || accessories.has(part.accessory);
    }
    return skin;
  }

  setEquipment(loadout: Readonly<EquipmentLoadout>): void {
    this.equipment.setLoadout(loadout);
  }

  equip(slot: EquipmentSlot, id: EquipmentId): boolean {
    return this.equipment.equip(slot, id);
  }

  unequip(slot: EquipmentSlot): boolean {
    return this.equipment.unequip(slot);
  }

  equipmentState(): EquipmentLoadout {
    return this.equipment.state();
  }

  setEquipmentVisible(visible: boolean): void {
    this.equipment.setVisible(visible);
  }

  jointState(): CharacterJointState[] {
    return this.rig.state();
  }

  setJointTransform(id: string, transform: CharacterJointTransform): boolean {
    if (!this.rig.joint(id)) return false;
    this.animator.stop();
    const previous = this.manualPose.get(id);
    const next: CharacterJointTransform = {
      ...(transform.pos ? { pos: transform.pos } : previous?.pos ? { pos: previous.pos } : {}),
      ...(transform.rotation
        ? { rotation: transform.rotation }
        : previous?.rotation
          ? { rotation: previous.rotation }
          : {}),
    };
    this.manualPose.set(id, next);
    for (const [jointId, jointTransform] of this.manualPose) {
      this.rig.set(jointId, jointTransform);
    }
    return true;
  }

  resetJoints(): void {
    this.manualPose.clear();
    this.animator.stop();
    this.rig.reset();
  }

  exportPose(): Record<string, CharacterJointTransform> {
    return this.rig.exportPose();
  }

  /** One texture per color+style pair, shared across parts and reused on skin changes. */
  private styleTexture(color: number, style: AvatarStyle): DataTexture {
    const key = `${style}:${color}`;
    let tex = this.styleTextures.get(key);
    if (!tex) {
      const data = new Uint8Array(AVATAR_TILE * AVATAR_TILE * 4);
      paintAvatarTile(data, color, style);
      tex = new DataTexture(data, AVATAR_TILE, AVATAR_TILE, RGBAFormat);
      tex.magFilter = NearestFilter;
      tex.minFilter = NearestFilter;
      tex.colorSpace = SRGBColorSpace;
      tex.needsUpdate = true;
      this.styleTextures.set(key, tex);
    }
    return tex;
  }

  dispose(): void {
    this.equipment.dispose();
    for (const d of this.disposables) d.dispose();
    for (const tex of this.styleTextures.values()) tex.dispose();
    this.styleTextures.clear();
  }
}
