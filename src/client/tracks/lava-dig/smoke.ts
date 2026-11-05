import * as THREE from 'three';

export interface Emitter {
  at: THREE.Vector3;
  /** Puffs in flight from here, how fast they rise, how big they grow and how long they last. */
  count: number;
  rise: number;
  size: [number, number];
  life: number;
  drift: THREE.Vector3;
  tone: [number, number, number];
}

/**
 * Smoke as one mesh of camera-facing quads, rebuilt on the CPU each frame, so a whole sky of plumes is one draw call.
 * Each puff loops on its own timer: rising, drifting with the wind, swelling and darkening.
 */
export class Smoke {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly puffs: { e: Emitter; seed: number }[] = [];
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(emitters: Emitter[], material: THREE.Material) {
    for (const e of emitters) for (let k = 0; k < e.count; k++) this.puffs.push({ e, seed: k / e.count });
    const n = this.puffs.length;
    this.pos = new Float32Array(n * 18);
    this.col = new Float32Array(n * 18);
    const uv = new Float32Array(n * 12);
    const nor = new Float32Array(n * 18);
    const corners = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];
    for (let i = 0; i < n; i++) {
      uv.set(corners, i * 12);
      for (let k = 0; k < 6; k++) nor.set([0, 1, 0], i * 18 + k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }

  update(time: number, camera: THREE.Camera): void {
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const c = new THREE.Vector3();
    this.puffs.forEach(({ e, seed }, i) => {
      const t = (time / e.life + seed) % 1;
      const wobble = Math.sin(seed * 40 + time * 0.7) * 0.3;
      c.copy(e.at)
        .addScaledVector(e.drift, t * e.life)
        .add(new THREE.Vector3(wobble * e.size[0], t * e.rise * e.life, Math.cos(seed * 31) * e.size[0] * 0.4));
      const s = (e.size[0] + (e.size[1] - e.size[0]) * t) / 2;
      const dark = 1 - t * 0.55;
      const quad = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ];
      quad.forEach(([a, b], k) => {
        const o = i * 18 + k * 3;
        this.pos[o] = c.x + (this.right.x * a + this.up.x * b) * s;
        this.pos[o + 1] = c.y + (this.right.y * a + this.up.y * b) * s;
        this.pos[o + 2] = c.z + (this.right.z * a + this.up.z * b) * s;
        this.col[o] = e.tone[0] * dark;
        this.col[o + 1] = e.tone[1] * dark;
        this.col[o + 2] = e.tone[2] * dark;
      });
    });
    const g = this.mesh.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('color').needsUpdate = true;
  }
}
