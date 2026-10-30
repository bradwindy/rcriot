import * as THREE from 'three';
import type { Fx } from '../settings';
import { globals } from './ps1';

/**
 * Renders the scene into a low-res buffer, then draws that buffer onto the screen. Colour is cut to 15 bits with the
 * PS1's own 4x4 ordered dither. The CRT pass then plays the part of a composite cable and a cheap TV: each line smears
 * sideways (which melts the dither, as it did on real sets), red and blue drift apart, bright areas glow, every buffer
 * row becomes a scanline beam that swells when bright, and grain and a dark edge sit on top. No barrel curvature.
 * The 2D layer (HUD and menus) is laid over each buffer pixel first, so the TV treats it exactly like the game.
 * Before that, bloom: glowing materials draw brighter than white, that excess is blurred at a quarter of the buffer's
 * size and added back, so flames and lamps bleed light that then gets dithered with everything else.
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
uniform sampler2D tUi;
uniform vec2 uUiRes;
uniform float uUi;
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
  vec3 c = min(texelFetch(tScene, p, 0).rgb, vec3(1.0));
  if (uBits < 8.0) {
    float d = uDither * BAYER[(p.x & 3) + (p.y & 3) * 4];
    float levels = exp2(uBits);
    c = floor(clamp(c * 255.0 + d, 0.0, 255.0) / (256.0 / levels)) / (levels - 1.0);
  }
  if (uUi > 0.5) {
    ivec2 q = clamp(ivec2((vec2(p) + 0.5) * uUiRes / uRes), ivec2(0), ivec2(uUiRes) - 1);
    vec4 ui = texelFetch(tUi, q, 0);
    c = mix(c, ui.rgb, ui.a);
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

/** Keeps only what is brighter than white, averaged over each quarter-size cell. */
const brightShader = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;
varying vec2 vUv;

vec3 excess(vec2 uv) {
  vec3 c = texture2D(tScene, uv).rgb;
  float m = max(max(c.r, c.g), c.b);
  return c * max(m - 1.0, 0.0) / max(m, 1e-4);
}

void main() {
  vec3 sum = excess(vUv + uTexel * vec2(-1.0, -1.0)) + excess(vUv + uTexel * vec2(1.0, -1.0))
    + excess(vUv + uTexel * vec2(-1.0, 1.0)) + excess(vUv + uTexel * vec2(1.0, 1.0));
  gl_FragColor = vec4(sum * 0.25, 1.0);
}
`;

/** A 9-tap Gaussian along one axis, done in 5 linear taps. */
const blurShader = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uStep;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(tSource, vUv).rgb * 0.2270;
  c += (texture2D(tSource, vUv + uStep * 1.3846).rgb + texture2D(tSource, vUv - uStep * 1.3846).rgb) * 0.3162;
  c += (texture2D(tSource, vUv + uStep * 3.2308).rgb + texture2D(tSource, vUv - uStep * 3.2308).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}
`;

const combineShader = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
varying vec2 vUv;

void main() {
  vec3 c = min(texelFetch(tScene, ivec2(gl_FragCoord.xy), 0).rgb, vec3(1.0));
  gl_FragColor = vec4(min(c + texture2D(tBloom, vUv).rgb * uBloom, vec3(1.0)), 1.0);
}
`;

const BLOOM: Record<Fx['bloom'], { strength: number; spread: number }> = {
  off: { strength: 0, spread: 0 },
  soft: { strength: 1.1, spread: 1 },
  strong: { strength: 1.9, spread: 1.6 },
};

const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
  new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false });

const linearTarget = (type: THREE.TextureDataType, depthBuffer = false) =>
  new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer,
    type,
  });

const CRT: Record<Fx['crt'], Record<string, number>> = {
  off: { uBlur: 0, uFringe: 0, uScan: 0, uGlow: 0, uGrain: 0, uVignette: 0, uMask: 0, uRoll: 0 },
  soft: { uBlur: 0.5, uFringe: 0.3, uScan: 0.4, uGlow: 0.12, uGrain: 0.035, uVignette: 0.18, uMask: 0, uRoll: 0 },
  strong: { uBlur: 0.75, uFringe: 0.6, uScan: 0.65, uGlow: 0.22, uGrain: 0.07, uVignette: 0.3, uMask: 0.15, uRoll: 0.05 },
};

const WOBBLE: Record<Fx['wobble'], number> = { off: 0, subtle: 0.5, ps1: 1, heavy: 2 };

export class Pipeline {
  readonly target: THREE.WebGLRenderTarget;
  private readonly bloomA: THREE.WebGLRenderTarget;
  private readonly bloomB: THREE.WebGLRenderTarget;
  private readonly combined = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
  });
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly combine: THREE.ShaderMaterial;
  private bloom = BLOOM.off;
  private readonly material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tScene: { value: null as THREE.Texture | null },
      tUi: { value: null as THREE.Texture | null },
      uUiRes: { value: new THREE.Vector2(1, 1) },
      uUi: { value: 0 },
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
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  private view = { x: 0, y: 0, w: 1, h: 1 };
  private ui: THREE.CanvasTexture | null = null;
  private cssW = 1;
  private cssH = 1;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    renderer.autoClear = false;
    this.scene.add(this.quad);
    // Glow needs colour past white. Without float buffers it clips at white and bloom has nothing to find.
    const ext = renderer.extensions;
    const hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.target = linearTarget(type, true);
    this.bloomA = linearTarget(type);
    this.bloomB = linearTarget(type);
    this.bright = pass(brightShader, { tScene: { value: this.target.texture }, uTexel: { value: new THREE.Vector2() } });
    this.blur = pass(blurShader, { tSource: { value: null }, uStep: { value: new THREE.Vector2() } });
    this.combine = pass(combineShader, {
      tScene: { value: this.target.texture },
      tBloom: { value: this.bloomA.texture },
      uBloom: { value: 0 },
    });
    this.material.uniforms.tScene.value = this.target.texture;
  }

  get size(): { w: number; h: number } {
    return { w: this.target.width, h: this.target.height };
  }

  /** Where the game is drawn on the page, in CSS pixels. */
  get viewport(): { x: number; y: number; w: number; h: number } {
    return this.view;
  }

  /** The 2D layer to lay over the scene. Call again whenever the canvas changes size. */
  setUi(canvas: HTMLCanvasElement): void {
    this.ui?.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.NoColorSpace;
    this.ui = tex;
    this.material.uniforms.tUi.value = tex;
    this.material.uniforms.uUiRes.value.set(canvas.width, canvas.height);
    this.material.uniforms.uUi.value = 1;
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
    this.combined.setSize(bw, bh);
    this.bloomA.setSize(Math.ceil(bw / 4), Math.ceil(bh / 4));
    this.bloomB.setSize(Math.ceil(bw / 4), Math.ceil(bh / 4));
    this.bright.uniforms.uTexel.value.set(1 / bw, 1 / bh);
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
    this.bloom = BLOOM[fx.bloom];
    this.combine.uniforms.uBloom.value = this.bloom.strength;
    this.material.uniforms.tScene.value = this.bloom.strength > 0 ? this.combined.texture : this.target.texture;
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
    if (this.bloom.strength > 0) this.renderBloom();
    r.setRenderTarget(null);
    if (this.ui) this.ui.needsUpdate = true;
    r.setViewport(0, 0, this.cssW, this.cssH);
    r.clear();
    r.setViewport(this.view.x, this.view.y, this.view.w, this.view.h);
    this.quad.material = this.material;
    r.render(this.scene, this.camera);
  }

  private renderBloom(): void {
    const { bloomA: a, bloomB: b } = this;
    this.draw(this.bright, a);
    // The spread is in bloom texels at 240 lines, so the glow keeps its size on screen at any resolution.
    const step = (this.bloom.spread * a.height) / 60;
    this.blur.uniforms.tSource.value = a.texture;
    this.blur.uniforms.uStep.value.set(step / a.width, 0);
    this.draw(this.blur, b);
    this.blur.uniforms.tSource.value = b.texture;
    this.blur.uniforms.uStep.value.set(0, step / a.height);
    this.draw(this.blur, a);
    this.draw(this.combine, this.combined);
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }
}
