import type { TrackDef } from '../course';
import type { Hazard } from '../hazards';
import { buildTrack, type ControlPoint, type Cover, type Surface } from '../track';

/** The reactor's centre and the radius of the gantry ring round it. */
export const CORE = { x: -45, z: -180, r: 46 };
/** The rocket silo's centre and the radius of the tube that spirals up round it. */
export const SILO = { x: -204, z: 74, r: 46 };
/** The goo pool: a sunk basin in the corner of the L the main road takes round it, and its surface. */
export const POOL = { x0: -212, x1: -116, z0: -124, z1: -16, floor: -5, level: -3.2 };
/** The hairpin before the start straight. */
export const HAIRPIN = { x: 40, z: 167, r: 21 };
/** Height the tube climbs in one full turn. */
const CLIMB = 13;
export const BASE = 0.3;
/** Where the tube ends and the open gantry over its mouth begins, in degrees round the silo. */
export const TUBE_END = 470;

type Stretch = 'apron' | 'hall' | 'ring' | 'goo' | 'catwalk' | 'ramp' | 'tube' | 'gantry';
type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch];

const COVER: Record<Stretch, Cover> = {
  apron: 'open',
  hall: 'indoor',
  ring: 'deck',
  goo: 'indoor',
  catwalk: 'deck',
  ramp: 'deck',
  tube: 'deck',
  gantry: 'deck',
};

/** Points round a circle, counter-clockwise on the map from `a0` to `a1` degrees (0 east, 90 north). */
function arc(c: { x: number; z: number; r: number }, a0: number, a1: number, step: number, row: (a: number) => [number, number, number, number, Surface, Stretch]): Row[] {
  const out: Row[] = [];
  const n = Math.round(Math.abs(a1 - a0) / step);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const r = (a * Math.PI) / 180;
    const [y, width, shoulder, bank, surface, stretch] = row(a);
    out.push([c.x + Math.cos(r) * c.r, c.z - Math.sin(r) * c.r, y, width, shoulder, bank, surface, stretch]);
  }
  return out;
}

export const RING_Y = 5.6;
export const helixY = (a: number) => 5 + (CLIMB * (a - 180)) / 360;

/** Reactor: out of the launch apron, round the reactor core on a gantry, past the goo pool and up the rocket tube. */
const ROWS: Row[] = [
  [0, 0, BASE, 14, 3, 0, 'asphalt', 'apron'], // start line on the launch apron
  [0, -36, BASE, 14, 3, 0, 'asphalt', 'apron'],
  [0, -50, BASE + 0.5, 14, 3, 0, 'asphalt', 'apron'], // kicker over the blast deflector
  [0, -57, BASE + 2.4, 14, 3, 0, 'metal', 'apron'],
  [0, -66, BASE + 0.4, 14, 3, 0, 'asphalt', 'apron'],
  [0, -86, BASE, 14, 2, 0, 'metal', 'hall'], // blast doors into the reactor hall
  [0.5, -101, 1.8, 13.5, 1.5, 2, 'metal', 'ring'],
  [1, -124, RING_Y - 0.5, 13, 1, 4, 'metal', 'ring'], // ramp up onto the gantry ring
  ...arc(CORE, 0, 180, 45, (a) => [RING_Y, 13, 1, a > 170 ? 8 : 16, 'metal', 'ring']),
  [-92, -152, RING_Y + 0.3, 13, 1, 0, 'metal', 'ring'], // the ring ends in a drop
  [-94, -144, 1.9, 14, 2, 0, 'metal', 'goo'],
  [-95, -136, BASE, 14, 2, 0, 'metal', 'goo'],
  [-96, -114, BASE, 14, 2, 0, 'metal', 'goo'], // fork: the catwalk leaves here
  [-96, -72, BASE, 14, 2, 0, 'metal', 'goo'],
  [-96, -54, BASE + 0.4, 14, 2, 0, 'metal', 'goo'], // kicker over the coolant pipes
  [-96, -46, BASE + 2.3, 14, 2, 0, 'metal', 'goo'],
  [-96, -36, BASE + 0.8, 14, 2, 0, 'metal', 'goo'],
  [-98, -17, BASE, 14, 2, 0, 'metal', 'goo'],
  [-115, 4, BASE, 14, 2, -14, 'metal', 'goo'],
  [-150, 9, BASE, 14, 2, 0, 'metal', 'goo'],
  [-186, 8, BASE, 14, 2, 0, 'metal', 'goo'],
  [-216, 6, BASE, 14, 2, 0, 'metal', 'goo'], // the catwalk joins again
  [-240, 14, 1.8, 14, 2, 10, 'metal', 'ramp'],
  [-250, 40, 3.2, 14, 1.5, 6, 'metal', 'ramp'], // up the ramp into the tube
  ...arc(SILO, 180, 580, 40, (a) => [helixY(a), 14, 1, a < 190 ? 12 : a > 560 ? 10 : 24, 'metal', a < TUBE_END ? 'tube' : 'gantry']),
  [-216, 131, helixY(580) - 0.4, 13, 1, 0, 'metal', 'gantry'],
  [-198, 145, helixY(580) - 0.6, 13, 1, 0, 'metal', 'gantry'], // a kicker off the end of the gantry
  [-192, 149.5, helixY(580) + 0.6, 13, 1, 0, 'metal', 'gantry'],
  [-180, 157, helixY(580) - 8, 13, 1, 0, 'metal', 'gantry'],
  [-156, 168, 4.5, 14, 1.5, 0, 'metal', 'gantry'],
  [-138, 174, 1.8, 14, 2, 0, 'asphalt', 'apron'],
  [-120, 178, BASE, 14, 3, 0, 'asphalt', 'apron'],
  [-96, 182, BASE + 0.4, 14, 3, 0, 'asphalt', 'apron'], // kicker over the fuel line
  [-89, 182, BASE + 2.3, 14, 3, 0, 'metal', 'apron'],
  [-79, 181, BASE + 0.4, 14, 3, 0, 'asphalt', 'apron'],
  [-48, 183, BASE, 14, 3, 0, 'asphalt', 'apron'],
  [-10, 188, BASE, 14, 3, 0, 'asphalt', 'apron'],
  ...arc(HAIRPIN, 270, 450, 30, (a) => [BASE, 14, 3, a > 280 && a < 440 ? 6 : 0, 'asphalt', 'apron']), // hairpin round the fuel farm
  [20, 146, BASE, 14, 3, 0, 'asphalt', 'apron'],
  [10, 143.3, BASE, 14, 3, -4, 'asphalt', 'apron'],
  [2.7, 136, BASE, 14, 3, -4, 'asphalt', 'apron'],
  [0, 124, BASE, 14, 3, 0, 'asphalt', 'apron'],
  [0, 90, BASE, 14, 3, 0, 'asphalt', 'apron'],
  [0, 45, BASE, 14, 3, 0, 'asphalt', 'apron'],
];

const point = ([x, z, y, width, shoulder, bank, surface, stretch]: Row): ControlPoint => ({
  x,
  z,
  y,
  width,
  shoulder,
  bank,
  surface,
  cover: COVER[stretch],
  zone: stretch,
  dark: true,
});

const POINTS = ROWS.map(point);
const FORK_FROM = ROWS.findIndex(([x, z]) => x === -96 && z === -114);
const FORK_TO = ROWS.findIndex(([x, z]) => x === -216 && z === 6);

/** The catwalk shortcut: narrow, straight across the goo pool, with a broken span to jump. */
const CATWALK: Row[] = [
  [-109, -99, BASE, 11, 0.5, 0, 'metal', 'catwalk'],
  [-120, -86, BASE, 9, 0.5, 0, 'metal', 'catwalk'],
  [-128.4, -77.6, BASE, 9, 0.5, 0, 'metal', 'catwalk'],
  [-132.6, -73.4, BASE + 1.5, 9, 0.5, 0, 'metal', 'catwalk'], // the lip
  [-135.5, -70.5, POOL.floor, 9, 0.5, 0, 'goo', 'catwalk'],
  [-140, -66, POOL.floor, 9, 0.5, 0, 'goo', 'catwalk'],
  [-142.5, -63.5, BASE + 0.6, 9, 0.5, 0, 'metal', 'catwalk'], // the far side
  [-162, -44, BASE + 0.2, 9, 0.5, 0, 'metal', 'catwalk'],
  [-184, -22, BASE, 10, 0.5, 0, 'metal', 'catwalk'],
  [-200, -6, BASE, 12, 1, 0, 'metal', 'goo'],
];

const marks = buildTrack(POINTS).marks;
const ringAt = (a: number) => marks[ROWS.findIndex(([x, z]) => Math.abs(x - (CORE.x + Math.cos((a * Math.PI) / 180) * CORE.r)) < 0.01 && Math.abs(z - (CORE.z - Math.sin((a * Math.PI) / 180) * CORE.r)) < 0.01)];
const tubeAt = (a: number) => {
  const i = ROWS.findIndex(([x, z]) => Math.abs(x - (SILO.x + Math.cos((a * Math.PI) / 180) * SILO.r)) < 0.01 && Math.abs(z - (SILO.z - Math.sin((a * Math.PI) / 180) * SILO.r)) < 0.01);
  return (marks[i] + marks[i + 1]) / 2;
};

/** The robot arm that swings across the ring behind the core, and the rocket's exhaust venting into the tube. */
export const HAZARDS: Hazard[] = [
  { kind: 'sweep', route: 0, s: ringAt(90), offset: 0, period: 3.6, phase: 0.1, radius: 1.8, reach: 5.6, duty: 1, height: 2.2, effect: 'spin' },
  { kind: 'burst', route: 0, s: tubeAt(260), offset: -3.6, period: 16, phase: 0.4, radius: 3.4, reach: 0, duty: 0.17, height: 4, effect: 'launch' },
];

export const REACTOR: TrackDef = {
  points: POINTS,
  boxes: [0.07, 0.3, 0.62, 0.88],
  fork: { from: FORK_FROM, to: FORK_TO, points: CATWALK.map(point) },
  hazards: HAZARDS,
};
