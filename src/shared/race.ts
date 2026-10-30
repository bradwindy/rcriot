import { botInput, type Brain } from './bot';
import { BASE_SPEC, CAR_RADIUS, resetCar, spawnCar, stepCar, TICK, type Car, type CarInput, type CarSpec } from './car';
import { mulberry32 } from './rng';
import type { Track } from './track';

export interface Racer {
  car: Car;
  spec: CarSpec;
  /** Null for the player. */
  brain: Brain | null;
  /** Times over the start line. The grid sits behind it, so the first crossing starts lap 1. */
  lap: number;
  halfway: boolean;
  /** What drove the car on the last tick, for steering the front wheels on screen. */
  input: CarInput;
}

const RESTITUTION = 0.3;

export class Race {
  readonly racers: Racer[] = [];
  tick = 0;

  constructor(
    readonly track: Track,
    count: number,
    playerSlot: number,
    seed = 7,
  ) {
    const rng = mulberry32(seed);
    for (let slot = 0; slot < count; slot++) {
      const row = Math.floor(slot / 2);
      const side = slot % 2 === 0 ? -1 : 1;
      const s = track.length - 5 - row * 6 - (side > 0 ? 3 : 0);
      const player = slot === playerSlot;
      this.racers.push({
        car: spawnCar(track, s, side * 3.2),
        spec: player ? BASE_SPEC : { ...BASE_SPEC, topSpeed: BASE_SPEC.topSpeed * (0.9 + rng() * 0.08) },
        brain: player ? null : { lane: (rng() - 0.5) * 1.2, phase: rng() * Math.PI * 2 },
        lap: 0,
        halfway: true,
        input: { throttle: 0, steer: 0 },
      });
    }
  }

  get player(): Racer {
    return this.racers.find((r) => !r.brain) ?? this.racers[0];
  }

  step(playerInput: CarInput): void {
    const { track } = this;
    const half = track.length / 2;
    for (const r of this.racers) {
      const before = r.car.s;
      r.input = r.brain ? botInput(r.car, r.spec, track, r.brain) : playerInput;
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
    this.collide();
    this.tick++;
  }

  private collide(): void {
    const cars = this.racers.map((r) => r.car);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= CAR_RADIUS * 2 || d < 1e-6 || Math.abs(b.y - a.y) > 1.5) continue;
        const nx = dx / d;
        const nz = dz / d;
        const push = (CAR_RADIUS * 2 - d) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
        const closing = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (closing < 0) {
          const k = (-(1 + RESTITUTION) * closing) / 2;
          a.vx -= nx * k;
          a.vz -= nz * k;
          b.vx += nx * k;
          b.vz += nz * k;
        }
      }
    }
  }

  /** Distance covered since the green light, used for standings. */
  progress(r: Racer): number {
    return r.lap * this.track.length + r.car.s;
  }

  standings(): Racer[] {
    return [...this.racers].sort((a, b) => this.progress(b) - this.progress(a));
  }

  reset(r: Racer): void {
    resetCar(r.car, this.track);
  }
}
