import { BOT_LEVELS, type BotLevel } from './bot';
import { NO_INPUT, type CarInput } from './car';
import type { GridSlot } from './protocol';
import { MAX_RACERS } from './race';
import { mulberry32 } from './rng';
import { ROSTER } from './roster';

export const TRACKS = ['pirate-cove'] as const;
export type TrackId = (typeof TRACKS)[number];

export interface Settings {
  laps: number;
  /** Bots added to the grid after the people, as many as fit. */
  bots: number;
  items: boolean;
  level: BotLevel;
  track: TrackId;
}

export const DEFAULT_SETTINGS: Settings = { laps: 3, bots: 6, items: true, level: 'normal', track: 'pirate-cove' };
export const LAPS_MAX = 9;

const BOT_NAMES = ['Sparky', 'Turbo', 'Nitro', 'Gizmo', 'Rusty', 'Bolt', 'Dash', 'Zippy', 'Tinker', 'Chip', 'Sprocket'];

function pick<T>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  Number.isInteger(v) ? Math.min(hi, Math.max(lo, v as number)) : fallback;

export function sanitizeSettings(input: unknown, prev: Settings = DEFAULT_SETTINGS): Settings {
  const s = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  return {
    laps: int(s.laps, 1, LAPS_MAX, prev.laps),
    bots: int(s.bots, 0, MAX_RACERS - 1, prev.bots),
    items: typeof s.items === 'boolean' ? s.items : prev.items,
    level: pick(s.level, BOT_LEVELS, prev.level),
    track: pick(s.track, TRACKS, prev.track),
  };
}

export const isCar = (id: unknown): id is string => ROSTER.some((m) => m.id === id);

/**
 * The starting grid: the people and up to `bots` bots, shuffled by `seed` so nobody always starts at the back. Bots
 * drive random cars, and two cars may be the same model.
 */
export function buildGrid(people: { id: string; name: string; car: string }[], bots: number, seed: number): GridSlot[] {
  const rng = mulberry32(seed);
  const grid: GridSlot[] = people.slice(0, MAX_RACERS).map((p) => ({ id: p.id, name: p.name, car: p.car }));
  const names = [...BOT_NAMES];
  for (let i = 0; i < bots && grid.length < MAX_RACERS; i++) {
    const name = names.splice(Math.floor(rng() * names.length), 1)[0] ?? `Bot ${i + 1}`;
    grid.push({ id: null, name, car: ROSTER[Math.floor(rng() * ROSTER.length)].id });
  }
  for (let i = grid.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [grid[i], grid[j]] = [grid[j], grid[i]];
  }
  return grid;
}

/** One input sample on the wire: throttle, steer, and the buttons as bits. `reset` puts the car back on the track. */
export const packSample = (c: CarInput, reset = false): number[] => [
  Math.round(c.throttle * 100) / 100,
  Math.round(c.steer * 100) / 100,
  (c.drift ? 1 : 0) | (c.item ? 2 : 0) | (c.itemBack ? 4 : 0) | (reset ? 8 : 0),
];

export function unpackSample(q: readonly unknown[], at: number): { input: CarInput; reset: boolean } {
  const [throttle, steer, bits] = q.slice(at, at + 3);
  if (typeof throttle !== 'number' || typeof steer !== 'number' || typeof bits !== 'number') return { input: NO_INPUT, reset: false };
  const clamp = (n: number) => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);
  return {
    input: { throttle: clamp(throttle), steer: clamp(steer), drift: (bits & 1) !== 0, item: (bits & 2) !== 0, itemBack: (bits & 4) !== 0 },
    reset: (bits & 8) !== 0,
  };
}
