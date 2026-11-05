import { NO_INPUT, type CarInput } from '../shared/car';
import { unpackSample } from '../shared/lobby';
import { MAX_SAMPLES, SAMPLE_SIZE, type HostMsg, type OverMsg } from '../shared/protocol';
import { Race } from '../shared/race';
import { ROSTER } from '../shared/roster';
import { encodeSnapshot } from '../shared/snapshot';
import { courseOf } from '../shared/tracks';
import type { RaceInit } from './messages';

export interface MatchIO {
  /** To every guest and to the host's own page. `reliable` picks the channel. */
  send(msg: HostMsg, reliable: boolean): void;
  /** A snapshot, to every guest and to the host's own page, over the unreliable channel. */
  snap(buf: ArrayBuffer): void;
  /** To the party server. */
  report(msg: OverMsg): void;
}

/** Input samples a racer may have waiting. More would add lag after a burst of late messages. */
const INPUT_QUEUE = 4;
/**
 * A racer who always had a sample to spare over this many ticks skips one, so the wait a burst of messages leaves
 * behind drains away instead of adding lag for the rest of the race.
 */
const DRAIN_TICKS = 8;

interface Inputs {
  queue: { seq: number; input: CarInput; reset: boolean }[];
  /** Highest sequence number taken so far. Guests repeat every unacked sample, so anything at or below it is a repeat. */
  high: number;
  /** Sequence number of the last sample a tick applied, or -1. */
  applied: number;
  /** What the racer drives with while no new sample is waiting. */
  last: CarInput;
  /** The fewest samples left waiting after a tick, over the ticks since the last check. */
  spare: number;
  watched: number;
}

type Queued = Inputs['queue'][number];

/** A skipped sample's one-off presses (a reset, a pick-up fired) go with the sample after it, so they still happen. */
function carry(from: Queued, to: Queued | undefined): void {
  if (!to) return;
  to.reset ||= from.reset;
  to.input = { ...to.input, item: to.input.item || from.input.item, itemBack: to.input.itemBack || from.input.itemBack };
}

/**
 * One race, run by the party host's page. People are keyed by public id. A bot drives the car of anyone whose game
 * link is down, until it comes back. Time only moves through tick(), one fixed step per call.
 */
export class RaceMatch {
  readonly race: Race;
  private readonly n: number;
  private readonly init: RaceInit;
  /** Grid slot of each person. */
  private readonly slots = new Map<string, number>();
  private readonly linked: Set<string>;
  private readonly inputs = new Map<string, Inputs>();
  private reported = false;

  constructor(
    private io: MatchIO,
    init: RaceInit,
  ) {
    this.init = init;
    this.n = init.race;
    init.grid.forEach((g, i) => {
      if (g.id) this.slots.set(g.id, i);
    });
    const models = init.grid.map((g) => ROSTER.find((m) => m.id === g.car) ?? ROSTER[0]);
    const { settings } = init;
    this.race = new Race(courseOf(settings.track), models, [...this.slots.values()], init.seed, settings.items, { laps: settings.laps, level: settings.level });
    this.linked = new Set([init.host, ...init.linked]);
    for (const [id, slot] of this.slots) this.race.racers[slot].auto = !this.linked.has(id);
  }

  get over(): boolean {
    return this.reported;
  }

  /**
   * Queues input samples, flattened oldest first, SAMPLE_SIZE numbers each and numbered from `s`. tick() applies one per
   * step and snapshots report the number of the last one applied. Samples already taken are skipped.
   */
  input(id: string, s: unknown, q: unknown): void {
    if (!this.slots.has(id)) return;
    if (typeof s !== 'number' || !Number.isSafeInteger(s) || s < 0) return;
    if (!Array.isArray(q) || q.length % SAMPLE_SIZE !== 0 || q.length > MAX_SAMPLES * SAMPLE_SIZE) return;
    let inputs = this.inputs.get(id);
    if (!inputs) this.inputs.set(id, (inputs = { queue: [], high: -1, applied: -1, last: NO_INPUT, spare: Infinity, watched: 0 }));
    for (let i = 0; i < q.length; i += SAMPLE_SIZE) {
      const seq = s + i / SAMPLE_SIZE;
      if (seq <= inputs.high) continue;
      inputs.queue.push({ seq, ...unpackSample(q, i) });
      inputs.high = seq;
    }
    while (inputs.queue.length > INPUT_QUEUE) carry(inputs.queue.shift()!, inputs.queue[0]);
  }

  /**
   * A guest's game link opened or closed. A bot drives while it is down. A new link may come from a reloaded page that
   * numbers its samples from 0 again, so it starts that racer's inputs over.
   */
  link(id: string, up: boolean): void {
    const slot = this.slots.get(id);
    if (slot === undefined || id === this.init.host) return;
    if (up) {
      this.inputs.delete(id);
      this.linked.add(id);
    } else {
      this.linked.delete(id);
    }
    const r = this.race.racers[slot];
    r.auto = !up || r.finish !== null;
  }

  /** The racer pressed Leave, so a bot drives their car to the end. */
  quit(id: string): void {
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    this.slots.delete(id);
    this.linked.delete(id);
    this.race.racers[slot].auto = true;
  }

  tick(): void {
    if (this.reported) return;
    const { race } = this;
    const controls = race.racers.map(() => NO_INPUT);
    const acks = race.racers.map(() => -1);
    for (const [id, slot] of this.slots) {
      const inputs = this.inputs.get(id);
      if (!inputs) continue;
      const { input, reset } = this.next(inputs);
      if (reset) race.reset(race.racers[slot]);
      controls[slot] = input;
      acks[slot] = inputs.applied;
    }
    race.step(controls);
    const events = race.items.events.splice(0);
    if (events.length) this.io.send({ t: 'e', n: this.n, k: race.tick, e: events }, true);
    this.io.snap(encodeSnapshot(race, this.n, acks));
    if (race.over) {
      this.reported = true;
      const msg: OverMsg = { t: 'over', race: this.n, results: race.results(this.init.grid.map((g) => g.name)) };
      this.io.send(msg, true);
      this.io.report(msg);
    }
  }

  /** The racer's next queued sample, skipping one when the queue has kept a spare for a while. */
  private next(inputs: Inputs): { input: CarInput; reset: boolean } {
    if (inputs.watched >= DRAIN_TICKS) {
      if (inputs.spare > 0 && inputs.queue.length > 1) carry(inputs.queue.shift()!, inputs.queue[0]);
      inputs.spare = Infinity;
      inputs.watched = 0;
    }
    const next = inputs.queue.shift();
    if (next) {
      inputs.last = next.input;
      inputs.applied = next.seq;
    }
    inputs.spare = Math.min(inputs.spare, inputs.queue.length);
    inputs.watched++;
    return { input: inputs.last, reset: next?.reset ?? false };
  }
}
