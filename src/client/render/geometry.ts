import * as THREE from 'three';
import { hash2 } from './noise';

/** Builds a transform from position, yaw, pitch, roll (applied in that order) and scale. */
export function xf(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

export type RGB = [number, number, number];

interface Bucket {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
}

/**
 * Collects static triangles by material and merges them into one mesh per material, so the whole world draws in a
 * couple of dozen calls.
 */
/** Boxes thinner than this on both short sides get a 1-pixel line down the middle. */
const THIN = 0.5;
const UP = new THREE.Vector3(0, 1, 0);

export class Batch {
  private readonly buckets = new Map<THREE.Material, Bucket>();
  private readonly lines = new Map<THREE.Material, Bucket>();

  /** `wire` draws the 1-pixel lines. Box materials opt in by naming a colour in `userData.wire`. */
  constructor(private readonly wire: THREE.Material | null = null) {}

  private bucket(m: THREE.Material, map = this.buckets): Bucket {
    let b = map.get(m);
    if (!b) {
      b = { pos: [], nor: [], uv: [], col: [] };
      map.set(m, b);
    }
    return b;
  }

  line(m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, c: RGB): void {
    const bucket = this.bucket(m, this.lines);
    for (const p of [a, b]) {
      bucket.pos.push(p.x, p.y, p.z);
      bucket.nor.push(UP.x, UP.y, UP.z);
      bucket.uv.push(0, 0);
      bucket.col.push(c[0], c[1], c[2]);
    }
  }

  /**
   * A box, plus a line down its middle when it is thin. A rope or post far thinner than a pixel only lights the pixels
   * whose centres it happens to cover, so it breaks up and pops. A line always lights at least one pixel, and up close
   * it sits hidden inside the box. PS1 games drew wires the same way.
   */
  box(m: THREE.Material, w: number, h: number, d: number, matrix: THREE.Matrix4, color: RGB = [1, 1, 1]): void {
    this.geometry(m, new THREE.BoxGeometry(w, h, d), matrix, color);
    this.spine(m, [w, h, d], matrix, color);
  }

  /** A box from a to b, `w` wide and `h` tall, for ropes, beams and rails. */
  beam(m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, h = w, color: RGB = [1, 1, 1]): void {
    const [g, matrix] = beam(a, b, w, h);
    this.geometry(m, g, matrix, color);
    this.spine(m, [w, h, a.distanceTo(b)], matrix, color);
  }

  private spine(m: THREE.Material, dims: number[], matrix: THREE.Matrix4, color: RGB): void {
    const tone = m.userData.wire as RGB | undefined;
    if (!this.wire || !tone) return;
    const long = dims.indexOf(Math.max(...dims));
    if (dims.some((v, i) => i !== long && v > THIN)) return;
    const a = new THREE.Vector3().setComponent(long, -dims[long] / 2).applyMatrix4(matrix);
    const b = new THREE.Vector3().setComponent(long, dims[long] / 2).applyMatrix4(matrix);
    this.line(this.wire, a, b, [tone[0] * color[0], tone[1] * color[1], tone[2] * color[2]]);
  }

  vertex(m: THREE.Material, p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: RGB = [1, 1, 1]): void {
    const b = this.bucket(m);
    b.pos.push(p.x, p.y, p.z);
    b.nor.push(n.x, n.y, n.z);
    b.uv.push(u, v);
    b.col.push(c[0], c[1], c[2]);
  }

  geometry(m: THREE.Material, g: THREE.BufferGeometry, matrix?: THREE.Matrix4, color: RGB = [1, 1, 1]): void {
    const flat = g.index ? g.toNonIndexed() : g.clone();
    if (matrix) flat.applyMatrix4(matrix);
    const pos = flat.getAttribute('position');
    const nor = flat.getAttribute('normal');
    const uv = flat.getAttribute('uv');
    const col = flat.getAttribute('color');
    const b = this.bucket(m);
    for (let i = 0; i < pos.count; i++) {
      b.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      b.nor.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      if (col) b.col.push(col.getX(i) * color[0], col.getY(i) * color[1], col.getZ(i) * color[2]);
      else b.col.push(color[0], color[1], color[2]);
    }
    flat.dispose();
  }

  meshes(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const [map, Kind] of [
      [this.buckets, THREE.Mesh],
      [this.lines, THREE.LineSegments],
    ] as const) {
      for (const [m, b] of map) {
        if (!b.pos.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
        g.computeBoundingSphere();
        const obj = new Kind(g, m);
        obj.matrixAutoUpdate = false;
        out.push(obj);
      }
    }
    return out;
  }
}

/** Non-indexed with face normals, for the faceted look of rocks and cut wood. */
export function faceted(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  flat.computeVertexNormals();
  return flat;
}

/** A lumpy faceted boulder, about `size` across. */
export function boulder(seed: number, size: number, squash = 0.7): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 0.75 + 0.5 * hash2(Math.round(x * 10) + seed * 7, Math.round(y * 10) * 13 + Math.round(z * 10), seed);
    pos.setXYZ(i, x * k * size * 0.5, y * k * size * 0.5 * squash, z * k * size * 0.5);
  }
  return faceted(g);
}

function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h = w): [THREE.BufferGeometry, THREE.Matrix4] {
  const d = b.clone().sub(a);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const g = new THREE.BoxGeometry(w, h, d.length());
  return [g, xf(mid.x, mid.y, mid.z, Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)))];
}

/** A box whose top face is narrower and shorter than its bottom, for car shells and wedges. */
export function taper(w0: number, l0: number, w1: number, l1: number, h: number, shift = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const top = pos.getY(i) > 0;
    const w = top ? w1 : w0;
    const l = top ? l1 : l0;
    pos.setXYZ(i, pos.getX(i) * w, (pos.getY(i) + 0.5) * h, pos.getZ(i) * l + (top ? shift : 0));
  }
  g.computeVertexNormals();
  return faceted(g);
}
