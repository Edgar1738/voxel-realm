import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  EdgesGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  type Object3D,
} from 'three';
import type { Prefab } from '../core/Prefab';

/** One RGB per block id for the ghost voxels (the world-map palette slots in directly). */
export type GhostPalette = Map<number, readonly [number, number, number]>;

/**
 * Above this many voxels the ghost falls back to the bounds box alone — a preview of a
 * multi-array mega-paste doesn't need per-voxel fidelity, and instance rebuilds on every
 * rotate should stay instant.
 */
export const GHOST_VOXEL_CAP = 30000;

const GHOST_TINT: readonly [number, number, number] = [120, 170, 210];

/**
 * Live preview of the transformed clipboard at the paste origin: the actual voxels as
 * translucent per-block-colored cubes, plus the bounds outline. The voxel mesh rebuilds
 * only when `revision` changes (rotate/mirror/array/copy); every other frame just moves it.
 */
export class PasteGhost {
  readonly edges: LineSegments;
  private voxels?: InstancedMesh;
  private builtRevision = -1;
  private readonly cube = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });
  private addToScene?: (o: Object3D) => void;
  private readonly scratch = new Matrix4();
  private readonly color = new Color();

  constructor(private readonly palette: GhostPalette = new Map()) {
    this.edges = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.9 }),
    );
    this.edges.visible = false;
    this.edges.renderOrder = 999;
  }

  attach(add: (o: Object3D) => void): void {
    this.addToScene = add;
    add(this.edges);
  }

  update(
    prefab: Prefab | undefined,
    origin: { x: number; y: number; z: number } | undefined,
    show: boolean,
    revision = 0,
  ): void {
    if (!show || !prefab || !origin) {
      this.edges.visible = false;
      if (this.voxels) this.voxels.visible = false;
      return;
    }
    const [sx, sy, sz] = prefab.dims;
    this.edges.scale.set(sx, sy, sz);
    this.edges.position.set(origin.x + sx / 2, origin.y + sy / 2, origin.z + sz / 2);
    this.edges.visible = true;

    if (revision !== this.builtRevision) {
      this.builtRevision = revision;
      this.rebuild(prefab);
    }
    if (this.voxels) {
      this.voxels.position.set(origin.x, origin.y, origin.z);
      this.voxels.visible = true;
    }
  }

  /** Swaps in a fresh instanced mesh for the prefab's voxels (or none, over the cap). */
  private rebuild(prefab: Prefab): void {
    if (this.voxels) {
      this.voxels.removeFromParent();
      this.voxels.dispose(); // frees the per-instance buffers; geometry/material are shared
      delete this.voxels;
    }
    const count = prefab.blocks.length;
    if (count === 0 || count > GHOST_VOXEL_CAP) return;
    const mesh = new InstancedMesh(this.cube, this.material, count);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.renderOrder = 998;
    mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      const b = prefab.blocks[i];
      this.scratch.makeTranslation(b[0] + 0.5, b[1] + 0.5, b[2] + 0.5);
      mesh.setMatrixAt(i, this.scratch);
      const rgb = this.palette.get(b[3]) ?? GHOST_TINT;
      // A light tint-lift keeps the hologram feel; block colors stay clearly recognizable.
      this.color.setRGB(
        (rgb[0] * 0.9 + GHOST_TINT[0] * 0.1) / 255,
        (rgb[1] * 0.9 + GHOST_TINT[1] * 0.1) / 255,
        (rgb[2] * 0.9 + GHOST_TINT[2] * 0.1) / 255,
      );
      mesh.setColorAt(i, this.color);
    }
    this.voxels = mesh;
    this.addToScene?.(mesh);
  }

  /** Frees the outline + shared voxel-cube GPU resources. */
  dispose(): void {
    this.edges.geometry.dispose();
    (this.edges.material as LineBasicMaterial).dispose();
    this.voxels?.dispose();
    this.cube.dispose();
    this.material.dispose();
  }
}
