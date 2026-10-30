import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type RoomMsg, type ServerMsg } from '../src/shared/protocol';
import { newStats } from '../src/shared/results';

interface Client {
  messages: ServerMsg[];
  closed: Promise<CloseEvent>;
  until<T extends ServerMsg>(match: (m: ServerMsg) => m is T, timeoutMs?: number): Promise<T>;
  send(msg: object): void;
}

type Welcome = Extract<ServerMsg, { t: 'welcome' }>;
type Signal = Extract<ServerMsg, { t: 'signal' }>;

const url = (code: string, v: string | number = PROTOCOL_VERSION) => `https://rcriot.test/api/party/${code}/ws?v=${v}`;

async function connect(code: string, v: string | number = PROTOCOL_VERSION): Promise<Client> {
  const res = await exports.default.fetch(url(code, v), { headers: { Upgrade: 'websocket' } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const messages: ServerMsg[] = [];
  const listeners = new Set<() => void>();
  ws.addEventListener('message', (e) => {
    if (typeof e.data === 'string' && e.data !== 'pong') messages.push(JSON.parse(e.data) as ServerMsg);
    for (const l of listeners) l();
  });
  const closed = new Promise<CloseEvent>((resolve) => ws.addEventListener('close', resolve));
  return {
    messages,
    closed,
    send: (msg) => ws.send(JSON.stringify(msg)),
    until<T extends ServerMsg>(match: (m: ServerMsg) => m is T, timeoutMs = 5000): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const check = () => {
          const found = messages.findLast(match);
          if (!found) return;
          listeners.delete(check);
          clearTimeout(timer);
          resolve(found);
        };
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`Timed out. Got: ${messages.map((m) => m.t).join(',')}`));
        }, timeoutMs);
        listeners.add(check);
        check();
      });
    },
  };
}

async function join(code: string, pid: string, name: string, car: string): Promise<Client & { id: string }> {
  const c = await connect(code);
  c.send({ t: 'hello', pid, name, car });
  const { id } = await c.until((m): m is Welcome => m.t === 'welcome');
  return { ...c, id };
}

const isRoom =
  (pred: (m: RoomMsg) => boolean) =>
  (m: ServerMsg): m is RoomMsg =>
    m.t === 'room' && pred(m);

describe('Worker routing', () => {
  it('rejects bad requests and tells old pages to reload', async () => {
    expect((await exports.default.fetch(url('ABCDE'))).status).toBe(426);
    expect((await exports.default.fetch(url('nope!'), { headers: { Upgrade: 'websocket' } })).status).toBe(400);
    const cross = await exports.default.fetch(url('ABCDE'), { headers: { Upgrade: 'websocket', Origin: 'https://evil.example' } });
    expect(cross.status).toBe(403);
    expect((await (await connect('ABCDE', 0)).closed).code).toBe(4001);
  });
});

describe('Party', () => {
  it('runs a lobby, a race on the grid and its result, then back to the lobby', async () => {
    const host = await join('RACE2', 'host-pid-0123456789', 'Brad', 'comet');
    const guest = await join('RACE2', 'guest-pid-0123456789', 'Sam', 'quackers');

    // Signals only pass between the host and a guest, with the sender filled in.
    guest.send({ t: 'signal', to: host.id, l: 7, d: { candidate: null } });
    const signal = await host.until((m): m is Signal => m.t === 'signal');
    expect(signal).toMatchObject({ from: guest.id, l: 7 });

    // Only the host changes settings and starts.
    guest.send({ t: 'settings', s: { laps: 9 } });
    host.send({ t: 'settings', s: { laps: 2, bots: 3, level: 'hard' } });
    await guest.until(isRoom((r) => r.settings.laps === 2));
    host.send({ t: 'start' });
    const race = await guest.until(isRoom((r) => r.phase === 'race'));
    expect(race.grid).toHaveLength(5);
    expect(race.grid.filter((g) => g.id === null)).toHaveLength(3);
    const slot = race.grid.findIndex((g) => g.id === guest.id);
    expect(race.grid[slot]).toMatchObject({ name: 'Sam', car: 'quackers' });
    expect(race.players.find((p) => p.id === guest.id)?.slot).toBe(slot);

    // A late joiner watches this race.
    const late = await join('RACE2', 'late-pid-0123456789', 'Jo', 'comet');
    expect((await late.until(isRoom((r) => r.players.length === 3))).players.find((p) => p.id === late.id)?.slot).toBe(-1);

    // The host's report becomes the room's result. Names and cars come from the grid, not the report.
    const results = race.grid.map((_, i) => ({ name: 'spoof', place: i + 1, time: 60 + i, bestLap: 29, stats: { ...newStats(), topSpeed: 40 } }));
    guest.send({ t: 'over', race: race.race, results });
    host.send({ t: 'over', race: race.race, results });
    const over = await guest.until(isRoom((r) => r.phase === 'results'));
    expect(over.results?.[slot]).toMatchObject({ name: 'Sam', model: 'quackers', place: slot + 1, bot: false });

    host.send({ t: 'again' });
    const lobby = await guest.until(isRoom((r) => r.phase === 'lobby' && r.race === race.race));
    expect(lobby.players.every((p) => p.slot === -1)).toBe(true);
  });
});
