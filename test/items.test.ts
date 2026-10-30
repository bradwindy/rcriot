import { describe, expect, it } from 'vitest';
import { NO_INPUT, spawnCar, TICK } from '../src/shared/car';
import { PIRATE_COVE } from '../src/shared/circuit';
import { applyHit, FAKE_ARM, ROLL_TIME, rollItem, type ItemKind } from '../src/shared/items';
import { mulberry32 } from '../src/shared/rng';
import { Race } from '../src/shared/race';
import { ROSTER } from '../src/shared/roster';
import { buildTrack } from '../src/shared/track';

const track = buildTrack(PIRATE_COVE);

/** A race just past GO, with the player in slot 0 holding nothing and bots everywhere else. */
function started(count: number): Race {
  const race = new Race(track, ROSTER.slice(0, count), 0);
  while (!race.started) race.step(NO_INPUT);
  return race;
}

describe('items', () => {
  it('leaders get defensive items and the back of the pack gets the strong ones', () => {
    const rng = mulberry32(3);
    const strong: ItemKind[] = ['rocket', 'heat', 'lightning', 'shockwave', 'ultimate'];
    const share = (place: number) => {
      let n = 0;
      let ultimate = 0;
      for (let i = 0; i < 4000; i++) {
        const k = rollItem(place, rng).kind;
        if (strong.includes(k)) n++;
        if (k === 'ultimate') ultimate++;
      }
      return { strong: n / 4000, ultimate };
    };
    const front = share(0);
    const back = share(1);
    expect(back.strong).toBeGreaterThan(front.strong * 2);
    expect(front.ultimate).toBe(0);
    expect(back.ultimate).toBeGreaterThan(0);
  });

  it('a shield blocks a blast', () => {
    const car = spawnCar(track, 100, 0);
    car.shield = 5;
    expect(applyHit(car, 'blast')).toBe(false);
    expect(car.tumble).toBe(0);
  });

  it('blue lightning zaps a car alongside, and two charges cancel out', () => {
    const sideBySide = () => {
      const race = started(2);
      Object.assign(race.racers[0].car, spawnCar(track, 120, -2));
      Object.assign(race.racers[1].car, spawnCar(track, 120, 2));
      return race;
    };
    const race = sideBySide();
    race.items.charge[0] = 10;
    race.step(NO_INPUT);
    expect(race.racers[1].car.stun).toBeGreaterThan(0);

    const again = sideBySide();
    again.items.charge[0] = 10;
    again.items.charge[1] = 10;
    again.step(NO_INPUT);
    expect(again.items.charge[0]).toBe(0);
    expect(again.items.charge[1]).toBe(0);
  });

  it('the ultimate weapon shorts out every other car', () => {
    const race = started(6);
    race.items.held[0] = { kind: 'ultimate', count: 1 };
    for (let i = 0; i < ROLL_TIME / TICK + 2; i++) race.step(NO_INPUT);
    for (const r of race.racers) r.car.stun = 0;
    race.step({ ...NO_INPUT, item: true });
    const others = race.racers.slice(1).map((r) => r.car.stun);
    expect(others.every((s) => s > 0)).toBe(true);
    expect(race.racers[0].car.stun).toBe(0);
  });

  it('a locked rocket homes in on the car ahead', () => {
    const race = started(2);
    const [me, them] = race.racers.map((r) => r.car);
    Object.assign(me, spawnCar(track, 40, 0));
    Object.assign(them, spawnCar(track, 65, 0));
    race.items.held[0] = { kind: 'rocket', count: 1 };
    const drive = { ...NO_INPUT, throttle: 1 };
    for (let i = 0; i < 60; i++) race.step(drive);
    expect(race.items.lock[0]).toBe(1);
    race.step({ ...drive, item: true });
    let hit = false;
    for (let i = 0; i < 3 / TICK && !hit; i++) {
      race.step(drive);
      hit = them.tumble > 0;
    }
    expect(hit).toBe(true);
  });

  it('a fake box cannot hit the car right behind until it has armed', () => {
    const race = started(2);
    const [me, chaser] = race.racers.map((r) => r.car);
    Object.assign(me, spawnCar(track, 60, 0));
    Object.assign(chaser, spawnCar(track, 56, 0));
    race.racers[1].spec.topSpeed = 0.001;
    race.items.held[0] = { kind: 'fake', count: 1 };
    for (let i = 0; i < ROLL_TIME / TICK + 2; i++) race.step(NO_INPUT);
    race.step({ ...NO_INPUT, itemBack: true });
    const fake = race.items.entities.find((e) => e.kind === 'fake');
    expect(fake).toBeDefined();
    Object.assign(chaser, { x: fake?.x, z: fake?.z });
    for (let i = 0; i < (FAKE_ARM - 0.2) / TICK; i++) {
      race.step(NO_INPUT);
      Object.assign(chaser, { x: fake?.x, z: fake?.z, vx: 0, vz: 0 });
    }
    expect(chaser.tumble).toBe(0);
    for (let i = 0; i < 0.5 / TICK; i++) {
      race.step(NO_INPUT);
      if (race.items.entities.includes(fake as never)) Object.assign(chaser, { x: fake?.x, z: fake?.z, vx: 0, vz: 0 });
    }
    expect(chaser.tumble).toBeGreaterThan(0);
  });
});
