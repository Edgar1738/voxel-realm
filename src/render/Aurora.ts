import {
  AdditiveBlending,
  DoubleSide,
  GLSL3,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  Vector3,
  type Scene,
} from 'three';
import { skyState } from './Sky';
import { SNOW, DIRTY_SNOW, BLUE_ICE } from '../blocks/blocks';

/** Ground blocks that put the camera "in aurora country". */
export function auroraGround(id: number): boolean {
  return id === SNOW || id === DIRTY_SNOW || id === BLUE_ICE;
}

const CURTAIN_W = 1100;
const CURTAIN_H = 170;
const CURTAIN_Y = 235;
const CURTAIN_DIST = 420; // hung to the north of the camera

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
uniform float uStrength;
in vec2 vUv;
out vec4 fragColor;

float ahash(vec2 i) {
  uvec2 q = uvec2(ivec2(i));
  uint h = q.x * 0x27d4eb2du ^ q.y * 0x165667b1u ^ 0x51d0e7u;
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  return float(h ^ (h >> 13u)) * (1.0 / 4294967296.0);
}
float anoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ahash(i), ahash(i + vec2(1, 0)), u.x),
             mix(ahash(i + vec2(0, 1)), ahash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  if (uStrength < 0.005) discard;
  // Slowly swaying curtains: two noise octaves drive the column density, a phase term
  // makes the folds crawl sideways the way aurora sheets billow.
  float x = vUv.x * 7.0;
  float curtain = anoise(vec2(x, uTime * 0.045)) * 0.6 +
                  anoise(vec2(x * 2.3 + 11.0, uTime * 0.075)) * 0.4;
  float band = smoothstep(0.34, 0.72, curtain);
  // Bright lower hem fading upward, hem height wobbling with the folds.
  float vert = smoothstep(0.02, 0.22, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y + curtain * 0.35));
  float edge = smoothstep(0.0, 0.12, vUv.x) * (1.0 - smoothstep(0.88, 1.0, vUv.x));
  float a = band * vert * edge * uStrength * 0.55;
  // Green hem rising into teal then violet — the classic aurora gradient.
  vec3 col = mix(vec3(0.15, 0.95, 0.5), vec3(0.45, 0.35, 0.95), clamp(vUv.y * 1.5 - 0.15 + curtain * 0.25, 0.0, 1.0));
  fragColor = vec4(col, a);
}
`;

/**
 * A northern-lights curtain hung high to the north of the camera, visible only on
 * proper nights while standing in snow/ice country (Frostvale, tundra, high peaks).
 * Strength eases in and out so walking off a snowfield fades the lights rather than
 * snapping them off. Additive, so it layers over the star field.
 */
export class Aurora {
  private readonly mesh: Mesh;
  private readonly material: RawShaderMaterial;
  private strength = 0;

  constructor(private readonly scene: Scene) {
    this.material = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: {
        uTime: { value: 0 },
        uStrength: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.mesh = new Mesh(new PlaneGeometry(CURTAIN_W, CURTAIN_H), this.material);
    this.mesh.renderOrder = -6; // over stars/clouds, still behind terrain via depth
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(
    dt: number,
    cameraPos: Vector3,
    time: number,
    inAuroraLand: boolean,
    elapsed: number,
  ): void {
    const s = skyState(time);
    const night = Math.max(0, Math.min(1, 1 - s.daylight * 1.6)); // matches the star fade
    const target = inAuroraLand ? 1 : 0;
    const rate = target > this.strength ? 0.12 : 0.25; // fades out faster than it blooms
    this.strength +=
      Math.sign(target - this.strength) * Math.min(Math.abs(target - this.strength), rate * dt);

    const power = this.strength * night;
    this.material.uniforms.uStrength.value = power;
    this.material.uniforms.uTime.value = elapsed;
    this.mesh.visible = power > 0.005;
    this.mesh.position.set(cameraPos.x, CURTAIN_Y, cameraPos.z - CURTAIN_DIST);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
