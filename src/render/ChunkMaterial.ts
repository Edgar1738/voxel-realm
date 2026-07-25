import {
  RawShaderMaterial,
  GLSL3,
  Vector3,
  DoubleSide,
  type DataArrayTexture,
  type Texture,
} from 'three';

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
uniform sampler2D uTexMeta;
uniform float uVariation;
uniform vec3 uLightDir;
uniform float uDirStrength;
uniform vec3 uLightColor;
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

// ---------------------------------------------------------------------------
// Per-voxel texture variation + regional color drift (opaque/transparent passes
// only; uVariation is 0 on the cutout pass, whose swayed vWorldPos is inexact).
// All hashes work on integer world coordinates, so the result is deterministic
// across chunks, remeshes, and reloads, and greedy merge quads stay untouched —
// variation happens per FRAGMENT, never in the mesh.
// ---------------------------------------------------------------------------
uint hashU(uvec3 v, uint salt) {
  uint h = v.x * 0x27d4eb2du ^ v.y * 0x165667b1u ^ v.z * 0x9e3779b1u ^ salt * 0x85ebca6bu;
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return h ^ (h >> 16u);
}
float hash2f(vec2 i, uint salt) {
  uvec2 q = uvec2(ivec2(i));
  return float(hashU(uvec3(q, 0u), salt)) * (1.0 / 4294967296.0);
}
// Smooth 2D value noise on world coordinates (regional drift; period-free).
float vnoise(vec2 p, uint salt) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash2f(i, salt);
  float b = hash2f(i + vec2(1.0, 0.0), salt);
  float c = hash2f(i + vec2(0.0, 1.0), salt);
  float d = hash2f(i + vec2(1.0, 1.0), salt);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  float driftId = 0.0;
  vec4 texel;
  if (uVariation > 0.5) {
    // Per-layer material metadata: R = variant count, G = drift class, B = rotate flag.
    vec4 meta = texelFetch(uTexMeta, ivec2(int(vLayer + 0.5), 0), 0) * 255.0;
    driftId = meta.g;
    float texLayer = vLayer;
    vec2 texUv = vUv;
    if (meta.r > 1.5 || meta.b > 0.5) {
      // The owning voxel: a face fragment sits on an integer plane along its normal,
      // so stepping half a block against the normal lands inside the solid block.
      uvec3 voxel = uvec3(ivec3(floor(vWorldPos - vWorldNormal * 0.5 + 1e-4)));
      if (meta.r > 1.5) {
        // Variant layers are painted contiguously after their group base.
        texLayer = vLayer + floor(min(float(hashU(voxel, 0x51u) & 255u) * (1.0 / 256.0) * meta.r, meta.r - 1.0));
      }
      if (meta.b > 0.5) {
        // One of 8 orientations per voxel (transpose + mirrors), isotropic tiles only.
        uint o = hashU(voxel, 0x9du) & 7u;
        vec2 f = fract(vUv);
        if ((o & 1u) != 0u) f = f.yx;
        if ((o & 2u) != 0u) f.x = 1.0 - f.x;
        if ((o & 4u) != 0u) f.y = 1.0 - f.y;
        texUv = f;
      }
    }
    // Explicit gradients from the ORIGINAL quad UVs: fract()/flips are discontinuous at
    // voxel borders and would otherwise spike the implicit derivatives into a wrong mip.
    texel = textureGrad(uTex, vec3(texUv, texLayer), dFdx(vUv), dFdy(vUv));
  } else {
    texel = texture(uTex, vec3(vUv, vLayer));
  }
  if (uAlphaTest > 0.0 && texel.a < uAlphaTest) discard;
  vec3 base = texel.rgb * vTint;
  // Regional color drift: two octaves of low-frequency world-space noise sweep broad
  // warm/cool + light/dark patches across natural materials, so meadows, canopies and
  // rock faces stop reading as one flat sheet. Deliberately gentle — palette identity
  // stays with the textures and biome tints.
  if (driftId > 0.5) {
    float n = vnoise(vWorldPos.xz * (1.0 / 96.0), 0x2fu) * 0.6 +
              vnoise(vWorldPos.xz * (1.0 / 384.0), 0xb1u) * 0.4;
    float d = n - 0.5;
    if (driftId < 2.5) {
      // grass (1) / foliage (2): warm/cool hue drift plus gentle value drift.
      base *= mix(vec3(0.93, 1.0, 1.03), vec3(1.06, 1.02, 0.9), n);
      base *= 1.0 + d * 0.12;
    } else {
      // soil (3) / stone (4): value-only drift, slightly stronger on soil.
      base *= 1.0 + d * (driftId < 3.5 ? 0.14 : 0.1);
    }
  }
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
  // Diffuse sun/moon term in world space: uLightDir is world-space, so it must pair with
  // vWorldNormal (vNormal is view-space and would make shading swim as the camera turns).
  float diff = max(dot(normalize(vWorldNormal), normalize(uLightDir)), 0.0);
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
  // uDirStrength fades the directional term to a flat mid-value (0.6 ~ hemisphere-average
  // diff) at twilight; uLightColor tints only this term, so golden-hour warmth never leaks
  // into caves or lantern light. Brightness stays driven solely by the baked light level.
  float dir = mix(0.6, diff, uDirStrength);
  vec3 shade = (vec3(0.45) + 0.55 * dir * uLightColor) * aoFactor;
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
  /**
   * Enable per-voxel texture variation + regional color drift. Off for the cutout pass:
   * its vWorldPos is displaced by plant sway, and thin alpha-tested blades don't benefit.
   */
  variation?: boolean;
}

function buildMaterial(
  tex: DataArrayTexture,
  metaTex: Texture | null,
  opts: MaterialOpts = {},
): RawShaderMaterial {
  const {
    alpha = 1.0,
    transparent = false,
    doubleSide = false,
    alphaTest = 0,
    swayAmp = 0,
    waveAmp = 0,
    variation = false,
  } = opts;
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      uTex: { value: tex },
      uTexMeta: { value: metaTex },
      uVariation: { value: variation && metaTex ? 1.0 : 0.0 },
      uLightDir: { value: new Vector3(0.5, 1.0, 0.3).normalize() },
      // Sun-arc lighting: DayNight overwrites these live (dirStrength dips at twilight,
      // lightColor goes gold at low sun / cool blue under the moon).
      uDirStrength: { value: 1.0 },
      uLightColor: { value: new Vector3(1, 1, 1) },
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

export function createChunkMaterial(
  tex: DataArrayTexture,
  metaTex: Texture | null = null,
): RawShaderMaterial {
  return buildMaterial(tex, metaTex, { variation: true });
}

/** Translucent material for the transparent pass (water/glass; drawn after opaque, no depth write). */
export function createTransparentMaterial(
  tex: DataArrayTexture,
  metaTex: Texture | null = null,
): RawShaderMaterial {
  return buildMaterial(tex, metaTex, {
    alpha: 0.72,
    transparent: true,
    doubleSide: true,
    waveAmp: WATER_WAVE_AMP,
    variation: true,
  });
}

/** Cutout material for plants: opaque + depth-writing, double-sided, with an alpha-test discard. */
export function createCutoutMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex, null, {
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
