import type { TrackDef } from '../course';
import type { Hazard } from '../hazards';
import type { ControlPoint, Cover, Surface } from '../track';

/** Centre of the volcano's magma chamber, and the radius of the ledge that rings its lava lake. */
export const CALDERA = { x: 0, z: -380, ledge: 76, wall: 92, lake: 60 };
/** Height of the lava lake's surface. */
export const LAVA_LEVEL = -3.5;

type Stretch = 'out' | 'dig' | 'tube' | 'hall' | 'ledge' | 'climb' | 'bridge' | 'exit' | 'causeway';
/** Named spots along the main loop, for the scenery to find. */
export type Spot = 'portal' | 'fossil' | 'trench' | 'jeep' | 'pit' | 'fork' | 'join' | 'bridge' | 'crest' | 'exit' | 'cliff' | 'flow';
type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch, spot?: Spot];

const STRETCH: Record<Stretch, { cover: Cover; zone: string; dark?: boolean }> = {
  out: { cover: 'open', zone: 'ash', dark: false },
  dig: { cover: 'tunnel', zone: 'dig' },
  tube: { cover: 'tunnel', zone: 'tube' },
  hall: { cover: 'indoor', zone: 'hall' },
  ledge: { cover: 'indoor', zone: 'ledge' },
  climb: { cover: 'indoor', zone: 'climb' },
  bridge: { cover: 'deck', zone: 'bridge', dark: true },
  exit: { cover: 'tunnel', zone: 'exit' },
  causeway: { cover: 'indoor', zone: 'causeway' },
};

/**
 * Lava Dig: out of the ash flats into an excavation under the volcano, down a lava tube into the magma chamber, round
 * the lava lake (or straight across it over two pits), up the chamber wall, over a rock bridge and out of the flank.
 */
const MAIN: Row[] = [
  [0, -60, 1, 14, 3.5, 0, 'dirt', 'out'], // the start line on the ash flats
  [36, -60, 1, 14, 3.5, 0, 'dirt', 'out'],
  [60, -70, 1, 14, 3, 0, 'dirt', 'out'],
  [70, -95, 1, 14, 2.5, 0, 'dirt', 'out'],
  [71, -126, 0.8, 14, 2, 0, 'dirt', 'dig', 'portal'], // the dig, in a cave under the cliff
  [68, -150, 0.3, 14, 2, 0, 'dirt', 'dig'],
  [56, -172, 0, 13, 2, 0, 'dirt', 'dig', 'fossil'],
  [60, -196, -0.3, 13, 2, 0, 'dirt', 'dig'],
  [74, -212, -0.3, 13, 2, 0, 'wood', 'dig'], // a plank ramp over the trench
  [81, -219, 1.5, 12, 1.5, 0, 'dirt', 'dig', 'trench'],
  [86, -225, -2.3, 12, 1.5, 0, 'dirt', 'dig'],
  [90, -231, -2.3, 12, 1.5, 0, 'dirt', 'dig'],
  [94, -239, -0.5, 13, 2, 0, 'dirt', 'dig'],
  [98, -258, -0.5, 14, 2, 0, 'dirt', 'dig', 'jeep'],
  [104, -278, -0.2, 12, 1, 0, 'rock', 'tube'], // a lava tube
  [107, -290, 0.2, 12, 1, 0, 'rock', 'tube'],
  [109, -298, 2.4, 12, 1, 0, 'rock', 'tube', 'pit'],
  [110, -302, -4, 12, 1, 0, 'lava', 'tube'],
  [111, -307, -4, 12, 1, 0, 'lava', 'tube'],
  [112, -312, 1.2, 12, 1, 0, 'rock', 'tube'],
  [110, -324, 0.6, 12, 1, 0, 'rock', 'tube'],
  [100, -336, 0.4, 12, 1, 4, 'rock', 'tube'],
  [82, -341, 0.4, 12, 1.5, 0, 'rock', 'hall', 'fork'], // into the magma chamber
  [56, -324, 0.8, 12, 1.5, -4, 'rock', 'ledge'],
  [20, -306, 0.8, 12, 1.5, -6, 'rock', 'ledge'],
  [-20, -307, 0.8, 12, 1.5, -6, 'rock', 'ledge'],
  [-54, -326, 0.8, 12, 1.5, -6, 'rock', 'ledge'],
  [-74, -360, 0.8, 12, 1.5, -6, 'rock', 'ledge'],
  [-74, -400, 0.8, 12, 1.5, -6, 'rock', 'ledge'],
  [-54, -434, 0.8, 12, 1.5, -6, 'rock', 'ledge'],
  [-24, -452, 1.2, 12, 1.5, -4, 'rock', 'ledge'],
  [8, -457, 3, 12, 1, -6, 'rock', 'climb', 'join'], // up the chamber wall
  [36, -447, 6, 12, 1, -6, 'rock', 'climb'],
  [57, -430, 9.5, 12, 1, -6, 'rock', 'climb'],
  [68, -410, 12.5, 12, 1, -2, 'rock', 'climb'],
  [58, -393, 13.5, 11, 0.8, 0, 'rock', 'bridge', 'bridge'], // a rock bridge over the lake
  [36, -379, 14, 11, 0.8, 0, 'rock', 'bridge'],
  [22, -370, 14.4, 11, 0.8, 0, 'wood', 'bridge'], // a plank kicker built onto the span
  [15, -365.5, 16.4, 11, 0.8, 0, 'wood', 'bridge', 'crest'],
  [-3, -354, 12.6, 11, 0.8, 0, 'rock', 'bridge'],
  [-20, -344, 12.8, 11, 0.8, 0, 'rock', 'bridge'],
  [-40, -331, 13, 11, 0.8, 0, 'rock', 'bridge'],
  [-64, -318, 13, 11, 0.8, 0, 'rock', 'bridge'],
  [-84, -306, 13, 12, 0.8, 0, 'rock', 'exit', 'exit'], // out through the flank
  [-110, -300, 12.8, 12, 0.8, 0, 'rock', 'exit'],
  [-134, -288, 12.6, 12, 0.8, 4, 'rock', 'exit'],
  [-142, -264, 12.4, 12, 0.8, 0, 'rock', 'exit'],
  [-128, -242, 12.2, 12, 0.8, -4, 'rock', 'exit'],
  [-136, -219, 12, 12, 0.8, 0, 'rock', 'exit'],
  [-160, -210, 11.6, 12, 0.8, 0, 'rock', 'exit'],
  [-182, -204, 11, 12, 0.8, 0, 'rock', 'exit'],
  [-192, -192, 11.3, 13, 1.5, 0, 'rock', 'out'], // a ledge out of the cliff, and a drop
  [-196, -180, 11.6, 13, 1.5, 0, 'rock', 'out', 'cliff'],
  [-198, -166, 2, 14, 2.5, 0, 'dirt', 'out'],
  [-196, -140, 1.2, 14, 3, 0, 'dirt', 'out'],
  [-187, -120, 1, 14, 3, 0, 'dirt', 'out'],
  [-181, -109, 1.2, 12, 2, 0, 'rock', 'out'],
  [-177, -102, 3.4, 12, 2, 0, 'rock', 'out', 'flow'], // over a lava flow
  [-174, -97, -3, 12, 2, 0, 'lava', 'out'],
  [-171, -92, -3, 12, 2, 0, 'lava', 'out'],
  [-167, -86, 2, 13, 2.5, 0, 'dirt', 'out'],
  [-158, -76, 1.2, 14, 3, 0, 'dirt', 'out'],
  [-136, -64, 1, 14, 3.5, 0, 'dirt', 'out'],
  [-110, -60, 1, 14, 3.5, 0, 'dirt', 'out'],
  [-70, -60, 1, 14, 3.5, 0, 'dirt', 'out'],
  [-35, -60, 1, 14, 3.5, 0, 'dirt', 'out'],
];

/** Straight across the lava lake on a causeway, jumping two gaps where the lava has broken through. */
const SHORTCUT: Row[] = [
  [64, -349, 0.6, 10, 1, 0, 'rock', 'causeway'],
  [51, -354, 0.6, 10, 1, 0, 'rock', 'causeway'],
  [44, -359, 2.8, 10, 1, 0, 'rock', 'causeway'], // lip
  [41, -362, -6, 10, 1, 0, 'lava', 'causeway'],
  [37, -365, -6, 10, 1, 0, 'lava', 'causeway'],
  [33, -368, 1.4, 10, 1, 0, 'rock', 'causeway'],
  [10, -384, 0.6, 10, 1, 0, 'rock', 'causeway'],
  [-10, -398, 0.6, 10, 1, 0, 'rock', 'causeway'],
  [-17, -403, 2.8, 10, 1, 0, 'rock', 'causeway'], // lip
  [-21, -406, -6, 10, 1, 0, 'lava', 'causeway'],
  [-25, -409, -6, 10, 1, 0, 'lava', 'causeway'],
  [-29, -412, 1.4, 10, 1, 0, 'rock', 'causeway'],
  [-38, -421, 0.8, 10, 1, 0, 'rock', 'causeway'],
  [-41, -436, 1, 11, 1, -4, 'rock', 'causeway'],
  [-22, -451, 1.4, 12, 1, -4, 'rock', 'causeway'],
];

/** Control point index of each named spot on the main loop. */
export const SPOTS = Object.fromEntries(MAIN.flatMap((r, i) => (r[8] ? [[r[8], i]] : []))) as Record<Spot, number>;

const point = ([x, z, y, width, shoulder, bank, surface, stretch]: Row): ControlPoint => {
  const s = STRETCH[stretch];
  return { x, z, y, width, shoulder, bank, surface, cover: s.cover, zone: s.zone, ...(s.dark === undefined ? {} : { dark: s.dark }) };
};

const HAZARDS: Hazard[] = [
  // A boulder drops out of the chamber wall at the top of the climb and rolls down it, against the traffic.
  { kind: 'roll', route: 0, s: 800, offset: -3, period: 6.5, phase: 0, radius: 2, reach: -48, duty: 0.45, height: 3.5, effect: 'spin' },
  // A lava geyser on the ash flats, on the inside of the last bend.
  { kind: 'burst', route: 0, s: 1340, offset: -3.8, period: 4.5, phase: 0.3, radius: 2.4, reach: 0, duty: 0.3, height: 5, effect: 'launch' },
];

export const LAVA_DIG: TrackDef = {
  points: MAIN.map(point),
  fork: { from: SPOTS.fork, to: SPOTS.join, points: SHORTCUT.map(point) },
  hazards: HAZARDS,
  boxes: [0.07, 0.19, 0.36, 0.64, 0.79],
};
