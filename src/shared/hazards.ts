import { CAR_RADIUS, hitCar, type Car } from './car';
import { routeTrack } from './course';
import { sampleAt, surfaceY, wrapS, type Track } from './track';

/**
 * Set pieces that knock cars about, timed off the race clock so every copy of the race agrees on them for free.
 * A sweep swings side to side across the road (a pendulum, a crane hook). A burst goes off in one spot for part of
 * each cycle (a geyser, a bite, a blast). A roll travels along the track for part of each cycle (a boulder, a cart).
 */
export interface Hazard {
  kind: 'sweep' | 'burst' | 'roll';
  /** The route it sits on, 0 for the main track. */
  route: number;
  /** Distance along its route of its centre, or where a roll starts. */
  s: number;
  /** Sideways from the centre line, positive to the right. */
  offset: number;
  /** Seconds per cycle, and where in its cycle it is at the green light, 0 to 1. */
  period: number;
  phase: number;
  radius: number;
  /** A sweep's swing either side of `offset`, or how far a roll travels each cycle (negative runs against traffic). */
  reach: number;
  /** Share of each cycle a burst or roll is live. */
  duty: number;
  /** How high above the road it reaches. Cars flying higher clear it. */
  height: number;
  /** Spin: knocked aside and spun. Launch: thrown up in the air. */
  effect: 'spin' | 'launch';
}

export interface HazardState {
  x: number;
  y: number;
  z: number;
  s: number;
  offset: number;
  live: boolean;
  /** How far through its cycle, 0 to 1. A roll's run, or a burst's live part, is the first `duty` of it. */
  t: number;
}

export function hazardAt(track: Track, h: Hazard, clock: number): HazardState {
  const t = (((clock / h.period + h.phase) % 1) + 1) % 1;
  const route = routeTrack(track, h.route);
  let s = h.s;
  let offset = h.offset;
  let live = true;
  if (h.kind === 'sweep') offset += h.reach * Math.sin(t * Math.PI * 2);
  else {
    live = t < h.duty;
    if (h.kind === 'roll') s = wrapS(route, h.s + h.reach * Math.min(1, t / h.duty));
  }
  const p = sampleAt(route, s);
  return { x: p.x - p.tz * offset, y: surfaceY(p, offset), z: p.z + p.tx * offset, s, offset, live, t };
}

/** Knocks the car about if a live hazard has it. Returns true when it did. */
export function strike(track: Track, h: Hazard, clock: number, car: Car): boolean {
  if (car.shield > 0 || car.tumble > 0 || car.bubble > 0) return false;
  const at = hazardAt(track, h, clock);
  if (!at.live) return false;
  const dx = car.x - at.x;
  const dz = car.z - at.z;
  const d = Math.hypot(dx, dz);
  if (d > h.radius + CAR_RADIUS || car.y - at.y > h.height) return false;
  const nx = d > 1e-3 ? dx / d : 1;
  const nz = d > 1e-3 ? dz / d : 0;
  car.vx = car.vx * 0.4 + nx * 8;
  car.vz = car.vz * 0.4 + nz * 8;
  if (h.effect === 'launch') {
    car.vy = 11;
    car.y += 0.05;
    car.air = 1;
    car.tumble = 1;
  } else {
    car.tumble = 0.8;
  }
  car.drift = 0;
  car.driftTime = 0;
  hitCar(car, 1);
  return true;
}
