import './levels.css';
import { TRACK_INFO, trackInfo, WORLDS, type TrackId, type WorldId } from '../shared/tracks/info';
import {
  ArcadeScreen,
  bar,
  box,
  chevrons,
  chrome,
  DIM,
  drawChrome,
  easeBack,
  easeOut,
  every,
  FAINT,
  fit,
  PANEL,
  shine,
  text,
  textWidth,
  type Chrome,
} from './arcade';
import { bestLap } from './best';
import { bake, CAP, GOLD, INK, sprite, WHITE, type Fill, type Rect } from './pixel';

export interface LevelHooks {
  /** The menu blip, on every move. */
  select(): void;
  /** One lap of the track, in metres. */
  lengthOf(id: TrackId): number;
  /** Points round the track seen from above, for its map. Empty for no map. */
  outlineOf(id: TrackId): { x: number; z: number }[];
  /** Shows the track flying by behind the menu. */
  preview(id: TrackId): void;
}

/** Practice races the track picked. In a party the host picks the next race's track. */
export type LevelMode = 'practice' | 'party';

type Step = 'world' | 'track';
type Point = { x: number; z: number };

interface Look {
  /** The picked plate, the world's lettering and its map. */
  fill: Fill;
  /** The plates not picked. */
  dark: Fill;
  /** The block behind the world's chrome name. */
  back: [string, string];
}

/** Each world's colours. Stepping through the worlds recolours the screen's edges, plates and name. */
export const WORLD_LOOKS: Record<WorldId, Look> = {
  jungle: { fill: ['#d8ff8a', '#5ccf3a', '#1f7a2a'], dark: ['#3a7a2a', '#1a4a1a', '#0c260e'], back: ['#2a8a2e', '#0a2a10'] },
  horror: { fill: ['#e8c8ff', '#a060f0', '#4a1e8a'], dark: ['#5a3a8a', '#2e1a52', '#160c2a'], back: ['#6a3cc8', '#160a3a'] },
  planet: { fill: ['#c8dcff', '#4a7aff', '#1a2aa8'], dark: ['#2a4a9a', '#16245a', '#0a1030'], back: ['#2a5ad8', '#0a1448'] },
  monster: { fill: ['#ffb8a0', '#f0402a', '#8a1010'], dark: ['#8a2a1e', '#501010', '#280808'], back: ['#c8281c', '#3a0606'] },
  aklm: { fill: ['#ffc8f0', '#ff4ac0', '#a01a7a'], dark: ['#8a2a6e', '#521040', '#2a0822'], back: ['#c82a9a', '#3a0630'] },
  pirate: { fill: ['#b8fff0', '#2ac8b4', '#0a6a6a'], dark: ['#1a6a64', '#0e3c3a', '#06201e'], back: ['#1a8a8a', '#042a2e'] },
};

const TRACKS_OF = WORLDS.map((w) => TRACK_INFO.filter((t) => t.world === w.id));
const MOST_TRACKS = Math.max(...TRACKS_OF.map((t) => t.length));
const BAND = 'rgba(8, 6, 20, 0.55)';

const disc = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};

/** Rubs out instead of painting, for the holes in an emblem. */
function cut(g: CanvasRenderingContext2D, draw: () => void): void {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  draw();
  g.restore();
}

/** Each world's badge picture, drawn in white into an `s` pixel square. */
const EMBLEMS: Record<WorldId, (g: CanvasRenderingContext2D, s: number) => void> = {
  // A leaf and its vein.
  jungle: (g, s) => {
    g.beginPath();
    g.moveTo(s * 0.12, s * 0.9);
    g.quadraticCurveTo(s * 0.06, s * 0.14, s * 0.9, s * 0.08);
    g.quadraticCurveTo(s * 0.88, s * 0.86, s * 0.12, s * 0.9);
    g.fill();
    cut(g, () => {
      g.lineWidth = Math.max(1, s * 0.08);
      g.beginPath();
      g.moveTo(s * 0.18, s * 0.84);
      g.lineTo(s * 0.7, s * 0.3);
      g.stroke();
    });
  },
  // A crescent moon.
  horror: (g, s) => {
    disc(g, s * 0.48, s * 0.52, s * 0.42);
    cut(g, () => disc(g, s * 0.7, s * 0.36, s * 0.34));
  },
  // A planet with a ring passing in front of it.
  planet: (g, s) => {
    const ring = (from: number, width: number) => {
      g.lineWidth = width;
      g.beginPath();
      g.ellipse(s * 0.5, s * 0.52, s * 0.48, s * 0.15, -0.4, from, from + Math.PI);
      g.stroke();
    };
    ring(Math.PI, s * 0.09);
    disc(g, s * 0.5, s * 0.52, s * 0.29);
    cut(g, () => ring(0, s * 0.09 + 2));
    ring(0, s * 0.09);
  },
  // Three claw slashes.
  monster: (g, s) => {
    for (let i = 0; i < 3; i++) {
      const x = s * (0.3 + i * 0.22);
      g.beginPath();
      g.moveTo(x + s * 0.13, s * 0.06);
      g.lineTo(x + s * 0.03, s * 0.5);
      g.lineTo(x - s * 0.13, s * 0.94);
      g.lineTo(x - s * 0.07, s * 0.48);
      g.closePath();
      g.fill();
    }
  },
  // A film star.
  aklm: (g, s) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.21 : s * 0.5;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(s * 0.5 + Math.cos(a) * r, s * 0.54 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  },
  // A skull.
  pirate: (g, s) => {
    disc(g, s * 0.5, s * 0.42, s * 0.36);
    g.fillRect(s * 0.3, s * 0.56, s * 0.4, s * 0.34);
    cut(g, () => {
      disc(g, s * 0.36, s * 0.46, s * 0.11);
      disc(g, s * 0.64, s * 0.46, s * 0.11);
      const tooth = Math.max(1, Math.round(s * 0.05));
      g.fillRect(Math.round(s * 0.44), Math.round(s * 0.76), tooth, s);
      g.fillRect(Math.round(s * 0.56) - tooth, Math.round(s * 0.76), tooth, s);
    });
  },
};

const emblems = new Map<string, HTMLCanvasElement>();

/** A world's picture in one colour with a dark outline, baked once per size and colour. */
function emblem(world: WorldId, size: number, color: string): HTMLCanvasElement {
  const key = `${world}|${size}|${color}`;
  const known = emblems.get(key);
  if (known) return known;
  const [mask, m] = sprite(size, size);
  m.fillStyle = m.strokeStyle = '#ffffff';
  m.lineCap = 'round';
  EMBLEMS[world](m, size);
  const shape = m.getImageData(0, 0, size, size);
  for (let i = 3; i < shape.data.length; i += 4) shape.data[i] = shape.data[i] < 110 ? 0 : 255;
  m.putImageData(shape, 0, 0);
  const tint = (c: string) => {
    const [canvas, g] = sprite(size, size);
    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = c;
    g.fillRect(0, 0, size, size);
    return canvas;
  };
  const [canvas, g] = sprite(size + 2, size + 2);
  const ink = tint(INK);
  for (let dy = 0; dy <= 2; dy++) for (let dx = 0; dx <= 2; dx++) g.drawImage(ink, dx, dy);
  g.drawImage(tint(color), 1, 1);
  bake(canvas, false);
  emblems.set(key, canvas);
  return canvas;
}

const chromes = new Map<string, Chrome>();

/** A world's name in chrome on a block of its own colour, baked once per size. */
function named(str: string, size: number, look: Look): Chrome {
  const key = `${str}|${size}|${look.back[0]}`;
  let c = chromes.get(key);
  if (!c) {
    c = chrome(str, size, undefined, look.back);
    chromes.set(key, c);
  }
  return c;
}

/** A small gold arrow pointing down at the picked plate. */
function marker(): HTMLCanvasElement {
  const [canvas, g] = sprite(11, 7);
  for (let r = 0; r < 6; r++) {
    g.fillStyle = INK;
    g.fillRect(r, r, 11 - r * 2, 1);
    g.fillStyle = r < 2 ? GOLD[0] : GOLD[1];
    if (r > 0) g.fillRect(r + 1, r, 9 - r * 2, 1);
  }
  g.fillStyle = INK;
  g.fillRect(5, 6, 1, 1);
  return canvas;
}

interface TrackMap {
  canvas: HTMLCanvasElement;
  /** The line on the canvas, with the distance round to each point, for the dot that laps it. */
  path: { x: number; y: number; d: number }[];
  length: number;
}

/** The track from above as a thick line in its world's colour, like the race map. */
function trackMap(points: Point[], size: number, line: string): TrackMap {
  let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const rim = Math.max(4, Math.round(size * 0.12));
  const margin = Math.ceil(rim / 2) + 2;
  const scale = (size - margin * 2) / (Math.max(maxX - minX, maxZ - minZ) || 1);
  const offX = (size - (maxX - minX) * scale) / 2;
  const offZ = (size - (maxZ - minZ) * scale) / 2;
  const path: TrackMap['path'] = [];
  let d = 0;
  for (const p of points) {
    const x = offX + (p.x - minX) * scale;
    const y = offZ + (p.z - minZ) * scale;
    const prev = path[path.length - 1];
    if (prev) d += Math.hypot(x - prev.x, y - prev.y);
    path.push({ x, y, d });
  }
  const [canvas, g] = sprite(size, size);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  for (const p of path) g.lineTo(p.x, p.y);
  g.closePath();
  g.strokeStyle = INK;
  g.lineWidth = rim;
  g.stroke();
  g.strokeStyle = line;
  g.lineWidth = rim - 2;
  g.stroke();
  bake(canvas);
  return { canvas, path, length: d + Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A lap as MM:SS.cc, or dashes when there is none. */
function lapTime(seconds: number | null): string {
  if (seconds === null) return '--:--.--';
  const cs = Math.round(Math.min(5999.99, seconds) * 100);
  return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Layout {
  narrow: boolean;
  m: number;
  back: Rect;
  captionY: number;
  /** Each world's name in chrome: one line, or two on narrow screens. */
  names: Chrome[][];
  nameTop: number;
  linePitch: number;
  /** Baseline of the world's track names, under its name. One line, or one per track. */
  listY: number;
  listStacked: boolean;
  /** Bottom of the dark band behind the header, on each step. */
  headWorld: number;
  headTrack: number;
  badges: Rect[];
  /** The track plates for a world of one track, of two, and so on. */
  cards: Rect[][];
  cardSize: number;
  /** The info card's left edge and width. Wide screens centre it on infoMid, narrow ones stand it on the plates. */
  infoX: number;
  infoW: number;
  infoMid: number;
  infoPad: number;
  mapSize: number;
  go: Rect;
  hintLines: number;
  hintY: number;
}

/**
 * The level select, world first and then track like RC Revenge's, in the title's arcade style. Dark bands top and
 * bottom hold the menu and leave the middle clear for the track flying by behind it. The worlds are plates with a
 * picture each. Picking one slides its tracks in, with the highlighted track's length, best lap and map.
 */
export class LevelSelect extends ArcadeScreen {
  /** A track was picked. */
  onPick: (id: TrackId) => void = () => undefined;
  /** Back out of the first step. */
  onBack: () => void = () => undefined;
  private mode: LevelMode = 'practice';
  private step: Step = 'world';
  private world = 0;
  private track = 0;
  /** The track to highlight on entering a world, if it is in that world. */
  private chosen: TrackId = TRACK_INFO[0].id;
  private previewed: TrackId | null = null;
  private shownAt = 0;
  private stepAt = 0;
  private worldAt = 0;
  private worldDir = 1;
  private lastWorld = 0;
  private trackAt = 0;
  private trackDir = 1;
  /** Where the world marker and the track chevrons glide from. */
  private markFrom: { x: number; y: number } | null = null;
  private chevronFrom: Rect | null = null;
  private L: Layout | null = null;
  private readonly arrow = marker();
  private readonly outlines = new Map<TrackId, Point[]>();
  private readonly lengths = new Map<TrackId, number>();
  private readonly maps = new Map<string, TrackMap>();
  private readonly backHit: HTMLButtonElement;
  private readonly worldHits: HTMLButtonElement[];
  private readonly trackHits: HTMLButtonElement[];
  private readonly goHit: HTMLButtonElement;

  constructor(
    host: HTMLElement,
    private readonly hooks: LevelHooks,
  ) {
    super(host, 'levels');
    this.backHit = this.button('Back', () => this.back());
    this.worldHits = WORLDS.map((w, i) => this.button(w.name, () => this.tap('world', i)));
    this.trackHits = Array.from({ length: MOST_TRACKS }, (_, i) => this.button('Track', () => this.tap('track', i)));
    this.goHit = this.button('Go', () => {
      if (!this.settling()) this.confirm();
    });
    // The mouse highlights what it moves onto. Plates sliding in under a still cursor don't count as a move.
    let mouse = '';
    addEventListener('pointermove', (e) => {
      const at = `${e.clientX},${e.clientY}`;
      const moved = at !== mouse;
      mouse = at;
      if (!moved || e.pointerType !== 'mouse' || !this.open) return;
      const w = this.worldHits.indexOf(e.target as HTMLButtonElement);
      const k = this.trackHits.indexOf(e.target as HTMLButtonElement);
      if (this.step === 'world' && w >= 0 && w !== this.world) this.toWorld(w, Math.sign(w - this.world));
      if (this.step === 'track' && k >= 0 && k !== this.track) this.toTrack(k, Math.sign(k - this.track));
    });
  }

  /** Opens on the world of `current`, ready to pick that track again. */
  show(current: TrackId, mode: LevelMode): void {
    const info = trackInfo(current);
    const now = performance.now() / 1000;
    this.mode = mode;
    this.chosen = info.id;
    this.world = this.lastWorld = Math.max(0, WORLDS.findIndex((w) => w.id === info.world));
    this.track = Math.max(0, TRACKS_OF[this.world].findIndex((t) => t.id === info.id));
    this.step = 'world';
    this.shownAt = this.worldAt = now;
    this.stepAt = this.trackAt = now - 10;
    this.markFrom = this.chevronFrom = null;
    this.previewed = null;
    this.reveal();
    this.sync();
    this.preview();
  }

  /** A key press from the game's keyboard handler. */
  key(code: string): void {
    if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') this.move(-1);
    if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') this.move(1);
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.confirm();
    if (code === 'Escape' || code === 'Backspace') this.back();
  }

  private get picked(): TrackId {
    return TRACKS_OF[this.world][this.track].id;
  }

  private move(dir: number): void {
    if (this.step === 'world') this.toWorld((this.world + dir + WORLDS.length) % WORLDS.length, dir);
    else {
      const count = TRACKS_OF[this.world].length;
      if (count > 1) this.toTrack((this.track + dir + count) % count, dir);
    }
  }

  private toWorld(i: number, dir: number): void {
    const now = performance.now() / 1000;
    this.markFrom = this.markAt(now);
    this.lastWorld = this.world;
    this.world = i;
    this.worldAt = now;
    this.worldDir = dir || 1;
    this.track = Math.max(0, TRACKS_OF[i].findIndex((t) => t.id === this.chosen));
    this.hooks.select();
    this.sync();
    this.preview();
  }

  private toTrack(k: number, dir: number): void {
    const now = performance.now() / 1000;
    this.chevronFrom = this.chevronAt(now);
    this.track = k;
    this.trackAt = now;
    this.trackDir = dir || 1;
    this.chosen = this.picked;
    this.hooks.select();
    this.preview();
  }

  /** A tap or click on a plate: the first picks it, a second on the same one goes on. */
  private tap(step: Step, i: number): void {
    if (this.step !== step || this.settling()) return;
    if (i !== (step === 'world' ? this.world : this.track)) {
      if (step === 'world') this.toWorld(i, Math.sign(i - this.world));
      else this.toTrack(i, Math.sign(i - this.track));
    } else this.confirm();
  }

  /** True just after the screen opens or changes step, so a double tap can't carry through to what slides in. */
  private settling(): boolean {
    return performance.now() / 1000 - Math.max(this.shownAt, this.stepAt) < 0.3;
  }

  private confirm(): void {
    this.hooks.select();
    if (this.step === 'track') {
      this.onPick(this.picked);
      return;
    }
    this.step = 'track';
    this.stepAt = performance.now() / 1000;
    this.chevronFrom = null;
    this.chosen = this.picked;
    this.sync();
  }

  private back(): void {
    this.hooks.select();
    if (this.step === 'world') {
      this.onBack();
      return;
    }
    this.step = 'world';
    this.stepAt = performance.now() / 1000;
    this.markFrom = null;
    this.sync();
  }

  private preview(): void {
    if (this.picked === this.previewed) return;
    this.previewed = this.picked;
    this.hooks.preview(this.picked);
  }

  private outline(id: TrackId): Point[] {
    let points = this.outlines.get(id);
    if (!points) {
      points = this.hooks.outlineOf(id);
      this.outlines.set(id, points);
    }
    return points;
  }

  private lengthOf(id: TrackId): number {
    let length = this.lengths.get(id);
    if (length === undefined) {
      length = this.hooks.lengthOf(id);
      this.lengths.set(id, length);
    }
    return length;
  }

  private mapOf(id: TrackId, size: number): TrackMap | null {
    const points = this.outline(id);
    if (points.length < 3) return null;
    const key = `${id}|${size}`;
    let map = this.maps.get(key);
    if (!map) {
      map = trackMap(points, size, WORLD_LOOKS[trackInfo(id).world].fill[0]);
      this.maps.set(key, map);
    }
    return map;
  }

  /** Shows the controls of the current step, over where they are drawn. */
  private sync(): void {
    const worlds = this.step === 'world';
    const tracks = TRACKS_OF[this.world];
    this.worldHits.forEach((b) => (b.hidden = !worlds));
    this.trackHits.forEach((b, i) => {
      b.hidden = worlds || i >= tracks.length;
      if (tracks[i]) b.setAttribute('aria-label', tracks[i].name);
    });
    this.goHit.setAttribute('aria-label', this.goLabel());
    const L = this.L;
    if (!L) return;
    this.place(this.backHit, L.back.x - 3, L.back.y - 3, L.back.w + 6, L.back.h + 6);
    L.badges.forEach((r, i) => this.place(this.worldHits[i], r.x - 2, r.y - 5, r.w + 4, r.h + 7));
    L.cards[tracks.length - 1].forEach((r, i) => this.place(this.trackHits[i], r.x - 4, r.y - 2, r.w + 8, r.h + 4));
    this.place(this.goHit, L.go.x - 4, L.go.y - 3, L.go.w + 8, L.go.h + 6);
  }

  private goLabel(): string {
    if (this.step === 'world') return 'SELECT';
    return this.mode === 'party' ? 'PICK TRACK' : 'RACE!';
  }

  private hints(): string[] {
    return ['ARROWS MOVE', this.step === 'track' && this.mode === 'practice' ? 'ENTER RACE' : 'ENTER PICK', 'ESC BACK'];
  }

  protected layout(): void {
    const { W, H, touch } = this;
    const narrow = W < 200;
    const m = narrow ? 3 : 6;
    const back = { x: m, y: m, w: textWidth('< BACK', 7) + 10, h: touch ? 15 : 13 };

    // The header: what to pick, then the world's name in chrome, sized so the longest name fits. Wide screens keep it
    // clear of the back button and the effects toggle in the corners.
    const captionY = (narrow ? back.y + back.h + 3 : m) + Math.round(8 * CAP);
    const nameTop = captionY + 3;
    const room = narrow ? W - 2 * m : W - 2 * (m + 52);
    const lines = WORLDS.map((w) => {
      const [first, ...rest] = w.name.split(' ');
      return narrow && rest.length ? [first, rest.join(' ')] : [w.name];
    });
    const widest = lines.flat().reduce((a, b) => (textWidth(b, 12) > textWidth(a, 12) ? b : a));
    let size = narrow ? 17 : 24;
    for (let c = chrome(widest, size); c.width > room && size > 10; c = chrome(widest, size)) {
      size = Math.max(10, Math.min(size - 1, Math.floor((size * room) / c.width)));
    }
    const names = WORLDS.map((w, i) => lines[i].map((s) => named(s, size, WORLD_LOOKS[w.id])));
    const linePitch = Math.round(size * CAP) + 4;
    const nameBottom = nameTop + Math.max(...names.map((n) => (n.length - 1) * linePitch + n[0].height)) - 2;
    const listStacked = TRACKS_OF.some((ts) => textWidth(ts.map((t) => t.name).join('   '), 7) > W - 2 * m);
    const listY = nameBottom + 7;

    // The foot: hints for keyboards, the go button, and the plates above it.
    const hints = this.hints();
    const hintLines = touch ? 0 : textWidth(hints.join('   '), 7) <= W - 8 ? 1 : hints.length;
    const hintY = H - (narrow ? 4 : 5);
    const goH = touch ? 17 : 15;
    const goTop = hintLines ? hintY - (hintLines - 1) * 9 - 7 - 6 - goH : H - m - goH - (narrow ? 0 : 2);
    const goW = Math.min(W - 2 * m - 24, Math.max(...['SELECT', this.mode === 'party' ? 'PICK TRACK' : 'RACE!'].map((s) => textWidth(s, 9))) + 28);
    const plates = goTop - 8;

    const cols = narrow ? 3 : WORLDS.length;
    const rows = Math.ceil(WORLDS.length / cols);
    const gap = narrow ? 5 : 7;
    const rowGap = 13;
    const bw = Math.min(narrow ? 34 : 50, Math.floor((W - 2 * m - 4 - (cols - 1) * gap) / cols));
    const bh = Math.round(bw * (narrow ? 0.72 : 0.62));
    const gridTop = plates - rows * bh - (rows - 1) * rowGap;
    const gridLeft = Math.round(W / 2 - (cols * bw + (cols - 1) * gap) / 2);
    const badges = WORLDS.map((_, i) => ({ x: gridLeft + (i % cols) * (bw + gap), y: gridTop + Math.floor(i / cols) * (bh + rowGap), w: bw, h: bh }));

    // Track plates: side by side on wide screens with room for the chevrons between, stacked on narrow ones.
    const cardH = narrow ? 16 : touch ? 22 : 20;
    const cardGap = narrow ? 5 : 32;
    const cardW = narrow ? W - 2 * m - 26 : Math.min(140, Math.floor((W - 2 * m - cardGap - 36) / 2));
    const cards = Array.from({ length: MOST_TRACKS }, (_, n) =>
      Array.from({ length: n + 1 }, (_, i) =>
        narrow
          ? { x: Math.round(W / 2 - cardW / 2), y: plates - (n + 1 - i) * cardH - (n - i) * cardGap, w: cardW, h: cardH }
          : { x: Math.round(W / 2 - ((n + 1) * cardW + n * cardGap) / 2) + i * (cardW + cardGap), y: plates - cardH, w: cardW, h: cardH },
      ),
    );
    const cardsTop = Math.min(...cards.flat().map((r) => r.y));

    const infoW = narrow ? W - 2 * m : Math.max(108, Math.min(150, Math.round(W * 0.3)));
    this.L = {
      narrow,
      m,
      back,
      captionY,
      names,
      nameTop,
      linePitch,
      listY,
      listStacked,
      headWorld: listY + (listStacked ? MOST_TRACKS - 1 : 0) * 9 + 7,
      headTrack: nameBottom + 5,
      badges,
      cards,
      cardSize: narrow ? 8 : 9,
      infoX: W - m - infoW,
      infoW,
      infoMid: Math.round((nameBottom + 5 + cardsTop) / 2),
      infoPad: narrow ? 4 : 5,
      mapSize: narrow ? 34 : 44,
      go: { x: Math.round(W / 2 - goW / 2), y: goTop, w: goW, h: goH },
      hintLines,
      hintY,
    };
    this.sync();
  }

  /** The info card's box. Narrow screens leave out the name and world, which the plate and header already show. */
  private infoRect(L: Layout, map: boolean): Rect {
    const body = map ? Math.max(L.mapSize, 34) : 18;
    const head = L.narrow ? 0 : Math.round(10 * CAP) + 13;
    const h = L.infoPad * 2 + head + body;
    const plates = Math.min(...L.cards[TRACKS_OF[this.world].length - 1].map((r) => r.y));
    return { x: L.infoX, y: L.narrow ? plates - 6 - h : Math.round(L.infoMid - h / 2), w: L.infoW, h };
  }

  /** How far through the slide to the track step: 0 on the world step, 1 on the track step. */
  private toTracks(t: number): number {
    const p = easeOut((t - this.stepAt) / 0.32);
    return this.step === 'track' ? p : 1 - p;
  }

  private markAt(t: number): { x: number; y: number } {
    const L = this.L as Layout;
    const b = L.badges[this.world];
    const to = { x: b.x + Math.round(b.w / 2), y: b.y };
    if (!this.markFrom) return to;
    const p = easeOut((t - this.worldAt) / 0.12);
    return { x: Math.round(lerp(this.markFrom.x, to.x, p)), y: Math.round(lerp(this.markFrom.y, to.y, p)) };
  }

  private chevronAt(t: number): Rect {
    const L = this.L as Layout;
    const to = L.cards[TRACKS_OF[this.world].length - 1][this.track];
    const from = this.chevronFrom;
    if (!from) return to;
    const p = easeOut((t - this.trackAt) / 0.12);
    return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p), w: lerp(from.w, to.w, p), h: to.h };
  }

  protected draw(t: number): void {
    const L = this.L;
    if (!L) return;
    const s = this.toTracks(t);
    this.drawBands(L, t, s);
    this.drawHeader(L, t, s);
    if (s < 1) this.drawWorlds(L, t, -Math.round(s * this.W));
    if (s > 0) {
      this.drawTracks(L, t, Math.round((1 - s) * this.W));
      this.drawInfo(L, t, s);
    }
    this.drawFoot(L, t);
  }

  /**
   * Letterbox bands behind the header and the plates, edged in the world's colour. A new colour wipes in from the side
   * moved to.
   */
  private drawBands(L: Layout, t: number, s: number): void {
    const { ctx, W, H } = this;
    const rise = this.rise(t, 0);
    const top = Math.round(lerp(L.headWorld, L.headTrack, s)) - rise;
    const map = L.narrow && this.mapOf(this.picked, L.mapSize) !== null;
    const bottomTrack = L.narrow ? this.infoRect(L, map).y - 5 : Math.min(...L.cards[TRACKS_OF[this.world].length - 1].map((r) => r.y)) - 8;
    const bottom = Math.round(lerp(L.badges[0].y - 11, bottomTrack, s)) + rise;
    ctx.fillStyle = BAND;
    ctx.fillRect(0, 0, W, top);
    ctx.fillRect(0, bottom, W, H - bottom);
    const wipe = Math.round(easeOut((t - this.worldAt) / 0.3) * W);
    const now = WORLD_LOOKS[WORLDS[this.world].id].fill;
    const was = WORLD_LOOKS[WORLDS[this.lastWorld].id].fill;
    for (const y of [top, bottom - 2]) {
      ctx.fillStyle = INK;
      ctx.fillRect(0, y === top ? y + 2 : y - 1, W, 1);
      for (const [fill, x, w] of [
        [was, 0, W],
        [now, this.worldDir > 0 ? W - wipe : 0, wipe],
      ] as const) {
        ctx.fillStyle = fill[0];
        ctx.fillRect(x, y, w, 1);
        ctx.fillStyle = fill[1];
        ctx.fillRect(x, y + 1, w, 1);
      }
    }
  }

  /** How far the menu still has to slide in from the top and bottom edges as the screen opens. */
  private rise(t: number, delay: number): number {
    return Math.round((1 - easeOut((t - this.shownAt - delay) / 0.3)) * 60);
  }

  private drawHeader(L: Layout, t: number, s: number): void {
    const { ctx, W } = this;
    const drop = this.rise(t, 0);
    const caption = this.step === 'world' ? 'SELECT WORLD' : 'SELECT TRACK';
    const pop = Math.round((1 - easeBack((t - this.stepAt) / 0.3)) * 5);
    text(ctx, caption, W / 2, L.captionY - pop - drop, 8, GOLD, 'center');

    box(ctx, L.back.x, L.back.y - drop, L.back.w, L.back.h);
    text(ctx, '< BACK', L.back.x + L.back.w / 2 + 1, L.back.y - drop + Math.round((L.back.h + 7 * CAP) / 2), 7, WHITE, 'center');

    // The world's name slides in from the side moved to, with a glint across it.
    const dx = Math.round((1 - easeOut((t - this.worldAt) / 0.22)) * this.worldDir * 28);
    const since = t - this.worldAt;
    const glint = since < 0.6 ? since / 0.6 : every(t, 4, 0.6);
    L.names[this.world].forEach((c, i) => {
      drawChrome(ctx, c, Math.round(W / 2 - c.width / 2 + 2) + dx, L.nameTop + i * L.linePitch - drop, glint);
    });

    // The world's tracks under its name, the one that would be raced in white.
    if (s >= 1) return;
    const tracks = TRACKS_OF[this.world];
    const shift = dx - Math.round(s * W);
    const gap = textWidth('   ', 7);
    const total = tracks.reduce((sum, tr) => sum + textWidth(tr.name, 7), 0) + gap * (tracks.length - 1);
    let x = W / 2 - total / 2;
    tracks.forEach((tr, i) => {
      const fill = i === this.track ? WHITE : DIM;
      if (L.listStacked) text(ctx, tr.name, W / 2 + shift, L.listY + i * 9 - drop, 7, fill, 'center');
      else x += text(ctx, tr.name, x + shift, L.listY - drop, 7, fill) + gap;
    });
  }

  private drawWorlds(L: Layout, t: number, dx: number): void {
    const ctx = this.ctx;
    const blink = Math.floor(t * 2.5) % 2 === 0;
    WORLDS.forEach((w, i) => {
      const b = L.badges[i];
      const look = WORLD_LOOKS[w.id];
      const on = i === this.world;
      const rise = this.rise(t, 0.05 + i * 0.04);
      const lift = on ? Math.round(easeBack((t - this.worldAt) / 0.25) * 3) : 0;
      const x = b.x + dx;
      const y = b.y + rise - lift;
      if (on) ctx.drawImage(bar(b.w + 2, b.h + 2, blink ? WHITE : GOLD), x - 1, y - 1);
      ctx.drawImage(bar(b.w, b.h, on ? look.fill : look.dark), x, y);
      const art = emblem(w.id, Math.round(b.h * 0.7), on ? '#ffffff' : look.fill[1]);
      ctx.drawImage(art, Math.round(x + b.w / 2 - art.width / 2), Math.round(y + b.h / 2 - art.height / 2));
    });
    const at = this.markAt(t);
    const bob = Math.round((Math.sin(t * 6) + 1) * 0.75);
    ctx.drawImage(this.arrow, at.x - 5 + dx, at.y - 4 - 7 - bob + this.rise(t, 0.05 + this.world * 0.04));
  }

  private drawTracks(L: Layout, t: number, dx: number): void {
    const ctx = this.ctx;
    const tracks = TRACKS_OF[this.world];
    const look = WORLD_LOOKS[WORLDS[this.world].id];
    const rects = L.cards[tracks.length - 1];
    tracks.forEach((tr, i) => {
      const r = rects[i];
      const on = i === this.track;
      const x = r.x + dx;
      ctx.drawImage(bar(r.w, r.h, on ? look.fill : look.dark), x, r.y);
      if (on) shine(ctx, x, r.y, r.w, r.h, every(t, 1.8, 0.45));
      const size = L.cardSize;
      text(ctx, fit(tr.name, size, r.w - r.h), x + r.w / 2 + 1, r.y + Math.round((r.h + size * CAP) / 2), size, on ? WHITE : DIM, 'center');
    });
    const c = this.chevronAt(t);
    chevrons(ctx, Math.round(c.x) + dx, Math.round(c.x + c.w) + dx, Math.round(c.y + c.h / 2), Math.round(c.h * 0.7), t);
  }

  private drawInfo(L: Layout, t: number, s: number): void {
    const ctx = this.ctx;
    const id = this.picked;
    const info = trackInfo(id);
    const look = WORLD_LOOKS[info.world];
    const map = this.mapOf(id, L.mapSize);
    const r = this.infoRect(L, map !== null);
    const x = r.x + Math.round((1 - s) * (this.W - r.x + 4));
    box(ctx, x, r.y, r.w, r.h, PANEL, look.fill[1]);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, r.y + 1, r.w - 2, r.h - 2);
    ctx.clip();
    const p = L.infoPad;
    const left = x + p + Math.round((1 - easeOut((t - this.trackAt) / 0.18)) * this.trackDir * 12);
    const right = x + r.w - p;
    let top = r.y + p;
    if (!L.narrow) {
      const nameY = top + Math.round(10 * CAP);
      text(ctx, fit(info.name, 10, r.w - p * 2), left, nameY, 10, WHITE);
      text(ctx, fit(WORLDS.find((w) => w.id === info.world)?.name ?? '', 7, r.w - p * 2), left, nameY + 9, 7, look.fill);
      top = nameY + 13;
    }
    const length = `${Math.round(this.lengthOf(id))} M`;
    const best = bestLap(id);
    const lap = lapTime(best);
    if (map) {
      ctx.drawImage(map.canvas, left, top);
      this.drawDot(map, left, top, t);
      const sx = left + L.mapSize + 5;
      text(ctx, 'LENGTH', sx, top + 6, 7, GOLD);
      text(ctx, length, sx, top + 15, 8, WHITE);
      text(ctx, 'BEST LAP', sx, top + 25, 7, GOLD);
      text(ctx, lap, sx, top + 34, 8, best === null ? DIM : WHITE);
    } else {
      text(ctx, 'LENGTH', left, top + 6, 7, GOLD);
      text(ctx, length, right, top + 6, 8, WHITE, 'right');
      text(ctx, 'BEST LAP', left, top + 16, 7, GOLD);
      text(ctx, lap, right, top + 16, 8, best === null ? DIM : WHITE, 'right');
    }
    ctx.restore();
  }

  /** A white dot lapping the map. */
  private drawDot(map: TrackMap, x: number, y: number, t: number): void {
    const d = ((t * 0.15) % 1) * map.length;
    const path = map.path;
    let i = 1;
    while (i < path.length && path[i].d < d) i++;
    const a = path[i - 1];
    const b = path[i % path.length];
    const span = (i < path.length ? b.d : map.length) - a.d;
    const f = span > 0 ? (d - a.d) / span : 0;
    const cx = Math.round(x + lerp(a.x, b.x, f));
    const cy = Math.round(y + lerp(a.y, b.y, f));
    this.ctx.fillStyle = INK;
    this.ctx.fillRect(cx - 2, cy - 2, 5, 5);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(cx - 1, cy - 1, 3, 3);
  }

  private drawFoot(L: Layout, t: number): void {
    const ctx = this.ctx;
    const rise = this.rise(t, 0.1);
    const g = L.go;
    ctx.drawImage(bar(g.w, g.h), g.x, g.y + rise);
    shine(ctx, g.x, g.y + rise, g.w, g.h, every(t, 1.8, 0.45));
    text(ctx, this.goLabel(), this.W / 2 + 1, g.y + rise + Math.round((g.h + 9 * CAP) / 2), 9, WHITE, 'center');
    if (!L.hintLines) return;
    const hints = this.hints();
    const lines = L.hintLines === 1 ? [hints.join('   ')] : hints;
    lines.forEach((str, i) => text(ctx, str, this.W / 2, L.hintY - (lines.length - 1 - i) * 9 + rise, 7, FAINT, 'center'));
  }
}
