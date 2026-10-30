import { TICK, type Car } from './car';
import { ITEM_KINDS, type Entity, type EntityKind } from './items';
import type { Race } from './race';
import type { Cover, Surface } from './track';

/**
 * Race state as a flat Float32Array, small enough to send every tick over an unreliable channel. Everything a guest
 * needs to draw the race and predict the cars is in it. Pick-up internals that only the host runs (aiming, cooldowns,
 * the dice) stay on the host.
 */
const CAR_NUMBERS = [
  'x', 'y', 'z', 'vx', 'vy', 'vz', 'heading', 'air', 'index', 's', 'offset', 'ground', 'drift', 'driftTime', 'boost',
  'stall', 'age', 'hopAt', 'boostAt', 'boostPower', 'bumpAt', 'bump', 'landAt', 'land', 'wallAt', 'shield', 'slick',
  'slickDir', 'stun', 'bubble', 'tumble', 'burn',
] as const satisfies readonly (keyof Car)[];
const SURFACES: Surface[] = ['sand', 'wood', 'rock'];
const COVERS: Cover[] = ['open', 'pier', 'ship', 'tunnel'];
const ENTITY_KINDS: EntityKind[] = ['rocket', 'mine', 'water', 'oil', 'fake'];

const VERSION = 1;
const HEADER = 9;
const PER_RACER = CAR_NUMBERS.length + 3 + 16;
const PER_ENTITY = 16;
const FLAG = { drift: 1, item: 2, itemBack: 4 };

export interface SnapHead {
  /** Race number, so a snapshot from an earlier race is never mistaken for one from this race. */
  n: number;
  /** Host tick. */
  k: number;
  /** By racer, the number of the last input sample the host applied, or -1. */
  acks: number[];
}

const opt = (v: number | null) => (v === null ? -1 : v);
const back = (v: number) => (v < 0 ? null : v);

export function encodeSnapshot(race: Race, n: number, acks: readonly number[]): ArrayBuffer {
  const { racers, items } = race;
  const out = new Float32Array(HEADER + racers.length * PER_RACER + items.boxes.length + items.entities.length * PER_ENTITY);
  let o = 0;
  const put = (v: number) => (out[o++] = v);
  put(VERSION);
  put(n);
  put(race.tick);
  put(opt(race.endAt));
  put(race.over ? 1 : 0);
  put(items.enabled ? 1 : 0);
  put(racers.length);
  put(items.boxes.length);
  put(items.entities.length);
  racers.forEach((r, i) => {
    const c = r.car;
    for (const k of CAR_NUMBERS) put(c[k]);
    put(SURFACES.indexOf(c.surface));
    put(COVERS.indexOf(c.cover));
    put((c.offroad ? 1 : 0) | (c.driftHeld ? 2 : 0));
    put(r.lap);
    put((r.halfway ? 1 : 0) | (r.auto ? 2 : 0));
    put(opt(r.gasAt));
    put(r.lapStart);
    put(opt(r.bestLap));
    put(opt(r.finish));
    put(r.input.throttle);
    put(r.input.steer);
    put((r.input.drift ? FLAG.drift : 0) | (r.input.item ? FLAG.item : 0) | (r.input.itemBack ? FLAG.itemBack : 0));
    const held = items.held[i];
    put(held ? ITEM_KINDS.indexOf(held.kind) : -1);
    put(held?.count ?? 0);
    put(items.heat[i]);
    put(items.charge[i]);
    put(items.lock[i]);
    put(acks[i] ?? -1);
    put(r.top);
  });
  for (const b of items.boxes) put(b.respawn);
  for (const e of items.entities) {
    put(e.id);
    put(ENTITY_KINDS.indexOf(e.kind));
    put(e.x);
    put(e.y);
    put(e.z);
    put(e.vx);
    put(e.vy);
    put(e.vz);
    put(e.owner);
    put(e.target);
    put(e.age);
    put(e.life);
    put((e.landed ? 1 : 0) | (e.out ? 2 : 0));
    put(e.hopAt);
    put(e.index);
    put(0);
  }
  return out.buffer;
}

/** Reads the header, or null for a snapshot this race can't load. */
export function snapHead(buf: ArrayBuffer, racers: number): SnapHead | null {
  if (buf.byteLength < HEADER * 4) return null;
  const v = new Float32Array(buf);
  if (v[0] !== VERSION || v[6] !== racers) return null;
  const size = HEADER + racers * PER_RACER + v[7] + v[8] * PER_ENTITY;
  if (v.length !== size) return null;
  const acks: number[] = [];
  for (let i = 0; i < racers; i++) acks.push(v[HEADER + i * PER_RACER + PER_RACER - 2]);
  return { n: v[1], k: v[2], acks };
}

/** Puts a race into the state a snapshot holds. Check it with snapHead first. */
export function loadSnapshot(race: Race, buf: ArrayBuffer): void {
  const v = new Float32Array(buf);
  const { racers, items } = race;
  let o = 2;
  const get = () => v[o++];
  race.tick = get();
  race.clock = race.tick * TICK;
  race.endAt = back(get());
  race.over = get() === 1;
  items.enabled = get() === 1;
  o += 1;
  const boxes = get();
  const entities = get();
  racers.forEach((r, i) => {
    const c = r.car;
    for (const k of CAR_NUMBERS) c[k] = get();
    c.surface = SURFACES[get()] ?? 'sand';
    c.cover = COVERS[get()] ?? 'open';
    const bits = get();
    c.offroad = (bits & 1) !== 0;
    c.driftHeld = (bits & 2) !== 0;
    r.lap = get();
    const flags = get();
    r.halfway = (flags & 1) !== 0;
    r.auto = (flags & 2) !== 0;
    r.gasAt = back(get());
    r.lapStart = get();
    r.bestLap = back(get());
    r.finish = back(get());
    const throttle = get();
    const steer = get();
    const f = get();
    r.input = { throttle, steer, drift: (f & FLAG.drift) !== 0, item: (f & FLAG.item) !== 0, itemBack: (f & FLAG.itemBack) !== 0 };
    const kind = get();
    const count = get();
    items.held[i] = kind >= 0 ? { kind: ITEM_KINDS[kind], count } : null;
    items.heat[i] = get();
    items.charge[i] = get();
    items.lock[i] = get();
    o++;
    r.top = get();
  });
  for (let b = 0; b < boxes; b++) {
    const respawn = get();
    if (items.boxes[b]) items.boxes[b].respawn = respawn;
  }
  items.entities.length = 0;
  for (let k = 0; k < entities; k++) {
    const e: Entity = {
      id: get(),
      kind: ENTITY_KINDS[get()] ?? 'mine',
      x: get(),
      y: get(),
      z: get(),
      vx: get(),
      vy: get(),
      vz: get(),
      owner: get(),
      target: get(),
      age: get(),
      life: get(),
      landed: false,
      out: false,
      hopAt: 0,
      index: 0,
    };
    const flags = get();
    e.landed = (flags & 1) !== 0;
    e.out = (flags & 2) !== 0;
    e.hopAt = get();
    e.index = get();
    o++;
    items.entities.push(e);
  }
}
