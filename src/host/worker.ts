import { TICK } from '../shared/car';
import { KEEPALIVE_MS } from '../shared/protocol';
import { RaceMatch, type MatchIO } from './match';
import type { FromWorker, RaceInit, ToWorker } from './messages';

/** The parts of DedicatedWorkerGlobalScope used here. This file is type-checked with the app's DOM lib. */
interface Scope {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<ToWorker>) => void): void;
}

const scope = self as unknown as Scope;
const STEP_MS = 1000 * TICK;
const MAX_CATCH_UP = 4;

const post = (msg: FromWorker) => scope.postMessage(msg);
const io: MatchIO = {
  send: (msg, reliable) => post({ t: 'send', data: JSON.stringify(msg), reliable }),
  snap: (buf) => scope.postMessage({ t: 'snap', buf }, [buf]),
  report: (msg) => post({ t: 'report', msg }),
};

let match: RaceMatch | null = null;
let loop: ReturnType<typeof setTimeout> | null = null;
let loopStart = 0;
let ticksRun = 0;
let beatAt = 0;

function begin(init: RaceInit): void {
  stop();
  const now = performance.now();
  match = new RaceMatch(io, init);
  loopStart = beatAt = now;
  ticksRun = 0;
  schedule();
}

/** Aims each timer at the next tick boundary, so ticks follow the clock however the browser rounds delays. */
function schedule(): void {
  const next = loopStart + (ticksRun + 1) * STEP_MS;
  loop = setTimeout(run, Math.max(0, Math.ceil(next - performance.now())));
}

/**
 * Runs the ticks that are due, at most MAX_CATCH_UP per wake, so a long stall isn't replayed at once. A tick that
 * throws is left uncaught, so the page sees the worker's error event and ends the race instead of this worker running
 * a broken one.
 */
function run(): void {
  loop = null;
  const now = performance.now();
  const due = Math.floor((now - loopStart) / STEP_MS);
  ticksRun = Math.max(ticksRun, due - MAX_CATCH_UP);
  while (ticksRun < due && match && !match.over) {
    ticksRun++;
    match.tick();
  }
  if (!match || match.over) return;
  if (now - beatAt >= KEEPALIVE_MS) {
    beatAt = now;
    post({ t: 'beat' });
  }
  schedule();
}

function stop(): void {
  if (loop) clearTimeout(loop);
  loop = null;
  match = null;
}

scope.addEventListener('message', ({ data: msg }) => {
  switch (msg.t) {
    case 'start':
      begin(msg.init);
      break;
    case 'input':
      match?.input(msg.id, msg.s, msg.q);
      break;
    case 'link':
      match?.link(msg.id, msg.up);
      break;
    case 'quit':
      match?.quit(msg.id);
      break;
    case 'stop':
      stop();
      break;
  }
});
