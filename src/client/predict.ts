import type { CarInput } from '../shared/car';
import type { ItemEvent } from '../shared/items';
import { packSample, unpackSample } from '../shared/lobby';
import { MAX_SAMPLES } from '../shared/protocol';
import type { Race } from '../shared/race';
import { loadSnapshot, snapHead } from '../shared/snapshot';
import type { Pose } from './render/cars';

/** With more of your samples than this still to apply, the host is not keeping up, so the oldest are left out. */
const MAX_UNACKED = 30;
/** A watcher's view runs at most this many ticks past the newest snapshot. */
const MAX_COAST = 8;
/** Seconds for a correction to an opponent's car to fade out. */
const SMOOTH = 0.08;
/** A correction bigger than this jumps straight there, as after a reset. */
const SNAP_DISTANCE = 6;
/** Sent samples kept while no ack comes back, about a second's worth. */
const HISTORY = 64;

interface Sample {
  seq: number;
  input: CarInput;
  reset: boolean;
}

/** Numbers every sample of the page session, across races and reconnects, so an ack never matches an older sample. */
let nextSeq = 0;

export interface Offset {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/**
 * Draws an online race in your own time. Each tick it loads the newest snapshot from the host and drives the cars on
 * from there with the samples the host has still to apply, and every other car as it was last driven, so your car
 * answers at once. When a new snapshot moves a car from where the last guess had it, the jump fades out instead.
 */
export class Predictor {
  /** Where each car was drawn from, one tick back, for the renderer to blend from. */
  readonly poses: Pose[];
  /** Each car's correction still fading out. */
  readonly offsets: Offset[];
  /** Your samples the host had still to apply at the newest snapshot. */
  ahead = 0;
  private snap: ArrayBuffer | null = null;
  private snapK = -1;
  private ack = -1;
  private fresh = false;
  private coast = 0;
  private history: Sample[] = [];

  constructor(
    readonly race: Race,
    readonly n: number,
    /** Your grid slot, or -1 while watching. */
    readonly me: number,
  ) {
    this.poses = race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
    this.offsets = race.racers.map(() => ({ x: 0, y: 0, z: 0, heading: 0 }));
  }

  /** A snapshot from the host. Older ones than the newest, and ones from another race, are dropped. */
  onSnapshot(buf: ArrayBuffer): void {
    const head = snapHead(buf, this.race.racers.length);
    if (!head || head.n !== this.n || head.k <= this.snapK) return;
    this.snap = buf;
    this.snapK = head.k;
    if (this.me >= 0) this.ack = Math.max(this.ack, head.acks[this.me]);
    this.fresh = true;
  }

  onEvents(events: ItemEvent[]): void {
    this.race.items.events.push(...events);
  }

  /** A new link starts with nothing applied, so samples from before it must not count as still to apply. */
  forget(): void {
    this.history = [];
  }

  /**
   * Takes this tick's controls and moves local time on a tick. Returns the samples to send: the new one, and before it
   * every sent one the host hasn't applied yet, up to MAX_SAMPLES.
   */
  tick(input: CarInput, reset = false): { s: number; q: number[] } | null {
    const race = this.race;
    let batch: { s: number; q: number[] } | null = null;
    if (this.me >= 0) {
      // Kept as the host will read it, rounded for the wire, so replays match the host exactly.
      this.history.push({ seq: nextSeq++, ...unpackSample(packSample(input, reset), 0) });
      if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY);
      const unsent = this.history.filter((p) => p.seq > this.ack).slice(-MAX_SAMPLES);
      batch = { s: unsent[0].seq, q: unsent.flatMap((p) => packSample(p.input, p.reset)) };
    }
    const before = race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
    if (!this.fresh) {
      // Nothing new from the host: carry on one more tick from the last guess.
      this.coast++;
      const mine = this.history.at(-1);
      if (this.me >= 0 || this.coast <= MAX_COAST) this.advance(this.others(), mine?.input ?? input, mine?.reset ?? false);
      this.record(before);
      return batch;
    }
    this.fresh = false;
    this.coast = 0;
    loadSnapshot(race, this.snap as ArrayBuffer);
    const others = this.others();
    const next = this.me >= 0 ? this.history.filter((p) => p.seq > this.ack).slice(-MAX_UNACKED) : [];
    const last = next.length - 1;
    let prior: Pose[] | null = null;
    next.forEach((p, i) => {
      if (i === last) prior = race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
      this.advance(others, p.input, p.reset);
    });
    this.ahead = next.length;
    // The new guess has its own idea of where each car was a tick ago, or with nothing to replay (watching), it is the
    // snapshot itself. The difference from where each car was drawn is carried as an offset that fades, so no car jumps.
    const from: Pose[] = prior ?? race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
    race.racers.forEach((_, i) => {
      const o = this.offsets[i];
      const dx = before[i].x + o.x - from[i].x;
      const dy = before[i].y + o.y - from[i].y;
      const dz = before[i].z + o.z - from[i].z;
      if (Math.hypot(dx, dz) > SNAP_DISTANCE) Object.assign(o, { x: 0, y: 0, z: 0, heading: 0 });
      else Object.assign(o, { x: dx, y: dy, z: dz, heading: wrap(before[i].heading + o.heading - from[i].heading) });
      Object.assign(this.poses[i], from[i]);
    });
    return batch;
  }

  /** Fades the corrections. */
  fade(dt: number): void {
    const k = Math.exp(-dt / SMOOTH);
    for (const o of this.offsets) {
      o.x *= k;
      o.y *= k;
      o.z *= k;
      o.heading *= k;
    }
  }

  /** The controls the other people last drove with, as the snapshot had them. Bots and finished cars drive themselves. */
  private others(): CarInput[] {
    return this.race.racers.map((r) => ({ ...r.input, item: false, itemBack: false }));
  }

  private advance(others: CarInput[], mine: CarInput, reset: boolean): void {
    if (reset && this.me >= 0) this.race.reset(this.race.racers[this.me]);
    const inputs = others.map((c, i) => (i === this.me ? mine : c));
    this.race.step(inputs, false);
  }

  private record(before: Pose[]): void {
    before.forEach((p, i) => Object.assign(this.poses[i], p));
  }
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
