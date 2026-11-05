import { K } from '../../../shared/tracks/pirate-cove';
import type { RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { fbm, smoothstep, valueNoise } from '../../render/noise';
import type { GroundSpec } from '../../render/terrain';

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

export function island(mats: Materials): GroundSpec {
  return {
    x0: -330,
    x1: 330,
    z0: -340,
    z1: 240,
    height: naturalHeight,
    paint: ({ steep, top, low }) => ((top > 6 && steep) || low > 9 ? mats.rock : mats.sand),
    cliffs: [mats.rock],
    headwall: mats.rock,
    tint: (x, z, h, mat): RGB => {
      const v = 0.92 + valueNoise(x / 9, z / 9, 3) * 0.16;
      if (mat === mats.rock) {
        const moss = h > 13 ? smoothstep(13, 18, h) * 0.5 : 0;
        return [v * (1 - moss * 0.35), v * (1 + moss * 0.1), v * (1 - moss * 0.4)];
      }
      if (h < -0.4) return [0.72 * v, 0.78 * v, 0.72 * v];
      const wet = smoothstep(0.9, -0.2, h);
      const grassy = smoothstep(0.58, 0.72, fbm(x / 30, z / 30, 2, 11)) * smoothstep(1.3, 2.2, h);
      return [v * (1 - wet * 0.22 - grassy * 0.25), v * (1 - wet * 0.18 + grassy * 0.05), v * (1 - wet * 0.1 - grassy * 0.45)];
    },
  };
}
