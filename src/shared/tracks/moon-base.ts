import type { TrackDef } from '../course';
import type { ControlPoint, Cover, Surface } from '../track';

/** Share of normal gravity out on the surface. Inside the base it is normal. */
export const MOON_G = 0.45;

type Stretch = 'apron' | 'surface' | 'airlock' | 'lab' | 'hall' | 'rotunda' | 'gallery' | 'tube' | 'ring' | 'crater' | 'chasm';
type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch, g?: number];

const COVER: Record<Stretch, Cover> = {
  apron: 'open',
  surface: 'open',
  crater: 'open',
  chasm: 'deck',
  airlock: 'indoor',
  lab: 'indoor',
  hall: 'indoor',
  rotunda: 'indoor',
  gallery: 'indoor',
  ring: 'indoor',
  tube: 'deck',
};
const OUTSIDE = new Set<Stretch>(['apron', 'surface', 'crater', 'chasm']);

/**
 * Moon Base: out of the hangar apron, through the airlock into the lab, round the laser hall and up the rotunda,
 * along a glass tube over the surface, out of a high airlock onto a ramp, and back across the craters in low gravity.
 */
const ROWS: Row[] = [
  [0, 0, 1, 14, 3, 0, 'dust', 'apron'], // start line on the landing apron
  [0, -32, 1, 14, 3, 0, 'dust', 'apron'],
  [0, -56, 1, 14, 1, 0, 'metal', 'airlock'], // airlock A
  [0, -76, 1, 14, 1, 0, 'metal', 'lab', 1],
  [3, -96, 1, 14, 1, 0, 'metal', 'lab'],
  [16, -116, 1, 14, 1, 0, 'metal', 'lab'],
  [40, -127, 1, 16, 1, 0, 'metal', 'hall'], // the mining laser hall
  [68, -129, 1, 16, 1, 0, 'metal', 'hall'],
  [92, -127, 1, 16, 1, 0, 'metal', 'hall'],
  [114, -136, 1.6, 14, 1, 6, 'metal', 'rotunda'], // hairpin round the hologram, climbing
  [122, -156, 3, 14, 1, 8, 'metal', 'rotunda'],
  [110, -175, 4.5, 14, 1, 6, 'metal', 'rotunda'],
  [86, -180, 5.5, 14, 1, 0, 'metal', 'gallery'],
  [58, -180, 7.5, 14, 1, 0, 'metal', 'gallery'],
  [30, -180, 9, 13, 1, 0, 'metal', 'airlock'], // airlock B
  [8, -181, 9.5, 12, 0.8, 0, 'metal', 'tube'], // the glass tube
  [-22, -176, 10, 12, 0.8, 0, 'metal', 'tube'],
  [-50, -158, 10, 12, 0.8, -4, 'metal', 'tube'],
  [-68, -128, 10, 12, 0.8, -4, 'metal', 'tube'],
  [-74, -90, 10, 12, 0.8, 0, 'metal', 'tube'],
  [-72, -48, 10, 12, 0.8, 0, 'metal', 'tube'],
  [-64, -8, 10, 12, 0.8, -3, 'metal', 'tube'],
  [-50, 28, 10, 12, 0.8, -4, 'metal', 'tube'],
  [-26, 50, 10, 12, 0.8, -2, 'metal', 'tube'],
  [0, 58, 10, 12, 0.8, 0, 'metal', 'tube'], // over the start straight
  [36, 58, 10, 12, 0.8, 0, 'metal', 'tube'],
  [70, 52, 10, 12, 0.8, 0, 'metal', 'tube'],
  [92, 50, 10, 13, 1, 0, 'metal', 'airlock', 1], // airlock C, high up
  [112, 50, 10, 14, 2, 0, 'dust', 'surface', MOON_G],
  [125, 50, 10, 14, 2, 0, 'dust', 'surface'], // the lip: off the ramp into low gravity
  [146, 52, 4, 14, 3, 0, 'dust', 'surface'],
  [164, 58, 1, 14, 3, 0, 'dust', 'surface'],
  [180, 74, 1, 14, 3, -6, 'dust', 'surface'],
  [186, 98, 1, 14, 3, 0, 'dust', 'surface'],
  [187, 122, 1, 14, 3, 0, 'dust', 'surface'],
  [187, 134, 1.2, 14, 3, 0, 'dust', 'surface'],
  [187, 143, 3.4, 14, 3, 0, 'dust', 'surface'], // crater rim
  [187, 159, 0, 14, 3, 0, 'dust', 'surface'],
  [186, 178, -0.6, 14, 3, 0, 'dust', 'surface'],
  [183, 196, 1.5, 14, 3, 0, 'dust', 'surface'],
  [176, 214, 0.8, 14, 3, 0, 'dust', 'surface'],
  [162, 236, 1, 14, 3, -6, 'dust', 'surface'],
  [140, 258, 1, 14, 3, 0, 'dust', 'surface'], // the fork
  [112, 280, 1, 13, 1, 0, 'metal', 'airlock'], // into the hab ring
  [87, 300, 1, 13, 1, 0, 'metal', 'ring', 1],
  [77, 322, 1, 13, 1, 0, 'metal', 'ring'],
  [58, 335, 1, 13, 1, 0, 'metal', 'ring'],
  [34, 337, 1, 13, 1, 0, 'metal', 'ring'],
  [12, 327, 1, 13, 1, 0, 'metal', 'ring'],
  [-1, 308, 1, 13, 1, 0, 'metal', 'ring'],
  [-4, 288, 1, 13, 1, 0, 'metal', 'airlock'],
  [-6, 264, 1, 14, 3, 0, 'dust', 'surface', MOON_G],
  [-8, 240, 1, 14, 3, 0, 'dust', 'surface'],
  [-10, 216, 1, 14, 3, 0, 'dust', 'surface'], // the shortcut joins
  [-8, 202, 1.2, 14, 3, 0, 'dust', 'surface'],
  [-6, 193, 3.2, 14, 3, 0, 'dust', 'surface'], // crater rim
  [-3, 177, 0.2, 14, 3, 0, 'dust', 'surface'],
  [0, 160, 0.8, 14, 3, 0, 'dust', 'surface'],
  [1, 134, 1, 14, 3, 0, 'dust', 'surface'],
  [0, 100, 1, 14, 3, 0, 'dust', 'apron'],
  [0, 60, 1, 14, 3, 0, 'dust', 'apron'],
  [0, 30, 1, 14, 3, 0, 'dust', 'apron'],
];

/** The shortcut across the crater field: under the lander, over a crevasse and past the greenhouse dome. */
const FORK_ROWS: Row[] = [
  [118, 256, 1, 11, 1.5, 0, 'dust', 'crater'],
  [98, 250, 1, 11, 1.5, 0, 'dust', 'crater'], // under the lander
  [80, 246, 1.3, 11, 1.5, 0, 'dust', 'crater'],
  [71, 245, 3.2, 11, 1.5, 0, 'dust', 'crater'], // crevasse lip
  [64, 244, -3, 11, 1.5, 0, 'void', 'chasm'],
  [54, 244, -3, 11, 1.5, 0, 'void', 'chasm'],
  [46, 244, 1, 11, 1.5, 0, 'dust', 'crater'],
  [24, 242, 1, 11, 1.5, 0, 'dust', 'crater'],
  [6, 234, 1, 11, 1.5, 0, 'dust', 'crater'],
  [-4, 228, 1, 12, 2, 0, 'dust', 'crater'],
];

function point([x, z, y, width, shoulder, bank, surface, stretch, g]: Row, gravity: number): ControlPoint {
  return { x, z, y, width, shoulder, bank, surface, cover: COVER[stretch], zone: stretch, dark: OUTSIDE.has(stretch) ? false : undefined, gravity: g ?? gravity };
}

function points(rows: Row[], start: number): ControlPoint[] {
  let g = start;
  return rows.map((r) => {
    g = r[8] ?? g;
    return point(r, g);
  });
}

const POINTS = points(ROWS, MOON_G);

export const MOON_BASE: TrackDef = {
  points: POINTS,
  fork: { from: 42, to: 53, points: points(FORK_ROWS, MOON_G) },
  hazards: [
    // A mining laser on a gantry, sweeping across the hall.
    { kind: 'sweep', route: 0, s: 180, offset: 0, period: 3.2, phase: 0, radius: 1.5, reach: 5.6, duty: 1, height: 6, effect: 'spin' },
    // The lander's descent engine, firing down onto the shortcut between its legs.
    { kind: 'burst', route: 1, s: 1126, offset: 0, period: 3.8, phase: 0.3, radius: 3.2, reach: 0, duty: 0.3, height: 6, effect: 'launch' },
  ],
  boxes: [0.07, 0.3, 0.585, 0.88],
};
