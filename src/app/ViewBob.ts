export interface ViewBobOffset {
  x: number;
  y: number;
  z: number;
}

/** Stateful, stride-driven first-person camera bob with eased activation. */
export class ViewBob {
  private phase = 0;
  private amplitude = 0;

  step(dt: number, distance: number, active: boolean, yaw: number): ViewBobOffset {
    const target = active && distance > 0.0005 ? 1 : 0;
    this.amplitude += (target - this.amplitude) * Math.min(1, dt * 8);
    if (this.amplitude <= 0.002) return { x: 0, y: 0, z: 0 };

    this.phase += distance * 1.7;
    const lateral = Math.cos(this.phase) * 0.022 * this.amplitude;
    return {
      x: Math.cos(yaw) * lateral,
      y: Math.sin(this.phase * 2) * 0.042 * this.amplitude,
      z: -Math.sin(yaw) * lateral,
    };
  }
}
