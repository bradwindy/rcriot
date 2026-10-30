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
/** Share of the turn rate you get in the air. */
const AIR_STEER = 0.35;
/** Share of wall-hit speed a car bounces back with. RC cars are light and plasticky. */
const WALL_BOUNCE = 0.45;
/** Share of landing speed a car bounces back up with, above LAND_BOUNCE_MIN. */
const LAND_BOUNCE = 0.22;
const LAND_BOUNCE_MIN = 5;

const HOP = 3.6;
/** A drift must start within this many seconds of the hop. */
const HOP_WINDOW = 0.6;
const DRIFT_MIN_SPEED = 10;
/** How hard a drift pushes the car wide of its arc. */
const DRIFT_SLIDE = 0.25;
/** Share of speed a drift loses per second. */
const DRIFT_DRAG = 0.06;
/** Seconds of drifting to reach blue sparks, then orange. */
export const DRIFT_LEVELS = [0.6, 1.4];
/** Boost seconds for blue and orange sparks, and for a rocket start. */
export const BOOST_TIME = { blue: 0.55, orange: 1.1, rocket: 0.9 };
const BOOST_TOP = 1.3;
const BOOST_ACCEL = 45;

export interface CarSpec {
  topSpeed: number;
  accel: number;
  /** Radians per second at full lock. */
  turnRate: number;
  /** How fast sideways slide dies away, per second. */
  grip: number;
  /** Mass in collisions, about 1. */
  weight: number;
}

export interface CarInput {
  /** -1 brake or reverse, 1 full throttle. */
  throttle: number;
  /** -1 full left, 1 full right. */
  steer: number;
  /** Held to hop and drift. */
  drift: boolean;
  /** Held to use the pick-up forward, or backward. */
  item: boolean;
  itemBack: boolean;
}

export const NO_INPUT: CarInput = { throttle: 0, steer: 0, drift: false, item: false, itemBack: false };

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
  /** -1 drifting left, 1 right, 0 not drifting. */
  drift: number;
  driftTime: number;
  driftHeld: boolean;
  /** Seconds of boost left. */
  boost: number;
  /** Seconds of wheelspin left after jumping the start. */
  stall: number;
  /** Ticks this car has run. Events below record the tick they happened on, so a renderer can catch each once. */
  age: number;
  hopAt: number;
  boostAt: number;
  boostPower: number;
  bumpAt: number;
  bump: number;
  landAt: number;
  land: number;
  wallAt: number;
  /** Seconds left on pick-up effects: immune, oiled (little grip), powerless, floating in a bubble, flung and spinning. */
  shield: number;
  slick: number;
  /** Which way an oiled car's tail swings first. */
  slickDir: number;
  stun: number;
  bubble: number;
  tumble: number;
  /** Seconds left of smoking tyres from the Heat Ray, for show. */
  burn: number;
}

export function headingOf(tx: number, tz: number): number {
  return Math.atan2(-tx, -tz);
}

export function spawnCar(track: Track, s: number, offset: number): Car {
  const p = sampleAt(track, s);
  const x = p.x - p.tz * offset;
  const z = p.z + p.tx * offset;
  const y = surfaceY(p, offset);
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: headingOf(p.tx, p.tz),
    air: 0,
    index: locate(track, x, z).index,
    s,
    offset,
    surface: p.surface,
    cover: p.cover,
    offroad: false,
    ground: y,
    drift: 0,
    driftTime: 0,
    driftHeld: false,
    boost: 0,
    stall: 0,
    age: 0,
    hopAt: -1,
    boostAt: -1,
    boostPower: 0,
    bumpAt: -1,
    bump: 0,
    landAt: -1,
    land: 0,
    wallAt: -1,
    shield: 0,
    slick: 0,
    slickDir: 1,
    stun: 0,
    bubble: 0,
    tumble: 0,
    burn: 0,
  };
}

export function grounded(car: Car): boolean {
  return car.air < COYOTE;
}

/** 0 no sparks yet, 1 blue, 2 orange. */
export function driftLevel(car: Car): 0 | 1 | 2 {
  if (!car.drift) return 0;
  return car.driftTime >= DRIFT_LEVELS[1] ? 2 : car.driftTime >= DRIFT_LEVELS[0] ? 1 : 0;
}

export function startBoost(car: Car, seconds: number, power: number): void {
  car.boost = Math.max(car.boost, seconds);
  car.boostAt = car.age;
  car.boostPower = power;
}

export function hitCar(car: Car, strength: number): void {
  if (strength > car.bump || car.bumpAt !== car.age) {
    car.bump = strength;
    car.bumpAt = car.age;
  }
}

export function endDrift(car: Car, cashIn: boolean): void {
  const level = driftLevel(car);
  if (cashIn && level) startBoost(car, level === 2 ? BOOST_TIME.orange : BOOST_TIME.blue, level);
  car.drift = 0;
  car.driftTime = 0;
}

/** Share of power a car keeps while zapped or shorted out, and of grip while oiled. */
const STUN_POWER = 0.25;
const SLICK_GRIP = 0.06;
/** An oiled car's tail swings side to side this hard, in radians per second, easing off as the oil wears away. */
const SLICK_FISHTAIL = 2.2;
/** How high a water bubble floats. */
const BUBBLE_HEIGHT = 2.8;

export function stepCar(car: Car, controls: CarInput, spec: CarSpec, track: Track, dt = TICK): void {
  car.age++;
  const helpless = car.bubble > 0 || car.tumble > 0;
  const input = helpless ? NO_INPUT : controls;
  const fx = -Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const rx = -fz;
  const rz = fx;
  let vf = car.vx * fx + car.vz * fz;
  let vr = car.vx * rx + car.vz * rz;
  const onGround = grounded(car);
  const steer = Math.max(-1, Math.min(1, input.steer));

  const press = input.drift && !car.driftHeld;
  car.driftHeld = input.drift;
  if (press && onGround) {
    car.vy = HOP;
    car.y += 0.02;
    car.air = COYOTE;
    car.hopAt = car.age;
  }
  const sinceHop = (car.age - car.hopAt) * dt;
  if (input.drift && !car.drift && Math.abs(steer) > 0.3 && vf > DRIFT_MIN_SPEED && sinceHop < HOP_WINDOW) {
    car.drift = Math.sign(steer);
  }
  if (car.drift && !input.drift) endDrift(car, true);
  else if (car.drift && vf < DRIFT_MIN_SPEED * 0.7) endDrift(car, false);
  if (car.drift && onGround) car.driftTime += dt;

  if (onGround) {
    const boosting = car.boost > 0;
    const stunned = car.stun > 0 && !boosting;
    const top = spec.topSpeed * (car.offroad && !boosting ? 0.62 : 1) * (boosting ? BOOST_TOP : 1) * (stunned ? 0.55 : 1);
    const th = car.stall > 0 ? 0 : Math.max(-1, Math.min(1, input.throttle));
    if (boosting) {
      vf = Math.min(top, vf + BOOST_ACCEL * dt);
    } else if (th > 0) {
      if (vf < -0.5) vf = Math.min(0, vf + BRAKE * th * dt);
      else vf += spec.accel * (stunned ? STUN_POWER : 1) * (car.slick > 0 ? 0.6 : 1) * th * dt * Math.max(0, 1 - vf / top);
    } else if (th < 0) {
      if (vf > 0.5) vf = Math.max(0, vf + BRAKE * th * dt);
      else vf = Math.max(-REVERSE_TOP, vf + spec.accel * 0.6 * th * dt);
    } else {
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), COAST * dt);
    }
    if (Math.abs(vf) > top) vf -= (vf - Math.sign(vf) * top) * Math.min(1, 2.5 * dt);
    vr *= Math.exp(-spec.grip * (car.slick > 0 ? SLICK_GRIP : 1) * dt);
    if (car.drift) {
      // A drift carries the car round on its own arc. Steering into it tightens the arc and steering out widens it.
      // Travel turns with the nose, so speed is kept, and the tail drifts a little wide. The angled-in look is drawn.
      const into = steer * car.drift;
      vf *= 1 - DRIFT_DRAG * dt;
      vr -= car.drift * vf * DRIFT_SLIDE * dt;
      car.heading -= car.drift * spec.turnRate * (0.3 + 0.2 * into) * dt;
      const nfx = -Math.sin(car.heading);
      const nfz = -Math.cos(car.heading);
      car.vx = nfx * vf - nfz * vr;
      car.vz = nfz * vf + nfx * vr;
    } else {
      car.vx = fx * vf + rx * vr;
      car.vz = fz * vf + rz * vr;
      const pace = Math.min(1, Math.abs(vf) / 5) * (1 - 0.4 * Math.min(1, Math.abs(vf) / spec.topSpeed));
      car.heading -= steer * spec.turnRate * pace * Math.sign(vf) * (car.slick > 0 ? 0.5 : 1) * dt;
    }
    if (car.slick > 0 && Math.abs(vf) > 4) {
      // Oil: the tail swings one way then the other, so the car slides out without spinning right round.
      const worn = car.slick / 2.5;
      car.heading += car.slickDir * SLICK_FISHTAIL * worn * Math.sin((2.5 - car.slick) * 6) * dt;
    }
  } else {
    car.heading -= steer * spec.turnRate * AIR_STEER * dt;
  }
  car.boost = Math.max(0, car.boost - dt);
  car.shield = Math.max(0, car.shield - dt);
  car.slick = Math.max(0, car.slick - dt);
  car.stun = Math.max(0, car.stun - dt);
  car.bubble = Math.max(0, car.bubble - dt);
  car.tumble = Math.max(0, car.tumble - dt);
  car.burn = Math.max(0, car.burn - dt);
  if (car.bubble > 0) {
    car.vx *= Math.exp(-2.5 * dt);
    car.vz *= Math.exp(-2.5 * dt);
  }
  car.stall = Math.max(0, car.stall - dt);

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  const loc = locate(track, car.x, car.z, car.index);
  const p = sampleAt(track, loc.s);
  const limit = limitOf(p) - HALF_WIDTH;
  if (Math.abs(loc.offset) > limit) {
    const side = Math.sign(loc.offset);
    const nx = -p.tz * side;
    const nz = p.tx * side;
    const push = Math.abs(loc.offset) - limit;
    car.x -= nx * push;
    car.z -= nz * push;
    const out = car.vx * nx + car.vz * nz;
    if (out > 0) {
      car.vx -= nx * out * (1 + WALL_BOUNCE);
      car.vz -= nz * out * (1 + WALL_BOUNCE);
      car.vx *= 0.96;
      car.vz *= 0.96;
      if (out > 2) {
        hitCar(car, Math.min(1, out / 18));
        car.wallAt = car.age;
      }
      if (out > 7 && car.drift) endDrift(car, false);
    }
    loc.offset = side * limit;
  }

  const ground = surfaceY(p, loc.offset);
  const rise = Math.max(-20, Math.min(20, (ground - car.ground) / dt));
  if (car.bubble > 0) {
    car.y += (ground + BUBBLE_HEIGHT - car.y) * Math.min(1, 4 * dt);
    car.vy = 0;
    car.air = 1;
  } else {
    car.vy -= GRAVITY * dt;
    car.y += car.vy * dt;
  }
  if (car.bubble > 0) {
    // Floating: no ground contact until the bubble pops.
  } else if (car.y <= ground) {
    const impact = rise - car.vy;
    car.y = ground;
    car.vy = rise;
    if (car.air > 0.15 && impact > 3) {
      car.land = Math.min(1, impact / 16);
      car.landAt = car.age;
      if (impact > LAND_BOUNCE_MIN) car.vy += impact * LAND_BOUNCE;
    }
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
  const age = car.age;
  Object.assign(car, spawnCar(track, car.s, 0), { age });
}
