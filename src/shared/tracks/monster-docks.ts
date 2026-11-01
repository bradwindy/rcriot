import type { TrackDef } from '../course';
import type { Hazard } from '../hazards';
import { buildTrack, type ControlPoint, type Cover, type Surface } from '../track';

type Stretch = 'road' | 'shed' | 'quay' | 'pier' | 'gap' | 'ship' | 'hold' | 'viaduct' | 'yard';
type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch];

const COVER: Record<Stretch, [Cover, string, boolean?]> = {
  road: ['open', 'dock'],
  shed: ['indoor', 'warehouse'],
  quay: ['open', 'quay'],
  pier: ['deck', 'pier'],
  gap: ['deck', 'gap'],
  ship: ['indoor', 'liner'],
  // The broken deck in the liner is open below, so the camera can follow a car over it, but still dark.
  hold: ['deck', 'hold', true],
  viaduct: ['deck', 'viaduct'],
  yard: ['open', 'yard'],
};

/**
 * Monster Docks: a harbour at dusk. Out of the gate, through a warehouse an ape is tearing open, round the dry dock
 * (or through the liner wrecked in it), out along a pier and between a sea monster's teeth, up the dock viaduct and off
 * its broken end into the container yard, then back under the viaduct to the gate.
 */
const ROWS: Row[] = [
  [20, -60, 2.5, 14, 3, 0, 'asphalt', 'road'], // start line, heading east
  [62, -60, 2.5, 14, 3, 0, 'asphalt', 'road'],
  [100, -70, 2.5, 13, 2, 5, 'asphalt', 'road'],
  [118, -98, 2.5, 13, 1.5, 0, 'stone', 'shed'], // warehouse doors
  [120, -130, 2.5, 13, 1.5, 0, 'stone', 'shed'],
  [120, -152, 2.6, 13, 1.5, 0, 'wood', 'shed'], // pallet ramp up to the loading door
  [120, -166, 5.0, 12, 1.5, 0, 'asphalt', 'quay'], // out of the loading door
  [118, -188, 2.5, 13, 2.5, 0, 'asphalt', 'quay'], // landing on the north quay
  [110, -218, 2.5, 13, 2.5, 6, 'asphalt', 'quay'],
  [86, -234, 2.5, 13, 2.5, 0, 'asphalt', 'quay'], // fork: the liner straight on, the quay round the dry dock
  [60, -228, 2.5, 13, 2.5, -4, 'asphalt', 'quay'],
  [34, -204, 2.5, 13, 2.5, -3, 'asphalt', 'quay'],
  [4, -196, 2.5, 13, 2.5, 0, 'asphalt', 'quay'],
  [-28, -204, 2.5, 13, 2.5, -3, 'asphalt', 'quay'],
  [-61, -224, 2.5, 13, 2.5, 0, 'asphalt', 'quay'], // swings wide of the liner's bow
  [-74, -256, 2.8, 13, 2, 0, 'asphalt', 'quay'], // join
  [-86, -276, 3.0, 12, 1, 0, 'wood', 'pier'], // onto the pier
  [-87, -288, 3.2, 12, 1, 0, 'wood', 'pier'],
  [-87, -294, 4.8, 12, 1, 0, 'wood', 'pier'], // lip of the bitten-off deck
  [-87, -299, -3, 12, 1, 0, 'void', 'gap'],
  [-87, -305, -3, 12, 1, 0, 'void', 'gap'],
  [-87, -311, 3.0, 12, 1, 0, 'wood', 'pier'],
  [-87, -316, 3.0, 12, 1, 0, 'wood', 'pier'],
  [-87, -340, 3.0, 12, 1, 0, 'wood', 'pier'], // the monster's bite (BITE_ROW)
  [-87, -362, 3.0, 12, 1, -4, 'wood', 'pier'], // round the pier head
  [-92.7, -379.6, 3.0, 12, 1, -7, 'wood', 'pier'],
  [-107.7, -390.5, 3.0, 12, 1, -8, 'wood', 'pier'],
  [-126.3, -390.5, 3.0, 12, 1, -8, 'wood', 'pier'],
  [-141.3, -379.6, 3.0, 12, 1, -7, 'wood', 'pier'],
  [-147, -362, 3.0, 12, 1, -4, 'wood', 'pier'],
  [-147, -320, 3.0, 12, 1, 0, 'wood', 'pier'],
  [-150, -262, 3.4, 12, 1, 0, 'asphalt', 'viaduct'], // up the viaduct
  [-164, -190, 7.2, 12, 1, 3, 'asphalt', 'viaduct'],
  [-162, -120, 11.0, 12, 1, -3, 'asphalt', 'viaduct'],
  [-147, -62, 12.0, 12, 1, 0, 'asphalt', 'viaduct'], // over the yard road
  [-146, -32, 12.2, 12, 1, 0, 'asphalt', 'viaduct'],
  [-146, -20, 13.2, 12, 1, 0, 'asphalt', 'viaduct'], // the broken end kicks up
  [-146, 6, 2.5, 13, 2.5, 0, 'asphalt', 'yard'],
  [-148, 30, 2.5, 13, 2.5, 0, 'asphalt', 'yard'],
  [-162, 62, 2.5, 13, 2.5, 0, 'asphalt', 'yard'],
  [-190, 74, 2.5, 13, 2.5, 0, 'asphalt', 'yard'], // under the wrecking ball (BALL_ROW)
  [-220, 70, 2.5, 13, 2.5, 0, 'asphalt', 'yard'],
  [-240, 46, 2.5, 13, 2.5, 0, 'asphalt', 'yard'],
  [-243, 18, 2.6, 12, 2, 0, 'metal', 'yard'], // container ramp
  [-243, 6, 5.0, 12, 2, 0, 'metal', 'yard'],
  [-243, -14, 2.5, 13, 2.5, 0, 'asphalt', 'yard'],
  [-234, -44, 2.5, 13, 2.5, 0, 'asphalt', 'yard'],
  [-206, -60, 2.5, 14, 3, 0, 'asphalt', 'yard'],
  [-147, -62, 2.5, 14, 3, 0, 'asphalt', 'road'], // under the viaduct
  [-90, -60, 2.5, 14, 3, 0, 'asphalt', 'road'],
  [-35, -60, 2.5, 14, 3, 0, 'asphalt', 'road'],
];

/** Through the wrecked liner: a gangway into the stern, a listing deck, a hole torn in it, and out through the bow. */
const FORK: Row[] = [
  [62, -236, 2.8, 12, 1, -2, 'asphalt', 'quay'],
  [44, -236, 3.3, 11, 0.5, -6, 'metal', 'ship'], // into the torn-open stern
  [24, -236, 3.4, 11, 0.5, -9, 'metal', 'ship'],
  [6, -236, 3.4, 11, 0.5, -5, 'metal', 'ship'],
  [-2, -236, 4.8, 11, 0.5, 0, 'metal', 'hold'], // where the liner broke in two
  [-7, -236, -3, 11, 0.5, 0, 'void', 'hold'],
  [-13, -236, -3, 11, 0.5, 0, 'void', 'hold'],
  [-19, -236, 3.4, 11, 0.5, 4, 'metal', 'ship'],
  [-24, -236, 3.4, 11, 0.5, 6, 'metal', 'ship'],
  [-38, -237, 3.2, 11, 0.5, 8, 'metal', 'ship'],
  [-50, -241, 3.0, 12, 1, 0, 'asphalt', 'quay'], // out through the smashed bow
];

const point = ([x, z, y, width, shoulder, bank, surface, stretch]: Row): ControlPoint => ({
  x,
  z,
  y,
  width,
  shoulder,
  bank,
  surface,
  cover: COVER[stretch][0],
  zone: COVER[stretch][1],
  ...(COVER[stretch][2] ? { dark: true } : {}),
});

const POINTS = ROWS.map(point);
const MARKS = buildTrack(POINTS).marks;
const BITE_ROW = 23;
const BALL_ROW = 40;

/**
 * The sea monster bites down on the pier: live while its jaws are shut, a third of each cycle, and it throws cars
 * that are under it. The wrecking ball swings across the container yard road from a crane.
 */
export const BITE: Hazard = {
  kind: 'burst',
  route: 0,
  s: MARKS[BITE_ROW] - 4,
  offset: 0,
  period: 4.2,
  phase: 0.35,
  radius: 6.4,
  reach: 0,
  duty: 0.3,
  height: 3.5,
  effect: 'launch',
};

export const BALL: Hazard = {
  kind: 'sweep',
  route: 0,
  s: MARKS[BALL_ROW],
  offset: 0,
  period: 3.6,
  phase: 0.1,
  radius: 1.7,
  reach: 6.2,
  duty: 1,
  height: 3,
  effect: 'spin',
};

export const MONSTER_DOCKS: TrackDef = {
  points: POINTS,
  fork: { from: 9, to: 15, points: FORK.map(point) },
  hazards: [BITE, BALL],
  water: 0,
};
