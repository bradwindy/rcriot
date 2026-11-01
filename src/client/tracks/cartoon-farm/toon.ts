import * as THREE from 'three';
import { ball, type Batch, type RGB } from '../../render/geometry';
import type { Looks } from './look';

/** A copy of a convex shape fattened by `t` on every side, for its ink outline. */
export function fattened(g: THREE.BufferGeometry, t: number): THREE.BufferGeometry {
  const out = g.clone();
  out.computeBoundingBox();
  const box = out.boundingBox ?? new THREE.Box3();
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const k = (v: number) => (v > 1e-4 ? (v + 2 * t) / v : 1);
  out.translate(-mid.x, -mid.y, -mid.z);
  out.scale(k(size.x), k(size.y), k(size.z));
  out.translate(mid.x, mid.y, mid.z);
  return out;
}

/** Static cartoon shapes with bold outlines, into the scenery batch. */
export class Toon {
  constructor(
    readonly batch: Batch,
    readonly L: Looks,
  ) {}

  /** Any convex shape, with its outline. */
  shape(mat: THREE.Material, g: THREE.BufferGeometry, m: THREE.Matrix4, color: RGB = [1, 1, 1], t = 0.08): void {
    this.batch.geometry(mat, g, m, color);
    if (t > 0) this.batch.geometry(this.L.ink, fattened(g, t), m);
  }

  box(mat: THREE.Material, w: number, h: number, d: number, m: THREE.Matrix4, color: RGB = [1, 1, 1], t = 0.08): void {
    this.batch.box(mat, w, h, d, m, color);
    if (t > 0) this.batch.geometry(this.L.ink, new THREE.BoxGeometry(w + 2 * t, h + 2 * t, d + 2 * t), m);
  }

  ball(mat: THREE.Material, r: number, m: THREE.Matrix4, color: RGB = [1, 1, 1], t = 0.08, sx = 1, sy = 1, sz = 1, seg = 8): void {
    this.batch.geometry(mat, ball(r, sx, sy, sz, seg), m, color);
    if (t > 0) this.batch.geometry(this.L.ink, ball(r + t / Math.min(sx, sy, sz), sx, sy, sz, Math.max(5, seg - 2)), m);
  }

  cyl(mat: THREE.Material, r0: number, r1: number, h: number, m: THREE.Matrix4, color: RGB = [1, 1, 1], t = 0.08, seg = 8): void {
    this.batch.geometry(mat, new THREE.CylinderGeometry(r0, r1, h, seg), m, color);
    if (t > 0) this.batch.geometry(this.L.ink, new THREE.CylinderGeometry(r0 + t, r1 + t, h + 2 * t, seg), m);
  }

  /** A beam from a to b, with its outline. */
  beam(mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h = w, color: RGB = [1, 1, 1], t = 0.06): void {
    this.batch.beam(mat, a, b, w, h, color);
    if (t > 0) {
      const d = b.clone().sub(a).normalize().multiplyScalar(t);
      this.batch.beam(this.L.ink, a.clone().sub(d), b.clone().add(d), w + 2 * t, h + 2 * t);
    }
  }
}

interface Part {
  start: number;
  pos: Float32Array;
  nor: Float32Array;
}

/**
 * Moving set pieces drawn in one call: template shapes are copied into one buffer, and each frame every part is moved
 * by its own matrix on the CPU. Cheaper than a mesh per sheep, and the PS1 shader has no instancing.
 */
export class Rig {
  readonly mesh: THREE.Mesh;
  private readonly parts: Part[] = [];
  private readonly build = { pos: [] as number[], nor: [] as number[], uv: [] as number[], col: [] as number[] };
  private pos: THREE.BufferAttribute | null = null;
  private nor: THREE.BufferAttribute | null = null;
  private readonly normal = new THREE.Matrix3();
  private readonly v = new THREE.Vector3();

  constructor(material: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** Adds a part from shapes in its own frame. Returns its handle. */
  part(shapes: { g: THREE.BufferGeometry; m?: THREE.Matrix4; color?: RGB }[]): number {
    const start = this.build.pos.length / 3;
    const pos: number[] = [];
    const nor: number[] = [];
    for (const { g, m, color = [1, 1, 1] } of shapes) {
      const flat = g.index ? g.toNonIndexed() : g.clone();
      if (m) flat.applyMatrix4(m);
      const p = flat.getAttribute('position');
      const n = flat.getAttribute('normal');
      const uv = flat.getAttribute('uv');
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        this.build.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        this.build.col.push(color[0], color[1], color[2]);
      }
      flat.dispose();
    }
    for (let i = 0; i < pos.length; i++) {
      this.build.pos.push(0);
      this.build.nor.push(0);
    }
    this.parts.push({ start, pos: new Float32Array(pos), nor: new Float32Array(nor) });
    return this.parts.length - 1;
  }

  /** Makes the buffers, once every part is in. */
  done(): THREE.Mesh {
    const g = this.mesh.geometry;
    this.pos = new THREE.Float32BufferAttribute(this.build.pos, 3);
    this.nor = new THREE.Float32BufferAttribute(this.build.nor, 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nor.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nor);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.build.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.build.col, 3));
    return this.mesh;
  }

  /** Moves a part to where `m` puts it. */
  set(id: number, m: THREE.Matrix4): void {
    const part = this.parts[id];
    const pos = this.pos;
    const nor = this.nor;
    if (!part || !pos || !nor) return;
    this.normal.getNormalMatrix(m);
    const P = pos.array as Float32Array;
    const N = nor.array as Float32Array;
    const e = m.elements;
    const n = this.normal.elements;
    for (let i = 0, k = part.start * 3; i < part.pos.length; i += 3, k += 3) {
      const x = part.pos[i];
      const y = part.pos[i + 1];
      const z = part.pos[i + 2];
      P[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const a = part.nor[i];
      const b = part.nor[i + 1];
      const c = part.nor[i + 2];
      this.v.set(n[0] * a + n[3] * b + n[6] * c, n[1] * a + n[4] * b + n[7] * c, n[2] * a + n[5] * b + n[8] * c).normalize();
      N[k] = this.v.x;
      N[k + 1] = this.v.y;
      N[k + 2] = this.v.z;
    }
  }

  /** Call once a frame after moving parts. */
  flush(): void {
    if (this.pos) this.pos.needsUpdate = true;
    if (this.nor) this.nor.needsUpdate = true;
  }
}

/** A rig in colour and its ink outline rig, moved together. */
export class InkRig {
  readonly body: Rig;
  readonly ink: Rig;

  constructor(L: Looks, material: THREE.Material = L.flat) {
    this.body = new Rig(material);
    this.ink = new Rig(L.ink);
  }

  /** Shapes are outlined unless `t` is 0. */
  part(shapes: { g: THREE.BufferGeometry; m?: THREE.Matrix4; color?: RGB; t?: number }[]): number {
    const a = this.body.part(shapes);
    const b = this.ink.part(shapes.filter((s) => (s.t ?? 0.07) > 0).map((s) => ({ g: fattened(s.g, s.t ?? 0.07), m: s.m })));
    if (a !== b) throw new Error('Rig parts out of step');
    return a;
  }

  done(): THREE.Mesh[] {
    return [this.body.done(), this.ink.done()];
  }

  set(id: number, m: THREE.Matrix4): void {
    this.body.set(id, m);
    this.ink.set(id, m);
  }

  flush(): void {
    this.body.flush();
    this.ink.flush();
  }
}
