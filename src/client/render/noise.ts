/** Deterministic hash of a lattice point to 0..1. */
export function hash2(x: number, z: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(x: number, z: number, seed = 0): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

export function fbm(x: number, z: number, octaves: number, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x, z, seed + i * 31) * amp;
    norm += amp;
    x *= 2.03;
    z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return smooth(t);
}
