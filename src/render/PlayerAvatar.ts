import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Material, type Object3D } from 'three';
import type { Vec3 } from '../core/types';
import {
  resolvePlayerSkin,
  type PlayerAccessoryId,
  type PlayerSkin,
  type PlayerSkinSlot,
} from '../character/PlayerSkins';

/** A blocky box part in local avatar space (origin = body center, +Y up, faces -Z at yaw 0). */
interface Part {
  id: string;
  size: [number, number, number];
  pos: [number, number, number];
  slot: PlayerSkinSlot;
  accessory?: PlayerAccessoryId;
}

// Compact Voxel Realm proportions for a roughly 1.8-tall body centered on the player origin.
// All optional skin/accessory parts are built once, then recolored and shown/hidden per skin.
const PARTS: readonly Part[] = [
  { id: 'head', size: [0.46, 0.46, 0.46], pos: [0, 0.65, 0], slot: 'skin' },
  // Face: eye whites + pupils sit just proud of the head's front (−Z) so hoods and helmets
  // never swallow them. Always visible — every skin gets a face.
  { id: 'right-eye', size: [0.1, 0.09, 0.03], pos: [0.1, 0.69, -0.225], slot: 'eye' },
  { id: 'left-eye', size: [0.1, 0.09, 0.03], pos: [-0.1, 0.69, -0.225], slot: 'eye' },
  { id: 'right-pupil', size: [0.05, 0.05, 0.03], pos: [0.09, 0.685, -0.235], slot: 'pupil' },
  { id: 'left-pupil', size: [0.05, 0.05, 0.03], pos: [-0.09, 0.685, -0.235], slot: 'pupil' },
  { id: 'brow', size: [0.3, 0.05, 0.03], pos: [0, 0.765, -0.225], slot: 'hair', accessory: 'brow' },
  { id: 'hair', size: [0.5, 0.14, 0.5], pos: [0, 0.88, 0], slot: 'hair', accessory: 'hair' },
  { id: 'hood', size: [0.58, 0.58, 0.58], pos: [0, 0.65, 0], slot: 'hood', accessory: 'hood' },
  {
    id: 'helmet',
    size: [0.56, 0.22, 0.56],
    pos: [0, 0.8, 0],
    slot: 'metal',
    accessory: 'helmet',
  },
  { id: 'torso', size: [0.52, 0.58, 0.3], pos: [0, 0.1, 0], slot: 'tunic' },
  { id: 'chest-trim', size: [0.54, 0.12, 0.32], pos: [0, 0.3, -0.01], slot: 'trim' },
  { id: 'belt', size: [0.56, 0.1, 0.34], pos: [0, -0.18, 0], slot: 'belt' },
  { id: 'right-arm', size: [0.16, 0.5, 0.24], pos: [0.35, 0.13, 0], slot: 'sleeves' },
  { id: 'left-arm', size: [0.16, 0.5, 0.24], pos: [-0.35, 0.13, 0], slot: 'sleeves' },
  { id: 'right-glove', size: [0.17, 0.14, 0.25], pos: [0.35, -0.19, 0], slot: 'gloves' },
  { id: 'left-glove', size: [0.17, 0.14, 0.25], pos: [-0.35, -0.19, 0], slot: 'gloves' },
  { id: 'right-leg', size: [0.21, 0.48, 0.25], pos: [0.13, -0.52, 0], slot: 'pants' },
  { id: 'left-leg', size: [0.21, 0.48, 0.25], pos: [-0.13, -0.52, 0], slot: 'pants' },
  { id: 'right-boot', size: [0.23, 0.2, 0.27], pos: [0.13, -0.82, 0], slot: 'boots' },
  { id: 'left-boot', size: [0.23, 0.2, 0.27], pos: [-0.13, -0.82, 0], slot: 'boots' },
  {
    id: 'satchel',
    size: [0.18, 0.22, 0.12],
    pos: [-0.35, -0.08, 0.13],
    slot: 'leather',
    accessory: 'satchel',
  },
  {
    id: 'tool-pouch',
    size: [0.16, 0.16, 0.12],
    pos: [0.34, -0.18, 0.13],
    slot: 'leather',
    accessory: 'tool-belt',
  },
  {
    id: 'backpack',
    size: [0.42, 0.5, 0.12],
    pos: [0, 0.04, 0.23],
    slot: 'leather',
    accessory: 'backpack',
  },
  {
    id: 'cloak',
    size: [0.58, 0.72, 0.08],
    pos: [0, -0.03, 0.24],
    slot: 'cloak',
    accessory: 'cloak',
  },
  {
    id: 'mantle',
    size: [0.62, 0.16, 0.38],
    pos: [0, 0.36, 0],
    slot: 'trim',
    accessory: 'mantle',
  },
  // Plated shoulders, one box over each arm's shoulder joint (root-mounted; they don't swing).
  {
    id: 'right-pauldron',
    size: [0.24, 0.14, 0.3],
    pos: [0.36, 0.4, 0],
    slot: 'metal',
    accessory: 'pauldrons',
  },
  {
    id: 'left-pauldron',
    size: [0.24, 0.14, 0.3],
    pos: [-0.36, 0.4, 0],
    slot: 'metal',
    accessory: 'pauldrons',
  },
  // Pointed hat as three stacked, shrinking boxes: brim, crown, tip.
  {
    id: 'hat-brim',
    size: [0.62, 0.06, 0.62],
    pos: [0, 0.9, 0],
    slot: 'hood',
    accessory: 'wizard-hat',
  },
  {
    id: 'hat-crown',
    size: [0.36, 0.2, 0.36],
    pos: [0, 1.02, 0],
    slot: 'hood',
    accessory: 'wizard-hat',
  },
  {
    id: 'hat-tip',
    size: [0.22, 0.2, 0.22],
    pos: [0, 1.2, 0],
    slot: 'hood',
    accessory: 'wizard-hat',
  },
  // Arrow quiver over the left shoulder blade, outside any cloak.
  {
    id: 'quiver',
    size: [0.16, 0.52, 0.16],
    pos: [-0.2, 0.18, 0.3],
    slot: 'leather',
    accessory: 'quiver',
  },
];

export const PLAYER_AVATAR_PART_IDS: readonly string[] = PARTS.map((part) => part.id);

/** A swinging limb: the primary part (arm/leg) pivots at its top, the extremity (glove/boot) rides along. */
interface LimbDef {
  primary: string;
  extremity: string;
  kind: 'arm' | 'leg';
  /** +1 for right, −1 for left, so left/right swing in opposite phase. */
  sign: number;
}

const LIMBS: readonly LimbDef[] = [
  { primary: 'right-arm', extremity: 'right-glove', kind: 'arm', sign: 1 },
  { primary: 'left-arm', extremity: 'left-glove', kind: 'arm', sign: -1 },
  { primary: 'right-leg', extremity: 'right-boot', kind: 'leg', sign: 1 },
  { primary: 'left-leg', extremity: 'left-boot', kind: 'leg', sign: -1 },
];

/** Motion this frame, driving the walk cycle. `dh` = horizontal distance moved, `dt` = seconds. */
export interface AvatarMotion {
  dh: number;
  dt: number;
}

/** Radians of stride phase advanced per block of ground covered (a full swing every ~1.1 blocks). */
const STRIDE_PER_BLOCK = 2.8;
/** Peak limb swing (radians ≈ 29°). */
const MAX_SWING = 0.5;
/** Above this horizontal speed (blocks/s) the walk cycle engages. */
const MOVING_SPEED = 0.6;
/** How fast the swing amplitude eases in/out (per second). */
const SWING_EASE = 10;

interface Limb {
  pivot: Group;
  kind: 'arm' | 'leg';
  sign: number;
}

/**
 * Visible blocky player character for third-person view. Built once; update() mutates position,
 * yaw, visibility and — driven by how far the player moved — a contralateral arm/leg walk swing.
 * Arm/leg limbs live under pivot groups at the shoulder/hip so they swing from the joint (gloves and
 * boots ride along). Hidden in first-person. Skin changes recolor/show-hide prebuilt parts.
 */
export class PlayerAvatar {
  readonly group = new Group();
  private readonly disposables: (BoxGeometry | Material)[] = [];
  private readonly partMeshes = new Map<string, Mesh<BoxGeometry, MeshLambertMaterial>>();
  private readonly limbs: Limb[] = [];
  private phase = 0;
  private swingAmp = 0;

  constructor(skinId?: string) {
    for (const part of PARTS) {
      const geometry = new BoxGeometry(...part.size);
      const material = new MeshLambertMaterial();
      const mesh = new Mesh(geometry, material);
      mesh.name = part.id;
      mesh.position.set(...part.pos);
      this.partMeshes.set(part.id, mesh);
      this.disposables.push(geometry, material);
    }

    const limbMembers = new Set(LIMBS.flatMap((l) => [l.primary, l.extremity]));
    // Non-limb parts hang directly off the root at their authored position.
    for (const part of PARTS) {
      if (limbMembers.has(part.id)) continue;
      this.group.add(this.partMeshes.get(part.id)!);
    }
    // Each limb gets a pivot group at the top of its primary part; members are re-expressed in
    // pivot-local space so a rest pose (rotation 0) is byte-identical to the authored layout.
    const byId = new Map(PARTS.map((p) => [p.id, p]));
    for (const def of LIMBS) {
      const primary = byId.get(def.primary)!;
      const pivot = new Group();
      pivot.position.set(primary.pos[0], primary.pos[1] + primary.size[1] / 2, primary.pos[2]);
      for (const memberId of [def.primary, def.extremity]) {
        const member = byId.get(memberId)!;
        const mesh = this.partMeshes.get(memberId)!;
        mesh.position.set(
          member.pos[0] - pivot.position.x,
          member.pos[1] - pivot.position.y,
          member.pos[2] - pivot.position.z,
        );
        pivot.add(mesh);
      }
      this.group.add(pivot);
      this.limbs.push({ pivot, kind: def.kind, sign: def.sign });
    }

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
    // Phase tracks distance covered, so the stride matches ground speed and freezes when still.
    this.phase += dh * STRIDE_PER_BLOCK;
    const speed = dt > 0 ? dh / dt : 0;
    const targetAmp = speed > MOVING_SPEED ? MAX_SWING : 0;
    this.swingAmp += (targetAmp - this.swingAmp) * Math.min(1, dt * SWING_EASE);
    const swing = Math.sin(this.phase) * this.swingAmp;
    for (const limb of this.limbs) {
      // Legs lead; arms swing opposite the same-side leg for a natural contralateral gait.
      limb.pivot.rotation.x = (limb.kind === 'leg' ? limb.sign : -limb.sign) * swing;
    }
  }

  /** Applies one of the built-in skins; unknown ids fall back to the default Realm Scout. */
  setSkin(skinId?: string): PlayerSkin {
    const skin = resolvePlayerSkin(skinId);
    const accessories = new Set<PlayerAccessoryId>(skin.accessories);
    for (const part of PARTS) {
      const mesh = this.partMeshes.get(part.id);
      if (!mesh) continue;
      mesh.material.color.setHex(skin.palette[part.slot]);
      mesh.visible = part.accessory === undefined || accessories.has(part.accessory);
    }
    return skin;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
