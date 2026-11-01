import { botInput, type BotLevel, type Brain } from './bot';
import {
  BOOST_TIME,
  CAR_RADIUS,
  grounded,
  hitCar,
  NO_INPUT,
  resetCar,
  spawnCar,
  startBoost,
  stepCar,
  TICK,
  type Car,
  type CarInput,
  type CarSpec,
} from './car';
import { strike } from './hazards';
import { botItem, Items, type Field } from './items';
import { newStats, type RacerStats, type ResultRow } from './results';
import { mulberry32 } from './rng';
import { specOf, type CarModel } from './roster';
import type { Track } from './track';

export interface Racer {
  car: Car;
  model: CarModel;
  spec: CarSpec;
  /** Whether a person drives this car. Their car drives itself once they finish, or while they are away. */
  human: boolean;
  brain: Brain;
  /** Driven by its brain this tick: always for bots, and for people who have finished or dropped out. */
  auto: boolean;
  /** Times over the start line. The grid sits behind it, so the first crossing starts lap 1. */
  lap: number;
  halfway: boolean;
  /** What drove the car on the last tick, for steering the front wheels on screen. */
  input: CarInput;
  /** Race clock when the gas went down during the countdown, or null while it is up. */
  gasAt: number | null;
  /** The most laps the car has started, so crossing back over the line after reversing doesn't count a lap twice. */
  top: number;
  /** Race clock when the current lap began, the best lap so far, and when the car finished. */
  lapStart: number;
  bestLap: number | null;
  finish: number | null;
  stats: RacerStats;
}

export const COUNTDOWN = 3;
/** Gas pressed within this many seconds before GO gives a rocket start. */
export const ROCKET_WINDOW = 0.45;
/** Gas held longer than this before GO spins the wheels for a moment. */
const JUMPED = 1.2;
const STALL = 0.8;
const RESTITUTION = 0.35;
/** Once the first person finishes, everyone else has this long. */
export const FINISH_WINDOW = 30;
/** Seconds between the place checks that count overtakes, so two cars side by side don't count dozens. */
const OVERTAKE_CHECK = 0.5;
export const MAX_RACERS = 12;

export interface RaceOptions {
  seed?: number;
  items?: boolean;
  /** Laps to the finish. Infinity for a race that never ends, like the title screen's. */
  laps?: number;
  level?: BotLevel;
}

export class Race implements Field {
  readonly racers: Racer[] = [];
  readonly items: Items;
  readonly laps: number;
  tick = 0;
  /** Seconds since the countdown started. The race is on from COUNTDOWN. */
  clock = 0;
  /** Race clock when the race ends, set when the first person finishes. */
  endAt: number | null = null;
  over = false;
  private worst: number[] = [];
  private lastRanks: number[] = [];
  /** When each racer last counted a Heat Ray burn from each other racer, so one blast counts once. */
  private burnt = new Map<number, number>();
  /** Seconds of each racer's current jump. A water bubble's float doesn't count. */
  private airRun: number[] = [];
  private checkAt = COUNTDOWN;

  /** models[i] drives grid slot i. People drive the slots in `humans`. */
  constructor(
    readonly track: Track,
    models: CarModel[],
    humans: number | readonly number[],
    seed = 7,
    items = true,
    opts: Omit<RaceOptions, 'seed' | 'items'> = {},
  ) {
    const people = typeof humans === 'number' ? [humans] : humans;
    const level = opts.level ?? 'normal';
    this.laps = opts.laps ?? Infinity;
    const rng = mulberry32(seed);
    models.forEach((model, slot) => {
      const { s, offset } = gridSlot(track, slot);
      const human = people.includes(slot);
      this.racers.push({
        car: spawnCar(track, s, offset),
        model,
        spec: specOf(model.stats),
        human,
        brain: { lane: (rng() - 0.5) * 1.2, phase: rng() * Math.PI * 2, rocket: level === 'hard' || rng() < 0.3, level },
        auto: !human,
        lap: 0,
        halfway: true,
        top: 0,
        input: NO_INPUT,
        gasAt: null,
        lapStart: COUNTDOWN,
        bestLap: null,
        finish: null,
        stats: newStats(),
      });
    });
    this.worst = this.racers.map(() => 0);
    this.airRun = this.racers.map(() => 0);
    this.items = new Items(track, this.racers.length, items, seed);
  }

  get cars(): Car[] {
    return this.racers.map((r) => r.car);
  }

  ranks(): number[] {
    const order = this.standings();
    return this.racers.map((r) => order.indexOf(r));
  }

  /** The first person's car, for single-player races. */
  get player(): Racer {
    return this.racers.find((r) => r.human) ?? this.racers[0];
  }

  get started(): boolean {
    return this.clock >= COUNTDOWN;
  }

  /**
   * One tick. `inputs` holds each racer's controls by index, or one set for every person. Cars that drive themselves
   * ignore theirs. A partial step (`full` false) moves the cars only, for a guest predicting the race ahead of the
   * host: no pick-ups, no stats and no finish.
   */
  step(inputs: CarInput | readonly (CarInput | undefined)[], full = true): void {
    const wasStarted = this.started;
    this.tick++;
    // Worked out from the tick rather than added up, so a guest that loads a snapshot keeps exactly the host's clock.
    this.clock = this.tick * TICK;
    const own = (i: number) => (Array.isArray(inputs) ? inputs[i] : (inputs as CarInput)) ?? NO_INPUT;
    if (!this.started) {
      this.racers.forEach((r, i) => {
        if (r.auto) return;
        const input = own(i);
        if (input.throttle > 0 && r.gasAt === null) r.gasAt = this.clock;
        if (input.throttle <= 0) r.gasAt = null;
        r.input = input;
      });
      return;
    }
    if (!wasStarted) this.launch();

    const { track } = this;
    this.racers.forEach((r, i) => {
      if (!r.auto) r.input = own(i);
      else r.input = { ...botInput(r.car, r.spec, track, r.brain, r.lap), ...(full ? botItem(this, this.items, i) : {}) };
    });
    const leader = full ? this.standings()[0] : null;
    this.racers.forEach((r, i) => this.drive(r, i, full, r === leader));
    for (const h of track.hazards) for (const r of this.racers) strike(track, h, this.clock, r.car);
    if (full) {
      const seen = this.items.events.length;
      this.items.step(this, this.racers.map((r) => r.input), TICK);
      this.count(this.items.events.slice(seen));
    }
    this.collide(full);
    if (full) this.check();
  }

  private drive(r: Racer, i: number, full: boolean, leading: boolean): void {
    const { car } = r;
    const half = this.track.length / 2;
    const before = car.s;
    stepCar(car, r.input, r.spec, this.track, TICK);
    const ds = car.s - before;
    if (ds < -half) {
      if (r.halfway) this.crossed(r, full, leading);
      r.halfway = false;
    } else if (ds > half) {
      r.lap--;
      r.halfway = true;
    } else if (before < half && car.s >= half) {
      r.halfway = true;
    }
    if (!full || r.finish !== null) return;
    const st = r.stats;
    const speed = Math.hypot(car.vx, car.vz);
    st.topSpeed = Math.max(st.topSpeed, speed);
    // A boost that starts inside the car's own step is a drift paying out. Batteries come later, from the items.
    if (car.boostAt === car.age) {
      st.driftBoosts++;
      if (car.boostPower > 1) st.orangeBoosts++;
    }
    if (car.wallAt === car.age) st.wallHits++;
    if (car.offroad) st.offroad += TICK;
    if (car.bubble > 0) {
      this.airRun[i] = 0;
    } else if (!grounded(car)) {
      st.airTime += TICK;
      this.airRun[i] += TICK;
    } else {
      st.bigAir = Math.max(st.bigAir, this.airRun[i]);
      this.airRun[i] = 0;
    }
  }

  private crossed(r: Racer, full: boolean, leading: boolean): void {
    r.lap++;
    if (r.lap <= r.top) return;
    r.top = r.lap;
    if (r.lap >= 2 && r.finish === null) {
      const lap = this.clock - r.lapStart;
      r.bestLap = r.bestLap === null ? lap : Math.min(r.bestLap, lap);
      if (full && leading) r.stats.lapsLed++;
    }
    r.lapStart = this.clock;
    if (r.lap > this.laps && r.finish === null && full) {
      r.finish = this.clock;
      r.auto = true;
      if (r.human && this.endAt === null) this.endAt = this.clock + FINISH_WINDOW;
    }
  }

  /** At GO: a rocket start for well-timed gas, wheelspin for jumping it. */
  private launch(): void {
    for (const r of this.racers) {
      if (!r.human) {
        if (r.brain.rocket) startBoost(r.car, BOOST_TIME.rocket, 1);
        continue;
      }
      if (r.gasAt === null) continue;
      const early = COUNTDOWN - r.gasAt;
      if (early <= ROCKET_WINDOW) {
        startBoost(r.car, BOOST_TIME.rocket, 1);
        r.stats.rocketStart = true;
      } else if (early > JUMPED) r.car.stall = STALL;
    }
  }

  private count(events: Items['events']): void {
    for (const e of events) {
      // A finished car is driving itself, so what it does no longer counts.
      const counts = (i: number) => i >= 0 && this.racers[i].finish === null;
      if (e.type === 'use' && counts(e.racer)) this.racers[e.racer].stats.itemsUsed++;
      if (e.type !== 'hit') continue;
      if (e.hit === 'burn') {
        // The Heat Ray singes several times a second, so a burn counts again only after a second clear of it.
        const key = e.racer * MAX_RACERS + e.by;
        const last = this.burnt.get(key) ?? -Infinity;
        this.burnt.set(key, this.clock);
        if (this.clock - last < 1) continue;
      }
      if (counts(e.racer)) this.racers[e.racer].stats.hitsTaken++;
      if (e.by !== e.racer && counts(e.by)) this.racers[e.by].stats.hitsLanded++;
    }
  }

  /** Overtakes and worst places, every OVERTAKE_CHECK seconds, then the end of the race. */
  private check(): void {
    if (this.clock >= this.checkAt) {
      this.checkAt += OVERTAKE_CHECK;
      const ranks = this.ranks();
      ranks.forEach((rank, i) => {
        const r = this.racers[i];
        if (r.finish !== null) return;
        const before = this.lastRanks[i];
        if (before !== undefined && rank < before) r.stats.overtakes += before - rank;
        this.worst[i] = Math.max(this.worst[i], rank);
      });
      this.lastRanks = ranks;
    }
    const people = this.racers.filter((r) => r.human);
    const allIn = people.length > 0 && people.every((r) => r.finish !== null);
    if (allIn || (this.endAt !== null && this.clock >= this.endAt)) this.over = true;
  }

  private collide(full: boolean): void {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i].car;
        const b = rs[j].car;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        // Cars floating in a water bubble are out of the way, so others drive under them.
        if (a.bubble > 0 || b.bubble > 0) continue;
        if (d >= CAR_RADIUS * 2 || d < 1e-6 || Math.abs(b.y - a.y) > 1.5) continue;
        const nx = dx / d;
        const nz = dz / d;
        // A shielded car barges through, as if it weighed four times as much.
        const ia = 1 / (rs[i].spec.weight * (a.shield > 0 ? 4 : 1));
        const ib = 1 / (rs[j].spec.weight * (b.shield > 0 ? 4 : 1));
        const push = (CAR_RADIUS * 2 - d) / (ia + ib);
        a.x -= nx * push * ia;
        a.z -= nz * push * ia;
        b.x += nx * push * ib;
        b.z += nz * push * ib;
        const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (closing < 0) {
          const k = (-(1 + RESTITUTION) * closing) / (ia + ib);
          a.vx -= nx * k * ia;
          a.vz -= nz * k * ia;
          b.vx += nx * k * ib;
          b.vz += nz * k * ib;
          const strength = Math.min(1, -closing / 14);
          if (strength > 0.1) {
            hitCar(a, strength);
            hitCar(b, strength);
            if (full) {
              if (rs[i].finish === null) rs[i].stats.bumps++;
              if (rs[j].finish === null) rs[j].stats.bumps++;
            }
          }
        }
      }
    }
  }

  /** Distance covered since the green light, used for standings. */
  progress(r: Racer): number {
    return r.lap * this.track.length + r.car.s;
  }

  progressOf(i: number): number {
    return this.progress(this.racers[i]);
  }

  /** Finishers in the order they crossed the line, then everyone else by how far they have got. */
  standings(): Racer[] {
    return [...this.racers].sort((a, b) => {
      if (a.finish !== null || b.finish !== null) return (a.finish ?? Infinity) - (b.finish ?? Infinity);
      return this.progress(b) - this.progress(a);
    });
  }

  /** Each racer's place from 1, and the places they gained from their worst. */
  places(): { place: number; comeback: number }[] {
    const ranks = this.ranks();
    return ranks.map((rank, i) => ({ place: rank + 1, comeback: Math.max(0, this.worst[i] - rank) }));
  }

  /** Each racer's result, in grid order. Times run from the green light. */
  results(names: readonly string[]): ResultRow[] {
    const places = this.places();
    return this.racers.map((r, i) => ({
      name: names[i] ?? r.model.name,
      bot: !r.human,
      model: r.model.id,
      place: places[i].place,
      time: r.finish === null ? null : r.finish - COUNTDOWN,
      bestLap: r.bestLap,
      stats: { ...r.stats, comeback: places[i].comeback },
    }));
  }

  reset(r: Racer): void {
    resetCar(r.car, this.track);
  }
}

/** Two staggered columns behind the start line. */
export function gridSlot(track: Track, slot: number): { s: number; offset: number } {
  const row = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? -1 : 1;
  return { s: track.length - 5 - row * 6 - (side > 0 ? 3 : 0), offset: side * 3.2 };
}

/** The player's car in their grid slot, and the rest of the roster shuffled into the other slots. */
export function gridFor(roster: CarModel[], playerCar: CarModel, count: number, playerSlot: number, seed: number): CarModel[] {
  const rng = mulberry32(seed);
  const others = roster.filter((m) => m.id !== playerCar.id);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const grid = others.slice(0, count - 1);
  grid.splice(playerSlot, 0, playerCar);
  return grid;
}
