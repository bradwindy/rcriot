import type { TrackDef } from '../course';
import type { Hazard } from '../hazards';
import type { ControlPoint, Cover, Surface } from '../track';

/** The tower the track spirals up inside: its centre, the road's radius round it, and the climb per turn. */
export const TOWER = { x: -70, z: -60, r: 24, climb: 10, base: 1, turns: 1.25 };

type Stretch = 'bank' | 'bridge' | 'moat' | 'draw' | 'gate' | 'yard' | 'rampart' | 'dungeon' | 'lab' | 'tower' | 'leap';
type Tail = [width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch];
type Row = [x: number, z: number, y: number, ...Tail];

const STRETCH: Record<Stretch, { cover: Cover; dark?: boolean }> = {
  bank: { cover: 'open' },
  bridge: { cover: 'deck' },
  moat: { cover: 'deck' },
  draw: { cover: 'deck' },
  gate: { cover: 'indoor' },
  yard: { cover: 'open' },
  rampart: { cover: 'deck' },
  dungeon: { cover: 'indoor' },
  lab: { cover: 'indoor' },
  tower: { cover: 'deck', dark: true },
  leap: { cover: 'deck' },
};

/** Points round an arc about (cx, cz) from angle a0 to a1 (degrees, 0 east, 90 south), every `step` degrees. */
function arc(cx: number, cz: number, r: number, a0: number, a1: number, step: number, y: number, rest: Tail): Row[] {
  const n = Math.max(1, Math.round(Math.abs(a1 - a0) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r, y, ...rest];
  });
}

/** The climb inside the tower: clockwise from the south side, one and a quarter turns, banked into the bend. */
function helix(): Row[] {
  const { x, z, r, climb, base, turns } = TOWER;
  const steps = Math.round(turns * 12);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / 12) * Math.PI * 2;
    return [x - Math.sin(t) * r, z + Math.cos(t) * r, base + (climb * i) / 12, 12, 1, -7, 'stone', 'tower'] as Row;
  });
}

const BANK: Tail = [14, 3, 0, 'dirt', 'bank'];

/**
 * Mad Lab: a stormy night at a mad scientist's castle. From the start on the east bank of the moat, round to the
 * south bridge and a leap over its broken span into the gatehouse. Then over the battlements, or down through the
 * dungeon, into the great laboratory, up the tower round its giant coil, out through a window and down a ramp to
 * the north bridge, and back along the north bank over two crests.
 */
const ROWS: Row[] = [
  [140, 60, 1, ...BANK], // start line on the east bank
  [140, 110, 1, ...BANK],
  ...arc(110, 155, 30, 0, 90, 30, 1, BANK),
  [80, 189, 1, ...BANK], // through the village
  [48, 181, 1, ...BANK],
  [24, 186, 1, ...BANK],
  ...arc(10, 155, 30, 90, 180, 30, 1, [14, 2, 0, 'dirt', 'bank']).slice(1),
  [-20, 141, 1.4, 13, 0.6, 0, 'stone', 'bridge'], // the south bridge
  [-20, 131, 3.4, 13, 0.6, 0, 'stone', 'bridge'], // its broken end
  [-20, 125.5, -3, 13, 0.6, 0, 'goo', 'moat'],
  [-20, 121, -3, 13, 0.6, 0, 'goo', 'moat'],
  [-20, 116, 1.1, 13, 0.6, 0, 'wood', 'draw'], // the drawbridge
  [-20, 104, 1.0, 13, 0.6, 0, 'stone', 'gate'],
  [-20, 92, 1.0, 13, 0.6, 0, 'stone', 'gate'],
  [-20, 82, 1.0, 13, 1, 0, 'stone', 'yard'], // fork: the dungeon dives on, the battlements climb right
  [-11, 70, 2.2, 12, 1, -3, 'stone', 'rampart'],
  [2, 62, 3.8, 12, 1, -3, 'stone', 'rampart'],
  [20, 58, 5.6, 12, 1, 0, 'stone', 'rampart'],
  [40, 58, 7.4, 12, 1, 0, 'stone', 'rampart'],
  [58, 60, 8.0, 12, 1, 0, 'stone', 'rampart'],
  [72, 54, 8.0, 12, 1, 5, 'stone', 'rampart'],
  [78, 40, 8.0, 12, 1, 0, 'stone', 'rampart'],
  [78, 28, 8.4, 12, 1, 0, 'stone', 'rampart'],
  [78, 20, 10.0, 12, 1, 0, 'stone', 'rampart'], // over the turret roof
  [78, 10, 6.6, 12, 1, 0, 'stone', 'rampart'],
  [77, 0, 3.6, 12, 1, 0, 'stone', 'rampart'],
  [70, -9, 1.4, 13, 1, 0, 'stone', 'yard'],
  [64, -18, 1.0, 13, 1, 0, 'stone', 'lab'], // join, into the laboratory
  ...arc(34, -18, 30, 0, -60, 30, 1, [13, 1.5, 4, 'stone', 'lab']).slice(1),
  [30, -49, 1, 12, 2, 0, 'stone', 'lab'],
  [10, -45, 1, 12, 2, -3, 'stone', 'lab'],
  [-8, -36, 1, 12, 2, 0, 'stone', 'lab'],
  [-28, -36, 1, 12, 2, 0, 'stone', 'lab'],
  [-46, -36, 1, 12, 1, 0, 'stone', 'tower'],
  ...helix(),
  [-96, -69, 14.2, 12, 1, 0, 'stone', 'tower'],
  [-100, -77, 15.2, 12, 1, 0, 'wood', 'leap'], // out through the window
  [-106, -88, 12.0, 12, 1, 0, 'wood', 'leap'],
  [-110, -100, 8.6, 12, 1, 0, 'wood', 'leap'],
  [-112, -114, 5.0, 12, 1, 0, 'wood', 'leap'],
  [-112, -127, 2.6, 13, 0.6, 0, 'stone', 'bridge'], // the north bridge
  ...arc(-82, -140, 30, 180, 270, 30, 2, [13, 0.6, 0, 'stone', 'bridge']).slice(0, 1),
  ...arc(-82, -140, 30, 180, 270, 30, 1, BANK).slice(1),
  [-56, -172, 1.0, ...BANK],
  [-28, -170, 1.2, ...BANK],
  [-18, -170, 3.4, ...BANK], // first crest
  [-4, -172, 0.6, ...BANK],
  [24, -176, 1.0, ...BANK], // the windmill
  [48, -176, 1.2, ...BANK],
  [58, -175, 3.4, ...BANK], // second crest
  [72, -173, 0.6, ...BANK],
  ...arc(110, -142, 30, 270, 360, 30, 1, BANK).map(([x, z, y]) => [x - 4, z, y, 14, 3, 0, 'dirt', 'bank'] as Row),
  [146, -116, 1, ...BANK],
  [158, -94, 1, ...BANK],
  [154, -70, 1, ...BANK],
  [142, -50, 1, ...BANK],
  [140, -25, 1, ...BANK],
  [140, 15, 1, ...BANK],
];

/** Through the dungeon: a drop through a trapdoor, the Tesla coil gauntlet, and a ramp back up into the yard. */
const DUNGEON: Row[] = [
  [-21, 72, 1.6, 11, 0.6, 0, 'stone', 'dungeon'],
  [-25, 61, -4.5, 11, 0.6, 0, 'stone', 'dungeon'],
  [-20, 50, -7.0, 11, 0.6, 0, 'stone', 'dungeon'],
  [-10, 38, -7.0, 11, 0.6, 0, 'stone', 'dungeon'],
  [4, 30, -7.0, 11, 0.6, 0, 'stone', 'dungeon'],
  [22, 24, -7.0, 11, 0.6, 0, 'stone', 'dungeon'],
  [38, 18, -7.0, 11, 0.6, 0, 'stone', 'dungeon'],
  [48, 10, -5.8, 11, 0.6, 0, 'stone', 'dungeon'],
  [55, 0, -2.6, 12, 0.6, 0, 'stone', 'dungeon'],
  [60, -9, 0.4, 12, 0.6, 0, 'stone', 'yard'],
];

const POINTS: ControlPoint[] = ROWS.map(toPoint);

function toPoint([x, z, y, width, shoulder, bank, surface, stretch]: Row): ControlPoint {
  return { x, z, y, width, shoulder, bank, surface, cover: STRETCH[stretch].cover, zone: stretch, dark: STRETCH[stretch].dark };
}

const FROM = ROWS.findIndex(([x, z]) => x === -20 && z === 82);
const TO = ROWS.findIndex(([x, z]) => x === 64 && z === -18);

const HAZARDS: Hazard[] = [
  // A pendulum blade swinging across the laboratory, just before the tower door.
  { kind: 'sweep', route: 0, s: 655, offset: 0, period: 3.2, phase: 0, radius: 1.3, reach: 5.5, duty: 1, height: 3.5, effect: 'spin' },
  // A Tesla coil in the dungeon gauntlet discharging into the left half of the road.
  { kind: 'burst', route: 1, s: 452, offset: -2.2, period: 2.6, phase: 0.3, radius: 3.2, reach: 0, duty: 0.35, height: 3, effect: 'spin' },
];

export const MAD_LAB: TrackDef = {
  points: POINTS,
  fork: { from: FROM, to: TO, points: DUNGEON.map(toPoint) },
  hazards: HAZARDS,
  water: -1.5,
};
