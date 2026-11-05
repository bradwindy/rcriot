import { describe, expect, it } from 'vitest';
import { NO_INPUT, TICK } from '../src/shared/car';
import { Race } from '../src/shared/race';
import { ROSTER } from '../src/shared/roster';
import { courseOf, TRACK_IDS } from '../src/shared/tracks';

/** Every track: the right size and features, and a 12-bot race that everyone finishes, both ways round the fork. */
describe.each(TRACK_IDS)('%s', (id) => {
  const track = courseOf(id);
  const fresh = id !== 'pirate-cove';

  it.runIf(fresh)('is long enough, forks once, has hazards and a dark stretch', () => {
    expect(track.length).toBeGreaterThanOrEqual(1300);
    expect(track.length).toBeLessThanOrEqual(1700);
    expect(track.routes.length).toBe(1);
    expect(track.hazards.length).toBeGreaterThanOrEqual(1);
    expect(track.hazards.length).toBeLessThanOrEqual(2);
    expect([...track.samples, ...track.routes[0].track.samples].some((p) => p.dark)).toBe(true);
  });

  it('runs a 3-lap race that every bot finishes', () => {
    const race = new Race(track, [...ROSTER, ...ROSTER].slice(0, 12), [], 11, true, { laps: 3, level: 'normal' });
    const fork = track.routes[0];
    const ways = new Set<number>();
    const air = race.racers.map(() => 0);
    let jumps = 0;
    while (!race.racers.every((r) => r.lap > 3) && race.clock < 600) {
      race.step(NO_INPUT);
      race.racers.forEach((r, i) => {
        if (fork && r.car.s > fork.from + 20 && r.car.s < fork.to - 20) ways.add(r.car.route);
        if (r.car.air > 0) air[i] += TICK;
        else {
          if (i === 0 && air[i] > 0.35) jumps++;
          air[i] = 0;
        }
      });
    }
    const laps = race.racers.map((r) => r.bestLap ?? Infinity);
    console.log(`${id}: ${Math.round(track.length)} m, best laps ${Math.min(...laps).toFixed(1)}-${Math.max(...laps).toFixed(1)} s, jumps a lap ${(jumps / 3).toFixed(1)}`);
    const stuck = race.racers.filter((r) => r.lap <= 3).map((r) => `${r.model.id} lap ${r.lap} at ${Math.round(r.car.s)}`);
    expect(stuck).toEqual([]);
    if (fresh) {
      expect(ways).toEqual(new Set([0, 1]));
      expect(jumps / 3).toBeGreaterThanOrEqual(3);
    }
  });
});
