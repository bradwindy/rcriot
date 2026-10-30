import './arcade.css';
import { bake, CAP, drawGlyph, FONT, INK, sprite, type Fill, type Glyph } from './pixel';

/*
 * Shared parts of the arcade screens (title and results): a full-screen canvas at the game's low resolution that drawPage
 * copies onto the HUD layer, so the CRT treats it like the 3D view, plus chrome lettering and cached pixel text.
 */

export const SILVER: Fill = ['#ffffff', '#d4dcec', '#8a94aa'];
export const BRONZE: Fill = ['#ffd6a8', '#e48c44', '#9a4a18'];
export const DIM: Fill = ['#e4ecfa', '#b4c0d8', '#76829c'];
export const FAINT: Fill = ['#b8c0d0', '#8a92a6', '#5a6276'];
export const PANEL = 'rgba(16, 12, 30, 0.86)';
export const ACCENT = '#f2c12e';
const SHADOW = 'rgba(11, 7, 2, 0.85)';

/** CSS pixels per low-res pixel, as the HUD last set it. */
export function pixelScale(): number {
  return parseFloat(document.documentElement.style.getPropertyValue('--px')) || 3;
}

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
/** Overshoots a little before settling, for things that drop into place. */
export const easeBack = (t: number) => {
  const u = clamp01(t) - 1;
  return 1 + 2.4 * u ** 3 + 1.4 * u ** 2;
};

const glyphs = new Map<string, Glyph>();

export function glyph(str: string, size: number, fill: Fill, edge?: string): Glyph {
  const key = `${str}|${size}|${fill.join()}|${edge}`;
  let g = glyphs.get(key);
  if (!g) {
    if (glyphs.size > 600) glyphs.clear();
    g = drawGlyph(str, size, fill, 1, edge);
    glyphs.set(key, g);
  }
  return g;
}

export function textWidth(str: string, size: number): number {
  return glyph(str, size, DIM).width;
}

/** Draws pixel text with its baseline at y. Returns the advance. */
export function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size: number,
  fill: Fill,
  align: CanvasTextAlign = 'left',
  edge?: string,
): number {
  const g = glyph(str, size, fill, edge);
  const left = align === 'center' ? x - g.width / 2 : align === 'right' ? x - g.width : x;
  ctx.drawImage(g.canvas, Math.round(left - g.originX), Math.round(y - g.originY));
  return g.width;
}

/** Cuts a string down until it fits, so long names never run into the next column. */
export function fit(str: string, size: number, width: number): string {
  let s = str;
  while (s.length > 1 && textWidth(s, size) > width) s = s.slice(0, -1);
  return s === str ? s : s.trimEnd();
}

/** A panel as the select screen draws them: hard shadow, dark fill and a one-pixel border. */
export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = PANEL, edge = ACCENT): void {
  ctx.fillStyle = SHADOW;
  ctx.fillRect(x + 2, y + 2, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

/** A parallelogram leaning forward like the italic text, `lean` pixels across its height. */
export function slant(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lean: number): void {
  ctx.beginPath();
  ctx.moveTo(x + lean, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - lean, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

const HOT: Fill = ['#ffe680', '#ff9c1c', '#d0400a'];
const bars = new Map<string, HTMLCanvasElement>();

/** The glowing orange highlight bar behind a picked row, baked once per size. */
export function bar(w: number, h: number, fill: Fill = HOT): HTMLCanvasElement {
  const key = `${w}|${h}|${fill[1]}`;
  const known = bars.get(key);
  if (known) return known;
  const lean = Math.round(h * 0.4);
  const [canvas, g] = sprite(w + 3, h + 3);
  g.fillStyle = SHADOW;
  slant(g, 2, 2, w, h, lean);
  g.fill();
  g.fillStyle = INK;
  slant(g, 0, 0, w, h, lean);
  g.fill();
  const shade = g.createLinearGradient(0, 1, 0, h - 1);
  shade.addColorStop(0, fill[0]);
  shade.addColorStop(0.5, fill[1]);
  shade.addColorStop(1, fill[2]);
  g.fillStyle = shade;
  slant(g, 1, 1, w - 2, h - 2, lean);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.55)';
  g.fillRect(lean + 1, 1, w - lean - 3, 1);
  bake(canvas);
  if (bars.size > 40) bars.clear();
  bars.set(key, canvas);
  return canvas;
}

/** A bright diagonal stripe swept across a slanted shape, `t` from 0 to 1 across. */
export function shine(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  if (t <= 0 || t >= 1) return;
  const lean = Math.round(h * 0.4);
  ctx.save();
  slant(ctx, x + 1, y + 1, w - 2, h - 2, lean);
  ctx.clip();
  const at = Math.round(x - h + t * (w + h * 2));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  slant(ctx, at, y, 4, h, -lean);
  ctx.fill();
  ctx.restore();
}

/** Small gold chevrons pointing in at a picked row from both sides, nudging in and out. */
export function chevrons(ctx: CanvasRenderingContext2D, left: number, right: number, mid: number, size: number, t: number): void {
  const nudge = Math.round((Math.sin(t * 8) + 1) * 0.75);
  const tri = (x: number, dir: number) => {
    const h = size;
    for (const [color, grow] of [[INK, 1], [ACCENT, 0]] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - dir * (h * 0.7 + grow), mid - h / 2 - grow);
      ctx.lineTo(x + dir * grow, mid);
      ctx.lineTo(x - dir * (h * 0.7 + grow), mid + h / 2 + grow);
      ctx.closePath();
      ctx.fill();
    }
  };
  tri(left - 2 - nudge, 1);
  tri(right + 2 + nudge, -1);
}

const CHROME: [number, string][] = [
  [0, '#ffffff'],
  [0.18, '#d4f0ff'],
  [0.46, '#4c8ad8'],
  [0.5, '#1a1f4a'],
  [0.56, '#6a3418'],
  [0.78, '#e8a04a'],
  [1, '#fff4cc'],
];

/** Chrome lettering, baked once. `face` is the letters alone, for sweeping a glint over them. */
export interface Chrome {
  canvas: HTMLCanvasElement;
  face: HTMLCanvasElement;
  /** Spare canvas the glint is built on each frame. */
  scratch: HTMLCanvasElement;
  width: number;
  height: number;
  /** Where the text's left baseline sits inside the sprite. */
  originX: number;
  originY: number;
  /** Advance of the text alone. */
  advance: number;
}

const tinted = (mask: HTMLCanvasElement, color: string): HTMLCanvasElement => {
  const [c, g] = sprite(mask.width, mask.height);
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
};

/**
 * Heavy italic letters in banded chrome: sky blue over a dark horizon over warm sand, the late-90s logo look. They sit on
 * a solid block pushed back and down by `depth`, with a dark outline round it all and a one-pixel bevel lit from the
 * top left. Colour is cut to 5 bits without dither, so the gradient falls into clean bands.
 */
export function chrome(str: string, size: number, depth = Math.max(2, Math.round(size * 0.07)), back = ['#6a3cc8', '#160a3a']): Chrome {
  const font = `italic 900 ${size}px ${FONT}`;
  const [, measure] = sprite(1, 1);
  measure.font = font;
  const advance = measure.measureText(str).width;
  const outline = Math.max(1, Math.round(size * 0.045));
  const margin = outline + 2;
  const cap = Math.round(size * CAP);
  const originX = margin;
  const originY = margin + cap;
  const width = Math.ceil(advance + size * 0.12 + margin * 2 + depth);
  const height = originY + depth + margin + 1;

  const [face, f] = sprite(width, height);
  f.font = font;
  f.fillStyle = '#fff';
  f.fillText(str, originX, originY);
  const fd = f.getImageData(0, 0, width, height);
  for (let i = 3; i < fd.data.length; i += 4) fd.data[i] = fd.data[i] < 110 ? 0 : 255;
  f.putImageData(fd, 0, 0);

  const [canvas, g] = sprite(width, height);
  g.font = font;
  g.lineJoin = 'round';
  g.lineWidth = outline * 2;
  g.strokeStyle = INK;
  for (let d = depth; d >= 0; d--) g.strokeText(str, originX + d, originY + d);
  for (let d = depth; d >= 1; d--) {
    const mix = (d - 1) / Math.max(1, depth - 1);
    g.drawImage(tinted(face, mix > 0.5 ? back[1] : back[0]), d, d);
  }

  const [lit, l] = sprite(width, height);
  l.drawImage(face, 0, 0);
  l.globalCompositeOperation = 'source-in';
  const grad = l.createLinearGradient(0, originY - cap, 0, originY);
  for (const [at, color] of CHROME) grad.addColorStop(at, color);
  l.fillStyle = grad;
  l.fillRect(0, 0, width, height);
  g.drawImage(lit, 0, 0);

  // The bevel: a lit edge where the face meets empty space up and to the left, a dark one down and to the right.
  const image = g.getImageData(0, 0, width, height);
  const d = image.data;
  const mask = fd.data;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[(y * width + x) * 4 + 3] > 0;
  const bevel = size >= 40 ? 2 : 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      const o = (y * width + x) * 4;
      let edge = 0;
      for (let k = 1; k <= bevel && !edge; k++) {
        if (!inside(x - k, y - k) || !inside(x, y - k)) edge = 1;
        else if (!inside(x + k, y + k) || !inside(x + k, y)) edge = -1;
      }
      if (edge > 0) d[o] = d[o + 1] = d[o + 2] = 255;
      else if (edge < 0) for (let c = 0; c < 3; c++) d[o + c] = d[o + c] * 0.55;
    }
  }
  g.putImageData(image, 0, 0);
  bake(canvas, false);
  return { canvas, face, scratch: sprite(width, height)[0], width, height, originX, originY, advance };
}

/** Draws chrome lettering with a glint `t` of the way across it. Outside 0 to 1 there is no glint. */
export function drawChrome(ctx: CanvasRenderingContext2D, c: Chrome, x: number, y: number, t = -1): void {
  ctx.drawImage(c.canvas, Math.round(x), Math.round(y));
  glint(ctx, c.face, c.scratch, x, y, t);
}

/** A hard white stripe swept diagonally over the opaque parts of `face`, `t` of the way across. */
export function glint(ctx: CanvasRenderingContext2D, face: HTMLCanvasElement, scratch: HTMLCanvasElement, x: number, y: number, t: number): void {
  if (t <= 0 || t >= 1) return;
  const g = scratch.getContext('2d') as CanvasRenderingContext2D;
  const { width, height } = face;
  g.globalCompositeOperation = 'copy';
  g.drawImage(face, 0, 0);
  g.globalCompositeOperation = 'source-in';
  const lean = Math.round(height * 0.45);
  const band = Math.max(3, Math.round(height * 0.16));
  const at = Math.round(-band - lean + t * (width + band * 2 + lean * 2));
  g.fillStyle = '#ffffff';
  slant(g, at, 0, band, height, -lean);
  g.fill();
  g.fillStyle = '#bfe8ff';
  slant(g, at + band + 1, 0, 2, height, -lean);
  g.fill();
  slant(g, at - 3, 0, 2, height, -lean);
  g.fill();
  ctx.drawImage(scratch, Math.round(x), Math.round(y));
}

/** A four-point star that grows and fades, `t` from 0 to 1. */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number): void {
  if (t <= 0 || t >= 1) return;
  const r = Math.round(Math.sin(t * Math.PI) * size);
  if (r < 1) return;
  const cx = Math.round(x);
  const cy = Math.round(y);
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(cx - r, cy, r * 2 + 1, 1);
  ctx.fillRect(cx, cy - r, 1, r * 2 + 1);
  ctx.fillStyle = '#ffffff';
  const inner = Math.max(1, Math.round(r * 0.5));
  ctx.fillRect(cx - inner, cy, inner * 2 + 1, 1);
  ctx.fillRect(cx, cy - inner, 1, inner * 2 + 1);
  if (r > 2) ctx.fillRect(cx - 1, cy - 1, 3, 3);
}

/** Repeating timer: how far through a `length` second event that recurs every `period` seconds we are, or -1. */
export function every(t: number, period: number, length: number, offset = 0): number {
  const p = (((t - offset) % period) + period) % period;
  return p < length ? p / length : -1;
}

/**
 * A screen drawn on one full-screen canvas at the game's low resolution, redrawn every frame while open. Invisible
 * buttons over the drawn controls take clicks and taps, as the ghosted page does everywhere else.
 */
export abstract class ArcadeScreen {
  protected readonly root: HTMLElement;
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  /** Size of the screen in low-res pixels. */
  protected W = 0;
  protected H = 0;
  protected px = 3;
  protected touch = false;
  private frame = 0;

  constructor(
    host: HTMLElement,
    private readonly className: string,
  ) {
    this.root = document.createElement('div');
    this.root.className = `arcade ${className} pixel-ghost`;
    this.root.hidden = true;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'arcade-canvas';
    this.canvas.dataset.pixel = '';
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.root.append(this.canvas);
    host.append(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  protected reveal(): void {
    this.root.hidden = false;
    document.body.classList.add(`${this.className}-on`);
    this.fit(true);
    cancelAnimationFrame(this.frame);
    const loop = (now: number) => {
      if (!this.open) return;
      this.fit(false);
      this.paint(now / 1000);
      this.frame = requestAnimationFrame(loop);
    };
    loop(performance.now());
  }

  hide(): void {
    this.root.hidden = true;
    document.body.classList.remove(`${this.className}-on`);
    cancelAnimationFrame(this.frame);
  }

  /** Works the layout out again when the screen, the pixel size or the touch layout changes. */
  protected fit(force: boolean): void {
    const px = pixelScale();
    const W = Math.max(1, Math.round(innerWidth / px));
    const H = Math.max(1, Math.round(innerHeight / px));
    const touch = document.body.classList.contains('touch-on');
    if (!force && W === this.W && H === this.H && px === this.px && touch === this.touch) return;
    Object.assign(this, { W, H, px, touch });
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${W * px}px`;
    this.canvas.style.height = `${H * px}px`;
    this.layout();
  }

  private paint(t: number): void {
    this.ctx.clearRect(0, 0, this.W, this.H);
    this.ctx.imageSmoothingEnabled = false;
    this.draw(t);
  }

  /** Places an invisible control over a drawn one, in low-res pixels. */
  protected place(el: HTMLElement, x: number, y: number, w: number, h: number): void {
    const px = this.px;
    Object.assign(el.style, { left: `${x * px}px`, top: `${y * px}px`, width: `${w * px}px`, height: `${h * px}px` });
  }

  protected button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'arcade-hit';
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    // No focus on click, or a later Enter or Space would press it again on top of the game's own key handling.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    this.root.append(b);
    return b;
  }

  protected abstract layout(): void;
  protected abstract draw(t: number): void;
}
