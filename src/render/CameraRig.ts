import { Euler, Vector3, type PerspectiveCamera } from 'three';
import type { InputState } from '../player/PlayerController';
import type { Vec3 } from '../core/types';

/** Base radians-per-pixel; the player's sensitivity setting is a multiplier on this. */
export const BASE_LOOK_SENSITIVITY = 0.0025;
const PITCH_LIMIT = Math.PI / 2 - 0.01;
/** Two W presses within this window arm sprint (Minecraft's classic double-tap). */
const DOUBLE_TAP_MS = 300;
const PHOTO_MIN_SPEED = 2;
const PHOTO_MAX_SPEED = 96;
const PHOTO_SPEED_STEP = 2;

/** Next photo-mode fly speed for a wheel delta (scroll up = faster), clamped to a sane range. */
export function photoSpeedStep(speed: number, deltaY: number): number {
  const next = speed + (deltaY < 0 ? PHOTO_SPEED_STEP : -PHOTO_SPEED_STEP);
  return Math.max(PHOTO_MIN_SPEED, Math.min(PHOTO_MAX_SPEED, next));
}

/**
 * Clamps a photo-camera position to a sphere of `range` around `anchor` (the player's eye).
 * Streaming stays player-anchored during photo mode, so the camera must not out-fly the
 * loaded ring — beyond it there is only fog and ungenerated void.
 */
export function clampToRange(pos: Vec3, anchor: Vec3, range: number): Vec3 {
  const dx = pos.x - anchor.x;
  const dy = pos.y - anchor.y;
  const dz = pos.z - anchor.z;
  const d = Math.hypot(dx, dy, dz);
  if (d <= range || d === 0) return pos;
  const s = range / d;
  return { x: anchor.x + dx * s, y: anchor.y + dy * s, z: anchor.z + dz * s };
}

/** How far the third-person camera trails behind the eye, before obstruction clipping. */
export const THIRD_PERSON_DISTANCE = 4;

/** Which viewpoint the player camera uses; photo mode is tracked separately. */
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
  photoMode = false;

  private sensitivity = BASE_LOOK_SENSITIVITY;
  private invertY = false;
  private readonly pressed = new Set<string>();
  private toggleFlyQueued = false;
  /** Sprint arms on a double-tap of W (Ctrl+W closes browser tabs) and drops on W release. */
  private sprinting = false;
  private lastForwardTapMs = -Infinity;
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly inputController = new AbortController();
  private photoYaw = 0;
  private photoPitch = 0;
  private photoSpeed = 12;
  private photoLastFrameMs = performance.now();
  private photoReturnMode: CameraMode = 'third';
  /** Max camera distance from the player's eye; Game keeps this inside the loaded chunk ring. */
  private photoRange = Infinity;

  /** Detached-camera look, for aiming scene-direction keys (NPC pose/animation) in photo mode. */
  photoLook(): { yaw: number; pitch: number } {
    return { yaw: this.photoYaw, pitch: this.photoPitch };
  }

  constructor(
    private readonly camera: PerspectiveCamera,
    canvas: HTMLCanvasElement,
    private readonly overlay?: HTMLElement,
    private readonly isInputBlocked: () => boolean = () => false,
  ) {
    const signal = this.inputController.signal;

    // Listen on the canvas, not the document: the fullscreen overlay is click-through
    // (pointer-events: none in index.html), so world clicks land on the canvas while HUD
    // clicks land on their controls and must NOT grab the mouse — otherwise every toolbar
    // click captures the cursor (and when capture is denied, e.g. embedded webviews, the
    // overlay used to stay up and swallow the whole toolbar).
    const showLockError = (): void => {
      if (this.overlay) {
        this.overlay.textContent =
          'Mouse capture is blocked in this embedded view — menus and toolbar still work; ' +
          'open the game in a regular browser tab (e.g. http://localhost:5173) for mouse-look.';
      }
    };
    canvas.addEventListener(
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
    // Detached photo mode is observation-only: swallow world clicks before edit/NPC handlers.
    canvas.addEventListener(
      'mousedown',
      (e) => {
        if (!this.photoMode) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      { capture: true, signal },
    );
    canvas.addEventListener(
      'contextmenu',
      (e) => {
        if (!this.photoMode) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      { capture: true, signal },
    );
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.photoMode) return;
        // Claim the wheel outright: without stopImmediatePropagation the hotbar/reach
        // wheel handler (registered later on the same canvas) would also fire.
        e.preventDefault();
        e.stopImmediatePropagation();
        this.photoSpeed = photoSpeedStep(this.photoSpeed, e.deltaY);
      },
      { capture: true, passive: false, signal },
    );
    document.addEventListener('pointerlockerror', showLockError, { signal });

    document.addEventListener(
      'pointerlockchange',
      () => {
        this.locked = document.pointerLockElement === canvas;
        if (!this.locked) {
          this.pressed.clear();
          this.toggleFlyQueued = false;
          this.sprinting = false;
        }
        if (this.overlay) this.overlay.style.display = this.locked ? 'none' : 'flex';
      },
      { signal },
    );

    document.addEventListener(
      'mousemove',
      (e) => {
        if (!this.locked) return;
        const dPitch = e.movementY * this.sensitivity;
        if (this.photoMode) {
          this.photoYaw -= e.movementX * this.sensitivity;
          this.photoPitch -= this.invertY ? -dPitch : dPitch;
          this.photoPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.photoPitch));
          return;
        }
        this.yaw -= e.movementX * this.sensitivity;
        this.pitch -= this.invertY ? -dPitch : dPitch;
        this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
      },
      { signal },
    );

    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code === 'F2') {
          e.preventDefault();
          // Enter only from live gameplay (pointer locked, no menu/dialog up); exit always works.
          if (!e.repeat && (this.photoMode || (this.locked && !this.isInputBlocked()))) {
            this.togglePhotoMode();
          }
          return;
        }
        // Double-tap detection needs the fresh-press edge, so check before pressed.add
        // (held-key auto-repeat also arrives as keydown and must not count as a tap).
        if (!this.photoMode && e.code === 'KeyW' && !this.pressed.has('KeyW')) {
          const now = performance.now();
          if (now - this.lastForwardTapMs < DOUBLE_TAP_MS) this.sprinting = true;
          this.lastForwardTapMs = now;
        }
        this.pressed.add(e.code);
        if (!this.photoMode && e.code === 'KeyF') this.toggleFlyQueued = true;
      },
      { signal },
    );
    window.addEventListener(
      'keyup',
      (e) => {
        this.pressed.delete(e.code);
        if (e.code === 'KeyW') this.sprinting = false;
      },
      { signal },
    );
  }

  /** Removes all event listeners registered by this rig. */
  dispose(): void {
    this.inputController.abort();
  }

  /** Applies look preferences live. `sensitivityMultiplier` scales the base radians-per-pixel. */
  setLookSettings(opts: { sensitivityMultiplier?: number; invertY?: boolean }): void {
    if (opts.sensitivityMultiplier !== undefined) {
      this.sensitivity = BASE_LOOK_SENSITIVITY * opts.sensitivityMultiplier;
    }
    if (opts.invertY !== undefined) this.invertY = opts.invertY;
  }

  /** Snapshot of input intents; consumes the one-frame fly-toggle edge. */
  getInput(): InputState {
    if (!this.locked || this.isInputBlocked() || this.photoMode) {
      this.toggleFlyQueued = false;
      this.sprinting = false;
      return {
        forward: false,
        back: false,
        left: false,
        right: false,
        up: false,
        down: false,
        sprint: false,
        toggleFly: false,
      };
    }

    const forward = this.pressed.has('KeyW');
    const state: InputState = {
      forward,
      back: this.pressed.has('KeyS'),
      left: this.pressed.has('KeyA'),
      right: this.pressed.has('KeyD'),
      up: this.pressed.has('Space'),
      down: this.pressed.has('ShiftLeft'),
      sprint: this.sprinting && forward,
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
    if (this.photoMode) this.exitPhotoMode();
    this.mode = this.mode === 'first' ? 'third' : 'first';
    return this.mode;
  }

  /**
   * Enter/exit an independent flying camera while leaving the player frozen in place.
   * The photo camera has no collision (it may pass through blocks by design) but is kept
   * within {@link setPhotoRange} of the player so it never leaves the loaded chunk ring.
   */
  togglePhotoMode(): boolean {
    if (this.photoMode) {
      this.exitPhotoMode();
      return false;
    }
    this.photoReturnMode = this.mode;
    this.mode = 'third';
    this.photoMode = true;
    this.photoYaw = this.yaw;
    this.photoPitch = this.pitch;
    this.photoLastFrameMs = performance.now();
    this.pressed.clear();
    this.toggleFlyQueued = false;
    this.sprinting = false;
    return true;
  }

  private exitPhotoMode(): void {
    this.photoMode = false;
    this.mode = this.photoReturnMode;
    this.pressed.clear();
    this.photoLastFrameMs = performance.now();
  }

  /** Max photo-camera distance from the player's eye (world units); Infinity disables the clamp. */
  setPhotoRange(range: number): void {
    this.photoRange = range;
  }

  private updatePhotoCamera(eye: Vec3): void {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.photoLastFrameMs) / 1000));
    this.photoLastFrameMs = now;
    this.euler.set(this.photoPitch, this.photoYaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
    if (!this.locked || this.isInputBlocked()) return;

    const forward = lookDirectionFromYawPitch(this.photoYaw, this.photoPitch);
    const right = { x: Math.cos(this.photoYaw), z: -Math.sin(this.photoYaw) };
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (this.pressed.has('KeyW')) {
      dx += forward.x;
      dy += forward.y;
      dz += forward.z;
    }
    if (this.pressed.has('KeyS')) {
      dx -= forward.x;
      dy -= forward.y;
      dz -= forward.z;
    }
    if (this.pressed.has('KeyD')) {
      dx += right.x;
      dz += right.z;
    }
    if (this.pressed.has('KeyA')) {
      dx -= right.x;
      dz -= right.z;
    }
    if (this.pressed.has('Space')) dy += 1;
    if (this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight')) dy -= 1;
    const length = Math.hypot(dx, dy, dz);
    if (length === 0) return;
    const distance = this.photoSpeed * dt;
    const next = clampToRange(
      {
        x: this.camera.position.x + (dx / length) * distance,
        y: this.camera.position.y + (dy / length) * distance,
        z: this.camera.position.z + (dz / length) * distance,
      },
      eye,
      this.photoRange,
    );
    this.camera.position.set(next.x, next.y, next.z);
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
    if (this.photoMode) {
      this.updatePhotoCamera(eye);
      return;
    }
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
