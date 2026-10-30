import * as THREE from 'three';
import type { Fx } from '../settings';
import { globals } from './ps1';

/**
 * Renders the scene into a low-res buffer, then draws that buffer onto the screen. Colour is cut to 15 bits with the
 * PS1's own 4x4 ordered dither. The CRT pass then plays the part of a composite cable and a cheap TV: each line smears
 * sideways (which melts the dither, as it did on real sets), red and blue drift apart, bright areas glow, every buffer
 * row becomes a scanline beam that swells when bright, and grain and a dark edge sit on top. No barrel curvature.
 */
const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uBits;
uniform float uDither;
uniform float uBlur;
uniform float uFringe;
uniform float uScan;
uniform float uGlow;
uniform float uGrain;
uniform float uVignette;
uniform float uMask;
uniform float uRoll;
uniform float uTime;
varying vec2 vUv;

const float BAYER[16] = float[16](-4.0, 0.0, -3.0, 1.0, 2.0, -2.0, 3.0, -1.0, -3.0, 1.0, -4.0, 0.0, 3.0, -1.0, 2.0, -2.0);

vec3 pixel(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(uRes) - 1);
  vec3 c = texelFetch(tScene, p, 0).rgb;
  if (uBits < 8.0) {
    float d = uDither * BAYER[(p.x & 3) + (p.y & 3) * 4];
    float levels = exp2(uBits);
    c = floor(clamp(c * 255.0 + d, 0.0, 255.0) / (256.0 / levels)) / (levels - 1.0);
  }
  return c;
}

vec3 smear(float x, int y, float sigma) {
  float cx = x - 0.5;
  int x0 = int(floor(cx));
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int k = -3; k <= 4; k++) {
    float d = float(x0 + k) - cx;
    float w = exp(-d * d / (2.0 * sigma * sigma));
    sum += pixel(ivec2(x0 + k, y)) * w;
    total += w;
  }
  return sum / total;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 px = vUv * uRes;
  if (uBlur <= 0.0) {
    gl_FragColor = vec4(pixel(ivec2(px)), 1.0);
    return;
  }
  int y = int(px.y);
  vec3 c = vec3(smear(px.x + uFringe, y, uBlur).r, smear(px.x, y, uBlur).g, smear(px.x - uFringe, y, uBlur).b);
  vec3 halo = smear(px.x, y, 1.8);
  c += halo * uGlow * smoothstep(0.35, 1.0, dot(halo, vec3(0.3, 0.59, 0.11)));

  // One beam per buffer row while rows are big enough to see. Above 540 rows the lines would only shimmer.
  float rows = uRes.y <= 540.0 ? uRes.y : 270.0;
  float f = fract(vUv.y * rows) - 0.5;
  float w = mix(0.26, 0.42, clamp(dot(c, vec3(0.3, 0.59, 0.11)), 0.0, 1.0));
  float beam = exp(-f * f / (2.0 * w * w)) / (w * 2.5066);
  c *= mix(1.0, beam, uScan);

  float band = exp(-pow(fract(uTime * 0.09) * 1.4 - 0.2 - (1.0 - vUv.y), 2.0) * 50.0);
  c *= 1.0 + uRoll * band;
  c += (hash(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * uGrain;
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 2.2;
  if (uMask > 0.0) {
    vec3 mask = vec3(1.0 - uMask);
    mask[int(gl_FragCoord.x) % 3] = 1.0 + uMask;
    c *= mask;
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const CRT: Record<Fx['crt'], Record<string, number>> = {
  off: { uBlur: 0, uFringe: 0, uScan: 0, uGlow: 0, uGrain: 0, uVignette: 0, uMask: 0, uRoll: 0 },
  soft: { uBlur: 0.5, uFringe: 0.3, uScan: 0.4, uGlow: 0.12, uGrain: 0.035, uVignette: 0.18, uMask: 0, uRoll: 0 },
  strong: { uBlur: 0.75, uFringe: 0.6, uScan: 0.65, uGlow: 0.22, uGrain: 0.07, uVignette: 0.3, uMask: 0.15, uRoll: 0.05 },
};

const WOBBLE: Record<Fx['wobble'], number> = { off: 0, subtle: 0.5, ps1: 1, heavy: 2 };

export class Pipeline {
  readonly target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  private readonly material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tScene: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uBits: { value: 5 },
      uDither: { value: 1 },
      uTime: globals.uTime,
      ...Object.fromEntries(Object.entries(CRT.off).map(([k, v]) => [k, { value: v }])),
    },
    depthTest: false,
    depthWrite: false,
  });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private view = { x: 0, y: 0, w: 1, h: 1 };
  private cssW = 1;
  private cssH = 1;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    renderer.autoClear = false;
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  get size(): { w: number; h: number } {
    return { w: this.target.width, h: this.target.height };
  }

  resize(cssW: number, cssH: number, dpr: number, fx: Fx, camera: THREE.PerspectiveCamera): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, false);
    const aspect = fx.aspect === 'classic' ? 4 / 3 : cssW / cssH;
    let w = cssW;
    let h = cssW / aspect;
    if (h > cssH) {
      h = cssH;
      w = cssH * aspect;
    }
    this.view = { x: (cssW - w) / 2, y: (cssH - h) / 2, w, h };
    const bh = fx.resolution > 0 ? fx.resolution : Math.round(h * dpr);
    const bw = Math.round(bh * aspect);
    this.target.setSize(bw, bh);
    this.material.uniforms.uRes.value.set(bw, bh);
    const wobble = WOBBLE[fx.wobble];
    globals.uSnap.value.set(wobble ? bw / wobble : 0, wobble ? bh / wobble : 0);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  apply(fx: Fx): void {
    this.material.uniforms.uBits.value = fx.colour === 'full' ? 8 : 5;
    this.material.uniforms.uDither.value = fx.colour === 'dithered' ? 1 : 0;
    for (const [k, v] of Object.entries(CRT[fx.crt])) this.material.uniforms[k].value = v;
    document.body.dataset.crt = fx.crt;
    globals.uAffine.value = fx.affine ? 1 : 0;
    globals.uFog.value = fx.fog ? 1 : 0;
    globals.uFogFar.value = fx.drawDistance;
    globals.uFogNear.value = fx.drawDistance * 0.2;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.setViewport(0, 0, this.cssW, this.cssH);
    r.clear();
    r.setViewport(this.view.x, this.view.y, this.view.w, this.view.h);
    r.render(this.scene, this.camera);
  }
}
