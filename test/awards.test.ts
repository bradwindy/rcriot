import { describe, expect, it } from 'vitest';
import { pickAwards } from '../src/shared/awards';
import type { RacerStats, ResultRow } from '../src/shared/results';

/** Twelve racers with a little ordinary variety, so nothing stands out until a test makes it. */
function field(): ResultRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const stats: RacerStats = {
      topSpeed: 33 + (i % 3) * 0.3,
      driftBoosts: 4 + (i % 3),
      orangeBoosts: 1 + (i % 2),
      rocketStart: false,
      itemsUsed: 3 + (i % 3),
      hitsLanded: i % 2,
      hitsTaken: 1 + (i % 2),
      airTime: 2 + (i % 3) * 0.5,
      bigAir: 0.5 + (i % 3) * 0.1,
      wallHits: 3 + (i % 4),
      bumps: 3 + (i % 4),
      overtakes: 1 + (i % 2),
      lapsLed: 0,
      offroad: 1 + (i % 3),
      comeback: i % 2,
    };
    return { name: `R${i}`, bot: i > 0, model: 'sandflea', place: i + 1, time: 90 + i, bestLap: 29 + (i % 2) * 0.2, stats };
  });
}

describe('awards', () => {
  it('goes to whoever stands out most, with no more than two each', () => {
    const rows = field();
    Object.assign(rows[0].stats, { driftBoosts: 20, orangeBoosts: 12, topSpeed: 40 });
    rows[4].stats.hitsLanded = 8;
    rows[7].stats.wallHits = 40;
    rows[10].stats.bigAir = 2.5;

    const awards = pickAwards(rows);
    // Racer 0 also has by far the top speed, but already holds two awards, so Speed Demon is skipped.
    expect(awards.map((a) => [a.name, a.winner])).toEqual([
      ['PINBALL', 7],
      ['DRIFT KING', 0],
      ['SPARK PLUG', 0],
      ['BIG AIR', 10],
      ['SHARPSHOOTER', 4],
    ]);
    expect(awards[1].reason).toBe('20 DRIFT BOOSTS');
  });
});
