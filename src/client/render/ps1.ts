import * as THREE from 'three';

export const POINT_LIGHTS = 8;

/**
 * The PS1 look, per vertex where the console did it: positions snap to the low-res pixel grid (the wobble),
 * lighting and fog are worked out per vertex (Gouraud), and textures can skip perspective correction (affine warp).
 * Light is allowed above 1, like the console's 2x texture modulation.
 */
const vertexShader = /* glsl */ `
#define POINT_LIGHTS ${POINT_LIGHTS}
uniform vec2 uSnap;
uniform float uLit;
uniform float uShade;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyLight;
uniform vec3 uGroundLight;
uniform vec3 uPointPos[POINT_LIGHTS];
uniform vec3 uPointColor[POINT_LIGHTS];
uniform float uPointRange[POINT_LIGHTS];
uniform float uFogNear;
uniform float uFogFar;
uniform float uFog;
uniform float uFogAmount;
uniform float uTime;
uniform float uWave;
uniform vec2 uScroll;

varying vec4 vLight;
varying vec3 vAffineUv;
varying vec2 vUv;
varying float vFog;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (uWave > 0.0) {
    world.y += uWave * (sin(world.x * 0.09 + uTime * 1.1) + sin(world.z * 0.13 - uTime * 0.8));
  }
  vec4 view = viewMatrix * world;
  vec4 clip = projectionMatrix * view;
  if (uSnap.x > 0.0 && clip.w > 0.0) {
    vec2 grid = uSnap * 0.5;
    clip.xy = round(clip.xy / clip.w * grid) / grid * clip.w;
  }
  gl_Position = clip;

  vec3 light = vec3(1.0);
  if (uLit > 0.5) {
    vec3 n = normalize(mat3(modelMatrix) * normal);
    light = mix(uGroundLight, uSkyLight, n.y * 0.5 + 0.5) * mix(0.25, 1.0, uShade);
    light += uSunColor * (max(dot(n, uSunDir), 0.0) * uShade);
    for (int i = 0; i < POINT_LIGHTS; i++) {
      vec3 d = uPointPos[i] - world.xyz;
      float dist = length(d);
      float a = clamp(1.0 - dist / uPointRange[i], 0.0, 1.0);
      light += uPointColor[i] * (a * a * (0.35 + 0.65 * max(dot(n, d / max(dist, 1e-3)), 0.0)));
    }
  }
  vec4 base = vec4(1.0);
#if defined(USE_COLOR_ALPHA)
  base = color;
#elif defined(USE_COLOR)
  base.rgb = color;
#endif
  vLight = vec4(base.rgb * light, base.a);

  vec2 uvs = uv + uScroll * uTime;
  vUv = uvs;
  vAffineUv = vec3(uvs * clip.w, clip.w);
  vFog = uFog * uFogAmount * clamp((-view.z - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
uniform vec3 uTint;
uniform vec3 uFogColor;
uniform float uAffine;
uniform float uAlphaTest;
uniform float uOpacity;

varying vec4 vLight;
varying vec3 vAffineUv;
varying vec2 vUv;
varying float vFog;

void main() {
  vec2 uv = mix(vUv, vAffineUv.xy / vAffineUv.z, uAffine);
  vec4 tex = texture2D(map, uv);
  if (tex.a < uAlphaTest) discard;
  vec3 col = tex.rgb * uTint * vLight.rgb;
  col = mix(min(col, vec3(1.0)), uFogColor, vFog);
  gl_FragColor = vec4(col, tex.a * vLight.a * uOpacity);
}
`;

/** Shared by every PS1 material, so one write updates the whole scene. */
export const globals = {
  uSnap: { value: new THREE.Vector2() },
  uAffine: { value: 1 },
  uSunDir: { value: new THREE.Vector3(-0.62, 0.42, 0.45).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
  uSkyLight: { value: new THREE.Color(0.5, 0.56, 0.7) },
  uGroundLight: { value: new THREE.Color(0.42, 0.34, 0.28) },
  uPointPos: { value: Array.from({ length: POINT_LIGHTS }, () => new THREE.Vector3(0, -9999, 0)) },
  uPointColor: { value: Array.from({ length: POINT_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  uPointRange: { value: new Array<number>(POINT_LIGHTS).fill(1) },
  uFogNear: { value: 60 },
  uFogFar: { value: 300 },
  uFog: { value: 1 },
  uFogColor: { value: new THREE.Color(0.96, 0.78, 0.6) },
  uTime: { value: 0 },
};

export interface PointLight {
  index: number;
  position: THREE.Vector3;
  color: THREE.Color;
}

let lightCount = 0;

export function addPointLight(position: THREE.Vector3, color: THREE.Color, range: number): PointLight | null {
  if (lightCount >= POINT_LIGHTS) return null;
  const index = lightCount++;
  globals.uPointPos.value[index].copy(position);
  globals.uPointColor.value[index].copy(color);
  globals.uPointRange.value[index] = range;
  return { index, position: globals.uPointPos.value[index], color: globals.uPointColor.value[index] };
}

export interface Ps1Options {
  map: THREE.Texture;
  tint?: THREE.ColorRepresentation;
  /** False draws at full brightness: skies, flames, lamps. */
  lit?: boolean;
  /** How much sunlight reaches it, 0 to 1. Low inside the cave and the wreck. */
  shade?: number;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  side?: THREE.Side;
  wave?: number;
  scroll?: [number, number];
  /** Share of the distance fog this material takes. */
  fog?: number;
  depthWrite?: boolean;
}

export type Ps1Material = THREE.ShaderMaterial;

export function ps1Material(o: Ps1Options): Ps1Material {
  const transparent = o.transparent ?? false;
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ...globals,
      map: { value: o.map },
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
      uLit: { value: o.lit === false ? 0 : 1 },
      uShade: { value: o.shade ?? 1 },
      uAlphaTest: { value: o.alphaTest ?? 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uWave: { value: o.wave ?? 0 },
      uScroll: { value: new THREE.Vector2(...(o.scroll ?? [0, 0])) },
      uFogAmount: { value: o.fog ?? 1 },
    },
    vertexColors: o.vertexColors ?? false,
    transparent,
    depthWrite: o.depthWrite ?? !transparent,
    side: o.side ?? THREE.FrontSide,
  });
}
