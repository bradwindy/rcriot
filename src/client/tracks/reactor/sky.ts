import * as THREE from 'three';
import type { ReactorMats } from './materials';

/** Where the gas giant hangs, from the camera. */
export const PLANET_DIR = new THREE.Vector3(0.55, 0.32, -0.77).normalize();

/** A banded gas giant with a tilted ring, drawn behind everything and kept at a fixed bearing from the camera. */
export function planet(m: ReactorMats): THREE.Group {
  const group = new THREE.Group();
  const globe = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16), m.planet);
  globe.renderOrder = -1;
  const pos: number[] = [];
  const uv: number[] = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const at = (a: number, r: number) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    const quad = [
      [at(a0, 120), 0],
      [at(a0, 205), 1],
      [at(a1, 205), 1],
      [at(a0, 120), 0],
      [at(a1, 205), 1],
      [at(a1, 120), 0],
    ] as const;
    for (const [p, u] of quad) {
      pos.push(...p);
      uv.push(u, i / 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const ring = new THREE.Mesh(g, m.rings);
  ring.renderOrder = -1;
  ring.rotation.set(0.32, 0, -0.28);
  globe.rotation.set(0.32, 0.4, -0.28);
  group.add(globe, ring);
  return group;
}
