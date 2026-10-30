import * as THREE from 'three';
import { K } from '../../shared/circuit';
import { limitOf, surfaceY } from '../../shared/track';
import { Batch, type RGB } from './geometry';
import type { Materials } from './materials';
import { fbm, smoothstep, valueNoise } from './noise';
import type { TrackIndex } from './trackindex';

const CELL = 4;
const X0 = -330;
const X1 = 330;
const Z0 = -340;
const Z1 = 240;
/** Clearance kept above the cave roof, so the hillside never pokes into the tunnel. */
export const TUNNEL_HEIGHT = 7.5;

function ellipse(x: number, z: number, cx: number, cz: number, rx: number, rz: number): number {
  return ((x - cx * K) / (rx * K)) ** 2 + ((z - cz * K) / (rz * K)) ** 2;
}

/** The island before the track is cut into it: beach, a lagoon open to the sea, dunes and a rocky headland. */
export function naturalHeight(x: number, z: number): number {
  const island = smoothstep(1.05, 0.8, ellipse(x, z, -10, -30, 175, 115));
  const lagoon = smoothstep(1.0, 0.6, ellipse(x, z, 55, -120, 80, 55));
  const land = island * (1 - lagoon);
  const dunes = (fbm(x / 40, z / 40, 3, 5) - 0.45) * 3.2;
  let h = -5 + (6 + Math.max(0, dunes)) * land;
  const d = Math.hypot(x + 125 * K, z - 25 * K);
  h += 19 * smoothstep(65, 27, d) * (0.8 + 0.4 * fbm(x / 18, z / 18, 3, 9)) * island;
  return h;
}

export interface Terrain {
  height(x: number, z: number): number;
}

export function buildTerrain(index: TrackIndex, mats: Materials, batch: Batch): Terrain {
  const nx = Math.round((X1 - X0) / CELL) + 1;
  const nz = Math.round((Z1 - Z0) / CELL) + 1;
  const heights = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = X0 + i * CELL;
      const z = Z0 + j * CELL;
      let h = naturalHeight(x, z);
      const near = index.nearest(x, z, 40);
      if (near) {
        const p = near.sample;
        const limit = limitOf(p);
        const road = surfaceY(p, near.offset) - 0.3;
        if (p.cover === 'tunnel') {
          if (near.d < limit + 7) h = Math.max(h, p.y + TUNNEL_HEIGHT + 2.5);
        } else if (p.cover === 'pier') {
          if (near.d < limit + 2) h = Math.min(h, road - 1.6);
        } else {
          h += (road - h) * smoothstep(limit + 16, limit + 2.5, near.d);
        }
      }
      heights[j * nx + i] = h;
    }
  }

  const at = (i: number, j: number) => heights[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  const point = (i: number, j: number) => new THREE.Vector3(X0 + i * CELL, at(i, j), Z0 + j * CELL);
  const normal = (i: number, j: number) =>
    new THREE.Vector3(at(i - 1, j) - at(i + 1, j), 2 * CELL, at(i, j - 1) - at(i, j + 1)).normalize();
  const tint = (i: number, j: number, rocky: boolean): RGB => {
    const x = X0 + i * CELL;
    const z = Z0 + j * CELL;
    const h = at(i, j);
    const v = 0.92 + valueNoise(x / 9, z / 9, 3) * 0.16;
    if (rocky) {
      const moss = h > 13 ? smoothstep(13, 18, h) * 0.5 : 0;
      return [v * (1 - moss * 0.35), v * (1 + moss * 0.1), v * (1 - moss * 0.4)];
    }
    if (h < -0.4) return [0.72 * v, 0.78 * v, 0.72 * v];
    const wet = smoothstep(0.9, -0.2, h);
    const grassy = smoothstep(0.58, 0.72, fbm(x / 30, z / 30, 2, 11)) * smoothstep(1.3, 2.2, h);
    return [
      v * (1 - wet * 0.22 - grassy * 0.25),
      v * (1 - wet * 0.18 + grassy * 0.05),
      v * (1 - wet * 0.1 - grassy * 0.45),
    ];
  };

  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const flip = (i + j) % 2 === 0;
      const tris: [number, number][][] = flip
        ? [
            [[i, j], [i, j + 1], [i + 1, j]],
            [[i + 1, j], [i, j + 1], [i + 1, j + 1]],
          ]
        : [
            [[i, j], [i, j + 1], [i + 1, j + 1]],
            [[i, j], [i + 1, j + 1], [i + 1, j]],
          ];
      for (const tri of tris) {
        const pts = tri.map(([a, b]) => point(a, b));
        const top = Math.max(...pts.map((p) => p.y));
        const low = Math.min(...pts.map((p) => p.y));
        const face = new THREE.Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0])).normalize();
        const steep = Math.abs(face.y) < 0.8;
        const rocky = (top > 6 && steep) || low > 9;
        const mat = rocky ? mats.rock : mats.sand;
        tri.forEach(([a, b], k) => {
          const p = pts[k];
          let u = p.x / 10;
          let v = p.z / 10;
          if (rocky && steep) {
            u = (Math.abs(face.x) > Math.abs(face.z) ? p.z : p.x) / 10;
            v = p.y / 10;
          }
          batch.vertex(mat, p, normal(a, b), u, v, tint(a, b, rocky));
        });
      }
    }
  }

  return {
    height(x: number, z: number): number {
      const fi = (x - X0) / CELL;
      const fj = (z - Z0) / CELL;
      const i = Math.floor(fi);
      const j = Math.floor(fj);
      const tx = fi - i;
      const tz = fj - j;
      const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
      const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
      return a + (b - a) * tz;
    },
  };
}
