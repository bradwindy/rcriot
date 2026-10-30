import { describe, expect, it } from 'vitest';
import { botInput } from '../src/shared/bot';
import { NO_INPUT, TICK } from '../src/shared/car';
import { PIRATE_COVE } from '../src/shared/circuit';
import { FINISH_WINDOW, Race } from '../src/shared/race';
import { ROSTER } from '../src/shared/roster';
import { encodeSnapshot, loadSnapshot, snapHead } from '../src/shared/snapshot';
import { buildTrack } from '../src/shared/track';

const track = buildTrack(PIRATE_COVE);

describe('race', () => {
  it('ends a set time after the first person finishes, and places the rest by how far they got', () => {
    const race = new Race(track, ROSTER.slice(0, 4), [0, 1], 3, false, { laps: 1 });
    const [driver, idler] = race.racers;
    while (!race.over && race.clock < 200) {
      race.step([botInput(driver.car, driver.spec, track, driver.brain), NO_INPUT]);
    }
    expect(driver.finish).not.toBeNull();
    expect(idler.finish).toBeNull();
    expect(race.clock).toBeCloseTo((driver.finish as number) + FINISH_WINDOW, 1);
    const rows = race.results(['A', 'B', 'C', 'D']);
    expect(rows[1].place).toBe(4);
    expect(rows[1].time).toBeNull();
    expect(rows[0].bestLap).toBeGreaterThan(0);
  });

  it('a guest that loads a snapshot predicts the cars as the host moves them', () => {
    const host = new Race(track, ROSTER.slice(0, 6), [0], 9, true, { laps: 3 });
    const drive = { ...NO_INPUT, throttle: 1, steer: 0.2 };
    for (let i = 0; i < 9 / TICK; i++) host.step([drive]);
    const buf = encodeSnapshot(host, 4, [123]);
    expect(snapHead(buf, 6)).toMatchObject({ n: 4, k: host.tick, acks: [123, -1, -1, -1, -1, -1] });

    const guest = new Race(track, ROSTER.slice(0, 6), [0], 9, true, { laps: 3 });
    loadSnapshot(guest, buf);
    expect(guest.items.entities.length).toBe(host.items.entities.length);
    for (let i = 0; i < 20; i++) {
      host.step([drive]);
      guest.step([drive], false);
    }
    const gap = Math.hypot(host.racers[0].car.x - guest.racers[0].car.x, host.racers[0].car.z - guest.racers[0].car.z);
    expect(gap).toBeLessThan(0.05);
  });
});
