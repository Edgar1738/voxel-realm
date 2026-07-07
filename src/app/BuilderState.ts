import type { Box } from './RegionOps';
import { rotateY, mirror, repeat, type Prefab } from '../core/Prefab';

export type BuilderMode = 'off' | 'selecting' | 'pasting';

export interface BuilderTransform {
  turns: number; // 0..3 quarter-turns about Y
  mirrorX: boolean;
  mirrorZ: boolean;
  arrayCount: number; // >= 1
  arrayAxis: 'x' | 'z';
}

interface Vec3i {
  x: number;
  y: number;
  z: number;
}

/** All builder-tool state and the geometry it derives. No three.js, no DOM — pure and testable. */
export class BuilderState {
  mode: BuilderMode = 'off';
  cornerA?: Vec3i;
  cornerB?: Vec3i;
  clipboard?: Prefab;
  transform: BuilderTransform = {
    turns: 0,
    mirrorX: false,
    mirrorZ: false,
    arrayCount: 1,
    arrayAxis: 'x',
  };
  /** Whole-block offset dialed in on top of the live aim so a paste can be placed precisely. */
  nudge: Vec3i = { x: 0, y: 0, z: 0 };
  private nextCorner: 'a' | 'b' = 'a';

  /** off ↔ selecting. Leaving Build mode clears the selection and any paste session. */
  toggleMode(): void {
    if (this.mode === 'off') {
      this.mode = 'selecting';
    } else {
      this.mode = 'off';
      this.clearSelection();
    }
  }

  /** Sets the next corner (A, then B, then cycles back to A). */
  setCorner(v: Vec3i): void {
    if (this.nextCorner === 'a') {
      this.cornerA = { ...v };
      this.nextCorner = 'b';
    } else {
      this.cornerB = { ...v };
      this.nextCorner = 'a';
    }
  }

  clearSelection(): void {
    delete this.cornerA;
    delete this.cornerB;
    this.nextCorner = 'a';
  }

  selectionBox(): Box | undefined {
    if (!this.cornerA || !this.cornerB) return undefined;
    return {
      x1: this.cornerA.x,
      y1: this.cornerA.y,
      z1: this.cornerA.z,
      x2: this.cornerB.x,
      y2: this.cornerB.y,
      z2: this.cornerB.z,
    };
  }

  setClipboard(p: Prefab): void {
    this.clipboard = p;
    this.transform = { turns: 0, mirrorX: false, mirrorZ: false, arrayCount: 1, arrayAxis: 'x' };
    this.resetNudge();
    this.mode = 'pasting';
  }

  /** Leave paste mode but keep the clipboard for another paste. */
  exitPaste(): void {
    if (this.mode === 'pasting') this.mode = 'selecting';
    this.resetNudge();
  }

  /** Shift the paste offset by whole blocks along each axis. */
  nudgeBy(dx: number, dy: number, dz: number): void {
    this.nudge = { x: this.nudge.x + dx, y: this.nudge.y + dy, z: this.nudge.z + dz };
  }

  /** Clear the paste offset back to the raw aim cell. */
  resetNudge(): void {
    this.nudge = { x: 0, y: 0, z: 0 };
  }

  /** Apply the current nudge offset to a base origin (returns a new point; never mutates). */
  applyNudge(base: Vec3i): Vec3i {
    return { x: base.x + this.nudge.x, y: base.y + this.nudge.y, z: base.z + this.nudge.z };
  }

  rotate(delta: number): void {
    this.transform.turns = (((this.transform.turns + delta) % 4) + 4) % 4;
  }

  mirrorAxis(axis: 'x' | 'z'): void {
    if (axis === 'x') this.transform.mirrorX = !this.transform.mirrorX;
    else this.transform.mirrorZ = !this.transform.mirrorZ;
  }

  arrayAdjust(delta: number, axis: 'x' | 'z'): void {
    this.transform.arrayAxis = axis;
    this.transform.arrayCount = Math.max(1, this.transform.arrayCount + delta);
  }

  /** Apply mirror(x) → mirror(z) → rotate → array, composing the tested Prefab functions. */
  transformedClipboard(): Prefab | undefined {
    if (!this.clipboard) return undefined;
    let p = this.clipboard;
    if (this.transform.mirrorX) p = mirror(p, 'x');
    if (this.transform.mirrorZ) p = mirror(p, 'z');
    p = rotateY(p, this.transform.turns);
    const n = this.transform.arrayCount;
    if (n > 1) {
      const stride: [number, number, number] =
        this.transform.arrayAxis === 'x' ? [p.dims[0], 0, 0] : [0, 0, p.dims[2]];
      p =
        this.transform.arrayAxis === 'x' ? repeat(p, n, 1, 1, stride) : repeat(p, 1, 1, n, stride);
    }
    return p;
  }
}
