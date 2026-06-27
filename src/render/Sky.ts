/** Sky/sun state for a time of day t in [0,1): 0 = midnight, 0.25 = sunrise, 0.5 = noon. */
export interface SkyState {
  /** Sky + fog color, 0-255. */
  sky: [number, number, number];
  /** Normalized-ish sun/light direction (the shader normalizes it). */
  sun: [number, number, number];
  /** Overall brightness multiplier, ~0.16 (night) .. 1 (day). */
  daylight: number;
}

type RGB = readonly [number, number, number];

const NIGHT: RGB = [16, 20, 44];
const DAY: RGB = [135, 206, 235];
const GLOW: RGB = [240, 150, 90]; // sunrise/sunset horizon

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mix(a: RGB, b: RGB, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Pure day/night model. Sun azimuth rotates with time; brightness follows its elevation. */
export function skyState(t: number): SkyState {
  const day = ((t % 1) + 1) % 1;
  const ang = (day - 0.25) * Math.PI * 2; // sunrise at 0.25
  const elevation = Math.sin(ang); // -1 midnight .. +1 noon

  const daylight = 0.16 + 0.84 * smoothstep(-0.15, 0.35, elevation);

  let sky = mix(NIGHT, DAY, smoothstep(-0.1, 0.3, elevation));
  const glow = Math.max(0, 1 - Math.abs(elevation) * 5) * smoothstep(-0.25, 0.15, elevation);
  sky = mix(sky, GLOW, glow * 0.5);

  // Keep the light coming from above so shading reads; only azimuth rotates.
  const sun: [number, number, number] = [Math.cos(ang) * 0.5, 0.85, Math.sin(ang) * 0.5];

  return {
    sky: [Math.round(sky[0]), Math.round(sky[1]), Math.round(sky[2])],
    sun,
    daylight,
  };
}
