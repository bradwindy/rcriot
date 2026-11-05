import { POOL, SILO } from '../../../shared/tracks/reactor';
import type { Batch, RGB } from '../../render/geometry';
import { smoothstep, valueNoise } from '../../render/noise';
import { buildTerrain, type Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import type { ReactorMats } from './materials';

type Rect = [x0: number, x1: number, z0: number, z1: number];

/** The reactor hall and the goo hall: one building, the union of two boxes. */
export const HALLS: Rect[] = [
  [-112, 20, -248, -84],
  [-236, -76, -132, 24],
];
export const ROOF = 22;

/** Its outline, counter-clockwise from above, for the walls. */
export const OUTLINE: [number, number][] = [
  [-112, -248],
  [20, -248],
  [20, -84],
  [-76, -84],
  [-76, 24],
  [-236, 24],
  [-236, -132],
  [-112, -132],
];

/** The floor inside, and the ground outside, split into boxes that tile the world without overlapping. */
const INSIDE: Rect[] = [
  [-236, -76, -132, 24],
  [-112, 20, -248, -132],
  [-76, 20, -132, -84],
];
const OUTSIDE: Rect[] = [
  [-332, 120, 24, 240],
  [-332, -236, -300, 24],
  [-236, 120, -300, -248],
  [20, 120, -248, 24],
  [-236, -112, -248, -132],
  [-76, 20, -84, 24],
];

export const SHAFT = 9;

/** The floor before the road is cut in: flat, with the goo pool sunk in the corner of the L and the silo shaft. */
export function floorHeight(x: number, z: number): number {
  if (x > POOL.x0 && x < POOL.x1 && z > POOL.z0 && z < POOL.z1) return POOL.floor;
  if (Math.hypot(x - SILO.x, z - SILO.z) < SHAFT + 1) return -14;
  return 0;
}

export function inHalls(x: number, z: number): boolean {
  return HALLS.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
}

export function buildGround(index: TrackIndex, batch: Batch, m: ReactorMats): Terrain {
  const tint = (inside: boolean) => (x: number, z: number, _h: number, mat: unknown): RGB => {
    const v = 0.94 + valueNoise(x / 23, z / 23, 4) * 0.08;
    if (mat === m.concrete || mat === m.concreteIn) return [v * 0.9, v * 0.9, v * 0.88];
    if (inside) return [v * 0.86, v * 0.92, v * 0.95];
    // Scorch round the silo, where the exhaust has blackened the apron.
    const burn = smoothstep(40, 14, Math.hypot(x - SILO.x, z - SILO.z));
    return [v * (0.78 - burn * 0.45), v * (0.8 - burn * 0.45), v * (0.76 - burn * 0.42)];
  };
  const spec = (r: Rect, inside: boolean) => ({
    x0: r[0],
    x1: r[1],
    z0: r[2],
    z1: r[3],
    cell: inside ? 2 : 4,
    blend: 4,
    height: floorHeight,
    paint: ({ steep }: { steep: boolean }) => (steep ? (inside ? m.concreteIn : m.concrete) : inside ? m.floorIn : m.floorOut),
    cliffs: [m.concrete, m.concreteIn],
    headwall: m.concrete,
    tint: tint(inside),
  });
  const parts = [
    ...INSIDE.map((r) => ({ r, t: buildTerrain(index, batch, spec(r, true)) })),
    ...OUTSIDE.map((r) => ({ r, t: buildTerrain(index, batch, spec(r, false)) })),
  ];
  // Each box only knows its own heights, so ask the one the point is in.
  return {
    height: (x, z) => {
      const part = parts.find(({ r }) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3]);
      return part ? part.t.height(x, z) : 0;
    },
  };
}
