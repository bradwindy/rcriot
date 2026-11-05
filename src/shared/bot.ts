import type { Car, CarInput, CarSpec } from './car';
import { fromMain, routeTrack } from './course';
import { sampleAt, type Track } from './track';

export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

/** Share of top speed a bot drives at, how fast it dares take corners, and how much it weaves. */
const SKILL: Record<BotLevel, { pace: number; corner: number; weave: number; shortcut: number }> = {
  easy: { pace: 0.86, corner: 0.8, weave: 1.4, shortcut: 0.2 },
  normal: { pace: 1, corner: 1, weave: 1, shortcut: 0.4 },
  hard: { pace: 1, corner: 1.18, weave: 0.6, shortcut: 0.65 },
};

/** How far before a fork a bot settles which way to go. */
const PLAN_AHEAD = 90;

export interface Brain {
  /** Preferred line, -1 left edge to 1 right edge. */
  lane: number;
  /** Where along the lap this bot starts weaving. */
  phase: number;
  /** Times its start for a rocket boost. */
  rocket: boolean;
  level: BotLevel;
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** The route a bot steers by: at a fork, a choice that holds for the lap, otherwise the route it is on. */
function plan(car: Car, track: Track, brain: Brain, lap: number): number {
  const fork = track.routes[0];
  if (!fork || car.s < fork.from - PLAN_AHEAD || car.s > fork.to) return car.route;
  if (car.s > fork.zones[0][1]) return car.route;
  const roll = Math.abs(Math.sin(brain.phase * 9301 + lap * 49297) * 43758.5453) % 1;
  return roll < SKILL[brain.level].shortcut ? 1 : 0;
}

export function botInput(car: Car, spec: CarSpec, main: Track, brain: Brain, lap = 0): CarInput {
  const route = plan(car, main, brain, lap);
  const track = routeTrack(main, route);
  const s = route === car.route ? car.rs : fromMain(main, route, car.s);
  const speed = Math.hypot(car.vx, car.vz);
  const look = 6 + speed * 0.45;
  const ahead = sampleAt(track, s + look);
  const room = ahead.width / 2 - 1.6;
  const skill = SKILL[brain.level];
  const lane = Math.max(-1, Math.min(1, brain.lane + 0.35 * skill.weave * Math.sin(car.s * 0.013 + brain.phase))) * room;
  const tx = ahead.x - ahead.tz * lane;
  const tz = ahead.z + ahead.tx * lane;
  const want = Math.atan2(-(tx - car.x), -(tz - car.z));
  const steer = Math.max(-1, Math.min(1, -wrapAngle(want - car.heading) * 2.4));

  // Sideways grip the bot plans its corners around, more for grippier cars.
  const cornerGrip = (16 + spec.grip * 1.7) * skill.corner;
  const far = sampleAt(track, s + look + 20);
  const bend = Math.abs(wrapAngle(Math.atan2(far.tx, far.tz) - Math.atan2(ahead.tx, ahead.tz))) / 20;
  const safe = Math.sqrt(cornerGrip / Math.max(bend, 1e-4));
  const limit = Math.min(spec.topSpeed * skill.pace, safe);
  const throttle = speed > limit + 1 ? -0.4 : skill.pace < 1 && speed > spec.topSpeed * skill.pace ? 0 : 1;
  return { throttle, steer, drift: false, item: false, itemBack: false };
}
