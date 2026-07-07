import { RawShaderMaterial, GLSL3, Vector3, DoubleSide, type DataArrayTexture } from 'three';

/** Headlamp reach in blocks; the glow fades to zero at this distance from the eye. */
export const HEADLAMP_RADIUS = 13;

const vertexShader = /* glsl */ `
precision highp float;
precision highp int;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uTime;
uniform float uSwayAmp;

in vec3 position;
in vec3 normal;
in vec2 uv;
in float layer;
in float ao;
in float light;
in vec3 tint;

out vec2 vUv;
out float vLayer;
out float vAo;
out float vLight;
out vec3 vTint;
out vec3 vNormal;
out vec3 vViewPos;
out vec3 vWorldPos;
out vec3 vWorldNormal;

void main() {
  vUv = uv;
  vLayer = layer;
  vAo = ao;
  vLight = light;
  vTint = tint;
  vNormal = normalize(normalMatrix * normal);
  // World-space normal for hemispheric ambient + water top-face masking. Chunk meshes are
  // translation-only (no rotation/scale), so mat3(modelMatrix) is a plain basis; the plant
  // sway below only displaces position, never the normal.
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  // Wind sway for cutout plants: tops (uv.y=1) lean, roots stay planted. World-position
  // phase keeps neighboring plants out of lockstep. uSwayAmp is 0 on non-plant passes.
  float sway = uSwayAmp * uv.y;
  worldPos.x += sway * sin(uTime * 1.7 + worldPos.x * 0.9 + worldPos.z * 1.3);
  worldPos.z += sway * cos(uTime * 1.3 + worldPos.z * 0.8 + worldPos.x * 1.1);
  vWorldPos = worldPos;
  vec4 mv = viewMatrix * vec4(worldPos, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform mat4 viewMatrix;
uniform sampler2DArray uTex;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
uniform float uDayLight;
uniform float uAlphaTest;
uniform float uTorch;
uniform float uTorchRadius;
uniform float uTime;
uniform float uWaveAmp;
uniform float uAoStrength;
uniform vec3 uSkyColor;
uniform float uAmbientStrength;
uniform vec3 uWaterDeep;
uniform float uWaterDepthTint;
uniform float uFresnelPower;
uniform float uFresnelTint;
uniform float uSpecStrength;

in vec2 vUv;
in float vLayer;
in float vAo;
in float vLight;
in vec3 vTint;
in vec3 vNormal;
in vec3 vViewPos;
in vec3 vWorldPos;
in vec3 vWorldNormal;

out vec4 fragColor;

void main() {
  vec4 texel = texture(uTex, vec3(vUv, vLayer));
  if (uAlphaTest > 0.0 && texel.a < uAlphaTest) discard;
  vec3 base = texel.rgb * vTint;
  // Water surface treatment (transparent pass only; uWaveAmp is 0 on every other pass):
  // the two-sine shimmer, a deep-blue depth tint, and a sky-tinted grazing-angle rim.
  // fres (view-angle fresnel) is reused for the alpha and to gate the glint further down.
  float fres = 0.0;
  if (uWaveAmp > 0.0) {
    float wave = sin(vWorldPos.x * 1.6 + vWorldPos.z * 0.7 + uTime * 1.4) *
                 sin(vWorldPos.z * 1.9 - vWorldPos.x * 0.5 + uTime * 1.1);
    base *= 1.0 + uWaveAmp * wave;
    vec3 Nv = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    fres = pow(1.0 - clamp(dot(Nv, V), 0.0, 1.0), uFresnelPower);
    base = mix(base, uWaterDeep, uWaterDepthTint);
    base = mix(base, uSkyColor, fres * uFresnelTint);
  }
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  // unpack baked light: sky dims with day/night, block (lanterns) stays bright
  float sky = floor(vLight / 16.0) / 15.0;
  float block = mod(vLight, 16.0) / 15.0;
  float dist = length(vViewPos);
  // headlamp: camera-centered glow, quantized to the 15 baked-light steps so it
  // reads as voxel light. The camera is the emitter, so every visible fragment
  // has line-of-sight to it — no shadowing needed.
  float torch = uTorch * clamp(1.0 - dist / uTorchRadius, 0.0, 1.0);
  torch = floor(torch * 15.0) / 15.0;
  float level = max(max(sky * uDayLight, max(block, torch)), 0.06);
  // uAoStrength: dev-tunable AO intensity (0 = off, 1 = baked value, >1 exaggerated).
  float aoFactor = clamp(mix(1.0, vAo, uAoStrength), 0.0, 1.0);
  float shade = (0.45 + 0.55 * diff) * aoFactor;
  // Hemispheric ambient: sky hue on up-faces, warmer/darker below, keyed by WORLD up.
  // Luminance-normalized (divide by hemi's luma) so it only RECOLORS and never adds
  // brightness -- baked light level stays the sole brightness driver, so caves stay dark
  // and lanterns stay bright. uAmbientStrength = 0 collapses tintMul to 1.0 (legacy look).
  float up = clamp(vWorldNormal.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 hemi = mix(uSkyColor * 0.55 + vec3(0.06, 0.05, 0.04), uSkyColor, up);
  vec3 hueTint = hemi / max(dot(hemi, vec3(0.299, 0.587, 0.114)), 1e-3);
  vec3 ambient = hueTint * mix(0.72, 1.0, up);
  vec3 tintMul = mix(vec3(1.0), ambient, uAmbientStrength);
  vec3 color = base * tintMul * shade * level;
  // Water sun glint: a Blinn-Phong highlight confined to top faces in daylight, so night
  // and underwater water stay calm. Sky-tinted so the sparkle matches the time of day.
  if (uWaveAmp > 0.0) {
    vec3 Nv = normalize(vNormal);
    vec3 V = normalize(-vViewPos);
    vec3 Lv = normalize((viewMatrix * vec4(normalize(uLightDir), 0.0)).xyz);
    vec3 H = normalize(V + Lv);
    float spec = pow(max(dot(Nv, H), 0.0), 48.0);
    float topMask = smoothstep(0.5, 0.9, vWorldNormal.y);
    color += uSpecStrength * spec * topMask * uDayLight * mix(vec3(1.0), uSkyColor, 0.3);
  }
  float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  color = mix(color, uFogColor, fog);
  // Water alpha varies with view angle: near-transparent looking straight down (fres≈0
  // keeps uAlpha), opaque/reflective at grazing angles (fres→1).
  float outAlpha = uAlpha;
  if (uWaveAmp > 0.0) outAlpha = mix(uAlpha, 1.0, fres);
  fragColor = vec4(color, outAlpha);
}
`;

/** Plant-top lean in blocks; subtle — a breeze, not a gale. */
export const PLANT_SWAY_AMP = 0.05;
/** Water brightness ripple amplitude (fraction of base color). */
export const WATER_WAVE_AMP = 0.1;

interface MaterialOpts {
  alpha?: number;
  transparent?: boolean;
  doubleSide?: boolean;
  alphaTest?: number;
  swayAmp?: number;
  waveAmp?: number;
}

function buildMaterial(tex: DataArrayTexture, opts: MaterialOpts = {}): RawShaderMaterial {
  const {
    alpha = 1.0,
    transparent = false,
    doubleSide = false,
    alphaTest = 0,
    swayAmp = 0,
    waveAmp = 0,
  } = opts;
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      uTex: { value: tex },
      uLightDir: { value: new Vector3(0.5, 1.0, 0.3).normalize() },
      uFogColor: { value: new Vector3(0.529, 0.725, 0.91) },
      uFogNear: { value: 40 },
      uFogFar: { value: 220 },
      uAlpha: { value: alpha },
      uDayLight: { value: 1.0 },
      uAlphaTest: { value: alphaTest },
      uTorch: { value: 0.0 },
      uTorchRadius: { value: HEADLAMP_RADIUS },
      uTime: { value: 0.0 },
      uSwayAmp: { value: swayAmp },
      uWaveAmp: { value: waveAmp },
      uAoStrength: { value: 1.0 },
      // Sky-tint ambient (Part 1): default matches the fog color; DayNight overwrites it live.
      uSkyColor: { value: new Vector3(0.529, 0.725, 0.91) },
      uAmbientStrength: { value: 0.35 },
      // Water polish (Part 2): deep depth tint, grazing fresnel, and sun glint strength.
      uWaterDeep: { value: new Vector3(0.05, 0.16, 0.32) },
      uWaterDepthTint: { value: 0.35 },
      uFresnelPower: { value: 4.0 },
      uFresnelTint: { value: 0.5 },
      uSpecStrength: { value: 0.6 },
    },
    vertexShader,
    fragmentShader,
  });
  material.transparent = transparent;
  if (transparent) material.depthWrite = false;
  if (doubleSide) material.side = DoubleSide;
  return material;
}

export function createChunkMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex);
}

/** Translucent material for the transparent pass (water/glass; drawn after opaque, no depth write). */
export function createTransparentMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex, {
    alpha: 0.72,
    transparent: true,
    doubleSide: true,
    waveAmp: WATER_WAVE_AMP,
  });
}

/** Cutout material for plants: opaque + depth-writing, double-sided, with an alpha-test discard. */
export function createCutoutMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex, {
    alpha: 1.0,
    doubleSide: true,
    alphaTest: 0.5,
    swayAmp: PLANT_SWAY_AMP,
  });
}

/** Advances the shared animation clock (plant sway, water shimmer). Call once per frame. */
export function applyTime(materials: readonly RawShaderMaterial[], seconds: number): void {
  for (const m of materials) {
    m.uniforms.uTime.value = seconds;
  }
}
