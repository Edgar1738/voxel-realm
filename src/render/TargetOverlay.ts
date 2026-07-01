import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import type { ResolvedTarget } from '../app/targetPreview';

/**
 * Two persistent, reusable scene overlays: a wireframe outline on the targeted voxel and a
 * translucent ghost on the adjacent place target. Geometry and both ghost materials are created
 * once; `update()` only repositions, toggles visibility, and swaps between the two preallocated
 * materials. Never allocates or disposes three.js resources per frame.
 */
export class TargetOverlay {
  readonly outline: LineSegments;
  readonly ghost: Mesh;
  private readonly validMat: MeshBasicMaterial;
  private readonly invalidMat: MeshBasicMaterial;

  constructor() {
    this.outline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.002, 1.002, 1.002)),
      new LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6 }),
    );
    this.outline.visible = false;
    this.outline.renderOrder = 999;

    // Valid: solid translucent green. Invalid: sparse red wireframe + lower opacity — differs by
    // more than hue so it reads correctly without relying on color alone.
    this.validMat = new MeshBasicMaterial({
      color: 0x66ff88,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.invalidMat = new MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      wireframe: true,
    });
    this.ghost = new Mesh(new BoxGeometry(1, 1, 1), this.validMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 999;
  }

  /** Adds both overlays to the scene graph. Call once, after construction. */
  attach(add: (o: Object3D) => void): void {
    add(this.outline);
    add(this.ghost);
  }

  /**
   * Positions and shows/hides both overlays for the current frame. `show=false` (pointer
   * unlocked or inventory open) hides everything. Toggle targets show the outline only.
   * `ghostVisible=false` keeps the outline but suppresses the placement ghost (user preference).
   */
  update(resolved: ResolvedTarget | undefined, show: boolean, ghostVisible = true): void {
    if (!show || !resolved) {
      this.outline.visible = false;
      this.ghost.visible = false;
      return;
    }
    const o = resolved.outline;
    this.outline.position.set(o.x + 0.5, o.y + 0.5, o.z + 0.5);
    this.outline.visible = true;

    if (resolved.kind === 'place' && ghostVisible) {
      const g = resolved.ghost;
      this.ghost.position.set(g.x + 0.5, g.y + 0.5, g.z + 0.5);
      this.ghost.material = g.valid ? this.validMat : this.invalidMat;
      this.ghost.visible = true;
    } else {
      this.ghost.visible = false;
    }
  }
}
