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
];

export const PLAYER_AVATAR_PART_IDS: readonly string[] = PARTS.map((part) => part.id);

/**
 * Visible blocky player character for third-person view. Built once as a Group of box parts;
 * update() only mutates position/yaw/visibility. Hidden in first-person. Skin changes recolor and
 * show/hide prebuilt parts; no render resources are allocated per frame.
 */
export class PlayerAvatar {
  readonly group = new Group();
  private readonly disposables: (BoxGeometry | Material)[] = [];
  private readonly partMeshes = new Map<string, Mesh<BoxGeometry, MeshLambertMaterial>>();

  constructor(skinId?: string) {
    for (const part of PARTS) {
      const geometry = new BoxGeometry(...part.size);
      const material = new MeshLambertMaterial();
      const mesh = new Mesh(geometry, material);
      mesh.name = part.id;
      mesh.position.set(...part.pos);
      this.group.add(mesh);
      this.partMeshes.set(part.id, mesh);
      this.disposables.push(geometry, material);
    }
    this.setSkin(skinId);
    this.group.visible = false;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.group);
  }

  /** Places the avatar at the body center with the given look yaw; hides it in first-person. */
  update(center: Vec3, yaw: number, visible: boolean): void {
    this.group.visible = visible;
    if (!visible) return;
    this.group.position.set(center.x, center.y, center.z);
    this.group.rotation.y = yaw;
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
