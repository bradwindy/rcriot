import * as THREE from 'three';
import { ps1Material } from './ps1';
import { tex } from './textures';

const MAX = 240;

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  age: number;
  r: number;
  g: number;
  b: number;
}

/** Camera-facing dust puffs, rebuilt on the CPU each frame into one mesh. */
export class Dust {
  readonly mesh: THREE.Mesh;
  private readonly puffs: Puff[] = [];
  private readonly pos = new Float32Array(MAX * 4 * 3);
  private readonly col = new Float32Array(MAX * 4 * 4);
  private readonly geometry = new THREE.BufferGeometry();

  constructor() {
    const uv = new Float32Array(MAX * 8);
    const index: number[] = [];
    for (let i = 0; i < MAX; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setIndex(index);
    const material = ps1Material({ map: tex.dust(), lit: false, vertexColors: true, transparent: true, alphaTest: 0.5 });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, color: THREE.Color): void {
    if (this.puffs.length >= MAX) this.puffs.shift();
    this.puffs.push({ x, y, z, vx, vy, vz, size, life, age: 0, r: color.r, g: color.g, b: color.b });
  }

  update(dt: number, camera: THREE.Camera): void {
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.puffs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const drag = Math.exp(-dt * 3);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag + dt * 0.6;
      const t = p.age / p.life;
      const s = p.size * (0.6 + t * 1.2);
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      corners.forEach(([cx, cy], k) => {
        const o = (n * 4 + k) * 3;
        this.pos[o] = p.x + (right.x * cx + up.x * cy) * s;
        this.pos[o + 1] = p.y + (right.y * cx + up.y * cy) * s;
        this.pos[o + 2] = p.z + (right.z * cx + up.z * cy) * s;
        const c = (n * 4 + k) * 4;
        this.col[c] = p.r;
        this.col[c + 1] = p.g;
        this.col[c + 2] = p.b;
        this.col[c + 3] = 1 - t;
      });
      n++;
    }
    this.geometry.setDrawRange(0, n * 6);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('color').needsUpdate = true;
  }
}
