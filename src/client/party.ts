import type { Settings } from '../shared/lobby';
import { CODE_ALPHABET, CODE_LENGTH, type HostMsg, type IceServer, type RoomMsg, type ServerMsg } from '../shared/protocol';
import { HostRuntime } from './host';
import { Net, type NetStatus } from './net';
import { GuestLink } from './peer';

const PID_KEY = 'rcriot.pid';

export function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

let memoryPid = '';
/** This tab's private player id. Kept per tab, so two tabs on one machine are two players and a reload keeps your car. */
function playerId(): string {
  let pid = '';
  try {
    pid = sessionStorage.getItem(PID_KEY) ?? '';
  } catch {
    // private mode: the id lasts for this page only
  }
  pid ||= memoryPid;
  if (!pid) {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    pid = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    memoryPid = pid;
    try {
      sessionStorage.setItem(PID_KEY, pid);
    } catch {
      // as above
    }
  }
  return pid;
}

export interface PartyEvents {
  room(room: RoomMsg): void;
  /** A race snapshot from the host, over the game link or straight from the worker on the host's own page. */
  snapshot(buf: ArrayBuffer): void;
  host(msg: HostMsg): void;
  status(status: NetStatus): void;
  /** The game link to the host came up or went down. Always up on the host's own page. */
  link(up: boolean): void;
}

/**
 * One party: the socket to its Durable Object, and either the race running on this page (as host) or a game link to
 * the host's page (as guest).
 */
export class PartySession {
  readonly net: Net;
  room: RoomMsg | null = null;
  myId = '';
  status: NetStatus = 'connecting';
  private ice: IceServer[] | null = null;
  /** At most one of these: the race runs on this page, or this page has a game link to the host. */
  private hostRt: HostRuntime | null = null;
  private link: GuestLink | null = null;
  /** The ping last told to the party on this socket, or -1. */
  private reported = -1;
  private ended = false;

  constructor(
    readonly code: string,
    private name: string,
    private car: () => string,
    private on: PartyEvents,
  ) {
    const pid = playerId();
    this.net = new Net(
      code,
      () => ({ t: 'hello', pid, name: this.name, car: this.car() }),
      (msg) => this.onMessage(msg),
      (status) => {
        this.status = status;
        // Another tab took over, or this one can't join, so it stops without a bye: the player hasn't left.
        if (status === 'replaced' || status === 'outdated' || status === 'full') this.end();
        this.on.status(status);
      },
      () => this.hostRt?.hosting ?? false,
    );
    this.net.connect();
  }

  get isHost(): boolean {
    return this.hostRt !== null;
  }

  get linked(): boolean {
    return this.hostRt !== null || (this.link?.up ?? false);
  }

  get rtt(): number {
    if (this.hostRt) return 0;
    return this.link?.up ? this.link.rtt : -1;
  }

  pickCar(car: string): void {
    this.net.send({ t: 'car', car });
  }

  settings(s: Partial<Settings>): void {
    this.net.send({ t: 'settings', s });
  }

  rename(name: string): void {
    this.name = name;
    this.net.send({ t: 'name', name });
  }

  start(): void {
    this.net.send({ t: 'start' });
  }

  again(): void {
    this.net.send({ t: 'again' });
  }

  /** Your input samples for the race in play. The host's own page gets every one, so only a guest repeats them. */
  input(batch: { s: number; q: number[] }): void {
    if (this.hostRt) this.hostRt.input(batch.s, batch.q);
    else this.link?.send({ t: 'p', ...batch });
  }

  /** Leave. The host hears it first, so a bot takes our car at once. */
  close(): void {
    this.link?.leave();
    this.link = null;
    this.end();
    this.net.close();
  }

  private end(): void {
    this.ended = true;
    this.dropLink();
    this.dropHost();
  }

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        if (msg.id !== this.myId) {
          this.dropLink();
          this.dropHost();
        }
        this.myId = msg.id;
        // The party forgets a ping when the socket drops, and may have missed a result while it was down.
        this.reported = -1;
        this.reportRtt(this.rtt);
        this.hostRt?.resend();
        break;
      case 'ice':
        this.ice = msg.servers;
        this.hostRt?.setIce(msg.servers);
        this.syncRole();
        break;
      case 'room':
        this.room = msg;
        this.syncRole();
        this.hostRt?.onRoom(msg);
        this.on.room(msg);
        break;
      case 'signal':
        if (this.hostRt) this.hostRt.signal(msg.from, msg.l, msg.d);
        else if (msg.from === this.room?.host) this.link?.signal(msg.l, msg.d);
        break;
      case 'left':
        this.hostRt?.quit(msg.id);
        break;
    }
  }

  /** The party host runs the race on their page. Everyone else keeps a game link to the host. */
  private syncRole(): void {
    const room = this.room;
    const me = this.myId;
    if (this.ended || !room || !me) return;
    if (room.host === me) {
      this.dropLink();
      if (this.hostRt) return;
      this.hostRt = new HostRuntime(me, {
        send: (m) => this.net.send(m),
        deliver: (m) => this.on.host(m),
        snapshot: (buf) => this.on.snapshot(buf),
        beat: () => this.net.keepalive(),
      });
      if (this.ice) this.hostRt.setIce(this.ice);
      this.reported = -1;
      this.reportRtt(0);
      this.on.link(true);
      return;
    }
    if (this.hostRt) {
      this.dropHost();
      this.reported = -1;
    }
    if (this.link && this.link.host !== room.host) this.dropLink();
    if (this.link || !room.host || !this.ice) return;
    const host = room.host;
    this.link = new GuestLink(host, () => this.ice ?? [], {
      signal: (l, d) => this.net.send({ t: 'signal', to: host, l, d }),
      message: (m) => this.on.host(m),
      snapshot: (buf) => this.on.snapshot(buf),
      change: (up) => this.on.link(up),
      rtt: (ms) => this.reportRtt(ms),
    });
  }

  private dropLink(): void {
    this.link?.close();
    this.link = null;
  }

  private dropHost(): void {
    this.hostRt?.stop();
    this.hostRt = null;
  }

  private reportRtt(ms: number): void {
    // The room only shows a change this big, so smaller ones aren't worth a message.
    if (ms < 0 || (this.reported >= 0 && Math.abs(ms - this.reported) < Math.max(20, this.reported * 0.2))) return;
    this.reported = ms;
    this.net.send({ t: 'rtt', ms });
  }
}
