import { Euler, Vector3, type PerspectiveCamera } from 'three';
import type { InputState } from '../player/PlayerController';

const SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.01;

/**
 * Owns pointer-lock mouse-look and keyboard input, and writes the player's eye transform
 * to the camera. Yaw/pitch use a YXZ euler so look direction matches PlayerController's
 * yaw convention (forward = -Z at yaw 0).
 */
export class CameraRig {
  yaw = 0;
  pitch = 0;
  locked = false;

  private readonly pressed = new Set<string>();
  private toggleFlyQueued = false;
  private readonly euler = new Euler(0, 0, 0, 'YXZ');

  constructor(
    private readonly camera: PerspectiveCamera,
    canvas: HTMLCanvasElement,
    private readonly overlay?: HTMLElement,
  ) {
    // Listen on document, not the canvas: the fullscreen overlay sits on top of the
    // canvas and would otherwise swallow the click before it reaches requestPointerLock.
    document.addEventListener('click', () => {
      if (!this.locked) void canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.overlay) this.overlay.style.display = this.locked ? 'none' : 'flex';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * SENSITIVITY;
      this.pitch -= e.movementY * SENSITIVITY;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    });

    window.addEventListener('keydown', (e) => {
      this.pressed.add(e.code);
      if (e.code === 'KeyF') this.toggleFlyQueued = true;
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
  }

  /** Snapshot of input intents; consumes the one-frame fly-toggle edge. */
  getInput(): InputState {
    const state: InputState = {
      forward: this.pressed.has('KeyW'),
      back: this.pressed.has('KeyS'),
      left: this.pressed.has('KeyA'),
      right: this.pressed.has('KeyD'),
      up: this.pressed.has('Space'),
      down: this.pressed.has('ShiftLeft'),
      toggleFly: this.toggleFlyQueued,
    };
    this.toggleFlyQueued = false;
    return state;
  }

  /** Current look direction as a plain vector. */
  forward(): { x: number; y: number; z: number } {
    const v = new Vector3();
    this.camera.getWorldDirection(v);
    return { x: v.x, y: v.y, z: v.z };
  }

  /** Writes the eye position + look orientation to the camera. */
  applyEye(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }
}
