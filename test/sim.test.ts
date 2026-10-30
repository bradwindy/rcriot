import { describe, expect, it } from 'vitest';
import { PIRATE_COVE } from '../src/shared/circuit';
import { Race } from '../src/shared/race';
import { buildTrack, limitOf, locate, sampleAt } from '../src/shared/track';

const track = buildTrack(PIRATE_COVE);

describe('track', () => {
  it('locates a point beside the road at the right distance and side', () => {
    const p = sampleAt(track, 300);
    const x = p.x - p.tz * 4;
    const z = p.z + p.tx * 4;
    const loc = locate(track, x, z);
    expect(loc.s).toBeCloseTo(300, 0);
    expect(loc.offset).toBeCloseTo(4, 1);
  });
});

describe('race', () => {
  it('bots lap the circuit without leaving the track', () => {
    const race = new Race(track, 8, 4);
    let worst = 0;
    for (let i = 0; i < 60 * 150; i++) {
      race.step({ throttle: 0, steer: 0 });
      for (const r of race.racers) {
        const p = sampleAt(track, r.car.s);
        worst = Math.max(worst, Math.abs(r.car.offset) - limitOf(p));
      }
    }
    const bots = race.racers.filter((r) => r.brain);
    expect(Math.min(...bots.map((r) => r.lap))).toBeGreaterThanOrEqual(3);
    expect(worst).toBeLessThanOrEqual(0);
  });

  it('a car leaves the ground over the stunt ramp at speed', () => {
    const race = new Race(track, 8, 4);
    let airborne = 0;
    for (let i = 0; i < 60 * 60; i++) {
      race.step({ throttle: 0, steer: 0 });
      airborne = Math.max(airborne, ...race.racers.map((r) => r.car.air));
    }
    expect(airborne).toBeGreaterThan(0.3);
  });
});
