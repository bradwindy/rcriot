import * as THREE from 'three';
import { hash2 } from '../../render/noise';
import { globals } from '../../render/ps1';
import type { Looks } from './look';

/** A grinning cartoon sun with turning rays, and puffy outlined clouds, all riding with the camera like the sky. */
export function cartoonSky(L: Looks): { group: THREE.Group; update(time: number, camera: THREE.Camera): void } {
  const group = new THREE.Group();

  const face = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), L.sun);
  face.renderOrder = -1;
  const rays = new THREE.Group();
  {
    const pos: number[] = [];
    const col: number[] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = (Math.PI / n) * 0.55;
      const r0 = 58;
      const r1 = i % 2 ? 82 : 94;
      const tri = [
        [Math.cos(a - w) * r0, Math.sin(a - w) * r0],
        [Math.cos(a + w) * r0, Math.sin(a + w) * r0],
        [Math.cos(a) * r1, Math.sin(a) * r1],
      ];
      for (const [x, y] of tri) {
        pos.push(x, y, -1);
        const c = i % 2 ? [1, 0.62, 0.15] : [1, 0.85, 0.25];
        col.push(c[0], c[1], c[2]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    const m = new THREE.Mesh(g, L.rays);
    m.renderOrder = -1;
    rays.add(m);
  }
  const sun = new THREE.Group();
  sun.add(rays, face);
  group.add(sun);

  const clouds = new THREE.Group();
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash2(i, 1, 5) * 0.3;
      const r = 620 + hash2(i, 2, 5) * 120;
      const y = 95 + hash2(i, 3, 5) * 110;
      const w = 110 + hash2(i, 4, 5) * 90;
      const hgt = w * 0.5;
      const c = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(w / 2);
      const flip = hash2(i, 5, 5) < 0.5;
      const corners = [
        [c.clone().sub(side), flip ? 1 : 0, 0],
        [c.clone().add(side), flip ? 0 : 1, 0],
        [c.clone().add(side).setY(y + hgt), flip ? 0 : 1, 1],
        [c.clone().sub(side).setY(y + hgt), flip ? 1 : 0, 1],
      ] as const;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const [v, u, vv] = corners[k];
        pos.push(v.x, v.y, v.z);
        uv.push(u, vv);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const m = new THREE.Mesh(g, L.cloud);
    m.renderOrder = -1;
    m.frustumCulled = false;
    clouds.add(m);
  }
  group.add(clouds);

  return {
    group,
    update(time, camera) {
      group.position.copy(camera.position);
      sun.position.copy(globals.uSunDir.value).multiplyScalar(700);
      sun.lookAt(camera.position);
      rays.rotation.z = time * 0.15;
      face.rotation.z = Math.sin(time * 1.3) * 0.08;
      clouds.rotation.y = time * 0.006;
    },
  };
}
