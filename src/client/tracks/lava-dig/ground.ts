import { CALDERA } from '../../../shared/tracks/lava-dig';
import type { RGB } from '../../render/geometry';
import { fbm, smoothstep, valueNoise } from '../../render/noise';
import type { GroundSpec } from '../../render/terrain';
import type { LavaMats } from './materials';

/** Where the cliff ring at the volcano's foot stands, from the crater's centre. */
export const CLIFF = 258;
/** Height of the crater's rim. */
export const RIM = 56;

export const fromCrater = (x: number, z: number): number => Math.hypot(x - CALDERA.x, z - CALDERA.z);

/** The lava river: it pours out of the cliff and runs straight away from the crater across the flats, under the road. */
const FLOW_AT = { x: -172.5, z: -94.5 };
const FLOW_LEN = Math.hypot(FLOW_AT.x - CALDERA.x, FLOW_AT.z - CALDERA.z);
export const FLOW = {
  dir: { x: (FLOW_AT.x - CALDERA.x) / FLOW_LEN, z: (FLOW_AT.z - CALDERA.z) / FLOW_LEN },
  /** Along the river from the crater: where it leaves the cliff, and where it ends. */
  from: CLIFF - 4,
  to: FLOW_LEN + 140,
  level: -1.6,
  width: 7,
};

/** Distance along the river from the crater, and across it. */
export function onFlow(x: number, z: number): { along: number; across: number } {
  const dx = x - CALDERA.x;
  const dz = z - CALDERA.z;
  return { along: dx * FLOW.dir.x + dz * FLOW.dir.z, across: Math.abs(dx * FLOW.dir.z - dz * FLOW.dir.x) };
}

/**
 * The land before the road is cut in: ash flats, a ring of basalt cliffs, the volcano's cone, and inside the rim the
 * magma chamber: a sheer wall down to a ledge round the lava lake.
 */
export function naturalHeight(x: number, z: number): number {
  const r = fromCrater(x, z);
  const a = Math.atan2(z - CALDERA.z, x - CALDERA.x);
  const flats = 0.4 + (fbm(x / 45, z / 45, 3, 3) - 0.5) * 2.2;
  const jag = (valueNoise(a * 9, 1, 4) - 0.5) * 10;
  const cliff = smoothstep(CLIFF + 6, CLIFF - 6, r + jag);
  const cone = 20 + (RIM - 20) * smoothstep(CLIFF - 8, 104, r) ** 1.15 + (fbm(x / 30, z / 30, 3, 8) - 0.5) * 6;
  let h = flats * (1 - cliff) + cone * cliff;
  const inside = smoothstep(CALDERA.wall + 12, CALDERA.wall + 2, r);
  if (inside > 0) {
    const wall = smoothstep(CALDERA.ledge + 10, CALDERA.wall + 4, r);
    const ledge = 0.2 + (valueNoise(x / 6, z / 6, 5) - 0.5) * 0.8;
    const lakeBed = -10;
    const floor = r < CALDERA.lake ? lakeBed : r < CALDERA.lake + 6 ? lakeBed + (ledge - lakeBed) * smoothstep(CALDERA.lake, CALDERA.lake + 6, r) : ledge;
    const inner = floor + (RIM + 2 - floor) * wall ** 1.6 + (wall > 0.05 && wall < 0.95 ? jag * 0.5 : 0);
    h = h * (1 - inside) + inner * inside;
  }
  const f = onFlow(x, z);
  if (f.along > FLOW.from - 6 && f.along < FLOW.to + 10) {
    const bank = smoothstep(FLOW.width + 3, FLOW.width / 2, f.across) * smoothstep(FLOW.from - 6, FLOW.from, f.along) * smoothstep(FLOW.to + 10, FLOW.to, f.along);
    h += (FLOW.level - 1.2 - h) * bank;
  }
  return h;
}

/** Ash on the flats and slopes, basalt on cliffs and walls, rubble down by the lava. Inside the rim it is dark. */
export function volcanoGround(m: LavaMats): GroundSpec {
  return {
    x0: -320,
    x1: 300,
    z0: -680,
    z1: 80,
    cell: 5,
    height: naturalHeight,
    paint: ({ steep, top, low }) => (steep ? m.groundRock : low < -1.5 || (top < 3 && low < 0.3) ? m.groundRubble : m.ground),
    cliffs: [m.groundRock],
    headwall: m.basaltIn,
    tint: (x, z, h, mat): RGB => {
      const r = fromCrater(x, z);
      const inside = smoothstep(CALDERA.wall + 14, CALDERA.wall + 4, r);
      const v = 0.92 + valueNoise(x / 11, z / 11, 3) * 0.16;
      // The chamber is lit by its lava, not the sky.
      const dark = 1 - inside * 0.62;
      if (mat === m.groundRock) return [v * dark, v * 0.94 * dark, v * 0.9 * dark];
      const scorch = smoothstep(4, -2, h) * 0.25;
      return [v * dark * (1 - scorch * 0.2), v * 0.95 * dark * (1 - scorch * 0.5), v * 0.92 * dark * (1 - scorch * 0.6)];
    },
  };
}
