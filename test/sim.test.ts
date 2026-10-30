import { describe, expect, it } from 'vitest';
import { BASE_TICKS, driveFor } from './helpers';
import { BOOST_TIME, driftLevel, spawnCar, stepCar, TICK } from '../src/shared/car';
import { PIRATE_COVE } from '../src/shared/circuit';
import { COUNTDOWN, Race } from '../src/shared/race';
import { ROSTER, specOf, STAT_TOTAL } from '../src/shared/roster';
import { buildTrack, limitOf, locate, sampleAt } from '../src/shared/track';

const track = buildTrack(PIRATE_COVE);

describe('track', () => {
  it('locates a point beside the road at the right distance and side', () => {
    const p = sampleAt(track, 300);
    const loc = locate(track, p.x - p.tz * 4, p.z + p.tx * 4);
    expect(loc.s).toBeCloseTo(300, 0);
    expect(loc.offset).toBeCloseTo(4, 1);
  });
});

describe('roster', () => {
  it('every car has the same stat total', () => {
    for (const m of ROSTER) expect(Object.values(m.stats).reduce((a, b) => a + b)).toBe(STAT_TOTAL);
  });

  it('every car laps inside the barriers, within 10% of the others, with its own pace off the line', () => {
    const laps: number[] = [];
    const launch: number[] = [];
    for (const model of ROSTER) {
      const race = new Race(track, [model], -1, 7, false);
      const r = race.racers[0];
      let worst = 0;
      let lapStart = 0;
      let lapTime = 0;
      for (let i = 0; i < BASE_TICKS * 100 && !lapTime; i++) {
        const before = r.lap;
        race.step({ throttle: 0, steer: 0, drift: false, item: false, itemBack: false });
        if (Math.abs(race.clock - COUNTDOWN - 1) < TICK / 2) launch.push(Math.hypot(r.car.vx, r.car.vz));
        worst = Math.max(worst, Math.abs(r.car.offset) - limitOf(sampleAt(track, r.car.s)));
        if (r.lap === 2 && before === 1) lapStart = race.clock;
        if (r.lap === 3 && before === 2) lapTime = race.clock - lapStart;
      }
      expect(worst, model.name).toBeLessThanOrEqual(0);
      expect(lapTime, model.name).toBeGreaterThan(0);
      laps.push(lapTime);
    }
    expect(Math.max(...laps) / Math.min(...laps)).toBeLessThan(1.1);
    const quickest = ROSTER.reduce((a, b) => (b.stats.accel > a.stats.accel ? b : a));
    const slowest = ROSTER.reduce((a, b) => (b.stats.accel < a.stats.accel ? b : a));
    expect(launch[ROSTER.indexOf(quickest)]).toBeGreaterThan(launch[ROSTER.indexOf(slowest)] * 1.2);
  });
});

describe('drift', () => {
  it('a long drift charges orange sparks, and letting go boosts past top speed', () => {
    const spec = specOf(ROSTER[0].stats);
    const car = spawnCar(track, 30, 0);
    const arena = driveFor(car, spec, 3, { throttle: 1, steer: 0, drift: false, item: false, itemBack: false });
    driveFor(car, spec, 0.05, { throttle: 1, steer: 1, drift: true, item: false, itemBack: false }, arena);
    driveFor(car, spec, 1.9, { throttle: 1, steer: 0.5, drift: true, item: false, itemBack: false }, arena);
    expect(driftLevel(car)).toBe(2);
    driveFor(car, spec, TICK, { throttle: 1, steer: 0, drift: false, item: false, itemBack: false }, arena);
    expect(car.boost).toBeCloseTo(BOOST_TIME.orange, 1);
    let fastest = 0;
    for (let i = 0; i < 40; i++) {
      stepCar(car, { throttle: 1, steer: 0, drift: false, item: false, itemBack: false }, spec, arena);
      fastest = Math.max(fastest, Math.hypot(car.vx, car.vz));
    }
    expect(fastest).toBeGreaterThan(spec.topSpeed);
  });
});

describe('start', () => {
  const launchWith = (gasFrom: number) => {
    const race = new Race(track, ROSTER.slice(0, 2), 0);
    while (!race.started) race.step({ throttle: race.clock >= gasFrom ? 1 : 0, steer: 0, drift: false, item: false, itemBack: false });
    return race.player.car;
  };

  it('gas just before GO gives a rocket start', () => {
    expect(launchWith(COUNTDOWN - 0.3).boost).toBeGreaterThan(0);
  });

  it('gas held too early spins the wheels instead', () => {
    const car = launchWith(1);
    expect(car.boost).toBe(0);
    expect(car.stall).toBeGreaterThan(0);
  });
});
