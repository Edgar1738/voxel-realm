import { overlapsSolid, resolveCollision, type SoliditySampler } from './Collision';
import type { Vec3 } from '../core/types';

/** Per-frame input intents (booleans; `toggleFly` is a one-frame edge). */
export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean; // Space: fly up / jump / swim up
  down: boolean; // Shift: fly down / sink
  /** Double-tap-W sprint intent; only applies while walking forward on land. */
  sprint: boolean;
  toggleFly: boolean;
}

/** The world the player queries: solidity (for collision) plus water (for swimming). */
export interface PlayerWorld extends SoliditySampler {
  isWater(x: number, y: number, z: number): boolean;
  /** Creative-safe viscous lava. Optional so legacy samplers remain valid. */
  isLava?(x: number, y: number, z: number): boolean;
  /** Whether the cell hosts a climbable block (ladder). Optional for older samplers/tests. */
  isClimbable?(x: number, y: number, z: number): boolean;
  /**
   * Whether the cell hosts a barrier (fence/wall/gate/door) — 1.5-tall shapes that exist to
   * be impassable. Mantling refuses to grab them, or every fence in every world stops working.
   */
  isBarrier?(x: number, y: number, z: number): boolean;
}

/** Player collision half-extents around the body center (exported for placement guards). */
export const PLAYER_HALF: Vec3 = { x: 0.3, y: 0.9, z: 0.3 };
const HALF = PLAYER_HALF;
const EYE_OFFSET = 0.7; // eye height above body center (~1.6 above feet)

const WALK_SPEED = 5.5;
const SPRINT_SPEED = 7.7; // Minecraft's ~1.4x walk
const FLY_SPEED = 30;
const GRAVITY = -28;
const JUMP_VELOCITY = 9;

const SWIM_SPEED = 3.3; // ~0.6x walk
const SWIM_VERTICAL = 4; // Space up / Shift down speed in water
const SWIM_SINK = 1.2; // gentle buoyant sink with no input
const LAVA_SPEED = 1.8;
const LAVA_VERTICAL = 2.1;
const LAVA_SINK = 0.55;

const CLIMB_SPEED = 4; // ladder up (forward/Space) and down (Shift)
const CLIMB_SLIDE = 1.5; // gentle slide when idle on a ladder (Minecraft-style)
const CLIMB_HORIZONTAL = 2.5; // slow sideways shuffle while hanging on

/** Mantle: a ledge top at most this far above the feet is grabbable (jump apex ≈ +1.45). */
const MANTLE_REACH = 1.1;
/** Only grab near/after the jump apex — grabbing at launch reads as teleporting. */
const MANTLE_MAX_VY = 2;

/** Owns the player's position/velocity and integrates input + physics each frame. */
export class PlayerController {
  readonly position: Vec3;
  flying: boolean;
  grounded = false;
  /** True while sprint speed is actually applied this frame (drives the camera FOV kick). */
  sprinting = false;
  /** True while the player's body intersects lava; used for creative-safe heat feedback. */
  inLava = false;
  private vy = 0;
  /** Armed by a jump, consumed by one mantle — never fires from a walk-off or a plain fall. */
  private mantleArmed = false;

  constructor(spawn: Vec3, flying: boolean) {
    this.position = { ...spawn };
    this.flying = flying;
  }

  /** Eye position for the camera (above the body center). */
  eye(): Vec3 {
    return { x: this.position.x, y: this.position.y + EYE_OFFSET, z: this.position.z };
  }

  update(dt: number, input: InputState, yaw: number, world: PlayerWorld): void {
    if (input.toggleFly) {
      this.flying = !this.flying;
      this.vy = 0;
    }

    const feetY = this.position.y - HALF.y;
    const headY = this.position.y + HALF.y;
    const submerged =
      !this.flying &&
      (world.isWater(Math.floor(this.position.x), Math.floor(feetY), Math.floor(this.position.z)) ||
        world.isWater(Math.floor(this.position.x), Math.floor(headY), Math.floor(this.position.z)));
    this.inLava =
      (world.isLava?.(
        Math.floor(this.position.x),
        Math.floor(feetY),
        Math.floor(this.position.z),
      ) ??
        false) ||
      (world.isLava?.(
        Math.floor(this.position.x),
        Math.floor(headY),
        Math.floor(this.position.z),
      ) ??
        false);
    const movingInLava = !this.flying && this.inLava;
    // On a ladder when the body column overlaps a climbable cell (ladders have no collision
    // box, so the check is the whole cell — grabbing feels generous, like Minecraft).
    const climbable = (y: number): boolean =>
      world.isClimbable?.(
        Math.floor(this.position.x),
        Math.floor(y),
        Math.floor(this.position.z),
      ) ?? false;
    const onLadder =
      !this.flying &&
      !submerged &&
      !movingInLava &&
      (climbable(feetY) || climbable(this.position.y));

    // Horizontal direction from yaw (forward = -Z at yaw 0, right = +X at yaw 0).
    const fwd: Vec3 = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
    const right: Vec3 = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
    const iz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);

    let mx = fwd.x * iz + right.x * ix;
    let mz = fwd.z * iz + right.z * ix;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }

    this.sprinting =
      !this.flying &&
      !submerged &&
      !movingInLava &&
      !onLadder &&
      input.sprint &&
      input.forward &&
      !input.back;
    const speed = this.flying
      ? FLY_SPEED
      : submerged
        ? SWIM_SPEED
        : movingInLava
          ? LAVA_SPEED
          : onLadder
            ? CLIMB_HORIZONTAL
            : this.sprinting
              ? SPRINT_SPEED
              : WALK_SPEED;
    const delta: Vec3 = { x: mx * speed * dt, y: 0, z: mz * speed * dt };

    if (this.flying) {
      const vs = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      delta.y = vs * FLY_SPEED * dt;
      this.vy = 0;
    } else if (movingInLava) {
      if (input.up) this.vy = LAVA_VERTICAL;
      else if (input.down) this.vy = -LAVA_VERTICAL;
      else this.vy = -LAVA_SINK;
      delta.y = this.vy * dt;
    } else if (onLadder) {
      // Forward or Space climbs, Shift descends, idle slides down slowly. Gravity is
      // suspended while hanging on, so letting go of the keys never means a plummet.
      if (input.forward || input.up) this.vy = CLIMB_SPEED;
      else if (input.down) this.vy = -CLIMB_SPEED;
      else this.vy = -CLIMB_SLIDE;
      delta.y = this.vy * dt;
    } else if (submerged) {
      if (input.up) this.vy = SWIM_VERTICAL;
      else if (input.down) this.vy = -SWIM_VERTICAL;
      else this.vy = -SWIM_SINK; // gentle buoyant sink
      delta.y = this.vy * dt;
    } else {
      if (this.grounded) this.mantleArmed = false;
      if (input.up && this.grounded) {
        this.vy = JUMP_VELOCITY;
        this.mantleArmed = true;
      }
      this.vy += GRAVITY * dt;
      delta.y = this.vy * dt;
      // Mantle: after a jump, pushing forward near/past the apex with a grabbable ledge
      // ahead — pull up onto it, once per jump. Step-up already covers 1-block climbs on
      // the ground; this adds the jump-and-grab for 2-block walls.
      if (
        this.mantleArmed &&
        !this.grounded &&
        input.forward &&
        this.vy <= MANTLE_MAX_VY &&
        len > 0.001
      ) {
        if (this.tryMantle(world, mx / Math.min(len, 1), mz / Math.min(len, 1))) {
          this.mantleArmed = false;
          delta.x = 0;
          delta.y = 0;
          delta.z = 0;
        }
      }
    }

    const res = resolveCollision(world, this.position, HALF, delta, this.grounded);
    this.position.x = res.center.x;
    this.position.y = res.center.y;
    this.position.z = res.center.z;
    this.grounded = this.flying || submerged || movingInLava ? false : res.grounded;
    if (res.grounded && this.vy < 0) this.vy = 0;
  }

  /**
   * Attempts to grab the ledge one cell ahead along the unit direction (nx,nz): the highest
   * collision-box top within MANTLE_REACH of the feet. Refuses barrier cells, and only
   * commits when the body fits standing on the ledge. Returns whether the pull-up happened.
   */
  private tryMantle(world: PlayerWorld, nx: number, nz: number): boolean {
    const feetY = this.position.y - HALF.y;
    const grabX = this.position.x + nx * (HALF.x + 0.45);
    const grabZ = this.position.z + nz * (HALF.z + 0.45);
    const cellX = Math.floor(grabX);
    const cellZ = Math.floor(grabZ);
    let ledgeTop = -Infinity;
    for (let y = Math.max(0, Math.floor(feetY)); y <= Math.floor(feetY + MANTLE_REACH); y++) {
      if (world.isBarrier?.(cellX, y, cellZ)) return false;
      for (const b of world.collisionBoxes(cellX, y, cellZ)) {
        if (grabX < b[0] || grabX > b[3] || grabZ < b[2] || grabZ > b[5]) continue;
        if (b[4] > feetY + 0.05 && b[4] <= feetY + MANTLE_REACH && b[4] > ledgeTop) ledgeTop = b[4];
      }
    }
    if (ledgeTop === -Infinity) return false;
    const target: Vec3 = {
      x: this.position.x + nx * 0.2,
      y: ledgeTop + HALF.y + 0.002,
      z: this.position.z + nz * 0.2,
    };
    if (overlapsSolid(world, target, HALF)) return false;
    this.position.x = target.x;
    this.position.y = target.y;
    this.position.z = target.z;
    this.vy = 0;
    return true;
  }
}
