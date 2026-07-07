import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three';

/** Reusable translucent footprint of the transformed clipboard at the paste origin. Created once. */
export class PasteGhost {
  readonly mesh: Mesh;
  readonly edges: LineSegments;

  constructor() {
    this.mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({
        color: 0x5ad1ff,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    this.edges = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.9 }),
    );
    this.mesh.visible = false;
    this.edges.visible = false;
    this.mesh.renderOrder = 998;
    this.edges.renderOrder = 999;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.mesh);
    add(this.edges);
  }

  update(
    dims: [number, number, number] | undefined,
    origin: { x: number; y: number; z: number } | undefined,
    show: boolean,
  ): void {
    if (!show || !dims || !origin) {
      this.mesh.visible = false;
      this.edges.visible = false;
      return;
    }
    const [sx, sy, sz] = dims;
    const cx = origin.x + sx / 2;
    const cy = origin.y + sy / 2;
    const cz = origin.z + sz / 2;
    this.mesh.scale.set(sx, sy, sz);
    this.mesh.position.set(cx, cy, cz);
    this.edges.scale.set(sx, sy, sz);
    this.edges.position.set(cx, cy, cz);
    this.mesh.visible = true;
    this.edges.visible = true;
  }

  /** Frees the ghost fill + edge-outline GPU resources. */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.edges.geometry.dispose();
    (this.edges.material as LineBasicMaterial).dispose();
  }
}
