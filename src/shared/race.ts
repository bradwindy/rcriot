import { botInput, type Brain } from './bot';
import {
  BOOST_TIME,
  CAR_RADIUS,
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
import { botItem, Items, type Field } from './items';
import { mulberry32 } from './rng';
import { specOf, type CarModel } from './roster';
import type { Track } from './track';

export interface Racer {
  car: Car;
  model: CarModel;
  spec: CarSpec;
  /** Null for the player. */
  brain: Brain | null;
  /** Times over the start line. The grid sits behind it, so the first crossing starts lap 1. */
  lap: number;
  halfway: boolean;
  /** What drove the car on the last tick, for steering the front wheels on screen. */
  input: CarInput;
  /** Race clock when the gas went down during the countdown, or null while it is up. */
  gasAt: number | null;
}

export const COUNTDOWN = 3;
/** Gas pressed within this many seconds before GO gives a rocket start. */
export const ROCKET_WINDOW = 0.45;
/** Gas held longer than this before GO spins the wheels for a moment. */
const JUMPED = 1.2;
const STALL = 0.8;
const RESTITUTION = 0.35;

export class Race implements Field {
  readonly racers: Racer[] = [];
  readonly items: Items;
  tick = 0;
  /** Seconds since the countdown started. The race is on from COUNTDOWN. */
  clock = 0;

  /** models[i] drives grid slot i. The player takes playerSlot. */
  constructor(
    readonly track: Track,
    models: CarModel[],
    playerSlot: number,
    seed = 7,
    items = true,
  ) {
    const rng = mulberry32(seed);
    models.forEach((model, slot) => {
      const { s, offset } = gridSlot(track, slot);
      const player = slot === playerSlot;
      this.racers.push({
        car: spawnCar(track, s, offset),
        model,
        spec: specOf(model.stats),
        brain: player ? null : { lane: (rng() - 0.5) * 1.2, phase: rng() * Math.PI * 2, rocket: rng() < 0.3 },
        lap: 0,
        halfway: true,
        input: NO_INPUT,
        gasAt: null,
      });
    });
    this.items = new Items(track, this.racers.length, items, seed);
  }

  get cars(): Car[] {
    return this.racers.map((r) => r.car);
  }

  ranks(): number[] {
    const order = this.standings();
    return this.racers.map((r) => order.indexOf(r));
  }

  get player(): Racer {
    return this.racers.find((r) => !r.brain) ?? this.racers[0];
  }

  get started(): boolean {
    return this.clock >= COUNTDOWN;
  }

  step(playerInput: CarInput): void {
    const wasStarted = this.started;
    this.clock += TICK;
    this.tick++;
    if (!this.started) {
      const gas = playerInput.throttle > 0;
      const p = this.player;
      if (gas && p.gasAt === null) p.gasAt = this.clock;
      if (!gas) p.gasAt = null;
      p.input = playerInput;
      return;
    }
    if (!wasStarted) this.launch();

    const { track } = this;
    const half = track.length / 2;
    this.racers.forEach((r, i) => {
      if (!r.brain) r.input = playerInput;
      else r.input = { ...botInput(r.car, r.spec, track, r.brain), ...botItem(this, this.items, i) };
    });
    for (const r of this.racers) {
      const before = r.car.s;
      stepCar(r.car, r.input, r.spec, track, TICK);
      const ds = r.car.s - before;
      if (ds < -half) {
        if (r.halfway) r.lap++;
        r.halfway = false;
      } else if (ds > half) {
        r.lap--;
        r.halfway = true;
      } else if (before < half && r.car.s >= half) {
        r.halfway = true;
      }
    }
    this.items.step(this, this.racers.map((r) => r.input), TICK);
    this.collide();
  }

  /** At GO: a rocket start for well-timed gas, wheelspin for jumping it. */
  private launch(): void {
    for (const r of this.racers) {
      if (r.brain) {
        if (r.brain.rocket) startBoost(r.car, BOOST_TIME.rocket, 1);
        continue;
      }
      if (r.gasAt === null) continue;
      const early = COUNTDOWN - r.gasAt;
      if (early <= ROCKET_WINDOW) startBoost(r.car, BOOST_TIME.rocket, 1);
      else if (early > JUMPED) r.car.stall = STALL;
    }
  }

  private collide(): void {
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

  standings(): Racer[] {
    return [...this.racers].sort((a, b) => this.progress(b) - this.progress(a));
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
