import { describe, expect, it } from 'vitest';
import { NO_INPUT, spawnCar, stepCar, TICK } from '../src/shared/car';
import { buildCourse, toMain, type TrackDef } from '../src/shared/course';
import { strike, type Hazard } from '../src/shared/hazards';
import { Race } from '../src/shared/race';
import { ROSTER, specOf } from '../src/shared/roster';
import type { ControlPoint } from '../src/shared/track';

const ring = (r: number, i: number, n: number): ControlPoint => {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.sin(a) * r * 1.4, z: -Math.cos(a) * r + r, y: 1, width: 14, shoulder: 3, bank: 0, surface: 'dirt', cover: 'open' };
};

/** An oval with a straight shortcut across its far end. */
function forked(): TrackDef {
  const points = Array.from({ length: 12 }, (_, i) => ring(170, i, 12));
  const [a, b] = [points[4], points[8]];
  const chord = [1, 2, 3].map((k) => ({ ...a, x: a.x + ((b.x - a.x) * k) / 4, z: a.z + ((b.z - a.z) * k) / 4 }));
  return { points, fork: { from: 4, to: 8, points: chord } };
}

describe('course', () => {
  it('maps the fork onto the main lap, and bots take both ways round and finish', () => {
    const track = buildCourse(forked());
    const fork = track.routes[0];
    expect(fork.track.length).toBeLessThan(track.length);
    expect(toMain(track, 1, fork.rfrom)).toBeCloseTo(fork.from, 3);
    expect(toMain(track, 1, fork.rto)).toBeCloseTo(fork.to, 3);
    expect(toMain(track, 1, fork.track.length - 1)).toBeCloseTo(track.length - 1, 1);

    const race = new Race(track, ROSTER.slice(0, 10), [], 5, false, { laps: 3, level: 'hard' });
    const took = new Set<string>();
    while (!race.racers.every((r) => r.lap > 3) && race.clock < 400) {
      race.step(NO_INPUT);
      race.racers.forEach((r, i) => {
        if (r.car.s > fork.from + 30 && r.car.s < fork.to - 30) took.add(`${i}:${r.car.route}`);
      });
    }
    expect(race.racers.every((r) => r.lap > 3)).toBe(true);
    expect([...took].some((k) => k.endsWith(':1'))).toBe(true);
    expect([...took].some((k) => k.endsWith(':0'))).toBe(true);
  });

  it('a car that lands in lava comes back on solid ground past it', () => {
    const points = Array.from({ length: 12 }, (_, i) => ring(170, i, 12));
    points[3] = { ...points[3], y: -4, surface: 'lava' };
    const track = buildCourse({ points });
    const lava = track.marks[3];
    const car = spawnCar(track, lava - 10, 0);
    const gas = { ...NO_INPUT, throttle: 1 };
    for (let i = 0; i < 3 / TICK && car.sinkAt < 0; i++) stepCar(car, gas, specOf(ROSTER[0].stats), track);
    expect(car.sinkAt).toBeGreaterThan(0);
    expect(car.s).toBeGreaterThan(track.marks[4]);
  });

  it('a live hazard knocks a car over, and one that is off leaves it be', () => {
    const track = buildCourse({ points: Array.from({ length: 12 }, (_, i) => ring(170, i, 12)) });
    const burst: Hazard = { kind: 'burst', route: 0, s: 100, offset: 0, period: 4, phase: 0, radius: 2, reach: 0, duty: 0.25, height: 3, effect: 'launch' };
    const car = spawnCar(track, 100, 0);
    expect(strike(track, burst, 2, car)).toBe(false);
    expect(strike(track, burst, 0.5, car)).toBe(true);
    expect(car.tumble).toBeGreaterThan(0);
    expect(car.vy).toBeGreaterThan(5);
  });
});
