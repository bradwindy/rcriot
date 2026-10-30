import { buildGrid, DEFAULT_SETTINGS, isCar, sanitizeSettings, type Settings } from '../shared/lobby';
import {
  HOST_GRACE_MS,
  HOST_SILENT_MS,
  LOBBY_GRACE_MS,
  type GridSlot,
  type OverMsg,
  type Phase,
  type PublicPlayer,
  type RoomMsg,
  type ServerMsg,
} from '../shared/protocol';
import { MAX_RACERS } from '../shared/race';
import { newStats, type RacerStats, type ResultRow } from '../shared/results';
import { ROSTER } from '../shared/roster';

export interface RoomIO {
  send(pid: string, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
  newId(): string;
  /** When the player's socket last showed it is alive (ms), or null when they have no socket. */
  seenAt(pid: string): number | null;
  /** A seed for the next race's grid and bots. */
  seed(): number;
}

export interface Player {
  pid: string;
  id: string;
  name: string;
  car: string;
  slot: number;
  /** Whether the player's socket to the party is open. */
  connected: boolean;
  /** When the player's socket dropped (ms), or -1 while connected or once their grace has been spent. */
  goneAt: number;
}

export interface RoomSnapshot {
  phase: Phase;
  settings: Settings;
  host: string;
  race: number;
  seed: number;
  grid: GridSlot[];
  results: ResultRow[] | null;
  players: Player[];
}

const MAX_PING_MS = 9999;
/** A full grid plus as many watching. Joins past this are turned away. */
export const MAX_PLAYERS = 24;
const STAT_KEYS = Object.keys(newStats()) as (keyof RacerStats)[];

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const time = (v: unknown): number | null => (finite(v) && v >= 0 ? v : null);

/** Rebuilds a result row from its known fields, or returns null when it isn't one. */
function resultRow(raw: unknown, slot: GridSlot): ResultRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const stats = (typeof r.stats === 'object' && r.stats !== null ? r.stats : {}) as Record<string, unknown>;
  if (!finite(r.place) || r.place < 1 || r.place > MAX_RACERS) return null;
  const clean = newStats();
  for (const k of STAT_KEYS) {
    const v = stats[k];
    if (k === 'rocketStart') clean.rocketStart = v === true;
    else if (finite(v)) clean[k] = Math.max(0, v);
  }
  return { name: slot.name, bot: slot.id === null, model: slot.car, place: r.place, time: time(r.time), bestLap: time(r.bestLap), stats: clean };
}

/**
 * One party's lobby, independent of Durable Object plumbing. The host's browser runs each race and reports the
 * result, which the room keeps so everyone, including people who join afterwards, sees the same board.
 */
export class Room {
  phase: Phase = 'lobby';
  settings: Settings = { ...DEFAULT_SETTINGS };
  players: Player[] = [];
  host = '';
  /** Number of the race in play or last run. */
  race = 0;
  seed = 0;
  grid: GridSlot[] = [];
  results: ResultRow[] | null = null;

  /** Last ping shown to the room, by pid. Kept off Player so it is never written to storage. */
  private pings = new Map<string, number>();

  constructor(private io: RoomIO) {}

  snapshot(): RoomSnapshot {
    const { phase, settings, host, race, seed, grid, results, players } = this;
    return { phase, settings, host, race, seed, grid, results, players };
  }

  /**
   * Rebuilds after the Durable Object wakes. Players whose socket is gone get a fresh grace, so a close that woke the
   * object, or a deploy restart, still runs through the normal leave path, and a host who doesn't come back ends the
   * race after HOST_GRACE_MS. `pings` holds the last ping shown for live players.
   */
  restore(snap: RoomSnapshot, livePids: Set<string>, now: number, pings: Map<string, number>): void {
    this.settings = sanitizeSettings(snap.settings);
    this.pings = pings;
    this.players = snap.players.map((p) => {
      const connected = livePids.has(p.pid);
      return { ...p, connected, goneAt: connected ? -1 : now };
    });
    this.host = snap.host;
    this.race = snap.race;
    this.seed = snap.seed;
    this.grid = snap.grid;
    this.results = snap.results;
    this.phase = snap.phase;
    this.ensureHost();
  }

  private find(pid: string): Player | undefined {
    return this.players.find((p) => p.pid === pid);
  }

  idOf(pid: string): string | undefined {
    return this.find(pid)?.id;
  }

  /** The connected person, other than `from`, whose public id is `to`. Game links only join the host and a guest. */
  peer(from: string, to: unknown): Player | undefined {
    return this.players.find((p) => p.id === to && p.pid !== from && p.connected && (from === this.host || p.pid === this.host));
  }

  private publicPlayer(p: Player): PublicPlayer {
    return {
      id: p.id,
      name: p.name,
      car: p.car,
      slot: p.slot,
      connected: p.connected,
      ping: p.connected ? (this.pings.get(p.pid) ?? -1) : -1,
    };
  }

  roomMsg(): RoomMsg {
    return {
      t: 'room',
      phase: this.phase,
      host: this.find(this.host)?.id ?? '',
      settings: this.settings,
      players: this.players.map((p) => this.publicPlayer(p)),
      race: this.race,
      seed: this.seed,
      grid: this.grid,
      results: this.results,
    };
  }

  private broadcastRoom(): void {
    this.io.broadcast(this.roomMsg());
  }

  /** Keeps the host while they are connected or still inside their reconnect grace. */
  private ensureHost(): void {
    const host = this.find(this.host);
    if (host && (host.connected || host.goneAt >= 0)) return;
    this.host = this.players.find((p) => p.connected)?.pid ?? '';
  }

  /** Hands host to the first connected person other than the current host, if there is one. */
  private passHost(): void {
    const next = this.players.find((p) => p.connected && p.pid !== this.host);
    if (next) this.host = next.pid;
  }

  /** Back to a fresh lobby, without the players who left for good. */
  private toLobby(): void {
    this.players = this.players.filter((p) => p.connected || p.goneAt >= 0);
    for (const p of this.players) p.slot = -1;
    this.phase = 'lobby';
  }

  join(pid: string, name: string, car: unknown): Player {
    let p = this.find(pid);
    if (p) {
      p.connected = true;
      p.goneAt = -1;
      p.name = name;
      if (this.phase !== 'race' && isCar(car)) p.car = car;
    } else {
      p = { pid, id: this.io.newId(), name, car: isCar(car) ? car : ROSTER[0].id, slot: -1, connected: true, goneAt: -1 };
      this.players.push(p);
    }
    this.ensureHost();
    this.io.send(pid, { t: 'welcome', id: p.id });
    this.broadcastRoom();
    return p;
  }

  rename(pid: string, name: string): void {
    const p = this.find(pid);
    if (!p || !name || p.name === name) return;
    p.name = name;
    this.broadcastRoom();
  }

  pickCar(pid: string, car: unknown): void {
    const p = this.find(pid);
    if (!p || !isCar(car) || p.car === car || (this.phase === 'race' && p.slot >= 0)) return;
    p.car = car;
    this.broadcastRoom();
  }

  /**
   * A socket closed. After a dropped connection the player keeps their place for a short grace period in case they
   * are reloading, and a racer keeps their car until the race ends while a bot drives it. After pressing Leave
   * (`quit`) they are gone at once. A host who quits ends the race.
   */
  leave(pid: string, now: number, quit = false): void {
    const p = this.find(pid);
    if (!p) return;
    const host = pid === this.host;
    p.connected = false;
    p.goneAt = now;
    this.pings.delete(pid);
    if (quit) this.drop(p);
    if (quit && host && this.phase === 'race') {
      this.passHost();
      this.toLobby();
    } else if (quit && this.phase === 'race' && p.slot >= 0) {
      this.io.send(this.host, { t: 'left', id: p.id });
    }
    this.ensureHost();
    if (this.wipeIfEmpty()) return;
    this.broadcastRoom();
  }

  /** Removes a player whose grace is spent. Racers stay listed until the race ends, so they can come back to their car. */
  private drop(p: Player): void {
    p.goneAt = -1;
    if (this.phase !== 'race' || p.slot < 0) this.players = this.players.filter((q) => q !== p);
  }

  /** Forgets the whole party once nobody is connected or about to come back. */
  private wipeIfEmpty(): boolean {
    if (this.players.some((q) => q.connected || q.goneAt >= 0)) return false;
    this.players = [];
    this.phase = 'lobby';
    this.results = null;
    return true;
  }

  /**
   * When the race's host counts as gone: HOST_GRACE_MS after their socket dropped, or HOST_SILENT_MS after an open
   * socket last showed life (a locked phone or frozen tab keeps its socket but stops running the race).
   */
  private hostGoneAt(): number {
    const host = this.find(this.host);
    if (!host || (!host.connected && host.goneAt < 0)) return -Infinity;
    if (!host.connected) return host.goneAt + HOST_GRACE_MS;
    return (this.io.seenAt(host.pid) ?? Infinity) + HOST_SILENT_MS;
  }

  /** Spends the grace of players who have not come back, and ends a race whose host is gone. Returns true if anything changed. */
  purge(now: number): boolean {
    let changed = false;
    for (const p of [...this.players]) {
      if (p.connected || p.goneAt < 0 || now - p.goneAt < LOBBY_GRACE_MS) continue;
      if (this.phase === 'race' && p.slot >= 0) continue;
      this.drop(p);
      changed = true;
    }
    if (this.phase === 'race' && now >= this.hostGoneAt()) {
      this.passHost();
      this.toLobby();
      changed = true;
    }
    if (!changed) return false;
    if (this.wipeIfEmpty()) return true;
    this.ensureHost();
    this.broadcastRoom();
    return true;
  }

  /** The earliest time purge() could change something, or null. */
  nextPurgeAt(): number | null {
    const times = this.players
      .filter((p) => !p.connected && p.goneAt >= 0 && !(this.phase === 'race' && p.slot >= 0))
      .map((p) => p.goneAt + LOBBY_GRACE_MS);
    if (this.phase === 'race') times.push(this.hostGoneAt());
    const at = Math.min(...times);
    return at === Infinity ? null : at;
  }

  /**
   * Stores a player's ping and tells the room when it is new or has moved enough to matter.
   * Returns the ping now shown for them, or null when the report is ignored.
   */
  reportPing(pid: string, ms: unknown): number | null {
    const p = this.find(pid);
    if (!p || typeof ms !== 'number' || !Number.isFinite(ms)) return null;
    const ping = Math.round(Math.max(0, Math.min(MAX_PING_MS, ms)));
    const shown = this.pings.get(pid);
    if (shown !== undefined && Math.abs(ping - shown) < Math.max(20, shown * 0.2)) return shown;
    this.pings.set(pid, ping);
    this.broadcastRoom();
    return ping;
  }

  updateSettings(pid: string, partial: unknown): void {
    if (pid !== this.host || this.phase === 'race') return;
    const merged = { ...this.settings, ...(typeof partial === 'object' && partial ? partial : {}) };
    this.settings = sanitizeSettings(merged, this.settings);
    this.broadcastRoom();
  }

  /** Puts the connected people on a grid with the bots and opens race number `race`. The host's page runs it from here. */
  start(pid: string): void {
    if (pid !== this.host || this.phase === 'race') return;
    this.players = this.players.filter((p) => p.connected);
    const racing = this.players.slice(0, MAX_RACERS);
    this.seed = this.io.seed();
    this.grid = buildGrid(racing, this.settings.bots, this.seed);
    for (const p of this.players) p.slot = this.grid.findIndex((g) => g.id === p.id);
    this.results = null;
    this.race++;
    this.phase = 'race';
    this.broadcastRoom();
  }

  /** Keeps the host's result for the race in play. */
  report(pid: string, msg: OverMsg): void {
    if (pid !== this.host || this.phase !== 'race' || msg.race !== this.race) return;
    const rows: unknown = msg.results;
    if (!Array.isArray(rows) || rows.length !== this.grid.length) return;
    const results = rows.map((r, i) => resultRow(r, this.grid[i]));
    if (results.some((r) => r === null)) return;
    this.results = results as ResultRow[];
    this.phase = 'results';
    this.broadcastRoom();
  }

  /** The host's page can't run the race the room thinks is in play (it reloaded), so the race ends. */
  abort(pid: string, race: unknown): void {
    if (pid !== this.host || this.phase !== 'race' || race !== this.race) return;
    this.toLobby();
    this.broadcastRoom();
  }

  again(pid: string): void {
    if (pid !== this.host || this.phase !== 'results') return;
    this.toLobby();
    this.ensureHost();
    this.broadcastRoom();
  }
}
