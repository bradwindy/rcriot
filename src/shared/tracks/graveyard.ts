import type { TrackDef } from '../course';
import type { Hazard } from '../hazards';
import { buildTrack, type ControlPoint, type Cover, type Surface } from '../track';

type Stretch = 'gate' | 'avenue' | 'crypt' | 'yard' | 'hill' | 'pond' | 'porch' | 'house' | 'stairs' | 'lawn' | 'secret' | 'lair';
type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch];

const COVER: Record<Stretch, Cover> = {
  gate: 'open',
  avenue: 'open',
  crypt: 'tunnel',
  yard: 'open',
  hill: 'open',
  pond: 'deck',
  porch: 'open',
  house: 'indoor',
  stairs: 'indoor',
  lawn: 'open',
  secret: 'open',
  lair: 'deck',
};

/**
 * Graveyard: a moonlit figure of eight. Out of the cemetery gates, over an open grave, through the crypt under
 * Hangman's Hill, round the graveyard (or over the vampire's lair), back up the hill past the hangman's tree, over the
 * crypt, across the pond on a boardwalk, and through the haunted house, up its stairs and out of the back door.
 */
const ROWS: Row[] = [
  [-200, 0, 1.0, 14, 3, 0, 'dirt', 'gate'], // start line, inside the cemetery gates
  [-200, -40, 1.0, 14, 3, 0, 'dirt', 'avenue'],
  [-189, -76, 1.0, 13, 2.5, -6, 'dirt', 'avenue'],
  [-152, -95, 1.2, 13, 2.5, -4, 'dirt', 'avenue'],
  [-114, -88, 1.4, 13, 2.5, 0, 'dirt', 'avenue'],
  [-97, -75, 1.4, 12, 2, 0, 'dirt', 'avenue'], // open grave kicker
  [-91, -69, 3.3, 12, 2, 0, 'dirt', 'avenue'],
  [-78, -53, 1.0, 13, 2.5, 0, 'dirt', 'avenue'],
  [-58, -20, 1.4, 12, 1.5, 0, 'dirt', 'avenue'],
  [-34, -2, 1.5, 12, 0.5, 0, 'stone', 'crypt'], // into the crypt
  [0, 0, 1.5, 12, 0.5, 0, 'stone', 'crypt'],
  [34, 0, 1.5, 12, 1.5, 0, 'dirt', 'yard'], // bats burst out here
  [75, -6, 1.5, 13, 2.5, 4, 'dirt', 'yard'],
  [118, -32, 1.5, 13, 2.5, 6, 'dirt', 'yard'], // the fork
  [148, -78, 1.5, 13, 2.5, 4, 'dirt', 'yard'],
  [153, -102, 1.5, 12, 2, 0, 'dirt', 'yard'], // fresh grave kicker
  [154, -110, 3.4, 12, 2, 0, 'dirt', 'yard'],
  [150, -128, 1.0, 13, 2.5, 0, 'dirt', 'yard'],
  [134, -170, 1.5, 13, 2.5, 6, 'dirt', 'yard'],
  [95, -196, 1.5, 13, 2.5, 4, 'dirt', 'yard'],
  [48, -203, 1.5, 13, 2.5, 0, 'dirt', 'yard'], // the join
  [6, -201, 1.8, 13, 2.5, 0, 'dirt', 'hill'],
  [-24, -200, 2.3, 13, 2.5, 4, 'dirt', 'hill'], // hairpin up Hangman's Hill
  [-46, -198, 2.7, 13, 2.5, 8, 'dirt', 'hill'],
  [-64, -190, 3.1, 13, 2.5, 10, 'dirt', 'hill'],
  [-72, -172, 3.5, 13, 2.5, 10, 'dirt', 'hill'],
  [-64, -154, 3.9, 13, 2.5, 10, 'dirt', 'hill'],
  [-46, -146, 4.4, 13, 2.5, 6, 'dirt', 'hill'],
  [-22, -144, 5.2, 13, 2.5, 0, 'dirt', 'hill'],
  [0, -128, 6.4, 13, 2, -6, 'dirt', 'hill'],
  [6, -98, 8.4, 13, 2, 0, 'dirt', 'hill'],
  [0, -56, 11.0, 13, 2, 0, 'dirt', 'hill'], // the hangman's tree
  [0, -28, 12.4, 13, 2, 0, 'dirt', 'hill'],
  [0, -14, 12.6, 12, 2, 0, 'dirt', 'hill'], // kicker over the crypt
  [0, -6, 14.4, 12, 2, 0, 'dirt', 'hill'],
  [0, 12, 11.6, 13, 2, 0, 'dirt', 'hill'],
  [0, 40, 7.0, 13, 2.5, 0, 'dirt', 'hill'],
  [-4, 72, 3.0, 13, 2.5, 0, 'dirt', 'hill'],
  [-14, 100, 1.4, 12, 1, 0, 'wood', 'pond'], // the boardwalk
  [-26, 128, 1.4, 12, 1, -4, 'wood', 'pond'],
  [-42, 152, 1.3, 12, 1, -4, 'dirt', 'porch'],
  [-60, 169, 1.0, 13, 2, -2, 'wood', 'porch'], // a ramp of boards up to the porch
  [-77, 175.5, 2.2, 12, 1, 0, 'wood', 'porch'], // up the porch steps
  [-86, 176, 2.3, 12, 1, 0, 'wood', 'house'], // the haunted house
  [-102, 176, 2.3, 12, 1, 0, 'wood', 'house'],
  [-110, 176, 3.0, 12, 1, 0, 'wood', 'stairs'],
  [-124, 176, 6.6, 12, 1, 0, 'wood', 'stairs'],
  [-130, 176, 7.3, 12, 1, 0, 'wood', 'house'], // off the landing
  [-142, 176, 3.4, 12, 1, 0, 'wood', 'house'],
  [-156, 176, 3.4, 12, 1, 0, 'wood', 'porch'], // out of the back door
  [-162, 175, 3.6, 12, 1, 0, 'wood', 'porch'],
  [-174, 170, 1.0, 13, 2, 0, 'dirt', 'lawn'],
  [-194, 150, 1.0, 14, 3, -6, 'dirt', 'lawn'],
  [-200, 116, 1.0, 14, 3, 0, 'dirt', 'gate'],
  [-200, 70, 1.0, 14, 3, 0, 'dirt', 'gate'],
];

const SHORTCUT: Row[] = [
  [124, -68, 2.0, 10, 1, 0, 'dirt', 'secret'],
  [106, -102, 4.8, 9, 0.6, 0, 'stone', 'lair'], // the bridge over the vampire's lair
  [94, -128, 6.0, 9, 0.6, 0, 'stone', 'lair'],
  [86, -154, 4.8, 9, 0.6, 0, 'stone', 'secret'],
  [80, -182, 1.8, 10, 1, 0, 'dirt', 'secret'],
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

export const GRAVEYARD_POINTS = ROWS.map(point);

/** Control point of the hangman's tree. */
const NOOSE_AT = 31;
const FORK = { from: 13, to: 20, points: SHORTCUT.map(point) };
const MAIN_MARKS = buildTrack(GRAVEYARD_POINTS).marks;
const FORK_MARKS = buildTrack([...GRAVEYARD_POINTS.slice(0, FORK.from + 1), ...FORK.points, ...GRAVEYARD_POINTS.slice(FORK.to)]).marks;

/** The noose on the hangman's tree swings across the hill road, a little before the hill top. */
export const NOOSE: Hazard = {
  kind: 'sweep',
  route: 0,
  s: MAIN_MARKS[NOOSE_AT] + 4,
  offset: 0,
  period: 2.8,
  phase: 0,
  radius: 1.1,
  reach: 5.5,
  duty: 1,
  height: 2.2,
  effect: 'spin',
};

/** The spider drops on its thread onto the middle of the lair bridge, and climbs back up. */
export const SPIDER: Hazard = {
  kind: 'burst',
  route: 1,
  s: FORK_MARKS[FORK.from + 3],
  offset: 0,
  period: 3.4,
  phase: 0.3,
  radius: 1.9,
  reach: 0,
  duty: 0.4,
  height: 2.6,
  effect: 'launch',
};

/** Box rows on the stretches both ways round share, clear of the jumps, the house and the grid. */
export const GRAVEYARD: TrackDef = { points: GRAVEYARD_POINTS, fork: FORK, hazards: [NOOSE, SPIDER], water: 0, boxes: [0.07, 0.24, 0.6, 0.9] };
