import type { Track } from '../shared/track';
import './hud.css';
import { bake, CAP, drawGlyph, drawPage, FONT, GOLD, GREEN, post, RED, setPixelScale, sprite, WHITE, type Fill, type Glyph, type Rect } from './pixel';

export interface HudFrame {
  /** 1-based race position. */
  place: number;
  /** Cars in the race. */
  total: number;
  /** Lap to show, 1-based, and how many the race has. Infinity for a race with no end. */
  lap: number;
  laps: number;
  /** Seconds into the current lap. */
  lapTime: number;
  /** Best lap in seconds, or null before there is one. */
  bestLap: number | null;
  /** Share of top speed, 0 to 1, for the arc. */
  speed: number;
  /** Whole number for the digits. */
  speedValue: number;
  /** World positions for the map. */
  cars: { x: number; z: number; me: boolean; color: string }[];
  /** Name tags over other people's cars, in normalised device coordinates. */
  tags: { x: number; y: number; name: string }[];
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Seconds as MM:SS.T, like the original's lap clock. */
function clock(seconds: number): string {
  const tenths = Math.floor(Math.min(5999.9, Math.max(0, seconds)) * 10);
  return `${pad(Math.floor(tenths / 600))}:${pad(Math.floor(tenths / 10) % 60)}.${tenths % 10}`;
}

const RAMP: [number, number, number][] = [
  [112, 12, 12],
  [214, 36, 12],
  [255, 140, 20],
  [255, 228, 60],
  [255, 255, 255],
];

function ramp(t: number): [number, number, number] {
  const at = t * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(at));
  const f = at - i;
  const [a, b] = [RAMP[i], RAMP[i + 1]];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const SEGMENTS = 15;
const SWEEP = 210;
/** Where the arc begins at low speed, in degrees clockwise from the top. It runs anticlockwise from there. */
const START = 227;
const DARK_RGB = [24, 10, 4];

/**
 * The speedometer arc: chunky bar segments from the lower left, round the right side and up to the top. Every pixel is
 * worked out once at the size it is shown, with PS1 colour and dither, so lighting segments is only a copy.
 */
class Gauge {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  /** Segment each pixel belongs to, or -1 outside the arc. */
  private readonly segment: Int8Array;
  private readonly on: Uint8ClampedArray;
  private readonly off: Uint8ClampedArray;
  private lit = -1;

  constructor(readonly size: number) {
    [this.canvas, this.ctx] = sprite(size, size);
    this.image = this.ctx.createImageData(size, size);
    this.segment = new Int8Array(size * size).fill(-1);
    this.on = new Uint8ClampedArray(size * size * 4);
    this.off = new Uint8ClampedArray(size * size * 4);
    const outer = size * 0.495;
    const inner = size * 0.278;
    const sweep = (SWEEP * Math.PI) / 180;
    const gap = Math.min(0.5, 1.3 / ((inner * sweep) / SEGMENTS));
    const colors = Array.from({ length: SEGMENTS }, (_, i) => ramp(i / (SEGMENTS - 1)));
    const mid = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - mid;
        const dy = y + 0.5 - mid;
        const r = Math.hypot(dx, dy);
        const angle = (((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360;
        const t = (START - angle) / SWEEP;
        if (r < inner || r > outer || t < 0 || t >= 1) continue;
        const p = y * size + x;
        const at = t * SEGMENTS;
        const i = Math.floor(at);
        const frac = at - i;
        this.segment[p] = i;
        const rim = r < inner + 1 || r > outer - 1 || frac < gap / 2 || frac > 1 - gap / 2;
        const shade = 0.78 + 0.3 * ((r - inner) / (outer - inner));
        for (let c = 0; c < 3; c++) {
          const base = rim ? DARK_RGB[c] : colors[i][c] * shade;
          this.on[p * 4 + c] = post(base, x, y);
          this.off[p * 4 + c] = post(rim ? base : base * 0.4, x, y);
        }
        this.on[p * 4 + 3] = 255;
        this.off[p * 4 + 3] = 120;
      }
    }
  }

  /** Lights the segments up to a share of top speed. Only repaints when the count changes. */
  set(share: number): void {
    const lit = Math.round(Math.min(1, Math.max(0, share)) * SEGMENTS);
    if (lit === this.lit) return;
    this.lit = lit;
    const out = this.image.data;
    for (let p = 0; p < this.segment.length; p++) {
      const src = this.segment[p] < lit ? this.on : this.off;
      const o = p * 4;
      out[o] = src[o];
      out[o + 1] = src[o + 1];
      out[o + 2] = src[o + 2];
      out[o + 3] = src[o + 3];
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}

const DARK = '#1a1006';

/** The track as a thick pale line, baked once. Cars are dots over it. */
class TrackMap {
  private readonly base: HTMLCanvasElement;
  private readonly minX: number;
  private readonly minZ: number;
  private readonly scale: number;
  private readonly offX: number;
  private readonly offZ: number;

  constructor(
    readonly size: number,
    lines: { x: number; z: number }[][],
  ) {
    const outline = lines.flat();
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of outline) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const rim = Math.max(3, Math.round(size * 0.075));
    const margin = Math.ceil(rim / 2) + 2;
    this.minX = minX;
    this.minZ = minZ;
    this.scale = (size - margin * 2) / (Math.max(maxX - minX, maxZ - minZ) || 1);
    this.offX = (size - (maxX - minX) * this.scale) / 2;
    this.offZ = (size - (maxZ - minZ) * this.scale) / 2;

    const [base, g] = sprite(size, size);
    this.base = base;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    // The main loop closes. A fork is an open line from where it leaves to where it joins.
    lines.forEach((line, k) => {
      line.forEach((p, i) => {
        if (i === 0) g.moveTo(this.px(p.x), this.pz(p.z));
        else g.lineTo(this.px(p.x), this.pz(p.z));
      });
      if (k === 0) g.closePath();
    });
    g.strokeStyle = DARK;
    g.lineWidth = rim;
    g.stroke();
    g.strokeStyle = '#ece2c8';
    g.lineWidth = rim - 2;
    g.stroke();
    bake(base);
  }

  private px(x: number): number {
    return this.offX + (x - this.minX) * this.scale;
  }

  private pz(z: number): number {
    return this.offZ + (z - this.minZ) * this.scale;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, cars: HudFrame['cars']): void {
    ctx.drawImage(this.base, x, y);
    const s = Math.max(1, Math.round(this.size / 64));
    const square = (cx: number, cy: number, side: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(cx - side / 2), Math.round(cy - side / 2), side, side);
    };
    for (const me of [false, true]) {
      for (const car of cars) {
        if (car.me !== me) continue;
        const cx = x + this.px(car.x);
        const cy = y + this.pz(car.z);
        if (me) {
          square(cx, cy, 7 * s, DARK);
          square(cx, cy, 5 * s, '#ffffff');
          square(cx, cy, 3 * s, car.color);
        } else {
          square(cx, cy, 4 * s, DARK);
          square(cx, cy, 2 * s, car.color);
        }
      }
    }
  }
}

/** The glossy blue item box, baked once. */
function boxSprite(size: number, u: number): HTMLCanvasElement {
  const [canvas, g] = sprite(size, size);
  const radius = Math.min(size / 2, 1.8 * u);
  const edge = 2 + Math.max(0, Math.round(0.4 * u) - 1);
  const inner = size - edge * 2;
  g.fillStyle = '#0a1a58';
  g.beginPath();
  g.roundRect(0, 0, size, size, radius);
  g.fill();
  g.fillStyle = '#9bd6ff';
  g.beginPath();
  g.roundRect(1, 1, size - 2, size - 2, Math.max(0, radius - 1));
  g.fill();
  const face = () => {
    g.beginPath();
    g.roundRect(edge, edge, inner, inner, Math.max(0, radius - edge));
  };
  g.save();
  face();
  g.clip();
  const body = g.createRadialGradient(size / 2, size * 0.3, 0, size / 2, size * 0.3, size * 0.8);
  body.addColorStop(0, '#3f86ff');
  body.addColorStop(0.6, '#1f55d6');
  body.addColorStop(1, '#11329a');
  g.fillStyle = body;
  g.fillRect(0, 0, size, size);
  const gloss = g.createLinearGradient(0, edge, 0, edge + inner);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  gloss.addColorStop(0.46, 'rgba(255, 255, 255, 0.1)');
  gloss.addColorStop(0.47, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gloss;
  g.fillRect(0, 0, size, size);
  face();
  g.lineWidth = Math.max(2, u);
  g.strokeStyle = 'rgba(170, 220, 255, 0.5)';
  g.stroke();
  g.restore();
  return bake(canvas);
}

/** Everything that depends on the canvas size or the touch layout, worked out in canvas pixels. */
interface Layout {
  touch: boolean;
  /** The safe area inside the canvas: its corner and size. */
  X: number;
  Y: number;
  W: number;
  H: number;
  u: number;
  pad: number;
  boxSize: number;
  boxX: number;
  boxY: number;
  box: HTMLCanvasElement;
  textSize: number;
  helpSize: number;
  placeSize: number;
  infoTop: number;
  infoLeft: number;
  infoWidth: number;
  gauge: Gauge;
  gaugeX: number;
  gaugeY: number;
  map: TrackMap;
  mapX: number;
  mapY: number;
}

interface TextOptions {
  align?: CanvasTextAlign;
  /** Horizontal squeeze, for tall narrow digits. */
  squeeze?: number;
  edge?: string;
}

const HELP = [
  'ARROWS/WASD DRIVE    SPACE DRIFT',
  'E FIRE AHEAD    Q FIRE BEHIND',
  'B LOOK BACK    R RESET    C CAMERA',
  'M MUTE    ESC CARS    P EFFECTS',
];

/**
 * The screen's 2D layer: the in-race HUD, plus the menus and buttons copied from the page. It is drawn onto one canvas
 * at the game's own low resolution, which the post pass lays over the scene before the CRT, so all of it gets the same
 * chunky pixels, scanlines and smear as the 3D view. Sprites with gradients are baked once with PS1 colour.
 */
export class Hud {
  readonly canvas = document.createElement('canvas');
  private readonly ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  private readonly safe: HTMLElement;
  private outline: { x: number; z: number }[][] = [];
  private glyphs = new Map<string, Glyph>();
  private view: Rect = { x: 0, y: 0, w: 1, h: 1 };
  /** Canvas pixels per CSS pixel. */
  private k = 1;
  private visible = false;
  private last: HudFrame | null = null;
  private flashAt = -1e9;
  private layout: Layout | null = null;
  private icon: HTMLCanvasElement | null | undefined;
  private count = 0;
  private locked = false;
  private big = '';
  private popFrom = -1e9;
  private helpTo = 0;

  /** The map's lines: the main track's centre line, and the fork's own stretch. */
  setTrack(track: Track): void {
    this.outline = [
      track.samples.map((p) => ({ x: p.x, z: p.z })),
      ...track.routes.map((r) => r.track.samples.filter((p) => p.s >= r.rfrom && p.s <= r.rto).map((p) => ({ x: p.x, z: p.z }))),
    ];
    if (this.layout) this.build();
  }

  constructor(root: HTMLElement) {
    root.innerHTML = '<div class="hud-safe"></div>';
    this.safe = root.firstElementChild as HTMLElement;
  }

  /**
   * Matches the canvas to the game's buffer, pixel for pixel, so the CRT treats both alike. A native-resolution buffer
   * is too fine for chunky pixels, so the canvas stays at 360 lines then. `view` is where the game sits, in CSS pixels.
   */
  fit(view: Rect, bufferW: number, bufferH: number): void {
    const h = bufferH <= 540 ? bufferH : 360;
    this.canvas.width = Math.max(1, Math.round((bufferW * h) / bufferH));
    this.canvas.height = h;
    this.view = view;
    this.k = h / view.h;
    setPixelScale(1 / this.k);
    this.build();
  }

  show(visible: boolean): void {
    this.visible = visible;
    if (visible) this.helpTo = performance.now() + 12000;
  }

  private build(): void {
    const r = this.safe.getBoundingClientRect();
    const k = this.k;
    const X = Math.max(0, Math.round((r.left - this.view.x) * k));
    const Y = Math.max(0, Math.round((r.top - this.view.y) * k));
    const W = Math.min(this.canvas.width, Math.round((r.right - this.view.x) * k)) - X;
    const H = Math.min(this.canvas.height, Math.round((r.bottom - this.view.y) * k)) - Y;
    // A page with no size yet (a hidden tab or frame) gets its layout on the resize that gives it one.
    if (W < 1 || H < 1) return;
    const ctx = this.ctx;
    this.glyphs.clear();
    const touch = document.body.classList.contains('touch-on');
    const u = touch
      ? Math.max(4.5 * k, Math.min((1.25 * H) / 100, (1.3 * W) / 100))
      : Math.max(4 * k, Math.min(H / 100, (1.3 * W) / 100));
    const pad = 3 * u;
    const boxSize = Math.round(12.5 * u);
    const side = Math.max(32, Math.round((touch ? 17 : 24) * u));
    const textSize = Math.max(7, (touch ? 3.8 : 4.2) * u);
    const placeSize = Math.max(18, (touch ? 9 : 14) * u);
    ctx.font = `italic 900 ${textSize}px ${FONT}`;
    const infoWidth = Math.max(ctx.measureText('BEST LAP').width, ctx.measureText('00:00.0').width) + textSize * 0.1;
    ctx.font = `italic 900 10px ${FONT}`;
    const helpWidth = Math.max(...HELP.map((line) => ctx.measureText(line).width)) / 10;
    this.layout = {
      touch,
      X,
      Y,
      W,
      H,
      u,
      pad,
      boxSize,
      boxX: Math.round(W / 2 - boxSize / 2),
      boxY: Math.round(touch ? 60 * k : 4.5 * u),
      box: boxSprite(boxSize, u),
      textSize,
      helpSize: Math.min(3 * u, (W / 2 - boxSize / 2 - pad * 2) / helpWidth),
      placeSize,
      infoTop: touch ? 12 * k : Math.max(58 * k, 5.5 * u),
      infoLeft: W - pad - infoWidth,
      infoWidth,
      gauge: new Gauge(side),
      gaugeX: Math.round(touch ? pad + side + 1.5 * u : W - pad - side),
      gaugeY: Math.round(H - pad - side),
      map: new TrackMap(side, this.outline),
      mapX: Math.round(pad),
      mapY: Math.round(H - pad - side),
    };
  }

  /** Called every frame. Draws the whole HUD. */
  frame(f: HudFrame): void {
    this.last = f;
  }

  /** Called every frame, racing or not: the HUD if it is showing, then the page's menus and buttons, then any flash. */
  paint(): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (this.layout && document.body.classList.contains('touch-on') !== this.layout.touch) this.build();
    const L = this.layout;
    const f = this.last;
    if (this.visible && L && f) {
      this.drawTags(L, f);
      ctx.save();
      ctx.translate(L.X, L.Y);
      this.drawHelp(L, now);
      this.drawItem(L, now);
      this.drawInfo(L, f);
      this.drawGauge(L, f);
      L.map.draw(ctx, L.mapX, L.mapY, f.cars);
      this.drawCountdown(L);
      ctx.restore();
    }
    drawPage(ctx, this.view, this.k);
    const flash = 1 - (now - this.flashAt) / 450;
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 251, 232, ${0.75 * flash})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Draws text from a cached sprite, so each string is painted and baked to PS1 pixels only once. */
  private text(str: string, x: number, y: number, size: number, fill: Fill, options: TextOptions = {}): void {
    const glyph = this.glyph(str, size, fill, options);
    const align = options.align ?? 'left';
    const left = align === 'center' ? x - glyph.width / 2 : align === 'right' ? x - glyph.width : x;
    this.ctx.drawImage(glyph.canvas, Math.round(left - glyph.originX), Math.round(y - glyph.originY));
  }

  private glyph(str: string, size: number, fill: Fill, options: TextOptions): Glyph {
    const { squeeze = 1, edge } = options;
    const key = `${str}|${size}|${fill[1]}|${squeeze}|${edge}`;
    const known = this.glyphs.get(key);
    if (known) return known;
    const made = drawGlyph(str, size, fill, squeeze, edge);
    if (this.glyphs.size > 300) this.glyphs.clear();
    this.glyphs.set(key, made);
    return made;
  }

  private drawHelp(L: Layout, now: number): void {
    if (L.touch || L.helpSize < 6) return;
    const alpha = now < this.helpTo ? 0.85 : Math.max(0, 0.85 * (1 - (now - this.helpTo) / 1500));
    if (alpha <= 0) return;
    const size = L.helpSize;
    this.ctx.globalAlpha = alpha;
    HELP.forEach((line, i) => {
      this.text(line, L.pad, L.pad + size * CAP + i * size * 1.45, size, WHITE);
    });
    this.ctx.globalAlpha = 1;
  }

  private drawItem(L: Layout, now: number): void {
    if (this.icon === undefined) return;
    const ctx = this.ctx;
    const { boxX, boxY, boxSize, u } = L;
    const cx = boxX + boxSize / 2;
    const cy = boxY + boxSize / 2;
    const t = (now - this.popFrom) / 250;
    const bounce = t >= 1 || t < 0 ? 1 : 1 + 0.25 * (t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(bounce, bounce);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.roundRect(boxX + 1, boxY + 2, boxSize, boxSize, 1.8 * u);
    ctx.fill();
    ctx.globalAlpha = this.icon === null ? 0.55 : 1;
    ctx.drawImage(L.box, boxX, boxY);
    if (this.icon) {
      const size = Math.round(boxSize * 0.72);
      ctx.drawImage(this.icon, Math.round(cx - size / 2), Math.round(cy - size / 2), size, size);
    }
    ctx.globalAlpha = 1;
    if (this.count > 0) {
      const corner = { x: boxX + boxSize - 0.7 * u, y: boxY + boxSize - 0.5 * u };
      this.text(String(this.count), corner.x, corner.y, 5 * u, WHITE, { align: 'right' });
    }
    if (this.locked && Math.floor(now / 150) % 2 === 0) {
      const size = Math.max(7, 3.6 * u);
      this.text('LOCK', cx, boxY + boxSize + 1.6 * u + size * CAP, size, RED, { align: 'center' });
    }
    ctx.restore();
  }

  private drawInfo(L: Layout, f: HudFrame): void {
    const { textSize: size, placeSize, infoLeft: x, infoWidth, u } = L;
    const pitch = size * 0.98;
    const place = L.infoTop + placeSize * CAP;
    const lap = place + 1.4 * u + size * CAP;
    const time = lap + pitch;
    const label = time + pitch + 1.3 * u;
    this.text(String(f.place), x + infoWidth / 2, place, placeSize, WHITE, { align: 'center' });
    const lapNo = Math.max(1, Math.min(f.lap, f.laps));
    this.text(Number.isFinite(f.laps) ? `LAP ${lapNo}/${f.laps}` : `LAP ${lapNo}`, x, lap, size, WHITE);
    this.text(clock(f.lapTime), x, time, size, WHITE);
    this.text('BEST LAP', x, label, size, WHITE);
    this.text(f.bestLap === null ? '--:--.-' : clock(f.bestLap), x, label + pitch, size, WHITE);
  }

  private drawGauge(L: Layout, f: HudFrame): void {
    const { gauge, gaugeX: x, gaugeY: y } = L;
    gauge.set(f.speed);
    this.ctx.drawImage(gauge.canvas, x, y);
    const size = gauge.size * 0.34;
    const digits = String(Math.max(0, Math.round(f.speedValue)));
    const baseline = y + gauge.size / 2 + size * CAP * 0.5;
    const style = { align: 'center', squeeze: 0.78, edge: '#052a0a' } as const;
    this.text(digits, x + gauge.size * 0.46, baseline, size, GREEN, style);
  }

  private drawTags(L: Layout, f: HudFrame): void {
    const { width, height } = this.canvas;
    const size = Math.max(7, Math.round(2.6 * L.u));
    for (const t of f.tags) {
      this.text(t.name, Math.round(((t.x + 1) / 2) * width), Math.round(((1 - t.y) / 2) * height), size, WHITE, { align: 'center' });
    }
  }

  private drawCountdown(L: Layout): void {
    if (!this.big) return;
    const size = (L.touch ? 12 : 16) * L.u;
    this.text(this.big, L.W / 2, L.H * 0.34 + size * CAP, size, GOLD, { align: 'center' });
  }

  /** The held pick-up in its box at the top of the screen. Null shows an empty box, undefined hides it. */
  item(icon: HTMLCanvasElement | null | undefined, count: number, locked: boolean): void {
    this.icon = icon;
    this.count = count;
    this.locked = locked;
  }

  /** A little bounce of the item box when the roll lands. */
  pop(): void {
    this.popFrom = performance.now();
  }

  /** A white flash over the whole screen, for the Ultimate Weapon's thunderbolt. */
  flashScreen(): void {
    this.flashAt = performance.now();
  }

  /** The big countdown in the middle of the screen. Empty text hides it. */
  countdown(text: string): void {
    this.big = text;
  }
}
