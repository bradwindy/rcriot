import type { TrackDef } from '../course';
import type { ControlPoint, Cover, Surface } from '../track';

/** The layout is drawn at 1/K scale below and stretched by K, so the island and track can grow together. */
export const K = 1.25;

type Stretch = 'open' | 'pier' | 'ship' | 'tunnel';
type Row = [x: number, z: number, y: number, width: number, shoulder: number, bank: number, surface: Surface, stretch: Stretch];

const COVER: Record<Stretch, [Cover, string]> = { open: ['open', ''], pier: ['deck', 'pier'], ship: ['indoor', 'ship'], tunnel: ['tunnel', 'cave'] };

/** Pirate Cove: a counter-clockwise loop round a lagoon, along a pier, through a wreck and a smugglers' cave. */
const ROWS: Row[] = [
  [0, 0, 1.0, 14, 4, 0, 'sand', 'open'], // start line on the beach
  [50, 0, 1.0, 14, 4, 0, 'sand', 'open'],
  [95, -8, 1.0, 14, 4, 6, 'sand', 'open'],
  [120, -35, 1.1, 14, 4, 8, 'sand', 'open'],
  [125, -66, 1.6, 12, 1, 0, 'wood', 'pier'], // pier rises off the sand
  [122, -100, 2.6, 11, 0.6, 0, 'wood', 'pier'],
  [105, -135, 2.6, 11, 0.6, 0, 'wood', 'pier'],
  [70, -150, 2.8, 11, 0.6, 0, 'wood', 'pier'],
  [30, -150, 2.6, 11, 0.6, 0, 'wood', 'pier'],
  [0, -138, 2.6, 11, 0.6, 0, 'wood', 'pier'],
  [-20, -115, 2.4, 10, 0.5, 0, 'wood', 'pier'],
  [-30, -90, 2.0, 10, 0.5, 0, 'wood', 'ship'], // through the wreck
  [-40, -62, 1.4, 10, 0.5, 0, 'sand', 'open'],
  [-45, -54, 1.4, 12, 2, 0, 'wood', 'open'], // stunt ramp
  [-49, -48, 3.4, 12, 2, 0, 'sand', 'open'],
  [-58, -38, 1.3, 14, 4, 0, 'sand', 'open'],
  [-82, -20, 1.4, 14, 4, 0, 'sand', 'open'],
  [-105, 0, 2.0, 12, 0.5, 0, 'rock', 'tunnel'], // cave mouth
  [-128, 25, 3.5, 12, 0.5, 10, 'rock', 'tunnel'],
  [-118, 55, 5.0, 12, 0.5, 10, 'sand', 'open'], // cave exit
  [-90, 62, 4.6, 14, 3, 0, 'sand', 'open'],
  [-55, 48, 2.6, 14, 4, -4, 'sand', 'open'],
  [-32, 22, 1.5, 14, 4, 0, 'sand', 'open'],
  [-14, 5, 1.1, 14, 4, 0, 'sand', 'open'],
];

const POINTS: ControlPoint[] = ROWS.map(([x, z, y, width, shoulder, bank, surface, stretch]) => ({
  x: x * K,
  z: z * K,
  y,
  width,
  shoulder,
  bank,
  surface,
  cover: COVER[stretch][0],
  zone: COVER[stretch][1],
}));

export const PIRATE_COVE: TrackDef = { points: POINTS, water: 0 };
