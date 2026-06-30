import { RawShaderMaterial, GLSL3, Vector3, DoubleSide, type DataArrayTexture } from 'three';

const vertexShader = /* glsl */ `
precision highp float;
precision highp int;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

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

void main() {
  vUv = uv;
  vLayer = layer;
  vAo = ao;
  vLight = light;
  vTint = tint;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2DArray uTex;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlpha;
uniform float uDayLight;
uniform float uAlphaTest;

in vec2 vUv;
in float vLayer;
in float vAo;
in float vLight;
in vec3 vTint;
in vec3 vNormal;
in vec3 vViewPos;

out vec4 fragColor;

void main() {
  vec4 texel = texture(uTex, vec3(vUv, vLayer));
  if (uAlphaTest > 0.0 && texel.a < uAlphaTest) discard;
  vec3 base = texel.rgb * vTint;
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  // unpack baked light: sky dims with day/night, block (lanterns) stays bright
  float sky = floor(vLight / 16.0) / 15.0;
  float block = mod(vLight, 16.0) / 15.0;
  float level = max(max(sky * uDayLight, block), 0.06);
  float shade = (0.45 + 0.55 * diff) * vAo;
  vec3 color = base * shade * level;
  float dist = length(vViewPos);
  float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  color = mix(color, uFogColor, fog);
  fragColor = vec4(color, uAlpha);
}
`;

interface MaterialOpts {
  alpha?: number;
  transparent?: boolean;
  doubleSide?: boolean;
  alphaTest?: number;
}

function buildMaterial(tex: DataArrayTexture, opts: MaterialOpts = {}): RawShaderMaterial {
  const { alpha = 1.0, transparent = false, doubleSide = false, alphaTest = 0 } = opts;
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
  return buildMaterial(tex, { alpha: 0.72, transparent: true, doubleSide: true });
}

/** Cutout material for plants: opaque + depth-writing, double-sided, with an alpha-test discard. */
export function createCutoutMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return buildMaterial(tex, { alpha: 1.0, doubleSide: true, alphaTest: 0.5 });
}
