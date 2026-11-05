import type { TrackDef } from '../course';
import type { Hazard } from '../hazards';
import type { ControlPoint, Cover, Surface } from '../track';

type Stretch = 'start' | 'jungle' | 'village' | 'gorge' | 'river' | 'bridge' | 'stair' | 'summit' | 'hall' | 'idol' | 'trap' | 'terrace' | 'cave';
type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch];

const COVER: Record<Stretch, Cover> = {
  start: 'open',
  jungle: 'open',
  village: 'open',
  gorge: 'open',
  river: 'open',
  bridge: 'deck',
  stair: 'deck',
  summit: 'deck',
  hall: 'indoor',
  idol: 'indoor',
  trap: 'indoor',
  terrace: 'deck',
  cave: 'tunnel',
};

/** The pyramid's centre, its stairs run east-west through it. The temple hall lies along its south side. */
export const PYRAMID = { x: 120, z: -300 };
/** The river's surface. The ford under the bridge runs a hand's depth under it. */
export const RIVER_LEVEL = -7.25;
export const HALL_Z = -254;

/**
 * Inca Temple: a clockwise jungle lap. Out of the start through a campfire village, over a gorge by rope bridge or
 * down through the river, up the stairs of a stepped pyramid and off its far side, back through the torch-lit temple
 * hall past the golden idol and a rolling stone, under a swinging log and through a glowing cave.
 */
const ROWS: Row[] = [
  [-150, 10, 2, 14, 3, 0, 'dirt', 'start'], // 0 start line
  [-150, -30, 2, 14, 3, 0, 'dirt', 'village'],
  [-140, -62, 2, 13, 2.5, 0, 'dirt', 'village'],
  [-150, -94, 2, 13, 2, 0, 'wood', 'village'], // log ramp
  [-151, -103, 4, 13, 2, 0, 'dirt', 'village'],
  [-152, -120, 2, 13, 2.5, 0, 'dirt', 'village'],
  [-146, -146, 2, 14, 2.5, 0, 'dirt', 'jungle'],
  [-142, -172, 2, 14, 2, 0, 'dirt', 'gorge'], // 7 fork
  [-160, -184, 2, 14, 1.5, 0, 'dirt', 'gorge'],
  [-180, -194, 2, 14, 1.5, 0, 'dirt', 'gorge'],
  [-190, -212, -2, 15, 2, 0, 'dirt', 'river'],
  [-176, -233, -7.2, 15, 2, 0, 'mud', 'river'], // the ford
  [-152, -246, -7.6, 15, 2, 0, 'mud', 'river'], // under the bridge
  [-125, -258, -6, 15, 2, 0, 'dirt', 'river'],
  [-110, -274, -1.5, 15, 2, 0, 'dirt', 'river'],
  [-106, -291, 2, 14, 2, 0, 'dirt', 'gorge'],
  [-114, -306, 2, 14, 2, 0, 'dirt', 'gorge'],
  [-126, -320, 2, 14, 2.5, 0, 'dirt', 'jungle'], // 17 join
  [-100, -326, 2, 14, 2.5, 0, 'dirt', 'jungle'],
  [-50, -306, 2, 14, 2.5, 0, 'dirt', 'jungle'],
  [0, -300, 2, 14, 2.5, 0, 'dirt', 'jungle'],
  [36, -300, 2, 14, 2, 0, 'stone', 'jungle'],
  [56, -300, 2.4, 14, 1, 0, 'stone', 'stair'], // west stair foot
  [72, -300, 8.4, 14, 1, 0, 'stone', 'stair'],
  [88, -300, 14.2, 14, 1, 0, 'stone', 'stair'],
  [100, -300, 18.4, 14, 1, 0, 'stone', 'stair'],
  [110, -300, 19.9, 14, 1, 0, 'stone', 'summit'],
  [124, -300, 20, 14, 1, 0, 'stone', 'summit'],
  [132, -300, 20.6, 14, 1, 0, 'stone', 'summit'], // lip
  [140, -300, 17, 14, 1, 0, 'stone', 'stair'],
  [155, -300, 9, 14, 1, 0, 'stone', 'stair'],
  [172, -300, 2, 14, 1, 0, 'stone', 'stair'],
  [192, -300, 1.6, 14, 2.5, 0, 'dirt', 'jungle'], // landing
  [208, -292, 1.6, 14, 2.5, 4, 'dirt', 'jungle'],
  [214, -277, 1.6, 14, 2.5, 6, 'dirt', 'jungle'],
  [208, -262, 1.6, 14, 2.5, 4, 'dirt', 'jungle'],
  [190, -254, 1.6, 14, 2, 0, 'dirt', 'jungle'],
  [160, -254, 1.5, 14, 1, 0, 'stone', 'hall'], // east door
  [145, -254, 0.5, 14, 1, 0, 'stone', 'hall'],
  [128, -254, -0.5, 16, 1, 0, 'stone', 'idol'],
  [110, -254, -0.5, 14, 1, 0, 'stone', 'trap'],
  [96, -254, 1.8, 14, 1, 0, 'stone', 'trap'],
  [80, -254, 4, 14, 1, 0, 'stone', 'terrace'], // west door
  [72, -254, 4.3, 14, 1, 0, 'stone', 'terrace'], // lip
  [60, -254, 1, 14, 2, 0, 'dirt', 'jungle'],
  [42, -251, 1.2, 14, 2.5, 0, 'dirt', 'jungle'],
  [20, -240, 1.5, 14, 2.5, -4, 'dirt', 'jungle'],
  [4, -218, 2, 14, 2.5, 0, 'dirt', 'jungle'],
  [-4, -190, 2, 14, 2, 0, 'dirt', 'jungle'],
  [-8, -160, 2, 14, 2, 0, 'dirt', 'jungle'], // swinging log
  [-10, -132, 2.5, 14, 2, 0, 'dirt', 'jungle'],
  [-2, -110, 3, 13, 2, 6, 'dirt', 'jungle'],
  [-14, -88, 4.5, 13, 1.5, 0, 'dirt', 'jungle'],
  [-24, -68, 6, 13, 0.6, 0, 'rock', 'cave'],
  [-30, -40, 7, 13, 0.6, 8, 'rock', 'cave'],
  [-42, -12, 7.5, 13, 0.6, 8, 'rock', 'cave'],
  [-46, 12, 7.5, 13, 0.6, 0, 'rock', 'cave'],
  [-47, 28, 7.2, 14, 2, 0, 'dirt', 'jungle'], // ledge
  [-48, 42, 2, 14, 2.5, 0, 'dirt', 'jungle'],
  [-54, 72, 2, 14, 3, -4, 'dirt', 'jungle'],
  [-72, 106, 2, 14, 3, -8, 'dirt', 'jungle'],
  [-102, 126, 2, 14, 3, -8, 'dirt', 'jungle'],
  [-135, 126, 2, 14, 3, -6, 'dirt', 'jungle'],
  [-150, 104, 2, 14, 3, 0, 'dirt', 'start'],
  [-150, 60, 2, 14, 3, 0, 'dirt', 'start'],
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
});

const BRIDGE: Row[] = [
  [-141, -186, 2, 12, 1, 0, 'dirt', 'gorge'],
  [-141, -198, 2, 8, 0.5, 0, 'wood', 'bridge'],
  [-140, -212, 0.8, 8, 0.5, 0, 'wood', 'bridge'],
  [-140, -222, 1.8, 8, 0.5, 0, 'wood', 'bridge'], // broken end, kicked up
  [-140, -226, -6, 8, 0.5, 0, 'void', 'bridge'],
  [-140, -232, 0.8, 8, 0.5, 0, 'wood', 'bridge'],
  [-140, -246, 1.6, 8, 0.5, 0, 'wood', 'bridge'],
  [-139, -262, 2, 8, 0.5, 0, 'wood', 'bridge'],
  [-136, -280, 2, 12, 1.5, 0, 'dirt', 'gorge'],
  [-132, -296, 2, 13, 2, 0, 'dirt', 'gorge'],
  [-129, -308, 2, 14, 2, 0, 'dirt', 'gorge'],
];

/** Lap distances of the hazards, so the scenery can find them. */
export const BALL_S = 924;
export const LOG_S = 1072;

const HAZARDS: Hazard[] = [
  // A stone ball drops from the ceiling at the top of the hall's ramp and rolls down it at the oncoming cars, keeping
  // to the right-hand side so there is a lane to dodge into on the left.
  { kind: 'roll', route: 0, s: BALL_S, offset: 3.4, period: 6.5, phase: 0.2, radius: 2.3, reach: -42, duty: 0.4, height: 4, effect: 'launch' },
  // A spiked log swings across the jungle trail from a stone gateway.
  { kind: 'sweep', route: 0, s: LOG_S, offset: 0, period: 3.4, phase: 0, radius: 1.5, reach: 5.2, duty: 1, height: 2.2, effect: 'spin' },
];

export const INCA_TEMPLE: TrackDef = {
  points: ROWS.map(point),
  fork: { from: 7, to: 17, points: BRIDGE.map(point) },
  hazards: HAZARDS,
  water: RIVER_LEVEL,
  boxes: [0.05, 0.3, 0.64, 0.86],
};
