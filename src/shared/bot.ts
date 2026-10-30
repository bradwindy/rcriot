import type { Car, CarInput, CarSpec } from './car';
import { sampleAt, type Track } from './track';

/** Sideways grip the bots plan corners around, in units per second squared. */
const CORNER_GRIP = 30;

export interface Brain {
  /** Preferred line, -1 left edge to 1 right edge. */
  lane: number;
  /** Where along the lap this bot starts weaving. */
  phase: number;
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function botInput(car: Car, spec: CarSpec, track: Track, brain: Brain): CarInput {
  const speed = Math.hypot(car.vx, car.vz);
  const look = 6 + speed * 0.45;
  const ahead = sampleAt(track, car.s + look);
  const room = ahead.width / 2 - 1.6;
  const lane = Math.max(-1, Math.min(1, brain.lane + 0.35 * Math.sin(car.s * 0.013 + brain.phase))) * room;
  const tx = ahead.x - ahead.tz * lane;
  const tz = ahead.z + ahead.tx * lane;
  const want = Math.atan2(-(tx - car.x), -(tz - car.z));
  const steer = Math.max(-1, Math.min(1, -wrapAngle(want - car.heading) * 2.4));

  const far = sampleAt(track, car.s + look + 20);
  const bend = Math.abs(wrapAngle(Math.atan2(far.tx, far.tz) - Math.atan2(ahead.tx, ahead.tz))) / 20;
  const safe = Math.sqrt(CORNER_GRIP / Math.max(bend, 1e-4));
  const throttle = speed > Math.min(spec.topSpeed, safe) + 1 ? -0.4 : 1;
  return { throttle, steer };
}
