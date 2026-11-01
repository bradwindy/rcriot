import * as THREE from 'three';
import type { Batch, RGB } from '../../render/geometry';
import { fbm, hash2, smoothstep } from '../../render/noise';
import type { GroundSpec } from '../../render/terrain';
import type { Looks } from './look';

/** Where the big landmarks sit, shared by the ground and the scenery. */
export const MAP = {
  centre: { x: 180, z: 0 },
  hill: { x: 314, z: 16, r: 50, h: 19 },
  /** Where the trestle crosses the sheep field road. The valley floor there is kept low. */
  crossing: { x: 268, z: -53 },
  pond: { x: 162, z: -158, rx: 42, rz: 25 },
  /** The river of milk, from the milk silo south past the road. */
  river: [
    [70, 140],
    [69, 186],
    [63, 226],
    [46, 272],
    [20, 330],
  ] as [number, number][],
  milkLevel: -1.3,
  /** The milk factory's floor plan and the yard in front of it. */
  factory: { x0: 90, x1: 170, z0: 164, z1: 208 },
  yard: { x0: 150, x1: 232, z0: 100, z1: 214 },
  barns: { x0: 98, x1: 212, z0: -130, z1: -100 },
  inner: { x0: -150, x1: 520, z0: -330, z1: 330 },
};

function segDist(x: number, z: number, a: [number, number], b: [number, number]): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - a[0] - abx * t, z - a[1] - abz * t);
}

export function riverDist(x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < MAP.river.length - 1; i++) d = Math.min(d, segDist(x, z, MAP.river[i], MAP.river[i + 1]));
  return d;
}

const ellipse = (x: number, z: number, e: { x: number; z: number; rx: number; rz: number }) => ((x - e.x) / e.rx) ** 2 + ((z - e.z) / e.rz) ** 2;

function inRect(x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, pad: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return smoothstep(pad, 0, Math.hypot(dx, dz));
}

/** The farm before the road is cut into it: soft rolling fields, Big Hill, the pond, the milk river and far round hills. */
export function naturalHeight(x: number, z: number): number {
  const far = Math.hypot(x - MAP.centre.x, z - MAP.centre.z);
  const swell = 2.5 + 30 * smoothstep(260, 520, far);
  let h = 1 + (fbm(x / 110, z / 110, 3, 51) - 0.45) * swell;
  // Round hummocks in the fields, like a cartoon background.
  h += 3.5 * Math.max(0, fbm(x / 45, z / 45, 2, 77) - 0.55) * 6;
  const hd = Math.hypot(x - MAP.hill.x, (z - MAP.hill.z) * 0.92);
  h += MAP.hill.h * Math.cos((Math.PI / 2) * Math.min(1, hd / (MAP.hill.r + 8))) ** 2;
  const valley = smoothstep(36, 20, Math.hypot(x - MAP.crossing.x, z - MAP.crossing.z));
  h += (Math.min(h, 0.9) - h) * valley;
  const pond = ellipse(x, z, MAP.pond);
  h += (-2.6 - h) * smoothstep(1.05, 0.55, pond);
  h += (1.0 - h) * inRect(x, z, MAP.yard, 18);
  h += (1.4 - h) * inRect(x, z, MAP.barns, 14);
  h += (-3.2 - h) * smoothstep(11, 5, riverDist(x, z));
  return h;
}

const FIELD_TONES: RGB[] = [
  [0.42, 0.8, 0.27],
  [0.55, 0.84, 0.28],
  [0.34, 0.7, 0.24],
  [0.95, 0.82, 0.36],
  [0.47, 0.82, 0.3],
  [0.62, 0.86, 0.32],
];

/** Patchwork fields: each field its own green, some golden, some mown in stripes. */
export function fieldTint(x: number, z: number, h: number): RGB {
  const wx = x + (fbm(x / 60, z / 60, 2, 3) - 0.5) * 40;
  const wz = z + (fbm(z / 60, x / 60, 2, 4) - 0.5) * 40;
  const fx = Math.floor(wx / 64);
  const fz = Math.floor(wz / 56);
  const pick = hash2(fx, fz, 91);
  let c = FIELD_TONES[Math.floor(pick * FIELD_TONES.length)];
  if (pick > 0.8) {
    const stripe = Math.floor((pick > 0.9 ? wx : wz) / 5) % 2 === 0;
    c = stripe ? [0.5, 0.86, 0.3] : [0.38, 0.74, 0.25];
  }
  const far = Math.hypot(x - MAP.centre.x, z - MAP.centre.z);
  const high = smoothstep(4, 22, h) * 0.25;
  const out: RGB = [c[0] * (1 - high) + 0.4 * high, c[1] * (1 - high) + 0.82 * high, c[2] * (1 - high) + 0.3 * high];
  const blue = smoothstep(300, 600, far) * 0.3;
  return [out[0] * (1 - blue) + 0.45 * blue, out[1] * (1 - blue) + 0.75 * blue, out[2] * (1 - blue) + 0.6 * blue];
}

export function farmGround(L: Looks): GroundSpec {
  return {
    ...MAP.inner,
    cell: 5,
    height: naturalHeight,
    paint: () => L.grass,
    headwall: L.grass,
    tint: (x, z, h): RGB => {
      if (h < -0.6) {
        const milky = smoothstep(14, 8, riverDist(x, z));
        return milky > 0 ? [0.9, 0.9, 0.85] : [0.36, 0.62, 0.48];
      }
      return fieldTint(x, z, h);
    },
  };
}

/** Coarse rolling ground beyond the main terrain, out to the far hills. */
export function outerGround(batch: Batch, L: Looks): void {
  const CELL = 40;
  const { x0, x1, z0, z1 } = MAP.inner;
  const inside = (x: number, z: number) => x > x0 + CELL && x < x1 - CELL && z > z0 + CELL && z < z1 - CELL;
  const at = (x: number, z: number) => new THREE.Vector3(x, naturalHeight(x, z) - 0.6, z);
  const up = new THREE.Vector3(0, 1, 0);
  for (let z = -900; z < 900; z += CELL) {
    for (let x = -720; x < 1080; x += CELL) {
      if (inside(x, z) && inside(x + CELL, z) && inside(x, z + CELL) && inside(x + CELL, z + CELL)) continue;
      const a = at(x, z);
      const b = at(x + CELL, z);
      const c = at(x, z + CELL);
      const d = at(x + CELL, z + CELL);
      for (const tri of [
        [a, c, b],
        [b, c, d],
      ]) {
        const n = new THREE.Vector3().crossVectors(tri[1].clone().sub(tri[0]), tri[2].clone().sub(tri[0])).normalize();
        if (n.y < 0) n.negate();
        for (const v of tri) batch.vertex(L.grass, v, n.clone().lerp(up, 0.3).normalize(), v.x / 10, v.z / 10, fieldTint(v.x, v.z, v.y));
      }
    }
  }
}

/** Two rings of round hill flats on the horizon, like painted scenery at the back of the stage. */
export function farHills(L: Looks): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  for (const [radius, base, tone, seed] of [
    [980, 70, [0.36, 0.66, 0.3], 1],
    [1180, 120, [0.5, 0.72, 0.5], 2],
  ] as const) {
    const n = 160;
    const top = (i: number) => {
      const a = (i / n) * Math.PI * 2;
      const bumps = Math.abs(Math.sin(a * (7 + seed * 2) + seed)) * 0.6 + Math.abs(Math.sin(a * (3 + seed) + seed * 3)) * 0.4;
      return { x: MAP.centre.x + Math.cos(a) * radius, z: MAP.centre.z + Math.sin(a) * radius, h: base * (0.45 + bumps) };
    };
    for (let i = 0; i < n; i++) {
      const a = top(i);
      const b = top(i + 1);
      const quad = [
        [a.x, -20, a.z, 0.8],
        [a.x, a.h, a.z, 1],
        [b.x, -20, b.z, 0.8],
        [b.x, -20, b.z, 0.8],
        [a.x, a.h, a.z, 1],
        [b.x, b.h, b.z, 1],
      ];
      for (const [x, y, z, k] of quad) {
        pos.push(x, y, z);
        nor.push(0, 1, 0);
        uv.push(0, 0);
        col.push(tone[0] * k, tone[1] * k, tone[2] * k);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, L.hills);
  mesh.renderOrder = -1;
  return mesh;
}

/** The duck pond's water. */
export function pondWater(L: Looks): THREE.Mesh {
  const g = new THREE.CircleGeometry(1, 40);
  g.rotateX(-Math.PI / 2);
  g.scale(MAP.pond.rx * 1.25, 1, MAP.pond.rz * 1.6);
  g.translate(MAP.pond.x, 0, MAP.pond.z - 4);
  const uv = g.getAttribute('uv');
  const pos = g.getAttribute('position');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 12, pos.getZ(i) / 12);
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.count * 3).fill(1), 3));
  const mesh = new THREE.Mesh(g, L.water);
  mesh.renderOrder = 1;
  return mesh;
}

/** The river of milk: a strip along its course, flowing south. */
export function milkRiver(batch: Batch, L: Looks): void {
  const path = MAP.river;
  const pts: { x: number; z: number; tx: number; tz: number; v: number }[] = [];
  let v = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i];
    const [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / 4);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      pts.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / len, tz: (bz - az) / len, v: v + (len * t) / 8 });
    }
    v += len / 8;
  }
  const up = new THREE.Vector3(0, 1, 0);
  const W = 9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const corner = (p: typeof a, side: number) => new THREE.Vector3(p.x - p.tz * W * side, MAP.milkLevel, p.z + p.tx * W * side);
    const quad: [THREE.Vector3, number, number][] = [
      [corner(a, -1), 0, -a.v],
      [corner(a, 1), 1, -a.v],
      [corner(b, -1), 0, -b.v],
      [corner(a, 1), 1, -a.v],
      [corner(b, 1), 1, -b.v],
      [corner(b, -1), 0, -b.v],
    ];
    for (const [p, u, vv] of quad) batch.vertex(L.milk, p, up, u * 2, vv, [1, 1, 1]);
  }
}
