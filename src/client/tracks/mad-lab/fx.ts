import * as THREE from 'three';
import type { RGB } from '../../render/geometry';
import { hash2, valueNoise } from '../../render/noise';
import { addPointLight, type PointLight } from '../../render/ps1';

const TMP = {
  dir: new THREE.Vector3(),
  p1: new THREE.Vector3(),
  p2: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  side: new THREE.Vector3(1, 0, 0),
};

/**
 * Every electric arc on the track in one additive mesh, rebuilt each frame: each arc is a jagged line of crossed
 * ribbons, its kinks re-rolled many times a second so it crackles.
 */
export class Sparks {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly uv: Float32Array;
  private readonly max: number;
  private used = 0;
  private readonly pts: THREE.Vector3[] = Array.from({ length: 64 }, () => new THREE.Vector3());

  constructor(material: THREE.Material, maxVerts = 24000) {
    this.max = maxVerts;
    this.pos = new Float32Array(maxVerts * 3);
    this.col = new Float32Array(maxVerts * 3);
    this.uv = new Float32Array(maxVerts * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  begin(): void {
    this.used = 0;
  }

  /**
   * An arc from a to b in `segs` kinks, `width` across, thrown `jitter` sideways at most in the middle. `seed` and
   * `tick` pick its shape: the same pair draws the same arc, so a new tick is a new crackle.
   */
  arc(a: THREE.Vector3, b: THREE.Vector3, width: number, jitter: number, segs: number, color: RGB, seed: number, tick: number): void {
    const n = Math.min(segs, this.pts.length - 1);
    if (this.used + n * 12 > this.max) return;
    const dir = TMP.dir.subVectors(b, a);
    const len = dir.length();
    if (len < 1e-3) return;
    dir.divideScalar(len);
    const p1 = TMP.p1.crossVectors(dir, Math.abs(dir.y) > 0.9 ? TMP.side : TMP.up).normalize();
    const p2 = TMP.p2.crossVectors(dir, p1).normalize();
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bulge = Math.sin(t * Math.PI) * jitter;
      const j1 = (hash2(seed, i * 2 + tick * 131, 71) - 0.5) * 2 * bulge;
      const j2 = (hash2(seed, i * 2 + 1 + tick * 131, 73) - 0.5) * 2 * bulge;
      this.pts[i].copy(a).lerp(b, t).addScaledVector(p1, j1).addScaledVector(p2, j2);
    }
    for (let i = 0; i < n; i++) {
      const s = this.pts[i];
      const e = this.pts[i + 1];
      for (const across of [p1, p2]) {
        const w = width / 2;
        const sa = TMP.a.copy(s).addScaledVector(across, -w);
        const sb = TMP.b.copy(s).addScaledVector(across, w);
        const ea = TMP.c.copy(e).addScaledVector(across, -w);
        const eb = TMP.d.copy(e).addScaledVector(across, w);
        this.quad(sa, sb, eb, ea, color);
      }
    }
  }

  /** A forked arc: a trunk from a to b and `branches` short offshoots from its kinks. */
  fork(a: THREE.Vector3, b: THREE.Vector3, width: number, jitter: number, segs: number, color: RGB, seed: number, tick: number, branches: number): void {
    this.arc(a, b, width, jitter, segs, color, seed, tick);
    const len = a.distanceTo(b);
    for (let k = 0; k < branches; k++) {
      const t = 0.2 + 0.6 * hash2(seed, k + tick * 17, 79);
      const from = a.clone().lerp(b, t);
      const off = new THREE.Vector3(hash2(seed, k, 81 + tick) - 0.5, -0.3 - hash2(seed, k, 83 + tick) * 0.5, hash2(seed, k, 85 + tick) - 0.5)
        .normalize()
        .multiplyScalar(len * (0.12 + 0.15 * hash2(seed, k, 87)));
      this.arc(from, from.clone().add(off), width * 0.5, jitter * 0.35, Math.max(2, Math.round(segs / 3)), color, seed + k * 7, tick);
    }
  }

  private quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: RGB): void {
    const verts = [a, b, c, a, c, d];
    const us = [0, 1, 1, 0, 1, 0];
    const vs = [0, 0, 1, 0, 1, 1];
    for (let i = 0; i < 6; i++) {
      const o = this.used;
      this.pos[o * 3] = verts[i].x;
      this.pos[o * 3 + 1] = verts[i].y;
      this.pos[o * 3 + 2] = verts[i].z;
      this.col[o * 3] = color[0];
      this.col[o * 3 + 1] = color[1];
      this.col[o * 3 + 2] = color[2];
      this.uv[o * 2] = us[i];
      this.uv[o * 2 + 1] = vs[i];
      this.used++;
    }
  }

  end(): void {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.used);
    for (const name of ['position', 'color', 'uv']) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, this.used * attr.itemSize);
      attr.needsUpdate = true;
    }
  }
}

/** A fixed light that wavers: fire, bubbling vats, humming coils. */
export interface Flicker {
  light: PointLight;
  base: THREE.Color;
  seed: number;
  /** How fast and how far it wavers. */
  rate: number;
  depth: number;
}

/** What the scenery builders hand back: lights to flicker and flame tips to shed embers. */
export class Fx {
  readonly lights: Flicker[] = [];
  readonly flames: THREE.Vector3[] = [];

  light(at: THREE.Vector3, color: RGB, range: number, rate = 0, depth = 0): Flicker {
    const base = new THREE.Color(...color);
    const f = { light: addPointLight(at, base, range), base, seed: this.lights.length * 13 + 5, rate, depth };
    this.lights.push(f);
    return f;
  }

  flicker(time: number): void {
    for (const f of this.lights) {
      if (!f.depth) continue;
      const k = 1 - f.depth + f.depth * 2 * valueNoise(time * f.rate + f.seed, f.seed, 3);
      f.light.color.copy(f.base).multiplyScalar(k);
    }
  }
}
