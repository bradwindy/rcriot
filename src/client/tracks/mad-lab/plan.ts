import { TOWER } from '../../../shared/tracks/mad-lab';
import { fbm, smoothstep } from '../../render/noise';

/** The castle's outline: curtain walls round the yard, the laboratory along the north, the tower on its west end. */
export const CASTLE = { x0: -110, x1: 94, z0: -68, z1: 110 };
/** Inside faces of the curtain walls. */
export const YARD = { x0: -102, x1: 86, z0: -14, z1: 102 };
export const LAB = { x0: -49, x1: 86, z0: -66, z1: -14 };
/** The tower's inner and outer wall radius and its top. */
export const KEEP = { inner: 32, outer: 35, top: 36 };
export const GATE = { x: -20, z0: 86, z1: 110 };
/** Floor level of the yard, the laboratory and the tower, a little under the castle roads. */
export const FLOOR = 0.85;
export const MOAT = { width: 36, level: -1.5, bed: -6 };
/** The moat widens into a pool at the north-west, where the leap from the tower comes down. */
const POOL = { x: -100, z: -100, r: 36 };

export { TOWER };

/** Distance outside the castle's footprint, 0 inside it. */
export function outside(x: number, z: number): number {
  const dx = Math.max(CASTLE.x0 - x, 0, x - CASTLE.x1);
  const dz = Math.max(CASTLE.z0 - z, 0, z - CASTLE.z1);
  const tower = Math.max(0, Math.hypot(x - TOWER.x, z - TOWER.z) - KEEP.outer);
  return Math.min(Math.hypot(dx, dz), tower);
}

/** 0 in the moat, 1 on the banks. */
export function land(x: number, z: number): number {
  const d = outside(x, z);
  const pool = Math.hypot(x - POOL.x, z - POOL.z);
  return Math.min(smoothstep(MOAT.width - 3, MOAT.width + 1, d), smoothstep(POOL.r - 3, POOL.r + 1, pool));
}

/** The ground before the road is cut in: a sunken footprint under the castle, the moat, then banks rising to hills. */
export function groundHeight(x: number, z: number): number {
  const d = outside(x, z);
  if (d <= 0) return -10;
  const far = smoothstep(MOAT.width + 40, MOAT.width + 180, d);
  const hills = far * (6 + fbm(x / 80, z / 80, 3, 41) * 46) + (fbm(x / 25, z / 25, 2, 43) - 0.5) * 1.6 * smoothstep(MOAT.width + 6, MOAT.width + 20, d);
  const bank = 0.7 + Math.max(0, hills);
  return MOAT.bed + (bank - MOAT.bed) * land(x, z);
}

/** Under a roof or underground: the laboratory, the gatehouse passage and the dungeon, where no rain falls. */
export function roofedAt(x: number, y: number, z: number): boolean {
  const inLab = x > LAB.x0 && x < LAB.x1 + 1 && z > LAB.z0 - 1 && z < LAB.z1 + 1 && Math.hypot(x - TOWER.x, z - TOWER.z) > KEEP.outer;
  const inGate = Math.abs(x - GATE.x) < 10 && z > GATE.z0 && z < GATE.z1 - 2;
  return (inLab && y < 18) || (inGate && y < 8) || (outside(x, z) <= 0 && y < FLOOR - 0.6);
}
