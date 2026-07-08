import { Color, SRGBColorSpace, Vector3, type RawShaderMaterial, type Scene } from 'three';
import { skyState } from './Sky';

/** Drives the sky color, sun direction, and daylight uniforms from a time of day in [0,1). */
export class DayNight {
  time: number;
  dayLengthSec: number;
  private readonly background = new Color();

  constructor(
    private readonly scene: Scene,
    private readonly materials: RawShaderMaterial[],
    time = 0.3,
    dayLengthSec = 600,
  ) {
    this.time = time;
    this.dayLengthSec = dayLengthSec;
    this.scene.background = this.background;
    this.apply();
  }

  /** Sets the absolute time of day (wraps to [0,1)). */
  set(t: number): void {
    this.time = ((t % 1) + 1) % 1;
    this.apply();
  }

  /** Advances by `dt` seconds of real time scaled to the configured day length. */
  advance(dt: number): void {
    this.set(this.time + dt / this.dayLengthSec);
  }

  private apply(): void {
    const s = skyState(this.time);
    const r = s.sky[0] / 255;
    const g = s.sky[1] / 255;
    const b = s.sky[2] / 255;
    // skyState colors are display-sRGB. The chunk shader takes them raw (RawShaderMaterial has no
    // output transform), but scene.background is color-managed: the renderer converts it
    // working→sRGB at clear time, so the space must be declared here or the sky clears brighter
    // than the fog and the horizon seams (night: fog 16,20,44 vs sky 71,79,115).
    this.background.setRGB(r, g, b, SRGBColorSpace);
    for (const m of this.materials) {
      (m.uniforms.uLightDir.value as Vector3).set(s.sun[0], s.sun[1], s.sun[2]);
      (m.uniforms.uFogColor.value as Vector3).set(r, g, b);
      // Sky-tint ambient reads its own uniform, deliberately separate from uFogColor so the
      // underwater fog override (applyUnderwater) can't corrupt the surface lighting hue.
      (m.uniforms.uSkyColor.value as Vector3).set(r, g, b);
      m.uniforms.uDayLight.value = s.daylight;
    }
  }
}
