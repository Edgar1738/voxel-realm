import {
  DoubleSide,
  GLSL3,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  Vector2,
  Vector3,
  type Scene,
} from 'three';
import { skyState } from './Sky';
import type { WeatherKind } from '../app/weatherSchedule';

/** Cloud deck altitude — above every build but inside the camera's far plane. */
const CLOUD_Y = 178;
/** Plane span; the deck recenters on the camera, so this only bounds the visible disc. */
const CLOUD_SPAN = 1500;

/** Target sky coverage (0..1) per weather kind — clear keeps scattered fair-weather puffs. */
export function cloudCoverFor(kind: WeatherKind): number {
  if (kind === 'storm') return 0.9;
  if (kind === 'rain') return 0.72;
  if (kind === 'snow') return 0.62;
  return 0.32;
}

const vertexShader = /* glsl */ `
precision highp float;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uCover;
uniform vec3 uColor;
uniform float uShade;
uniform vec2 uCenter;
in vec2 vUv;
out vec4 fragColor;

float chash(vec2 i) {
  uvec2 q = uvec2(ivec2(i));
  uint h = q.x * 0x27d4eb2du ^ q.y * 0x165667b1u ^ 0x9e3779b1u;
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return float(h ^ (h >> 16u)) * (1.0 / 4294967296.0);
}
float cnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = chash(i);
  float b = chash(i + vec2(1.0, 0.0));
  float c = chash(i + vec2(0.0, 1.0));
  float d = chash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  // World-fixed coordinates: the plane recenters on the camera but the pattern does not
  // move with it, so clouds hang over PLACES and drift only with the wind term.
  vec2 wp = uCenter + (vUv - 0.5) * ${CLOUD_SPAN.toFixed(1)};
  vec2 wind = uTime * vec2(1.6, 0.55);
  vec2 p = (wp + wind) * (1.0 / 96.0);
  // Three octaves with a gentle domain warp: cumulus masses, not wallpaper noise.
  vec2 warp = vec2(cnoise(p * 0.5 + uTime * 0.002), cnoise(p * 0.5 + 7.3 - uTime * 0.0017)) - 0.5;
  float n = cnoise(p * 0.5 + warp * 1.3) * 0.55 +
            cnoise(p * 1.1 + warp * 0.8) * 0.3 +
            cnoise(p * 2.3) * 0.15;
  float thr = mix(0.64, 0.30, uCover);
  float body = smoothstep(thr, thr + 0.16, n);
  if (body < 0.004) discard;
  // Radial fade so the deck dissolves before the plane's rim can read as an edge.
  float rim = 1.0 - smoothstep(0.32, 0.5, length(vUv - 0.5));
  float alpha = body * rim * 0.88;
  // Flat-bottom shading: denser cloud reads darker underneath.
  vec3 col = uColor * mix(1.0, uShade, smoothstep(thr + 0.05, thr + 0.4, n));
  fragColor = vec4(col, alpha);
}
`;

/**
 * A drifting procedural cloud deck: one camera-following plane high over the world whose
 * pattern lives in WORLD space (clouds hang over places; the wind, not the player, moves
 * them). Coverage eases toward the weather's target — storms roll in, they don't pop —
 * and color follows the day/night sky so night clouds go dark instead of glowing.
 */
export class Clouds {
  private readonly mesh: Mesh;
  private readonly material: RawShaderMaterial;
  private cover = 0.32;

  constructor(private readonly scene: Scene) {
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: {
        uTime: { value: 0 },
        uCover: { value: this.cover },
        uColor: { value: new Vector3(1, 1, 1) },
        uShade: { value: 0.82 },
        uCenter: { value: new Vector2() },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new PlaneGeometry(CLOUD_SPAN, CLOUD_SPAN), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = CLOUD_Y;
    this.mesh.renderOrder = -7; // after the celestial sprites (-10..-8), under everything else
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Eases coverage toward the weather target and follows the camera + day/night palette. */
  update(dt: number, cameraPos: Vector3, time: number, kind: WeatherKind, elapsed: number): void {
    const target = cloudCoverFor(kind);
    const rate = 0.08; // coverage shifts over ~10s — fronts roll in, they don't pop
    this.cover +=
      Math.sign(target - this.cover) * Math.min(Math.abs(target - this.cover), rate * dt);

    this.mesh.position.x = cameraPos.x;
    this.mesh.position.z = cameraPos.z;
    (this.material.uniforms.uCenter.value as Vector2).set(cameraPos.x, cameraPos.z);

    const s = skyState(time);
    // Day: warm white. Night: dim slate so the deck silhouettes against stars. Storms mute.
    const brightness = 0.16 + 0.84 * s.daylight;
    const mute = kind === 'storm' ? 0.62 : kind === 'rain' ? 0.8 : 1.0;
    const col = this.material.uniforms.uColor.value as Vector3;
    col.set(1.0 * brightness * mute, 0.99 * brightness * mute, 1.02 * brightness * mute);
    this.material.uniforms.uShade.value = kind === 'storm' ? 0.6 : 0.82;
    this.material.uniforms.uCover.value = this.cover;
    this.material.uniforms.uTime.value = elapsed;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
