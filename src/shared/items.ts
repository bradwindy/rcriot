import { endDrift, startBoost, type Car, type CarInput } from './car';
import { mulberry32 } from './rng';
import { limitOf, locate, sampleAt, surfaceY, type Track } from './track';

/** The eleven pick-ups, from the RC Revenge Pro manual. */
export type ItemKind =
  | 'battery'
  | 'rocket'
  | 'heat'
  | 'lightning'
  | 'oil'
  | 'mines'
  | 'shield'
  | 'water'
  | 'shockwave'
  | 'fake'
  | 'ultimate';

export const ITEM_KINDS: ItemKind[] = ['battery', 'rocket', 'heat', 'lightning', 'oil', 'mines', 'shield', 'water', 'shockwave', 'fake', 'ultimate'];

/** Seconds each lasting effect runs, as agreed for this round. */
export const DURATION = { heat: 5, lightning: 10, shield: 10, slick: 2.5, battery: 2.2 };

/** How a car can be hurt. Every hit is blocked by a Shield. */
export type Hit = 'blast' | 'zap' | 'burn' | 'short' | 'bubble' | 'slick';

export interface Held {
  kind: ItemKind;
  /** Rockets, Mines and Water Bombs come in ones or threes. */
  count: number;
}

export type EntityKind = 'rocket' | 'mine' | 'water' | 'oil' | 'fake';

/** Something an item left on or above the track. */
export interface Entity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: number;
  /** Racer a rocket is homing on, or -1. */
  target: number;
  /** Seconds since it appeared, and seconds it may last. */
  age: number;
  life: number;
  /** At rest on the ground. */
  landed: boolean;
  /** A mine that bounced over the barrier and is falling away out of play. */
  out: boolean;
  /** When a resting mine next hops, in seconds of its age. */
  hopAt: number;
  index: number;
}

export interface Box {
  x: number;
  y: number;
  z: number;
  /** Seconds until it is back, 0 while it is there. */
  respawn: number;
}

export type ItemEvent =
  | { type: 'pickup'; racer: number; box: number }
  | { type: 'lock'; racer: number }
  | { type: 'use'; racer: number; kind: ItemKind }
  | { type: 'hit'; racer: number; hit: Hit }
  | { type: 'explode'; x: number; y: number; z: number; strength: number }
  | { type: 'splash'; x: number; y: number; z: number }
  | { type: 'zap'; from: number; to: number }
  | { type: 'thunder'; racers: number[] };

/** What the items need from the race. */
export interface Field {
  readonly track: Track;
  readonly cars: Car[];
  /** Place in the race of each racer, 0 for the leader. */
  ranks(): number[];
  /** Distance covered by each racer, for finding who is ahead. */
  progressOf(i: number): number;
}

const BOX_RADIUS = 1.7;
const BOX_RESPAWN = 3;
/** Seconds the item slot spins before the pick-up can be used. */
export const ROLL_TIME = 0.7;
const ROCKET_SPEED = 52;
const ROCKET_TURN = 5;
const ROCKET_RANGE = 75;
const LOCK_TIME = 0.6;
const HIT_RADIUS = 1.6;
const MINE_RADIUS = 1.7;
const FAKE_RADIUS = 1.4;
/** A mine is a ball this big, and barriers stop anything that hits them lower than WALL_HEIGHT. */
export const MINE_SIZE = 0.6;
const WALL_HEIGHT = 1.2;
/** Seconds a fake box flashes as it drops, before it can hurt anyone. */
export const FAKE_ARM = 1.2;
const OIL_RADIUS = 2.4;
const WATER_RADIUS = 3;
const SHOCK_RADIUS = 11;
/** Seconds a water bomb is in the air, for leading its target. */
const LOB_TIME = 0.76;
/** The Heat Ray reaches a long way down the track in a narrowish cone. */
export const HEAT_RANGE = 20;
const HEAT_CONE = 0.32;
const ZAP_RANGE = 5.5;
/** Seconds a dropped thing ignores the car that dropped it. */
const OWNER_GRACE = 1;
const GRAVITY = 26;

/** Item odds for the leader and for last place. Places in between blend the two. */
const ODDS: Record<ItemKind, [front: number, back: number]> = {
  battery: [2, 3],
  shield: [2.5, 1],
  oil: [3, 0.5],
  mines: [3, 1],
  fake: [3, 0.3],
  water: [2, 2],
  rocket: [1, 3],
  heat: [0.8, 2.5],
  lightning: [0.5, 2.5],
  shockwave: [0.5, 2],
  ultimate: [0, 0.8],
};
const PACKS: ItemKind[] = ['rocket', 'mines', 'water'];

/** Rolls an item for a racer at `place` from 0 (leader) to 1 (last). */
export function rollItem(place: number, rng: () => number): Held {
  const weights = ITEM_KINDS.map((k) => {
    const [front, back] = ODDS[k];
    if (k === 'ultimate' && place < 0.6) return 0;
    return front + (back - front) * place;
  });
  let pick = rng() * weights.reduce((a, b) => a + b, 0);
  let kind: ItemKind = 'battery';
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick <= 0) {
      kind = ITEM_KINDS[i];
      break;
    }
  }
  const pack = PACKS.includes(kind) && rng() < 0.15 + 0.6 * place;
  return { kind, count: pack ? 3 : 1 };
}

/** Hurts a car. Returns false when its Shield blocked the hit. `push` is a sideways shove for blasts. */
export function applyHit(car: Car, hit: Hit, push = { x: 0, z: 0 }): boolean {
  if (car.shield > 0) return false;
  switch (hit) {
    case 'blast':
      endDrift(car, false);
      car.boost = 0;
      car.tumble = 1.3;
      car.vy = Math.max(car.vy, 7);
      car.vx = car.vx * 0.3 + push.x;
      car.vz = car.vz * 0.3 + push.z;
      car.air = Math.max(car.air, 0.2);
      break;
    case 'zap':
      car.stun = Math.max(car.stun, 1.4);
      car.vx *= 0.75;
      car.vz *= 0.75;
      break;
    case 'burn':
      car.stun = Math.max(car.stun, 0.7);
      car.burn = 1;
      car.vx *= 0.93;
      car.vz *= 0.93;
      break;
    case 'short':
      endDrift(car, false);
      car.boost = 0;
      car.stun = Math.max(car.stun, 2.5);
      car.vy = Math.max(car.vy, 3);
      car.vx *= 0.5;
      car.vz *= 0.5;
      break;
    case 'bubble':
      endDrift(car, false);
      car.boost = 0;
      car.bubble = 2;
      break;
    case 'slick':
      car.slick = DURATION.slick;
      car.slickDir = Math.random() < 0.5 ? -1 : 1;
      break;
  }
  return true;
}

function forward(car: Car): { x: number; z: number } {
  return { x: -Math.sin(car.heading), z: -Math.cos(car.heading) };
}

/** Pick-up boxes, held items, everything items leave on the track, and the lasting Heat Ray and Blue Lightning. */
export class Items {
  enabled: boolean;
  readonly boxes: Box[] = [];
  readonly entities: Entity[] = [];
  /** Events since the renderer last emptied the list. */
  readonly events: ItemEvent[] = [];
  readonly held: (Held | null)[];
  /** Seconds left of each racer's Heat Ray and Blue Lightning. */
  readonly heat: number[];
  readonly charge: number[];
  /** Racer each rocket holder is locked on to, or -1, and how long they have been aiming at them. */
  readonly lock: number[];
  private readonly aim: number[];
  private readonly aimAt: number[];
  private readonly pressed: boolean[];
  private readonly pressedBack: boolean[];
  private readonly heldFor: number[];
  /** Per racer, seconds until they can be zapped or burnt again. */
  private readonly zapCooldown: number[];
  private readonly burnCooldown: number[];
  private readonly rng: () => number;
  private nextId = 1;

  constructor(
    readonly track: Track,
    count: number,
    enabled: boolean,
    seed: number,
  ) {
    this.enabled = enabled;
    this.rng = mulberry32(seed ^ 0x51ed);
    this.held = new Array<Held | null>(count).fill(null);
    this.heat = new Array<number>(count).fill(0);
    this.charge = new Array<number>(count).fill(0);
    this.lock = new Array<number>(count).fill(-1);
    this.aim = new Array<number>(count).fill(0);
    this.aimAt = new Array<number>(count).fill(-1);
    this.pressed = new Array<boolean>(count).fill(false);
    this.pressedBack = new Array<boolean>(count).fill(false);
    this.heldFor = new Array<number>(count).fill(0);
    this.zapCooldown = new Array<number>(count).fill(0);
    this.burnCooldown = new Array<number>(count).fill(0);
    const L = track.length;
    for (const s of [0.07, 0.3, 0.64, 0.86].map((f) => f * L)) {
      const p = sampleAt(track, s);
      const room = p.width / 2 - 1.2;
      for (const f of [-0.75, -0.25, 0.25, 0.75]) {
        const o = f * room * 1.3;
        this.boxes.push({ x: p.x - p.tz * o, y: surfaceY(p, o) + 0.9, z: p.z + p.tx * o, respawn: 0 });
      }
    }
  }

  /** Seconds the racer has been holding its item, for bots that wait for a good moment. */
  holding(i: number): number {
    return this.held[i] ? this.heldFor[i] : 0;
  }

  step(field: Field, inputs: CarInput[], dt: number): void {
    const cars = field.cars;
    if (!this.enabled) {
      this.held.fill(null);
      this.entities.length = 0;
    }
    for (const b of this.boxes) b.respawn = Math.max(0, b.respawn - dt);
    for (let i = 0; i < cars.length; i++) {
      this.zapCooldown[i] = Math.max(0, this.zapCooldown[i] - dt);
      this.burnCooldown[i] = Math.max(0, this.burnCooldown[i] - dt);
      this.heat[i] = Math.max(0, this.heat[i] - dt);
      this.charge[i] = Math.max(0, this.charge[i] - dt);
      this.heldFor[i] = this.held[i] ? this.heldFor[i] + dt : 0;
    }
    if (this.enabled) this.collect(field);
    this.aimRockets(field, dt);
    for (let i = 0; i < cars.length; i++) {
      const ahead = inputs[i].item && !this.pressed[i];
      const behind = inputs[i].itemBack && !this.pressedBack[i];
      this.pressed[i] = inputs[i].item;
      this.pressedBack[i] = inputs[i].itemBack;
      if (!ahead && !behind) continue;
      // Mashing the button pops a water bubble sooner, as in the original.
      if (cars[i].bubble > 0) cars[i].bubble = Math.max(0, cars[i].bubble - 0.25);
      else if (cars[i].tumble <= 0 && this.heldFor[i] >= ROLL_TIME) this.use(field, i, behind);
    }
    this.lasting(field);
    this.move(field, dt);
  }

  private collect(field: Field): void {
    const ranks = field.ranks();
    const n = field.cars.length;
    field.cars.forEach((car, i) => {
      if (this.held[i]) return;
      for (const [k, b] of this.boxes.entries()) {
        if (b.respawn > 0) continue;
        if ((car.x - b.x) ** 2 + (car.z - b.z) ** 2 > BOX_RADIUS ** 2 || Math.abs(car.y + 0.5 - b.y) > 2) continue;
        b.respawn = BOX_RESPAWN;
        this.held[i] = rollItem(n > 1 ? ranks[i] / (n - 1) : 0, this.rng);
        this.heldFor[i] = 0;
        this.events.push({ type: 'pickup', racer: i, box: k });
        return;
      }
    });
  }

  /** Rocket holders aim at the nearest car ahead in front of them, and lock on after holding it in their sights. */
  private aimRockets(field: Field, dt: number): void {
    field.cars.forEach((car, i) => {
      if (this.held[i]?.kind !== 'rocket') {
        this.lock[i] = -1;
        this.aimAt[i] = -1;
        return;
      }
      const f = forward(car);
      let best = -1;
      let bestGap = ROCKET_RANGE;
      field.cars.forEach((other, j) => {
        if (j === i) return;
        const gap = field.progressOf(j) - field.progressOf(i);
        if (gap <= 0 || gap > bestGap) return;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if ((dx * f.x + dz * f.z) / Math.max(d, 1e-3) < 0.6) return;
        best = j;
        bestGap = gap;
      });
      if (best !== this.aimAt[i]) {
        this.aimAt[i] = best;
        this.aim[i] = 0;
        this.lock[i] = -1;
      }
      if (best < 0) return;
      this.aim[i] += dt;
      if (this.aim[i] >= LOCK_TIME && this.lock[i] !== best) {
        this.lock[i] = best;
        this.events.push({ type: 'lock', racer: i });
      }
    });
  }

  /** `reverse` (the backward button) fires rockets and water bombs behind. Mines, oil and fakes always go behind. */
  private use(field: Field, i: number, reverse: boolean): void {
    const back = reverse;
    const held = this.held[i];
    if (!held) return;
    const car = field.cars[i];
    const f = forward(car);
    const speed = Math.max(0, car.vx * f.x + car.vz * f.z);
    switch (held.kind) {
      case 'battery':
        startBoost(car, DURATION.battery, 2);
        break;
      case 'shield':
        car.shield = DURATION.shield;
        break;
      case 'heat':
        this.heat[i] = DURATION.heat;
        break;
      case 'lightning':
        this.charge[i] = DURATION.lightning;
        break;
      case 'rocket': {
        const dir = back ? -1 : 1;
        const target = back ? this.nearestBehind(field, i) : this.lock[i];
        const v = back ? ROCKET_SPEED * 0.8 : speed + ROCKET_SPEED;
        this.spawn('rocket', field, i, f.x * 1.6 * dir, 0.7, f.z * 1.6 * dir, f.x * v * dir, 0, f.z * v * dir, 5, target);
        break;
      }
      case 'water': {
        // Lobbed at the car ahead, leading it by its speed. With nobody in front it lands about 22 units ahead.
        const target = back ? -1 : this.ahead(field, i, 35, 0.75);
        let vx = f.x * (back ? -12 : speed + 30);
        let vz = f.z * (back ? -12 : speed + 30);
        if (target >= 0) {
          const t = field.cars[target];
          vx = (t.x + t.vx * LOB_TIME - car.x) / LOB_TIME;
          vz = (t.z + t.vz * LOB_TIME - car.z) / LOB_TIME;
        }
        this.spawn('water', field, i, f.x * (back ? -1.8 : 1.6), 1, f.z * (back ? -1.8 : 1.6), vx, 9, vz, 4);
        break;
      }
      case 'mines':
        this.spawn('mine', field, i, -f.x * 2.4, 0.8, -f.z * 2.4, car.vx * 0.5 - f.x * 3, 3, car.vz * 0.5 - f.z * 3, 25);
        break;
      case 'oil':
        this.spawn('oil', field, i, -f.x * 2.8, 0, -f.z * 2.8, 0, 0, 0, 20);
        break;
      case 'fake':
        this.spawn('fake', field, i, -f.x * 2.2, 1.4, -f.z * 2.2, car.vx * 0.3 - f.x * 2, 1.5, car.vz * 0.3 - f.z * 2, 30);
        break;
      case 'shockwave':
        field.cars.forEach((other, j) => {
          if (j === i) return;
          const dx = other.x - car.x;
          const dz = other.z - car.z;
          const d = Math.hypot(dx, dz);
          if (d > SHOCK_RADIUS || Math.abs(other.y - car.y) > 3) return;
          const shove = 16 * (1 - d / SHOCK_RADIUS) + 4;
          this.hit(j, other, 'blast', { x: (dx / Math.max(d, 0.1)) * shove, z: (dz / Math.max(d, 0.1)) * shove });
        });
        break;
      case 'ultimate': {
        const struck: number[] = [];
        field.cars.forEach((other, j) => {
          if (j !== i && this.hit(j, other, 'short')) struck.push(j);
        });
        this.events.push({ type: 'thunder', racers: struck });
        break;
      }
    }
    this.events.push({ type: 'use', racer: i, kind: held.kind });
    // Packs of three: rockets keep their lock between shots.
    held.count--;
    if (held.count <= 0) this.held[i] = null;
    this.heldFor[i] = held.count > 0 ? this.heldFor[i] : 0;
  }

  /** The nearest car within `range` whose direction is within the cone (as a cosine) of this car's nose, or -1. */
  private ahead(field: Field, i: number, range: number, cone: number): number {
    const car = field.cars[i];
    const f = forward(car);
    let best = -1;
    let bestD = range;
    field.cars.forEach((other, j) => {
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const d = Math.hypot(dx, dz);
      if (j === i || d > bestD || (dx * f.x + dz * f.z) / Math.max(d, 1e-3) < cone) return;
      best = j;
      bestD = d;
    });
    return best;
  }

  private nearestBehind(field: Field, i: number): number {
    let best = -1;
    let bestGap = 40;
    field.cars.forEach((_, j) => {
      const gap = field.progressOf(i) - field.progressOf(j);
      if (j !== i && gap > 0 && gap < bestGap) {
        best = j;
        bestGap = gap;
      }
    });
    return best;
  }

  private spawn(
    kind: EntityKind,
    field: Field,
    owner: number,
    ox: number,
    oy: number,
    oz: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    target = -1,
  ): void {
    const car = field.cars[owner];
    const x = car.x + ox;
    const z = car.z + oz;
    const loc = locate(field.track, x, z, car.index);
    const ground = surfaceY(sampleAt(field.track, loc.s), loc.offset);
    const onGround = vy === 0;
    this.entities.push({
      id: this.nextId++,
      kind,
      x,
      y: onGround ? ground + oy : car.y + oy,
      z,
      vx,
      vy,
      vz,
      owner,
      target,
      age: 0,
      life,
      landed: onGround,
      out: false,
      hopAt: 0.6 + this.rng() * 0.6,
      index: loc.index,
    });
  }

  private hit(j: number, car: Car, hit: Hit, push?: { x: number; z: number }): boolean {
    const landed = applyHit(car, hit, push);
    if (landed) this.events.push({ type: 'hit', racer: j, hit });
    return landed;
  }

  /** Heat Ray flames in front of a car, and the Blue Lightning charge that zaps anyone close. */
  private lasting(field: Field): void {
    const cars = field.cars;
    cars.forEach((car, i) => {
      if (this.heat[i] > 0) {
        const f = forward(car);
        cars.forEach((other, j) => {
          if (j === i || this.burnCooldown[j] > 0) return;
          const dx = other.x - car.x;
          const dz = other.z - car.z;
          const d = Math.hypot(dx, dz);
          if (d > HEAT_RANGE || d < 0.1 || Math.abs(other.y - car.y) > 2) return;
          if ((dx * f.x + dz * f.z) / d < Math.cos(HEAT_CONE)) return;
          this.burnCooldown[j] = 0.35;
          this.hit(j, other, 'burn');
        });
      }
      if (this.charge[i] > 0) {
        cars.forEach((other, j) => {
          if (j === i || this.charge[i] <= 0) return;
          const d = Math.hypot(other.x - car.x, other.z - car.z);
          if (d > ZAP_RANGE || Math.abs(other.y - car.y) > 2.5) return;
          if (this.charge[j] > 0) {
            // Two charged cars cancel each other out.
            this.charge[i] = 0;
            this.charge[j] = 0;
            this.events.push({ type: 'zap', from: i, to: j }, { type: 'zap', from: j, to: i });
            return;
          }
          if (this.zapCooldown[j] > 0) return;
          this.zapCooldown[j] = 1;
          if (this.hit(j, other, 'zap')) this.events.push({ type: 'zap', from: i, to: j });
        });
      }
    });
  }

  private move(field: Field, dt: number): void {
    const { track, cars } = field;
    for (let k = this.entities.length - 1; k >= 0; k--) {
      const e = this.entities[k];
      e.age += dt;
      let gone = e.age > e.life;
      if (e.kind === 'rocket') gone ||= this.flyRocket(e, field, dt);
      else if (e.kind === 'mine') gone ||= this.bounceMine(e, field, dt);
      else if (!e.landed) {
        e.vy -= GRAVITY * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.z += e.vz * dt;
        const loc = locate(track, e.x, e.z, e.index);
        e.index = loc.index;
        const p = sampleAt(track, loc.s);
        const limit = limitOf(p) - 0.5;
        if (Math.abs(loc.offset) > limit) {
          const side = Math.sign(loc.offset);
          e.x -= -p.tz * side * (Math.abs(loc.offset) - limit);
          e.z -= p.tx * side * (Math.abs(loc.offset) - limit);
          e.vx *= 0.3;
          e.vz *= 0.3;
        }
        const ground = surfaceY(p, Math.max(-limit, Math.min(limit, loc.offset)));
        const rest = e.kind === 'fake' ? 0.9 : 0.3;
        if (e.y <= ground + rest) {
          e.y = ground + rest;
          e.vx = e.vy = e.vz = 0;
          e.landed = true;
          if (e.kind === 'water') {
            this.splash(e, field);
            gone = true;
          }
        }
      }
      // Out-of-bounds mines are gone from play, and fakes are harmless until they have finished flashing.
      if (!gone && !e.out && !(e.kind === 'fake' && e.age < FAKE_ARM)) {
        for (let j = 0; j < cars.length; j++) {
          const car = cars[j];
          if (j === e.owner && e.age < OWNER_GRACE) continue;
          const d2 = (car.x - e.x) ** 2 + (car.z - e.z) ** 2;
          const dy = Math.abs(car.y + 0.4 - e.y);
          if (e.kind === 'oil') {
            if (d2 < OIL_RADIUS ** 2 && dy < 1.5 && car.slick <= 0.1) this.hit(j, car, 'slick');
            continue;
          }
          const r = e.kind === 'mine' ? MINE_RADIUS : e.kind === 'fake' ? FAKE_RADIUS : HIT_RADIUS;
          if (d2 > r * r || dy > 1.8) continue;
          if (e.kind === 'water') {
            this.splash(e, field);
          } else {
            const len = Math.hypot(e.vx, e.vz) || 1;
            this.hit(j, car, 'blast', { x: (e.vx / len) * 4, z: (e.vz / len) * 4 });
            this.events.push({ type: 'explode', x: e.x, y: e.y, z: e.z, strength: e.kind === 'rocket' ? 1 : 0.7 });
          }
          gone = true;
          break;
        }
      }
      if (gone) this.entities.splice(k, 1);
    }
  }

  /**
   * Bouncing mines: they bounce on the ground, rebound off barriers and walls, and hop about on their own when they
   * come to rest. One that is high enough as it reaches a barrier sails over it and falls away out of play.
   * Returns true once it comes down outside.
   */
  private bounceMine(e: Entity, field: Field, dt: number): boolean {
    const { track } = field;
    e.vy -= GRAVITY * dt;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.z += e.vz * dt;
    const loc = locate(track, e.x, e.z, e.index);
    e.index = loc.index;
    const p = sampleAt(track, loc.s);
    const edge = limitOf(p);
    const rim = surfaceY(p, Math.sign(loc.offset) * edge);
    if (e.out) {
      // Coming down outside the track: a splash off the pier, a puff anywhere else.
      if (e.y > rim - 0.3) return false;
      if (p.cover === 'pier') this.events.push({ type: 'splash', x: e.x, y: Math.max(0, e.y), z: e.z });
      else this.events.push({ type: 'explode', x: e.x, y: e.y, z: e.z, strength: 0.4 });
      return true;
    }
    const limit = edge - MINE_SIZE;
    if (Math.abs(loc.offset) > limit) {
      const wall = p.cover === 'tunnel' || p.cover === 'ship' ? Infinity : WALL_HEIGHT;
      if (e.y - MINE_SIZE > rim + wall) {
        e.out = true;
        return false;
      }
      const side = Math.sign(loc.offset);
      const nx = -p.tz * side;
      const nz = p.tx * side;
      const push = Math.abs(loc.offset) - limit;
      e.x -= nx * push;
      e.z -= nz * push;
      const out = e.vx * nx + e.vz * nz;
      if (out > 0) {
        e.vx -= nx * out * 1.75;
        e.vz -= nz * out * 1.75;
      }
    }
    const ground = surfaceY(p, Math.max(-edge, Math.min(edge, loc.offset)));
    if (e.y - MINE_SIZE <= ground) {
      e.y = ground + MINE_SIZE;
      e.vy = e.vy < -2.5 ? -e.vy * 0.55 : 0;
      const grip = Math.exp(-2.2 * dt);
      e.vx *= grip;
      e.vz *= grip;
      e.landed = e.vy === 0;
      if (e.landed && e.age >= e.hopAt) {
        const a = this.rng() * Math.PI * 2;
        const kick = 2 + this.rng() * 3;
        e.vx += Math.cos(a) * kick;
        e.vz += Math.sin(a) * kick;
        e.vy = 5 + this.rng() * 3;
        e.landed = false;
        e.hopAt = e.age + 0.8 + this.rng() * 0.9;
      }
    }
    return false;
  }

  /** Returns true when the rocket hit a wall. */
  private flyRocket(e: Entity, field: Field, dt: number): boolean {
    const { track, cars } = field;
    const speed = Math.max(ROCKET_SPEED, Math.hypot(e.vx, e.vz));
    let dirX = e.vx / speed;
    let dirZ = e.vz / speed;
    let wantX: number;
    let wantZ: number;
    if (e.target >= 0) {
      const t = cars[e.target];
      const d = Math.hypot(t.x - e.x, t.z - e.z) || 1;
      wantX = (t.x - e.x) / d;
      wantZ = (t.z - e.z) / d;
    } else {
      // Unlocked rockets follow the track, so they still fly the right way round bends.
      const p = sampleAt(track, track.samples[e.index].s);
      const along = dirX * p.tx + dirZ * p.tz >= 0 ? 1 : -1;
      wantX = p.tx * along;
      wantZ = p.tz * along;
    }
    const turn = Math.atan2(wantX * dirZ - wantZ * dirX, wantX * dirX + wantZ * dirZ);
    const step = Math.max(-ROCKET_TURN * dt, Math.min(ROCKET_TURN * dt, turn));
    const c = Math.cos(step);
    const s = Math.sin(step);
    [dirX, dirZ] = [dirX * c + dirZ * s, -dirX * s + dirZ * c];
    e.vx = dirX * speed;
    e.vz = dirZ * speed;
    e.x += e.vx * dt;
    e.z += e.vz * dt;
    const loc = locate(track, e.x, e.z, e.index);
    e.index = loc.index;
    const p = sampleAt(track, loc.s);
    e.y = surfaceY(p, loc.offset) + 0.7;
    if (Math.abs(loc.offset) > limitOf(p) + 0.5) {
      this.events.push({ type: 'explode', x: e.x, y: e.y, z: e.z, strength: 0.6 });
      return true;
    }
    return false;
  }

  private splash(e: Entity, field: Field): void {
    this.events.push({ type: 'splash', x: e.x, y: e.y, z: e.z });
    field.cars.forEach((car, j) => {
      if (j === e.owner && e.age < OWNER_GRACE) return;
      if ((car.x - e.x) ** 2 + (car.z - e.z) ** 2 < WATER_RADIUS ** 2 && Math.abs(car.y - e.y) < 2.5) this.hit(j, car, 'bubble');
    });
  }
}

/** When a bot uses its item, and which way. Bots wait a moment after picking up, then pick a good time. */
export function botItem(field: Field, items: Items, i: number): { item: boolean; itemBack: boolean } {
  const none = { item: false, itemBack: false };
  const held = items.held[i];
  const t = items.holding(i);
  if (!held || t < ROLL_TIME + 0.1) return none;
  const car = field.cars[i];
  const f = forward(car);
  let ahead = Infinity;
  let behind = Infinity;
  let near = Infinity;
  field.cars.forEach((other, j) => {
    if (j === i) return;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d = Math.hypot(dx, dz);
    near = Math.min(near, d);
    const along = (dx * f.x + dz * f.z) / Math.max(d, 1e-3);
    if (along > 0.85) ahead = Math.min(ahead, d);
    if (along < -0.6) behind = Math.min(behind, d);
  });
  let want: boolean;
  let reverse = false;
  switch (held.kind) {
    case 'rocket':
      want = items.lock[i] >= 0 || t > 8;
      if (!want && behind < 15 && t > 3) want = reverse = true;
      break;
    case 'water':
      want = (ahead > 14 && ahead < 30) || t > 8;
      break;
    case 'heat':
      want = ahead < 9 || t > 10;
      break;
    case 'shockwave':
      want = near < 8 || t > 10;
      break;
    case 'oil':
    case 'mines':
    case 'fake':
      want = behind < 25 || t > 7;
      reverse = true;
      break;
    case 'shield':
      want = t > 2.5;
      break;
    default:
      want = t > 1;
  }
  // One press every 0.4 s, so a pack of three goes out as three separate shots.
  const press = want && Math.floor(t * 60) % 24 === 0;
  return { item: press && !reverse, itemBack: press && reverse };
}
