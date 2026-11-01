import type { TrackDef } from '../course';
import type { Hazard } from '../hazards';
import type { ControlPoint, Cover, Surface } from '../track';

type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, cover: Cover, zone: string, dark?: boolean];

const row = ([x, z, y, width, shoulder, bank, surface, cover, zone, dark]: Row): ControlPoint => ({ x, z, y, width, shoulder, bank, surface, cover, zone, dark });

/**
 * Cartoon Farm: out of the farmyard, round the duck pond or through two rickety barns, down the sheep fields, a
 * corkscrew up and round Big Hill and over its own road on a trestle, off the end in a huge jump, past the milk churn
 * crane, through the dark milk factory and over the river of milk it pours out, and home past the chicken coop.
 */
const MAIN: Row[] = [
  [0, 0, 1, 14, 3, 0, 'dirt', 'open', 'yard'], // 0 start line in the farmyard
  [0, -40, 1, 14, 3, 0, 'dirt', 'open', 'yard'],
  [6, -78, 1.2, 14, 3, 3, 'dirt', 'open', 'lane'],
  [30, -108, 1.5, 13, 2.5, 6, 'dirt', 'open', 'lane'],
  [64, -124, 1.5, 13, 2.5, 0, 'dirt', 'open', 'lane'], // 4 the fork
  [92, -150, 1.4, 13, 3, -5, 'dirt', 'open', 'pond'],
  [120, -186, 1.2, 13, 2, -6, 'wood', 'deck', 'boardwalk'],
  [160, -196, 1.2, 13, 2, 0, 'wood', 'deck', 'boardwalk'],
  [203, -186, 1.2, 13, 2, -4, 'dirt', 'open', 'pond'],
  [238, -150, 1.4, 13, 3, -4, 'dirt', 'open', 'pond'],
  [256, -98, 1.5, 14, 3, 0, 'grass', 'open', 'field'], // 10 the join
  [266, -66, 1.5, 14, 3, 0, 'grass', 'open', 'field'],
  [268, -36, 1.5, 14, 3, 0, 'grass', 'open', 'field'], // under the trestle
  [268, -12, 1.5, 14, 3, 0, 'grass', 'open', 'field'], // the bouncing sheep
  [267, 10, 1.6, 14, 3, 0, 'grass', 'open', 'field'],
  [266, 20, 4.4, 14, 3, 0, 'grass', 'open', 'field'], // hump
  [265, 34, 1.6, 14, 3, 0, 'grass', 'open', 'field'],
  [268, 62, 2.0, 14, 3, 6, 'dirt', 'open', 'hill'],
  [295, 86, 2.5, 13, 2.5, 8, 'dirt', 'open', 'hill'], // corkscrew round Big Hill
  [318, 88, 5.0, 13, 2.5, 0, 'dirt', 'open', 'hill'], // roller
  [340, 80, 3.6, 13, 2.5, 6, 'dirt', 'open', 'hill'],
  [356, 54, 4.5, 13, 2.5, 10, 'dirt', 'open', 'hill'],
  [359, 28, 5.5, 13, 2.5, 3, 'dirt', 'open', 'hill'],
  [357, 10, 9.5, 13, 2.5, 0, 'dirt', 'open', 'hill'], // roller
  [354, -8, 7.5, 13, 2.5, 3, 'dirt', 'open', 'hill'],
  [346, -36, 11.0, 13, 2.5, 10, 'dirt', 'open', 'hill'],
  [326, -55, 12.0, 13, 2, 6, 'dirt', 'open', 'hill'],
  [298, -56, 12.0, 12, 1, 0, 'wood', 'deck', 'trestle'],
  [268, -53, 12.0, 12, 1, 0, 'wood', 'deck', 'trestle'], // over the sheep field road
  [245, -50, 12.0, 12, 1, 0, 'wood', 'deck', 'trestle'],
  [230, -48, 4.0, 13, 2, 0, 'dirt', 'open', 'field'], // off the end
  [214, -40, 2.0, 14, 3, 0, 'dirt', 'open', 'field'],
  [203, -15, 2.0, 14, 3, 5, 'dirt', 'open', 'field'],
  [202, 5, 2.0, 14, 3, 0, 'dirt', 'open', 'field'],
  [202, 16, 4.8, 14, 3, 0, 'dirt', 'open', 'field'], // hump
  [203, 30, 2.0, 14, 3, 0, 'dirt', 'open', 'field'],
  [206, 52, 2.0, 14, 3, -4, 'dirt', 'open', 'field'], // round the haystacks
  [222, 72, 2.0, 14, 3, 0, 'dirt', 'open', 'field'],
  [220, 92, 1.8, 14, 3, 6, 'dirt', 'open', 'field'],
  [204, 110, 1.6, 14, 3, 0, 'asphalt', 'open', 'works'],
  [200, 135, 1.5, 14, 3, 0, 'asphalt', 'open', 'works'], // the churn crane
  [196, 158, 1.5, 14, 3, 0, 'asphalt', 'open', 'works'],
  [182, 176, 1.5, 14, 2, 0, 'asphalt', 'open', 'works'],
  [160, 184, 1.5, 14, 2, 0, 'metal', 'indoor', 'factory'], // inside the milk factory
  [130, 187, 1.5, 14, 2, 0, 'metal', 'indoor', 'factory'],
  [100, 186, 1.5, 14, 2, 0, 'metal', 'indoor', 'factory'],
  [86, 186, 1.5, 14, 3, 0, 'wood', 'open', 'river'], // the kicker
  [76, 186, 3.2, 13, 2, 0, 'wood', 'open', 'river'], // lip
  [72, 186, -3.0, 13, 2, 0, 'goo', 'open', 'river'], // the river of milk
  [66, 186, -3.0, 13, 2, 0, 'goo', 'open', 'river'],
  [61, 186, 0.9, 13, 2, 0, 'dirt', 'open', 'river'],
  [52, 185, 1.0, 14, 3, 0, 'dirt', 'open', 'coop'],
  [33, 176, 1.1, 14, 3, 4, 'dirt', 'open', 'coop'],
  [12, 145, 1.0, 14, 3, 5, 'dirt', 'open', 'coop'],
  [0, 105, 1.0, 14, 3, 0, 'dirt', 'open', 'yard'],
  [0, 55, 1.0, 14, 3, 0, 'dirt', 'open', 'yard'],
];

/** Through two rickety barns: in at the door, up the ramp in the dark and out of the hayloft. Ramps are decks, so the barn floor stays flat. */
const BARNS: Row[] = [
  [92, -118, 1.5, 11, 1, 0, 'dirt', 'open', 'farm'],
  [108, -117, 1.5, 10, 0.6, 0, 'wood', 'deck', 'barn', true],
  [122, -116, 3.4, 10, 0.6, 0, 'wood', 'deck', 'barn', true],
  [135, -115, 5.6, 10, 0.6, 0, 'wood', 'deck', 'chute'],
  [146, -114, 1.6, 11, 1, 0, 'dirt', 'open', 'farm'],
  [160, -114, 1.6, 11, 1, 0, 'dirt', 'open', 'farm'],
  [172, -114, 1.6, 10, 0.6, 0, 'wood', 'deck', 'barn', true],
  [186, -114, 3.8, 10, 0.6, 0, 'wood', 'deck', 'barn', true],
  [198, -115, 5.4, 10, 0.6, 0, 'wood', 'deck', 'chute'],
  [209, -116, 1.6, 11, 1, 0, 'dirt', 'open', 'farm'],
  [230, -116, 1.5, 13, 2, 0, 'dirt', 'open', 'farm'],
];

const HAZARDS: Hazard[] = [
  // A giant sheep bounces back and forth across the road, landing in the middle once a cycle.
  { kind: 'burst', route: 0, s: 519, offset: 0, period: 2.4, phase: 0.5, radius: 2.4, reach: 0, duty: 0.3, height: 2.6, effect: 'launch' },
  // A milk churn on the yard crane, swung side to side across the road.
  { kind: 'sweep', route: 0, s: 1140, offset: 0, period: 3.4, phase: 0, radius: 1.4, reach: 6.5, duty: 1, height: 2.4, effect: 'spin' },
];

export const CARTOON_FARM: TrackDef = {
  points: MAIN.map(row),
  fork: { from: 4, to: 10, points: BARNS.map(row) },
  hazards: HAZARDS,
  boxes: [0.07, 0.325, 0.64, 0.8],
};
