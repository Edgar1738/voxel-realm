import { BoxGeometry, CylinderGeometry, Mesh, MeshBasicMaterial, type Object3D } from 'three';

/** Gold accent matching selection/HUD highlights so the beacon reads as a guide, not an edit tool. */
const BEACON_COLOR = 0xffd54a;

/** Tall translucent column so the active tour waypoint stays readable from distance. */
const BEAM_HEIGHT = 14;
const BEAM_RADIUS = 0.22;

/** Solid base pad sitting on the waypoint so the target is obvious up close. */
const PAD_SIZE = 1.15;
const PAD_HEIGHT = 0.18;

/**
 * World-space tour beacon for the active waypoint. Created once; {@link update} only mutates
 * transform/visibility. Unlit so it stays visible day/night without depending on scene lights.
 */
export class TourMarker {
  readonly beam: Mesh;
  readonly pad: Mesh;

  constructor() {
    this.beam = new Mesh(
      new CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS * 0.65, BEAM_HEIGHT, 10),
      new MeshBasicMaterial({
        color: BEACON_COLOR,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
    );
    this.pad = new Mesh(
      new BoxGeometry(PAD_SIZE, PAD_HEIGHT, PAD_SIZE),
      new MeshBasicMaterial({
        color: BEACON_COLOR,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.beam.visible = false;
    this.pad.visible = false;
    this.beam.renderOrder = 997;
    this.pad.renderOrder = 997;
  }

  attach(add: (o: Object3D) => void): void {
    add(this.beam);
    add(this.pad);
  }

  /**
   * Places the beacon at a waypoint (block-space coords; typically the landmark center).
   * Hidden when `show` is false or `point` is missing.
   */
  update(point: { x: number; y: number; z: number } | undefined, show: boolean): void {
    if (!show || !point) {
      this.beam.visible = false;
      this.pad.visible = false;
      return;
    }
    // Center the column on the block footprint; pad sits at waypoint y, beam rises from there.
    const cx = point.x + 0.5;
    const cz = point.z + 0.5;
    const baseY = point.y;
    this.pad.position.set(cx, baseY + PAD_HEIGHT / 2, cz);
    this.beam.position.set(cx, baseY + BEAM_HEIGHT / 2, cz);
    this.pad.visible = true;
    this.beam.visible = true;
  }

  /** Frees GPU resources owned by the beacon. */
  dispose(): void {
    this.beam.geometry.dispose();
    (this.beam.material as MeshBasicMaterial).dispose();
    this.pad.geometry.dispose();
    (this.pad.material as MeshBasicMaterial).dispose();
  }
}
