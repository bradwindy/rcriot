import * as THREE from 'three';

/** Slots handed each frame to the track's nearest fixed lights: torches, lamps, lava glow. */
export const POINT_LIGHTS = 8;
/** Extra light slots handed each frame to the nearest rockets, blasts, boosts, bolts and headlights. */
export const DYNAMIC_LIGHTS = 6;

/**
 * The PS1 look, per vertex where the console did it: positions snap to the low-res pixel grid (the wobble),
 * lighting and fog are worked out per vertex (Gouraud), and textures can skip perspective correction (affine warp).
 * Light is allowed above 1, like the console's 2x texture modulation.
 */
const vertexShader = /* glsl */ `
#define POINT_LIGHTS ${POINT_LIGHTS}
#define DYNAMIC_LIGHTS ${DYNAMIC_LIGHTS}
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
uniform vec3 uDynPos[DYNAMIC_LIGHTS];
uniform vec3 uDynColor[DYNAMIC_LIGHTS];
uniform float uDynRange[DYNAMIC_LIGHTS];
uniform int uDynCount;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFog;
uniform float uFogAmount;
uniform float uTime;
uniform float uWave;
uniform vec2 uScroll;
uniform float uSway;
uniform vec3 uSwayWeight;

varying vec4 vLight;
varying vec3 vAffineUv;
varying vec2 vUv;
varying float vFog;

vec3 point(vec3 pos, vec3 color, float range, vec3 at, vec3 n) {
  vec3 d = pos - at;
  float dist = length(d);
  float a = clamp(1.0 - dist / range, 0.0, 1.0);
  return color * (a * a * (0.35 + 0.65 * max(dot(n, d / max(dist, 1e-3)), 0.0)));
}

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (uWave > 0.0) {
    world.y += uWave * (sin(world.x * 0.09 + uTime * 1.1) + sin(world.z * 0.13 - uTime * 0.8));
  }
  if (uSway > 0.0) {
    // Wind: the free end of a leaf, blade, flag or sail moves, weighted by its uv, the root stays put.
    float w = clamp(uv.x * uSwayWeight.x + uv.y * uSwayWeight.y + uSwayWeight.z, 0.0, 1.0);
    float gust = sin(uTime * 2.1 + world.x * 0.35 + world.z * 0.2) + 0.5 * sin(uTime * 3.7 + world.z * 0.5);
    world.x += uSway * w * gust;
    world.z += uSway * w * 0.6 * cos(uTime * 1.7 + world.x * 0.3);
    world.y += uSway * w * 0.3 * sin(uTime * 4.3 + world.x);
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
    for (int i = 0; i < POINT_LIGHTS; i++) light += point(uPointPos[i], uPointColor[i], uPointRange[i], world.xyz, n);
    for (int i = 0; i < DYNAMIC_LIGHTS; i++) {
      if (i >= uDynCount) break;
      light += point(uDynPos[i], uDynColor[i], uDynRange[i], world.xyz, n);
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
uniform float uGlow;

varying vec4 vLight;
varying vec3 vAffineUv;
varying vec2 vUv;
varying float vFog;

void main() {
  vec2 uv = mix(vUv, vAffineUv.xy / vAffineUv.z, uAffine);
  vec4 tex = texture2D(map, uv);
  if (tex.a < uAlphaTest) discard;
  vec3 col = tex.rgb * uTint * vLight.rgb;
  // Glow pushes past white, into the range the bloom pass picks up.
  col = mix(min(col, vec3(1.0)) * (1.0 + uGlow), uFogColor, vFog);
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
  uDynPos: { value: Array.from({ length: DYNAMIC_LIGHTS }, () => new THREE.Vector3()) },
  uDynColor: { value: Array.from({ length: DYNAMIC_LIGHTS }, () => new THREE.Color()) },
  uDynRange: { value: new Array<number>(DYNAMIC_LIGHTS).fill(1) },
  uDynCount: { value: 0 },
  uFogNear: { value: 60 },
  uFogFar: { value: 300 },
  uFog: { value: 1 },
  uFogColor: { value: new THREE.Color(0.96, 0.78, 0.6) },
  uTime: { value: 0 },
};

/** A fixed light on the track. Change its colour or position and the next frame picks it up. */
/** The track's fog distance as a share of the draw distance setting. Murky tracks close it in. */
export const haze = { value: 1 };

export interface PointLight {
  position: THREE.Vector3;
  color: THREE.Color;
  range: number;
}

const fixed: PointLight[] = [];

/** A track can have as many fixed lights as it likes. Each frame the nearest few to the camera are lit. */
export function addPointLight(position: THREE.Vector3, color: THREE.Color, range: number): PointLight {
  const light = { position: position.clone(), color: color.clone(), range };
  fixed.push(light);
  return light;
}

/** Drops every fixed light, before another track is built. */
export function clearPointLights(): void {
  fixed.length = 0;
}

interface Offer {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  range: number;
  /** Distance added when ranking, so minor lights only take a slot when nothing bigger is near. */
  rank: number;
}

const offers: Offer[] = [];
let offered = 0;

/** Offers a light for this frame only. The nearest few to the camera get the dynamic slots. */
export function dynamicLight(x: number, y: number, z: number, color: THREE.Color, power: number, range: number, rank = 0): void {
  if (power <= 0) return;
  if (offered === offers.length) offers.push({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, range: 0, rank: 0 });
  Object.assign(offers[offered++], { x, y, z, r: color.r * power, g: color.g * power, b: color.b * power, range, rank });
}

const score = (f: Offer, eye: THREE.Vector3) => Math.hypot(f.x - eye.x, f.y - eye.y, f.z - eye.z) - f.range + f.rank;

const reach = (l: PointLight, eye: THREE.Vector3) => l.position.distanceTo(eye) - l.range;

/** Hands the fixed slots to the nearest fixed lights and the dynamic slots to this frame's nearest offers. */
export function flushLights(eye: THREE.Vector3): void {
  const near = fixed.length <= POINT_LIGHTS ? fixed : [...fixed].sort((a, b) => reach(a, eye) - reach(b, eye));
  for (let i = 0; i < POINT_LIGHTS; i++) {
    const l = near[i];
    if (l) {
      globals.uPointPos.value[i].copy(l.position);
      globals.uPointColor.value[i].copy(l.color);
      globals.uPointRange.value[i] = l.range;
    } else {
      globals.uPointPos.value[i].set(0, -9999, 0);
      globals.uPointColor.value[i].setRGB(0, 0, 0);
    }
  }
  // Lights well out of view cost every lit vertex a loop for nothing, so they get no slot.
  const live = offers
    .slice(0, offered)
    .filter((f) => score(f, eye) < 100)
    .sort((a, b) => score(a, eye) - score(b, eye));
  const n = Math.min(DYNAMIC_LIGHTS, live.length);
  for (let i = 0; i < n; i++) {
    const f = live[i];
    globals.uDynPos.value[i].set(f.x, f.y, f.z);
    globals.uDynColor.value[i].setRGB(f.r, f.g, f.b);
    globals.uDynRange.value[i] = f.range;
  }
  globals.uDynCount.value = n;
  offered = 0;
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
  /** Wind sway: how far the free end moves, and which way along the uvs is free (u, v, constant). */
  sway?: number;
  swayWeight?: [number, number, number];
  /** Share of the distance fog this material takes. */
  fog?: number;
  depthWrite?: boolean;
  /** Brightness past white, which blooms: 1 doubles it. */
  glow?: number;
  /** Adds onto what is behind, for sparks and fire. */
  additive?: boolean;
}

export type Ps1Material = THREE.ShaderMaterial;

export function ps1Material(o: Ps1Options): Ps1Material {
  const transparent = (o.transparent ?? false) || (o.additive ?? false);
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
      uSway: { value: o.sway ?? 0 },
      uSwayWeight: { value: new THREE.Vector3(...(o.swayWeight ?? [0, 1, 0])) },
      uFogAmount: { value: o.fog ?? 1 },
      uGlow: { value: o.glow ?? 0 },
    },
    vertexColors: o.vertexColors ?? false,
    transparent,
    depthWrite: o.depthWrite ?? !transparent,
    side: o.side ?? THREE.FrontSide,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
