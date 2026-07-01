import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, type Object3D } from 'three';
import type { Box } from '../app/RegionOps';

/** Reusable wireframe box marking the current two-corner selection. Created once; update() only mutates. */
export class SelectionBox {
  readonly mesh: LineSegments;

  constructor() {
    // Unit cube centered at origin; scaled per selection so edges track the box faces.
    this.mesh = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.9 }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 998;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
  }

  update(box: Box | undefined, show: boolean): void {
    if (!show || !box) {
      this.mesh.visible = false;
      return;
    }
    const minX = Math.min(box.x1, box.x2);
    const minY = Math.min(box.y1, box.y2);
    const minZ = Math.min(box.z1, box.z2);
    const sx = Math.abs(box.x2 - box.x1) + 1;
    const sy = Math.abs(box.y2 - box.y1) + 1;
    const sz = Math.abs(box.z2 - box.z1) + 1;
    this.mesh.scale.set(sx, sy, sz);
    this.mesh.position.set(minX + sx / 2, minY + sy / 2, minZ + sz / 2);
    this.mesh.visible = true;
  }
}
