/** Sky/sun state for a time of day t in [0,1): 0 = midnight, 0.25 = sunrise, 0.5 = noon. */
export interface SkyState {
  /** Sky + fog color, 0-255. */
  sky: [number, number, number];
  /** Unit sun direction: rises in +X at 0.25, peaks at 0.5, sets in -X at 0.75; y < 0 at night. */
  sun: [number, number, number];
  /**
   * Direction the strongest light comes from: the sun by day, the moon (opposite point of the
   * arc) at night. Never dips below the horizon, so shading always has a usable key light.
   */
  light: [number, number, number];
  /**
   * Directional-shading strength 0..1: full under a high sun, 0 across the horizon crossings
   * (twilight light is diffuse — this also hides the 180-degree sun-to-moon flip), capped under
   * moonlight so night shading reads softer than day.
   */
  dirStrength: number;
  /**
   * Luminance-neutral tint of the directional light: warm gold at low sun (golden hour), cool
   * blue under the moon, white at noon. Pre-faded toward white by dirStrength so the tint
   * vanishes exactly when the directional term does.
   */
  lightColor: [number, number, number];
  /** Overall brightness multiplier, ~0.16 (night) .. 1 (day). */
  daylight: number;
}

type RGB = readonly [number, number, number];

const NIGHT: RGB = [16, 20, 44];
const DAY: RGB = [135, 206, 235];
const GLOW: RGB = [240, 150, 90]; // sunrise/sunset horizon

// Tilt of the sun's arc off vertical (~24 deg): noon light lands high but not dead overhead,
// so vertical faces still get modeled instead of flattening to one shade.
const ARC_TILT = 0.42;
// Directional light tints, luminance-normalized (luma ~= 1) so they recolor without brightening.
const WHITE: RGB = [1, 1, 1];
const SUN_GOLD: RGB = [1.35, 0.93, 0.61];
const MOON_BLUE: RGB = [0.93, 0.98, 1.15];
// Moonlight models shapes at 60% of the sun's strength.
const MOON_DIR_STRENGTH = 0.6;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: RGB, b: RGB, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Pure day/night model. The sun rides a tilted great-circle arc; brightness follows its elevation. */
export function skyState(t: number): SkyState {
  const day = ((t % 1) + 1) % 1;
  const ang = (day - 0.25) * Math.PI * 2; // sunrise at 0.25
  const elevation = Math.sin(ang); // -1 midnight .. +1 noon

  const daylight = 0.16 + 0.84 * smoothstep(-0.15, 0.35, elevation);

  let sky = mix(NIGHT, DAY, smoothstep(-0.1, 0.3, elevation));
  const glow = Math.max(0, 1 - Math.abs(elevation) * 5) * smoothstep(-0.25, 0.15, elevation);
  sky = mix(sky, GLOW, glow * 0.5);

  // Great-circle arc rising in +X, tilted toward +Z. Unit length by construction:
  // cos^2 + (sin*cosT)^2 + (sin*sinT)^2 = 1.
  const sun: [number, number, number] = [
    Math.cos(ang),
    elevation * Math.cos(ARC_TILT),
    elevation * Math.sin(ARC_TILT),
  ];
  const isDay = sun[1] >= 0;
  const light: [number, number, number] = isDay ? sun : [-sun[0], -sun[1], -sun[2]];

  const dirStrength = smoothstep(0, 0.18, Math.abs(sun[1])) * (isDay ? 1 : MOON_DIR_STRENGTH);

  const tint = isDay ? mix(WHITE, SUN_GOLD, 1 - smoothstep(0.12, 0.55, sun[1])) : MOON_BLUE;
  const lightColor = mix(WHITE, tint, dirStrength);

  return {
    sky: [Math.round(sky[0]), Math.round(sky[1]), Math.round(sky[2])],
    sun,
    light,
    dirStrength,
    lightColor,
    daylight,
  };
}
