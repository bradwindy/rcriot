import { BOT_LEVELS } from '../shared/bot';
import { LAPS_MAX, type Settings } from '../shared/lobby';
import { NAME_MAX, type RoomMsg } from '../shared/protocol';
import { MAX_RACERS } from '../shared/race';
import { ROSTER } from '../shared/roster';
import { GOLD, GREEN, pixelLabel, RED, WHITE, type Fill } from './pixel';

const DIM: Fill = ['#c9c4dc', '#9a94b4', '#625c7c'];
const TRACK_NAMES: Record<Settings['track'], string> = { 'pirate-cove': 'PIRATE COVE' };

export interface LobbyEvents {
  settings(s: Partial<Settings>): void;
  rename(name: string): void;
  leave(): void;
}

interface Row {
  label: string;
  value: string;
  /** The setting one step down and one step up, or null at the end of its range. */
  steps: [Partial<Settings> | null, Partial<Settings> | null];
}

function rows(s: Settings): Row[] {
  const level = BOT_LEVELS.indexOf(s.level);
  return [
    { label: 'TRACK', value: TRACK_NAMES[s.track], steps: [null, null] },
    { label: 'LAPS', value: String(s.laps), steps: [s.laps > 1 ? { laps: s.laps - 1 } : null, s.laps < LAPS_MAX ? { laps: s.laps + 1 } : null] },
    { label: 'BOTS', value: String(s.bots), steps: [s.bots > 0 ? { bots: s.bots - 1 } : null, s.bots < MAX_RACERS - 1 ? { bots: s.bots + 1 } : null] },
    {
      label: 'BOT SKILL',
      value: s.level.toUpperCase(),
      steps: [level > 0 ? { level: BOT_LEVELS[level - 1] } : null, level < BOT_LEVELS.length - 1 ? { level: BOT_LEVELS[level + 1] } : null],
    },
    { label: 'ITEMS', value: s.items ? 'ON' : 'OFF', steps: [s.items ? { items: false } : null, s.items ? null : { items: true }] },
  ];
}

/**
 * The party panel beside the car select: the party code and link, who is in, and the race settings, which only the
 * host can change. Drawn in pixels through the CRT like the rest of the screen.
 */
export class LobbyPanel {
  private readonly root: HTMLElement;
  private shown = '';
  private editing = false;

  constructor(
    host: HTMLElement,
    private readonly on: LobbyEvents,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'lobby pixel-ghost';
    this.root.hidden = true;
    host.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** True while the name field has the keyboard, so game keys leave it alone. */
  get typing(): boolean {
    return this.editing;
  }

  hide(): void {
    this.root.hidden = true;
    this.shown = '';
  }

  show(code: string, room: RoomMsg | null, me: string, status: string): void {
    this.root.hidden = false;
    const key = JSON.stringify([code, room?.players, room?.settings, room?.host, room?.phase, me, status, innerWidth < innerHeight, innerWidth / innerHeight < 0.6]);
    if (key === this.shown || this.editing) return;
    this.shown = key;
    const host = room?.host === me;
    const everyone = room?.players ?? [];
    // Only so many rows fit, more on wide screens. You are always one of them.
    const narrow = innerWidth / innerHeight < 0.6;
    const fit = narrow ? 3 : innerWidth < innerHeight ? 4 : 8;
    const players = everyone.length <= fit ? everyone : [...everyone.filter((p) => p.id === me), ...everyone.filter((p) => p.id !== me)].slice(0, fit - 1);
    const more = everyone.length - players.length;
    const settings = room ? rows(room.settings) : [];
    this.root.innerHTML = `
      <div class="lobby-box" data-pixel>
        <div class="lobby-head"><span class="lobby-code"></span><button class="lobby-copy" data-pixel></button></div>
        <div class="lobby-sub"></div>
        <div class="lobby-players">
          ${players.map((p) => `<div class="lobby-row${p.id === me ? ' me' : ''}" ${p.id === me ? 'data-pixel' : ''}><span></span><span></span><span></span></div>`).join('')}
          ${more > 0 ? '<div class="lobby-more"></div>' : ''}
        </div>
        <div class="lobby-settings">
          ${settings.map(() => `<div class="lobby-set"><span></span><button data-pixel class="lobby-step"></button><span></span><button data-pixel class="lobby-step"></button></div>`).join('')}
        </div>
        <div class="lobby-actions">
          <button class="lobby-name" data-pixel></button>
          <button class="lobby-leave" data-pixel></button>
        </div>
        <input class="lobby-input" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" />
      </div>`;
    const at = (sel: string) => this.root.querySelector(sel) as HTMLElement;
    pixelLabel(at('.lobby-code'), `PARTY ${code}`, narrow ? 8 : 10, GOLD);
    pixelLabel(at('.lobby-copy'), narrow ? 'COPY' : 'COPY LINK', 7);
    const racing = room?.phase === 'race';
    const racer = room?.players.find((p) => p.id === me)?.slot ?? -1;
    const sub =
      status !== 'open'
        ? status.toUpperCase()
        : racing
          ? racer >= 0
            ? 'ESC OR MENU TO GO BACK'
            : 'WATCHING - YOU RACE NEXT TIME'
          : `RACERS ${Math.min(everyone.length, MAX_RACERS)}/${MAX_RACERS}`;
    const moreEl = this.root.querySelector<HTMLElement>('.lobby-more');
    if (moreEl) pixelLabel(moreEl, `+${more} MORE`, 7, DIM);
    pixelLabel(at('.lobby-sub'), sub, 7, status !== 'open' ? RED : DIM);
    this.root.querySelectorAll<HTMLElement>('.lobby-row').forEach((row, i) => {
      const p = players[i];
      const [name, car, ping] = row.querySelectorAll<HTMLElement>('span');
      const crown = p.id === room?.host ? '* ' : '';
      pixelLabel(name, `${crown}${p.name.toUpperCase()}`, 8, p.id === me ? GOLD : p.connected ? WHITE : DIM);
      pixelLabel(car, (ROSTER.find((m) => m.id === p.car)?.name ?? '').toUpperCase(), 7, DIM);
      const ms = p.id === room?.host ? 'HOST' : p.ping >= 0 ? `${p.ping}MS` : '...';
      pixelLabel(ping, ms, 7, p.ping >= 150 ? RED : p.id === room?.host || p.ping >= 0 ? GREEN : DIM);
    });
    this.root.querySelectorAll<HTMLElement>('.lobby-set').forEach((row, i) => {
      const r = settings[i];
      const [label, value] = row.querySelectorAll<HTMLElement>('span');
      const [down, up] = row.querySelectorAll<HTMLButtonElement>('button');
      pixelLabel(label, r.label, 7, DIM);
      pixelLabel(value, r.value, narrow ? 7 : 8);
      [down, up].forEach((b, k) => {
        const step = host && !racing ? r.steps[k] : null;
        b.disabled = !step;
        b.style.visibility = host && !racing && (r.steps[0] || r.steps[1]) ? 'visible' : 'hidden';
        pixelLabel(b, k ? '>' : '<', 8, step ? GOLD : DIM);
        if (step) b.addEventListener('click', () => this.on.settings(step));
      });
    });
    pixelLabel(at('.lobby-name'), 'NAME', 7);
    pixelLabel(at('.lobby-leave'), 'LEAVE', 7);
    at('.lobby-copy').addEventListener('click', () => void this.copy(code));
    at('.lobby-leave').addEventListener('click', () => this.on.leave());
    const input = at('.lobby-input') as HTMLInputElement;
    at('.lobby-name').addEventListener('click', () => {
      input.value = players.find((p) => p.id === me)?.name ?? '';
      this.editing = true;
      input.focus();
      input.select();
    });
    const nameLabel = this.root.querySelector<HTMLElement>('.lobby-row.me span');
    input.addEventListener('input', () => {
      if (nameLabel) pixelLabel(nameLabel, `${input.value.toUpperCase()}_`, 8, GOLD);
    });
    const done = (keep: boolean) => {
      if (!this.editing) return;
      this.editing = false;
      const name = input.value.trim();
      input.blur();
      if (keep && name) this.on.rename(name);
      this.shown = '';
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true));
  }

  private async copy(code: string): Promise<void> {
    const url = `${location.origin}/p/${code}`;
    const button = this.root.querySelector<HTMLElement>('.lobby-copy');
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'RC Riot', url });
      else await navigator.clipboard.writeText(url);
      if (button) pixelLabel(button, 'COPIED', 7, GREEN);
    } catch {
      // Share sheet closed, or no clipboard access.
    }
  }
}
