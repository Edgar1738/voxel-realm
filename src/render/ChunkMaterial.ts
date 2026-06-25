import { RawShaderMaterial, GLSL3, Vector3, type DataArrayTexture } from 'three';

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

out vec2 vUv;
out float vLayer;
out float vAo;
out vec3 vNormal;
out vec3 vViewPos;

void main() {
  vUv = uv;
  vLayer = layer;
  vAo = ao;
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

in vec2 vUv;
in float vLayer;
in float vAo;
in vec3 vNormal;
in vec3 vViewPos;

out vec4 fragColor;

void main() {
  vec3 base = texture(uTex, vec3(vUv, vLayer)).rgb;
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  float light = (0.45 + 0.55 * diff) * vAo;
  vec3 color = base * light;
  float dist = length(vViewPos);
  float fog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  color = mix(color, uFogColor, fog);
  fragColor = vec4(color, 1.0);
}
`;

export function createChunkMaterial(tex: DataArrayTexture): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    uniforms: {
      uTex: { value: tex },
      uLightDir: { value: new Vector3(0.5, 1.0, 0.3).normalize() },
      uFogColor: { value: new Vector3(0.529, 0.725, 0.91) },
      uFogNear: { value: 40 },
      uFogFar: { value: 220 },
    },
    vertexShader,
    fragmentShader,
  });
}
