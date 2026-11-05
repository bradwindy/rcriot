import * as THREE from 'three';
import type { RGB } from '../../render/geometry';
import { fbm, hash2, smoothstep, valueNoise } from '../../render/noise';
import type { GroundSpec } from '../../render/terrain';
import type { MadMats } from './materials';
import { groundHeight, land, MOAT, outside } from './plan';

export function grounds(m: MadMats): GroundSpec {
  return {
    x0: -260,
    x1: 300,
    z0: -330,
    z1: 290,
    cell: 5,
    height: groundHeight,
    paint: ({ steep, low }) => (steep || low < -2.5 ? m.cliff : m.grass),
    cliffs: [m.cliff],
    headwall: m.stone,
    blend: 12,
    tint: (x, z, h, mat): RGB => {
      const v = 0.9 + valueNoise(x / 11, z / 11, 5) * 0.2;
      if (mat === m.cliff) {
        const wet = smoothstep(-1, -4, h);
        return [v * (1 - wet * 0.3), v * (1 - wet * 0.1), v * (1 - wet * 0.35)];
      }
      const mossy = smoothstep(0.55, 0.7, fbm(x / 40, z / 40, 2, 47));
      return [v * (1 - mossy * 0.2), v * (1 + mossy * 0.08), v * (1 - mossy * 0.15)];
    },
  };
}

/** The moat's goo: one rolling sheet over the moat cells only, so none of it shows inside the castle or the dungeon. */
export function moat(m: MadMats): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const C = 4;
  const wet = (x: number, z: number) => outside(x, z) > -1 && land(x, z) < 0.98;
  for (let z = -180; z < 170; z += C) {
    for (let x = -170; x < 160; x += C) {
      if (![[x, z], [x + C, z], [x, z + C], [x + C, z + C]].some(([a, b]) => wet(a, b) && outside(a, b) > 0)) continue;
      const quad = [
        [x, z],
        [x, z + C],
        [x + C, z],
        [x + C, z],
        [x, z + C],
        [x + C, z + C],
      ];
      for (const [a, b] of quad) {
        pos.push(a, MOAT.level, b);
        uv.push(a / 14, b / 14);
        const glow = 0.26 + 0.2 * valueNoise(a / 20, b / 20, 9);
        col.push(0.8 * glow, glow, 0.7 * glow);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return new THREE.Mesh(g, m.goo);
}

/** A ring of jagged black crags round the valley, with a ruined castle on one of them, lost in the rain. */
export function crags(batch: { vertex: (m: THREE.Material, p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c?: RGB) => void }, m: MadMats): void {
  const n = 120;
  const ring = (i: number) => {
    const a = (i / n) * Math.PI * 2;
    const r = 560 + valueNoise(i * 0.25, 1, 51) * 140;
    const lump = valueNoise(i * 0.18, 3, 53);
    const spike = hash2(i, 0, 57) > 0.7 ? 30 : 0;
    const h = 30 + lump * 150 + spike;
    return new THREE.Vector3(Math.cos(a) * r + 20, h, Math.sin(a) * r - 20);
  };
  for (let i = 0; i < n; i++) {
    const a = ring(i);
    const b = ring(i + 1);
    const a0 = a.clone().setY(-10);
    const b0 = b.clone().setY(-10);
    const normal = new THREE.Vector3(-(a.x + b.x), 0, -(a.z + b.z)).normalize();
    const shade: RGB = [0.5, 0.48, 0.6];
    for (const [p, u, v] of [
      [a0, i, 0],
      [a, i, 1],
      [b0, i + 1, 0],
      [b0, i + 1, 0],
      [a, i, 1],
      [b, i + 1, 1],
    ] as const) {
      batch.vertex(m.crag, p, normal, u / 2, (v * p.y) / 20, shade);
    }
  }
}
