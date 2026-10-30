import type { Settings } from '../shared/lobby';
import type { GridSlot, OverMsg } from '../shared/protocol';

export interface RaceInit {
  race: number;
  seed: number;
  settings: Settings;
  grid: GridSlot[];
  /** Public id of the host, whose own car is always linked. */
  host: string;
  /** Ids of guests whose game links are already open. */
  linked: string[];
}

export type ToWorker =
  | { t: 'start'; init: RaceInit }
  | { t: 'input'; id: string; s: unknown; q: unknown }
  | { t: 'link'; id: string; up: boolean }
  | { t: 'quit'; id: string }
  | { t: 'stop' };

export type FromWorker =
  /** A HostMsg as JSON, made once for every guest and the host's own page. */
  | { t: 'send'; data: string; reliable: boolean }
  /** A race snapshot, for every guest and the host's own page. */
  | { t: 'snap'; buf: ArrayBuffer }
  /** For the party server. */
  | { t: 'report'; msg: OverMsg }
  /** Every KEEPALIVE_MS while a race runs, so the page pings the party socket even when its own timers are slowed. */
  | { t: 'beat' };
