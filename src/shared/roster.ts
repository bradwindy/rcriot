import type { CarSpec } from './car';

/** Each body is themed on one of the movie worlds from RC Revenge: pirates, monsters, sci-fi, horror, jungle, cartoons. */
export type Body = 'buggy' | 'shark' | 'rocket' | 'saucer' | 'hearse' | 'safari' | 'raptor' | 'galleon' | 'duck' | 'bones';

/** How the body paint is laid out over the base colour, in the second colour. */
export type Pattern = 'stripe' | 'plain' | 'flames' | 'zebra' | 'spots' | 'pinstripe';

/** Each stat runs 1 to 5, and every car's stats add up to 15, so no car is better overall. */
export interface Stats {
  speed: number;
  accel: number;
  handling: number;
  grip: number;
  weight: number;
}

export interface CarModel {
  id: string;
  name: string;
  body: Body;
  color: string;
  /** Second colour, for the pattern and trim. */
  stripe: string;
  pattern: Pattern;
  stats: Stats;
}

export const STAT_TOTAL = 15;

const car = (id: string, name: string, body: Body, color: string, stripe: string, pattern: Pattern, s: number[]): CarModel => ({
  id,
  name,
  body,
  color,
  stripe,
  pattern,
  stats: { speed: s[0], accel: s[1], handling: s[2], grip: s[3], weight: s[4] },
});

export const ROSTER: CarModel[] = [
  car('sandflea', 'Sand Flea', 'buggy', '#d8322a', '#f4f0e0', 'stripe', [3, 3, 3, 3, 3]),
  car('chomper', 'Chomper', 'shark', '#6c8aa8', '#eef2f2', 'plain', [2, 3, 2, 4, 4]),
  car('comet', 'Comet', 'rocket', '#d8dde4', '#e8401c', 'flames', [5, 2, 3, 3, 2]),
  car('saucer', 'Saucer', 'saucer', '#9aa4b4', '#7ac24a', 'plain', [4, 4, 4, 2, 1]),
  car('lastride', 'Last Ride', 'hearse', '#26222c', '#9a4ad8', 'pinstripe', [2, 2, 3, 3, 5]),
  car('safari', 'Safari', 'safari', '#e0c890', '#2a2420', 'zebra', [3, 4, 4, 2, 2]),
  car('raptor', 'Raptor', 'raptor', '#5a9a3a', '#2e5a22', 'spots', [5, 3, 2, 2, 3]),
  car('galleon', 'Galleon', 'galleon', '#8a5a32', '#c8281e', 'plain', [3, 3, 1, 4, 4]),
  car('quackers', 'Quackers', 'duck', '#f2d02e', '#f08a1c', 'plain', [1, 5, 5, 3, 1]),
  car('boneshaker', 'Boneshaker', 'bones', '#2a2a2a', '#e8e0c8', 'plain', [4, 3, 3, 4, 1]),
];

export function specOf(s: Stats): CarSpec {
  return {
    topSpeed: 30.5 + s.speed * 0.9,
    accel: 12 + s.accel * 3.6,
    turnRate: 1.75 + s.handling * 0.2,
    grip: 3.6 + s.grip * 1.3,
    weight: 0.6 + s.weight * 0.18,
  };
}
