import { STRIDE_LENGTH, landingVolume } from './sounds';

export interface MovementSoundEvents {
  /** A footstep is due this frame (stride distance walked while grounded). */
  stepped: boolean;
  /** Landing thud volume [0..1]; 0 = no landing (or too soft to hear). */
  landed: number;
}

/**
 * Pure per-frame tracker deriving footstep and landing events from player motion.
 * Steps fire every {@link STRIDE_LENGTH} blocks of grounded horizontal travel; a landing
 * fires on the airborne→grounded edge with volume scaled by the fall speed just before
 * impact. Flying and swimming are silent (the controller reports grounded=false there).
 */
export class MovementSoundTracker {
  private prevX: number | undefined;
  private prevY = 0;
  private prevZ = 0;
  private prevGrounded = false;
  private strideDistance = 0;
  private fallSpeed = 0;

  update(dt: number, x: number, y: number, z: number, grounded: boolean): MovementSoundEvents {
    if (this.prevX === undefined || dt <= 0) {
      this.prevX = x;
      this.prevY = y;
      this.prevZ = z;
      this.prevGrounded = grounded;
      return { stepped: false, landed: 0 };
    }

    const events: MovementSoundEvents = { stepped: false, landed: 0 };

    if (!grounded) {
      const downSpeed = (this.prevY - y) / dt;
      if (downSpeed > 0) this.fallSpeed = downSpeed;
      this.strideDistance = 0;
    } else {
      if (!this.prevGrounded) {
        events.landed = landingVolume(this.fallSpeed);
        this.fallSpeed = 0;
      }
      this.strideDistance += Math.hypot(x - this.prevX, z - this.prevZ);
      if (this.strideDistance >= STRIDE_LENGTH) {
        this.strideDistance -= STRIDE_LENGTH;
        events.stepped = true;
      }
    }

    this.prevX = x;
    this.prevY = y;
    this.prevZ = z;
    this.prevGrounded = grounded;
    return events;
  }
}
