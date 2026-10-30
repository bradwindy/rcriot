import type { ItemEvent } from './items';
import type { Settings } from './lobby';
import type { ResultRow } from './results';

/** Bump when page, host or server messages change shape, so stale tabs are told to reload. */
export const PROTOCOL_VERSION = 1;
/**
 * The most input samples one message may carry. Each message repeats every sample the host hasn't applied yet, about
 * a quarter of a second at most, so a lost message costs nothing.
 */
export const MAX_SAMPLES = 15;
/** Numbers per input sample: throttle, steer and button bits. */
export const SAMPLE_SIZE = 3;
/** How often guests time a ping to the host over the game link. */
export const PING_MS = 1000;
/** How often every page pings the party server, to keep its socket alive and show the server the page still runs. */
export const KEEPALIVE_MS = 5000;
/** How long the party keeps a player whose socket dropped, outside a race. Racers keep their car for the whole race. */
export const LOBBY_GRACE_MS = 8000;
/** How long the party waits for a host whose socket dropped mid-race before it ends the race and picks a new host. */
export const HOST_GRACE_MS = 5000;
/** A host page whose keepalive pings stop for this long mid-race (a locked phone, a frozen tab) counts as gone. */
export const HOST_SILENT_MS = 4 * KEEPALIVE_MS;
export const NAME_MAX = 12;
/** The largest message the party server accepts. WebRTC session descriptions and race results are the biggest. */
export const MAX_MESSAGE_BYTES = 16384;

/** Application WebSocket close codes. */
export const CLOSE = {
  replaced: 4000,
  outdated: 4001,
  full: 4002,
  left: 4003,
} as const;

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFC')
    // Strip control and format characters (bidi overrides, zero-width spaces), but keep the joiners emoji need.
    .replace(/(?![‍\u{e0020}-\u{e007f}])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, NAME_MAX).join('').trim();
}

export type Phase = 'lobby' | 'race' | 'results';

export interface PublicPlayer {
  id: string;
  name: string;
  /** Car model id from ROSTER. */
  car: string;
  /** Grid slot in the race in play, or -1 when watching. */
  slot: number;
  connected: boolean;
  /** Round-trip time to the host in ms as the player last reported it, or -1 when unknown. */
  ping: number;
}

/** One grid slot of a race: a person by public id, or a bot. */
export interface GridSlot {
  id: string | null;
  name: string;
  car: string;
}

export interface RoomMsg {
  t: 'room';
  phase: Phase;
  /** Public id of the party host, whose browser runs the race. */
  host: string;
  settings: Settings;
  players: PublicPlayer[];
  /** Number of the race in play or last run, counting from 1. 0 before the first start. */
  race: number;
  seed: number;
  /** The grid of the race in play or last run, or empty before the first. */
  grid: GridSlot[];
  /** Results of the last race, once it is over. */
  results: ResultRow[] | null;
}

/** The host's report of a race ending, to guests over the game link and to the party server. */
export interface OverMsg {
  t: 'over';
  race: number;
  results: ResultRow[];
}

/** The pick-up events of one host tick. Sent reliably, so a lost snapshot never loses a sound. */
export interface EventMsg {
  t: 'e';
  n: number;
  k: number;
  e: ItemEvent[];
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type IceCandidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

/**
 * WebRTC signalling relayed through the party server. Guests always offer and the host always answers. A null
 * candidate marks the end of the candidates.
 */
export type SignalData = { sdp: { type: 'offer' | 'answer'; sdp: string } } | { candidate: IceCandidate | null };

/** Party server to page, over the WebSocket. */
export type ServerMsg =
  | { t: 'welcome'; id: string }
  /** STUN and TURN servers for this page's game links. Follows every welcome. */
  | { t: 'ice'; servers: IceServer[] }
  | RoomMsg
  /**
   * `from` is the sender's public id, filled in by the party server. `l` numbers the guest's link attempt, so signals
   * for an attempt that has since been replaced are dropped.
   */
  | { t: 'signal'; from: string; l: number; d: SignalData }
  /** To the host: a racer pressed Leave mid-race. Their 'bye' can't reach the host while their link is down. */
  | { t: 'left'; id: string };

/** Page to party server, over the WebSocket. */
export type ClientMsg =
  | { t: 'hello'; pid: string; name: string; car: string }
  | { t: 'car'; car: string }
  | { t: 'name'; name: string }
  /** Round trip to the host over the game link, in ms. The host reports 0. */
  | { t: 'rtt'; ms: number }
  | { t: 'settings'; s: Partial<Settings> }
  | { t: 'start' }
  | { t: 'again' }
  /** `to` is the public id of the player the signal is for. */
  | { t: 'signal'; to: string; l: number; d: SignalData }
  /** From the host only: the race ended. */
  | OverMsg
  /** From the host only: this page can't run the race the party thinks is in play (it reloaded), so end it. */
  | { t: 'abort'; race: number };

/**
 * Host to guest over the game link, as JSON. Snapshots go as binary on the unreliable channel (see snapshot.ts), and
 * so do pongs. Events and the result go on the reliable one.
 */
export type HostMsg = EventMsg | OverMsg | { t: 'pong'; i: number };

/** Guest to host over the game link. Inputs and pings go on the unreliable channel, 'bye' on the reliable one. */
export type GuestMsg =
  /** Input samples, oldest first, flattened SAMPLE_SIZE numbers each. `s` numbers the first sample. */
  | { t: 'p'; s: number; q: number[] }
  | { t: 'ping'; i: number }
  /** The guest pressed Leave, so a bot takes their car at once. */
  | { t: 'bye' };
