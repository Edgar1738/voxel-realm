import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Material, type Object3D } from 'three';
import type { Vec3 } from '../core/types';

/** A blocky box part in local avatar space (origin = body center, +Y up, faces −Z at yaw 0). */
interface Part {
  size: [number, number, number];
  pos: [number, number, number];
  color: number;
}

// Minecraft-ish proportions for a ~1.8-tall body centered on the player origin: feet at −0.9,
// head top at +0.9, authored facing −Z so a group yaw of `rig.yaw` points it along the look.
const SKIN = 0xe0ac69;
const SHIRT = 0x3f7fbf;
const PANTS = 0x35507a;
const PARTS: readonly Part[] = [
  { size: [0.5, 0.5, 0.5], pos: [0, 0.65, 0], color: SKIN }, // head
  { size: [0.5, 0.6, 0.28], pos: [0, 0.1, 0], color: SHIRT }, // torso
  { size: [0.15, 0.6, 0.24], pos: [0.325, 0.1, 0], color: SHIRT }, // right arm
  { size: [0.15, 0.6, 0.24], pos: [-0.325, 0.1, 0], color: SHIRT }, // left arm
  { size: [0.22, 0.6, 0.26], pos: [0.13, -0.5, 0], color: PANTS }, // right leg
  { size: [0.22, 0.6, 0.26], pos: [-0.13, -0.5, 0], color: PANTS }, // left leg
];

/**
 * Visible blocky player character for third-person view. Built once as a Group of box parts;
 * update() only mutates position/yaw/visibility. Hidden in first-person. Uses MeshLambertMaterial
 * so the parts pick up the scene's directional/ambient light like the voxel terrain.
 */
export class PlayerAvatar {
  readonly group = new Group();
  private readonly disposables: (BoxGeometry | Material)[] = [];

  constructor() {
    for (const part of PARTS) {
      const geometry = new BoxGeometry(...part.size);
      const material = new MeshLambertMaterial({ color: part.color });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(...part.pos);
      this.group.add(mesh);
      this.disposables.push(geometry, material);
    }
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

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
