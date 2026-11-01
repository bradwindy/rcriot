import * as THREE from 'three';
import type { RGB } from '../../render/geometry';

/**
 * Quads rebuilt from scratch every frame: camera-facing puffs for steam, smoke, fire and sparks, and free quads for
 * beacon beams. Callers place everything from the clock, so a frame drawn on its own (a screenshot) looks the same.
 */
export class Quads {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();
  private n = 0;
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(
    material: THREE.Material,
    private readonly max: number,
    order: number,
  ) {
    this.pos = new Float32Array(max * 12);
    this.col = new Float32Array(max * 16);
    const uv = new Float32Array(max * 8);
    const index: number[] = [];
    for (let i = 0; i < max; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setIndex(index);
    this.geometry.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  begin(camera: THREE.Camera): void {
    this.n = 0;
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
  }

  /** A free quad through four corners, in order round its edge. */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: RGB, alpha = 1): void {
    if (this.n >= this.max) return;
    const corners = [a, b, c, d];
    for (let k = 0; k < 4; k++) {
      const o = (this.n * 4 + k) * 3;
      this.pos[o] = corners[k].x;
      this.pos[o + 1] = corners[k].y;
      this.pos[o + 2] = corners[k].z;
      const q = (this.n * 4 + k) * 4;
      this.col[q] = color[0];
      this.col[q + 1] = color[1];
      this.col[q + 2] = color[2];
      this.col[q + 3] = alpha;
    }
    this.n++;
  }

  /** A camera-facing square `size` across its half-width. */
  puff(x: number, y: number, z: number, size: number, color: RGB, alpha = 1): void {
    if (this.n >= this.max) return;
    const { right: r, up: u } = this;
    const corner = (cx: number, cy: number) =>
      CORNER.set(x + (r.x * cx + u.x * cy) * size, y + (r.y * cx + u.y * cy) * size, z + (r.z * cx + u.z * cy) * size);
    const o = this.n * 12;
    const q = this.n * 16;
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([cx, cy], k) => {
      const v = corner(cx, cy);
      this.pos[o + k * 3] = v.x;
      this.pos[o + k * 3 + 1] = v.y;
      this.pos[o + k * 3 + 2] = v.z;
      this.col.set([color[0], color[1], color[2], alpha], q + k * 4);
    });
    this.n++;
  }

  end(): void {
    this.geometry.setDrawRange(0, this.n * 6);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;
  }
}

const CORNER = new THREE.Vector3();

interface Part {
  pos: Float32Array;
  nor: Float32Array;
  offset: number;
  matrix: THREE.Matrix4;
  visible: boolean;
}

/**
 * Rigid moving parts that share a material, drawn as one mesh: each frame every part's vertices are moved by its own
 * matrix. Robot arms, the rocket and the like, for one draw call instead of one each.
 */
export class Rig {
  readonly mesh: THREE.Mesh;
  private readonly parts: Part[] = [];
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];
  private built = false;

  constructor(private readonly material: THREE.Material) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** Adds a part from geometry in its own space, optionally set into place within it first. Returns its handle. */
  add(g: THREE.BufferGeometry, local?: THREE.Matrix4, color: RGB = [1, 1, 1]): number {
    const flat = g.index ? g.toNonIndexed() : g.clone();
    if (local) flat.applyMatrix4(local);
    const p = flat.getAttribute('position');
    const n = flat.getAttribute('normal');
    const uv = flat.getAttribute('uv');
    const offset = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.col.push(...color);
    }
    this.parts.push({
      pos: new Float32Array(p.array),
      nor: new Float32Array(n.array),
      offset,
      matrix: new THREE.Matrix4(),
      visible: true,
    });
    flat.dispose();
    g.dispose();
    return this.parts.length - 1;
  }

  /** Several geometries as one part. */
  addGroup(pieces: [THREE.BufferGeometry, THREE.Matrix4?, RGB?][]): number {
    const merged: THREE.BufferGeometry[] = pieces.map(([g, m]) => {
      const flat = g.index ? g.toNonIndexed() : g.clone();
      if (m) flat.applyMatrix4(m);
      return flat;
    });
    const colors: RGB[] = pieces.map(([, , c]) => c ?? [1, 1, 1]);
    const pos: number[] = [];
    const nor: number[] = [];
    const uvs: number[] = [];
    const col: number[] = [];
    merged.forEach((g, k) => {
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      const uv = g.getAttribute('uv');
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        nor.push(n.getX(i), n.getY(i), n.getZ(i));
        uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        col.push(...colors[k]);
      }
      g.dispose();
    });
    const offset = this.pos.length / 3;
    this.pos.push(...pos);
    this.nor.push(...nor);
    this.uv.push(...uvs);
    this.col.push(...col);
    this.parts.push({ pos: new Float32Array(pos), nor: new Float32Array(nor), offset, matrix: new THREE.Matrix4(), visible: true });
    for (const [g] of pieces) g.dispose();
    return this.parts.length - 1;
  }

  set(part: number, matrix: THREE.Matrix4, visible = true): void {
    this.parts[part].matrix.copy(matrix);
    this.parts[part].visible = visible;
  }

  /** Moves every part's vertices to its matrix. */
  update(): void {
    const g = this.mesh.geometry;
    if (!this.built) {
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      this.built = true;
    }
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    const out = pos.array as Float32Array;
    const nout = nor.array as Float32Array;
    const normalMatrix = new THREE.Matrix3();
    for (const part of this.parts) {
      const e = part.matrix.elements;
      normalMatrix.getNormalMatrix(part.matrix);
      const ne = normalMatrix.elements;
      const count = part.pos.length / 3;
      for (let i = 0; i < count; i++) {
        const o = (part.offset + i) * 3;
        const x = part.pos[i * 3];
        const y = part.pos[i * 3 + 1];
        const z = part.pos[i * 3 + 2];
        if (!part.visible) {
          out[o] = out[o + 1] = out[o + 2] = 0;
          continue;
        }
        out[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        out[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        out[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = part.nor[i * 3];
        const ny = part.nor[i * 3 + 1];
        const nz = part.nor[i * 3 + 2];
        nout[o] = ne[0] * nx + ne[3] * ny + ne[6] * nz;
        nout[o + 1] = ne[1] * nx + ne[4] * ny + ne[7] * nz;
        nout[o + 2] = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      }
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  get materialOf(): THREE.Material {
    return this.material;
  }
}
