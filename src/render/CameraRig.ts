import { Euler, Vector3, type PerspectiveCamera } from 'three';
import type { InputState } from '../player/PlayerController';
import type { Vec3 } from '../core/types';

const SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.01;

/** How far the third-person camera trails behind the eye, before obstruction clipping. */
export const THIRD_PERSON_DISTANCE = 4;

/** Which viewpoint the render camera uses; `first` is the classic eye-in-head view. */
export type CameraMode = 'first' | 'third';

/**
 * Look direction for a given yaw/pitch, matching the camera's YXZ forward: −Z at yaw 0,
 * +Y when pitched up. This is the single source of truth for the look convention, so the
 * interaction ray (aim.ts) and the third-person offset stay aligned with the first-person view
 * even when the render camera is pulled back off the eye.
 */
export function lookDirectionFromYawPitch(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) };
}

/**
 * Owns pointer-lock mouse-look and keyboard input, and writes the player's eye transform
 * to the camera. Yaw/pitch use a YXZ euler so look direction matches PlayerController's
 * yaw convention (forward = -Z at yaw 0).
 */
export class CameraRig {
  yaw = 0;
  pitch = 0;
  locked = false;
  mode: CameraMode = 'first';

  private readonly pressed = new Set<string>();
  private toggleFlyQueued = false;
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly inputController = new AbortController();

  constructor(
    private readonly camera: PerspectiveCamera,
    canvas: HTMLCanvasElement,
    private readonly overlay?: HTMLElement,
    private readonly isInputBlocked: () => boolean = () => false,
  ) {
    const signal = this.inputController.signal;

    // Listen on document, not the canvas: the fullscreen overlay sits on top of the
    // canvas and would otherwise swallow the click before it reaches requestPointerLock.
    // Embedded webviews (e.g. IDE preview panels) deny pointer lock outright — surface
    // that on the overlay instead of failing silently.
    const showLockError = (): void => {
      if (this.overlay) {
        this.overlay.textContent =
          'Mouse capture is blocked in this embedded view — open the game in a regular ' +
          'browser tab (e.g. http://localhost:5173) to play.';
      }
    };
    document.addEventListener(
      'click',
      () => {
        if (this.locked) return;
        // Chrome returns a promise; older engines return undefined and report failures
        // via the pointerlockerror event instead.
        const request = canvas.requestPointerLock() as Promise<void> | undefined;
        void request?.catch(showLockError);
      },
      { signal },
    );
    document.addEventListener('pointerlockerror', showLockError, { signal });

    document.addEventListener(
      'pointerlockchange',
      () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) {
          this.pressed.clear();
          this.toggleFlyQueued = false;
        }
        if (this.overlay) this.overlay.style.display = this.locked ? 'none' : 'flex';
      },
      { signal },
    );

    document.addEventListener(
      'mousemove',
      (e) => {
        if (!this.locked) return;
        this.yaw -= e.movementX * SENSITIVITY;
        this.pitch -= e.movementY * SENSITIVITY;
        this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
      },
      { signal },
    );

    window.addEventListener(
      'keydown',
      (e) => {
        this.pressed.add(e.code);
        if (e.code === 'KeyF') this.toggleFlyQueued = true;
      },
      { signal },
    );
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code), { signal });
  }

  /** Removes all event listeners registered by this rig. */
  dispose(): void {
    this.inputController.abort();
  }

  /** Snapshot of input intents; consumes the one-frame fly-toggle edge. */
  getInput(): InputState {
    if (!this.locked || this.isInputBlocked()) {
      this.toggleFlyQueued = false;
      return {
        forward: false,
        back: false,
        left: false,
        right: false,
        up: false,
        down: false,
        toggleFly: false,
      };
    }

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

  /** Flips between first- and third-person and returns the new mode. */
  toggleMode(): CameraMode {
    this.mode = this.mode === 'first' ? 'third' : 'first';
    return this.mode;
  }

  /** Writes the eye position + look orientation to the camera (first-person snap). */
  applyEye(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  /**
   * Positions the render camera for the current mode. Orientation is always the yaw/pitch look
   * (identical in both modes, so the crosshair keeps pointing along the aim ray). First-person
   * sits the camera at the eye — byte-identical to {@link applyEye}. Third-person pulls it
   * straight back along −look by `thirdDistance` (already obstruction-clipped by the caller).
   */
  applyPlayerView(eye: Vec3, thirdDistance = THIRD_PERSON_DISTANCE): void {
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
    if (this.mode === 'first') {
      this.camera.position.set(eye.x, eye.y, eye.z);
      return;
    }
    const dir = lookDirectionFromYawPitch(this.yaw, this.pitch);
    this.camera.position.set(
      eye.x - dir.x * thirdDistance,
      eye.y - dir.y * thirdDistance,
      eye.z - dir.z * thirdDistance,
    );
  }
}
