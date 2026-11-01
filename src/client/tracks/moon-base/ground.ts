import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import type { RGB } from '../../render/geometry';
import { fbm, hash2, smoothstep, valueNoise } from '../../render/noise';
import type { GroundSpec } from '../../render/terrain';
import type { MoonMats } from './materials';

/** Where the sun shines from, shared by the theme and the shadows painted on the ground. */
export const SUN = new THREE.Vector3(0.62, 0.4, 0.42).normalize();

/** x, z, radius, depth. The first two are the craters the main road jumps through. */
type Crater = [x: number, z: number, r: number, depth: number];

/** Places kept clear of big craters: the start apron, the lab, the hab ring. */
const CLEAR: [x: number, z: number, r: number][] = [
  [0, 40, 70],
  [10, -110, 70],
  [100, -160, 60],
  [42, 300, 80],
];

const CRATERS: Crater[] = (() => {
  const list: Crater[] = [
    [186, 168, 26, 3.6],
    [-4, 178, 19, 3],
    [-150, 120, 42, 7],
    [90, 150, 30, 4.5],
    [260, 10, 46, 7],
    [-170, -90, 36, 6],
    [190, -60, 30, 5],
    [-60, 330, 34, 5],
  ];
  const rng = mulberry32(77);
  for (let i = 0; i < 70; i++) {
    const x = -330 + rng() * 760;
    const z = -360 + rng() * 820;
    const r = 5 + rng() * rng() * 26;
    if (CLEAR.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r)) continue;
    list.push([x, z, r, r * (0.16 + rng() * 0.1)]);
  }
  return list;
})();

/** Bowl, raised rim and a skirt of ejecta. */
function crater(x: number, z: number, [cx, cz, r, depth]: Crater): number {
  const d = Math.hypot(x - cx, z - cz) / r;
  if (d > 2.2) return 0;
  const rim = depth * 0.45 * Math.exp(-(((d - 1) / 0.28) ** 2));
  const bowl = d < 1 ? -depth * (1 - d * d) : 0;
  return rim + bowl;
}

/** The crevasse the shortcut leaps: a deep rille running north to south. */
function rille(x: number, z: number): number {
  const along = smoothstep(42, 18, Math.abs(z - 244));
  const across = smoothstep(11, 3, Math.abs(x - 59 - Math.sin(z * 0.08) * 2));
  return -16 * along * across;
}

/** The moon before the road is cut in: rolling dust, craters, a crevasse and highlands round the edge. */
export function moonHeight(x: number, z: number): number {
  let h = 0.6 + (fbm(x / 110, z / 110, 3, 61) - 0.5) * 6;
  const far = Math.hypot((x - 40) / 1.1, z - 70);
  h += smoothstep(300, 470, far) * (24 + 40 * fbm(x / 70, z / 70, 3, 62));
  for (const c of CRATERS) h += crater(x, z, c);
  return h + rille(x, z);
}

/** The ground stops where the far mountains take over, so it costs no vertices nobody can see. */
export const X0 = -340;
export const X1 = 440;
export const Z0 = -380;
export const Z1 = 502;
const CELL = 6;

/** The natural heights on the terrain grid, worked out once a page, for the shadow test to read quickly. */
const field = (() => {
  let grid: Float32Array | null = null;
  const nx = Math.round((X1 - X0) / CELL) + 1;
  const nz = Math.round((Z1 - Z0) / CELL) + 1;
  const fill = () => {
    const g = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = moonHeight(X0 + i * CELL, Z0 + j * CELL);
    return g;
  };
  return (x: number, z: number): number => {
    const g = (grid ??= fill());
    const fi = Math.max(0, Math.min(nx - 1.001, (x - X0) / CELL));
    const fj = Math.max(0, Math.min(nz - 1.001, (z - Z0) / CELL));
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const tx = fi - i;
    const tz = fj - j;
    const at = (a: number, b: number) => g[b * nx + a];
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return top + (bottom - top) * tz;
  };
})();

/** True when something between here and the sun would shade this point: a crater rim, a hill, the crevasse wall. */
function shaded(x: number, z: number, h: number): boolean {
  const flat = Math.hypot(SUN.x, SUN.z);
  const rise = SUN.y / flat;
  for (let t = 3; t < 70; t += 3) {
    if (field(x + (SUN.x / flat) * t, z + (SUN.z / flat) * t) > h + 0.4 + t * rise) return true;
  }
  return false;
}

export function moonGround(mm: MoonMats): GroundSpec {
  const shade = new Map<string, number>();
  return {
    x0: X0,
    x1: X1,
    z0: Z0,
    z1: Z1,
    cell: CELL,
    height: moonHeight,
    paint: ({ steep, low }) => (steep && low < -3 ? mm.rock : mm.regolith),
    cliffs: [mm.rock],
    headwall: mm.rock,
    blend: 12,
    tint: (x, z, h): RGB => {
      const key = `${x},${z}`;
      let s = shade.get(key);
      if (s === undefined) {
        s = shaded(x, z, h) ? 0.32 : 1;
        shade.set(key, s);
      }
      // Pale highlands and darker seas in broad sweeps, rays of bright ejecta round the big craters.
      const sea = smoothstep(0.42, 0.62, fbm(x / 160, z / 160, 2, 63));
      let v = (1.3 - sea * 0.28) * (0.96 + valueNoise(x / 14, z / 14, 64) * 0.08);
      for (const [cx, cz, r] of CRATERS.slice(0, 6)) {
        const d = Math.hypot(x - cx, z - cz);
        if (d < r * 1.2 || d > r * 4) continue;
        const a = Math.atan2(z - cz, x - cx);
        const ray = Math.max(0, Math.sin(a * 7 + cx) * Math.sin(a * 11 + cz)) * (1 - d / (r * 4));
        v += ray * 0.18;
      }
      const deep = smoothstep(-14, -3, h);
      v *= s * (0.35 + 0.65 * deep);
      return [v * 0.98, v * 0.98, v];
    },
  };
}

/** Grey peaks round the horizon, lit by the low sun and fading into black space. */
export function farMountains(mm: MoonMats): THREE.Mesh {
  const n = 120;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const ring = (i: number) => {
    const a = (i / n) * Math.PI * 2;
    const r = 720 + valueNoise(i * 0.31, 2, 65) * 120;
    const lump = valueNoise(i * 0.19, 4, 66);
    const h = 30 + Math.max(0, lump - 0.3) * 260 + hash2(i, 1, 67) * 25;
    return { x: 40 + Math.cos(a) * r, z: 70 + Math.sin(a) * r, h };
  };
  for (let i = 0; i < n; i++) {
    const a = ring(i);
    const b = ring(i + 1);
    const quad = [
      [a.x, -20, a.z, i, 0],
      [a.x, a.h, a.z, i, 1],
      [b.x, -20, b.z, i + 1, 0],
      [b.x, -20, b.z, i + 1, 0],
      [a.x, a.h, a.z, i, 1],
      [b.x, b.h, b.z, i + 1, 1],
    ];
    for (const [x, y, z, u, v] of quad) {
      pos.push(x, y, z);
      uv.push(u / 2, (v * y) / 40);
      const c = v ? 0.95 : 0.4;
      col.push(c, c, c * 1.04);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mm.mountains);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** The Earth hanging in the black sky to the north, lit half and half by the same sun as the moon. */
export const EARTH_DIR = new THREE.Vector3(-0.12, 0.4, -0.91).normalize();

export function earth(mm: MoonMats): THREE.Mesh {
  const g = new THREE.SphereGeometry(78, 24, 16);
  const mesh = new THREE.Mesh(g, mm.earth);
  mesh.rotation.set(0.35, 2.2, 0.15);
  mesh.renderOrder = -1;
  return mesh;
}
