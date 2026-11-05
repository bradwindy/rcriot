import type * as THREE from 'three';
import { PYRAMID, RIVER_LEVEL } from '../../../shared/tracks/inca-temple';
import type { Track } from '../../../shared/track';
import type { RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { fbm, smoothstep, valueNoise } from '../../render/noise';
import type { GroundSpec } from '../../render/terrain';
import type { IncaMats } from './palette';

export const BOUNDS = { x0: -330, x1: 350, z0: -470, z1: 270 };
/** The river runs west from the falls at the head of the gorge, under the bridge. */
export const RIVER = { level: RIVER_LEVEL, bed: -9.8, head: -84 };

export function riverZ(x: number): number {
  return -232 + 7 * Math.sin((x + 140) / 38);
}

/** Distance to the road on a coarse grid, so hills can rise away from it. */
function distanceField(track: Track): (x: number, z: number) => number {
  const cell = 8;
  const nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / cell) + 1;
  const nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / cell) + 1;
  const pts = [...track.samples, ...track.routes.flatMap((r) => r.track.samples)].filter((_, i) => i % 3 === 0);
  const grid = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = BOUNDS.x0 + i * cell;
      const z = BOUNDS.z0 + j * cell;
      let best = Infinity;
      for (const p of pts) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
      grid[j * nx + i] = Math.sqrt(best);
    }
  }
  const at = (i: number, j: number) => grid[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
  return (x, z) => {
    const fi = (x - BOUNDS.x0) / cell;
    const fj = (z - BOUNDS.z0) / cell;
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const tx = fi - i;
    const tz = fj - j;
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return a + (b - a) * tz;
  };
}

/** How deep the gorge cuts at a point, 0 outside it to 1 at the river. */
export function gorgeDepth(x: number, z: number): number {
  const along = smoothstep(RIVER.head + 6, RIVER.head - 14, x) * smoothstep(-340, -300, x);
  const d = Math.abs(z - riverZ(x));
  const half = 30 + 6 * Math.sin(x / 23);
  return along * smoothstep(half, 13, d);
}

/** The land before the road is cut in: a jungle basin ringed by hills, a gorge, the cave's hill and two clearings. */
export function naturalHeight(track: Track): (x: number, z: number) => number {
  const away = distanceField(track);
  return (x, z) => {
    let h = 1.3 + (fbm(x / 50, z / 50, 3, 7) - 0.5) * 2.4;
    const d = away(x, z);
    const hill = 6 + 34 * fbm(x / 80, z / 80, 3, 11);
    h += hill * smoothstep(22, 85, d);
    // The cave runs through a long hill.
    const cave = ((x + 36) / 42) ** 2 + ((z + 28) / 66) ** 2;
    h += 19 * smoothstep(1.1, 0.45, cave) * (0.85 + 0.3 * fbm(x / 20, z / 20, 2, 5));
    // A cliff behind the falls at the head of the gorge.
    const head = Math.hypot((x - RIVER.head - 16) / 26, (z - riverZ(RIVER.head)) / 40);
    h += 16 * smoothstep(1.2, 0.5, head);
    // Clearings: the temple plaza and the village.
    const plaza = Math.max(Math.abs(x - PYRAMID.x - 20) / 135, Math.abs(z - PYRAMID.z - 20) / 85);
    const village = Math.hypot((x + 148) / 42, (z + 88) / 75);
    const flat = Math.max(smoothstep(1.05, 0.8, plaza), smoothstep(1.1, 0.75, village));
    h += (1.3 - h) * flat;
    const g = gorgeDepth(x, z);
    if (g > 0) h += (RIVER.bed - h) * g ** 0.8;
    return h;
  };
}

export function jungleGround(track: Track, mats: Materials, inca: IncaMats): GroundSpec {
  return {
    ...BOUNDS,
    cell: 5,
    blend: 12,
    height: naturalHeight(track),
    paint: ({ steep, low, top }) => (steep && top - low > 1.2 ? mats.rock : low < -7 ? inca.mud : inca.ground),
    cliffs: [mats.rock],
    headwall: mats.rock,
    tint: (x: number, z: number, h: number, mat: THREE.Material): RGB => {
      const v = 0.86 + valueNoise(x / 13, z / 13, 3) * 0.24;
      if (mat === mats.rock) {
        const moss = smoothstep(0.45, 0.7, fbm(x / 9, (z + h) / 9, 2, 4));
        return [v * (0.92 - moss * 0.3), v * (0.95 + moss * 0.05), v * (0.85 - moss * 0.35)];
      }
      if (mat === inca.mud) return [v, v, v];
      const sun = smoothstep(0.5, 0.75, fbm(x / 40, z / 40, 2, 9));
      const wet = smoothstep(-2, -7, h);
      return [v * (1 + sun * 0.18 - wet * 0.2), v * (1 + sun * 0.08 - wet * 0.12), v * (1 - sun * 0.1 - wet * 0.15)];
    },
  };
}
