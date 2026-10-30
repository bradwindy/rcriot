import { limitOf, locate, sampleAt, surfaceY, type Cover, type Surface, type Track } from './track';

export const TICK = 1 / 60;
export const GRAVITY = 26;
export const CAR_RADIUS = 1.1;
/** Half the car's width, so its side meets the barrier rather than its centre. */
const HALF_WIDTH = 0.8;
const BRAKE = 42;
const COAST = 5;
const REVERSE_TOP = 9;
/** Seconds in the air that still count as touching the ground, so small bumps don't drop the controls. */
const COYOTE = 0.12;

export interface CarSpec {
  topSpeed: number;
  accel: number;
  /** Radians per second at full lock. */
  turnRate: number;
  /** How fast sideways slide dies away, per second. */
  grip: number;
}

export const BASE_SPEC: CarSpec = { topSpeed: 32, accel: 20, turnRate: 2.3, grip: 9 };

export interface CarInput {
  /** -1 brake or reverse, 1 full throttle. */
  throttle: number;
  /** -1 full left, 1 full right. */
  steer: number;
}

export interface Car {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Radians. 0 faces -z, and forward is (-sin, -cos). */
  heading: number;
  /** Seconds since the wheels last touched the ground. */
  air: number;
  index: number;
  s: number;
  offset: number;
  surface: Surface;
  cover: Cover;
  offroad: boolean;
  /** Ground height under the car on the last tick, to tell how fast the ground rises under it. */
  ground: number;
  /** Barrier hit speed this tick, for sparks and shakes. */
  scrape: number;
}

export function headingOf(tx: number, tz: number): number {
  return Math.atan2(-tx, -tz);
}

export function spawnCar(track: Track, s: number, offset: number): Car {
  const p = sampleAt(track, s);
  const x = p.x - p.tz * offset;
  const z = p.z + p.tx * offset;
  const y = surfaceY(p, offset);
  const car: Car = {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: headingOf(p.tx, p.tz),
    air: 0,
    index: -1,
    s,
    offset,
    surface: p.surface,
    cover: p.cover,
    offroad: false,
    ground: y,
    scrape: 0,
  };
  car.index = locate(track, x, z).index;
  return car;
}

export function grounded(car: Car): boolean {
  return car.air < COYOTE;
}

export function stepCar(car: Car, input: CarInput, spec: CarSpec, track: Track, dt = TICK): void {
  const fx = -Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const rx = -fz;
  const rz = fx;
  let vf = car.vx * fx + car.vz * fz;
  let vr = car.vx * rx + car.vz * rz;

  if (grounded(car)) {
    const top = car.offroad ? spec.topSpeed * 0.62 : spec.topSpeed;
    const th = Math.max(-1, Math.min(1, input.throttle));
    if (th > 0) {
      if (vf < -0.5) vf = Math.min(0, vf + BRAKE * th * dt);
      else vf += spec.accel * th * dt * Math.max(0, 1 - vf / top);
    } else if (th < 0) {
      if (vf > 0.5) vf = Math.max(0, vf + BRAKE * th * dt);
      else vf = Math.max(-REVERSE_TOP, vf + spec.accel * 0.6 * th * dt);
    } else {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), COAST * dt);
    }
    if (Math.abs(vf) > top) vf -= (vf - Math.sign(vf) * top) * Math.min(1, 2.5 * dt);
    vr *= Math.exp(-spec.grip * dt);

    car.vx = fx * vf + rx * vr;
    car.vz = fz * vf + rz * vr;

    const pace = Math.min(1, Math.abs(vf) / 5) * (1 - 0.4 * Math.min(1, Math.abs(vf) / spec.topSpeed));
    car.heading -= Math.max(-1, Math.min(1, input.steer)) * spec.turnRate * pace * Math.sign(vf) * dt;
  }

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  const loc = locate(track, car.x, car.z, car.index);
  const p = sampleAt(track, loc.s);
  const limit = limitOf(p) - HALF_WIDTH;
  car.scrape = 0;
  if (Math.abs(loc.offset) > limit) {
    const side = Math.sign(loc.offset);
    const nx = -p.tz * side;
    const nz = p.tx * side;
    const push = Math.abs(loc.offset) - limit;
    car.x -= nx * push;
    car.z -= nz * push;
    const out = car.vx * nx + car.vz * nz;
    if (out > 0) {
      car.vx -= nx * out * 1.3;
      car.vz -= nz * out * 1.3;
      car.vx *= 0.97;
      car.vz *= 0.97;
      car.scrape = out;
    }
    loc.offset = side * limit;
  }

  const ground = surfaceY(p, loc.offset);
  const rise = Math.max(-20, Math.min(20, (ground - car.ground) / dt));
  car.vy -= GRAVITY * dt;
  car.y += car.vy * dt;
  if (car.y <= ground) {
    car.y = ground;
    car.vy = rise;
    car.air = 0;
  } else {
    car.air += dt;
  }

  car.ground = ground;
  car.index = loc.index;
  car.s = loc.s;
  car.offset = loc.offset;
  car.surface = p.surface;
  car.cover = p.cover;
  car.offroad = p.cover === 'open' && Math.abs(loc.offset) > p.width / 2 + 0.4;
}

/** Puts a car back on the centre line where it is, facing the right way, stopped. */
export function resetCar(car: Car, track: Track): void {
  Object.assign(car, spawnCar(track, car.s, 0));
}
