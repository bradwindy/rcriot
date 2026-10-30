import * as THREE from 'three';
import type { Materials } from './materials';
import { hash2, valueNoise } from './noise';
import { globals } from './ps1';
import type { Terrain } from './terrain';

const ZENITH = new THREE.Color(0.24, 0.42, 0.74);
const UPPER = new THREE.Color(0.55, 0.62, 0.86);
const BELOW = new THREE.Color(0.86, 0.66, 0.52);

/** The sky, sun and clouds ride with the camera. The far islands and the sea stay put. */
export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly clouds: THREE.Mesh;
  private readonly sun: THREE.Mesh;

  constructor(mats: Materials) {
    const horizon = globals.uFogColor.value;
    const dome = new THREE.SphereGeometry(900, 20, 12);
    const pos = dome.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900;
      const c = y < 0 ? BELOW.clone().lerp(horizon, Math.max(0, 1 + y * 4)) : y < 0.25 ? horizon.clone().lerp(UPPER, y / 0.25) : UPPER.clone().lerp(ZENITH, Math.min(1, (y - 0.25) / 0.5));
      colors.push(c.r, c.g, c.b);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.dome = new THREE.Mesh(dome, mats.sky);
    this.dome.renderOrder = -2;

    const band = new THREE.CylinderGeometry(820, 820, 170, 24, 1, true);
    const uv = band.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 4);
    this.clouds = new THREE.Mesh(band, mats.cloud);
    this.clouds.position.y = 120;
    this.clouds.renderOrder = -1;

    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mats.sun);
    this.sun.renderOrder = -1;

    this.group.add(this.dome, this.clouds, this.sun);
  }

  update(camera: THREE.Camera, time: number): void {
    this.group.position.copy(camera.position);
    this.clouds.rotation.y = time * 0.004;
    this.sun.position.copy(globals.uSunDir.value).multiplyScalar(780);
    this.sun.lookAt(camera.position);
  }
}

/** A ragged ring of distant islands, mostly lost in the haze. */
export function farIslands(mats: Materials): THREE.Mesh {
  const n = 96;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const ring = (i: number) => {
    const a = (i / n) * Math.PI * 2;
    const r = 640 + valueNoise(i * 0.3, 1, 5) * 120;
    const lump = valueNoise(i * 0.22, 3, 7);
    const h = lump > 0.45 ? (lump - 0.45) * 160 + hash2(i, 0, 9) * 12 : -6;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r - 60, h };
  };
  for (let i = 0; i < n; i++) {
    const a = ring(i);
    const b = ring(i + 1);
    const quad = [
      [a.x, -8, a.z, i, 0],
      [a.x, a.h, a.z, i, 1],
      [b.x, -8, b.z, i + 1, 0],
      [b.x, -8, b.z, i + 1, 0],
      [a.x, a.h, a.z, i, 1],
      [b.x, b.h, b.z, i + 1, 1],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x, y, z);
      uv.push(u / 3, v * 3);
      const shade = v ? 0.8 : 0.55;
      col.push(shade * 0.85, shade, shade * 0.8);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mats.isles);
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

/** The sea and lagoon: one wavy sheet, turquoise over the shallows and deep blue further out. */
export function water(mats: Materials, terrain: Terrain): THREE.Mesh {
  const size = 1800;
  const g = new THREE.PlaneGeometry(size, size, 120, 120);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -50);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const shallow = new THREE.Color(0.42, 0.86, 0.84);
  const deep = new THREE.Color(0.14, 0.34, 0.62);
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, uv.getX(i) * (size / 16), uv.getY(i) * (size / 16));
    const depth = -terrain.height(pos.getX(i), pos.getZ(i));
    const c = shallow.clone().lerp(deep, Math.max(0, Math.min(1, depth / 4.5)));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, mats.water);
  mesh.renderOrder = 1;
  return mesh;
}
