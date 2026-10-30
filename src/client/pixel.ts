import './pixel.css';

/*
 * Text drawn as PS1-style pixels: each string is painted small, flattened to 5-bit colour with hard edges, then scaled
 * up without smoothing. The HUD draws these sprites onto its own canvas. Menus and buttons use pixelLabel.
 */

export const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
export const INK = '#1a1006';
const SHADOW = '#0b0702';
/** Cap height of the font as a share of its size. */
export const CAP = 0.72;

export type Fill = readonly [top: string, middle: string, bottom: string];
export const WHITE: Fill = ['#ffffff', '#f3f5fa', '#aab2c4'];
export const GOLD: Fill = ['#fff6b0', '#f2c12e', '#c2740e'];
export const GREEN: Fill = ['#c9ff6a', '#4fd630', '#1c8f22'];
export const RED: Fill = ['#ff9a8a', '#ff3a2a', '#b81208'];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** One colour channel at the PS1's 5 bits, with a 4x4 ordered dither. Back to 8 bits. */
export function post(value: number, x: number, y: number): number {
  const q = Math.min(31, Math.floor(value / 8 + (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16));
  return (q << 3) | (q >> 2);
}

export function sprite(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return [canvas, canvas.getContext('2d') as CanvasRenderingContext2D];
}

/** Turns a drawn sprite into PS1 colour in place: 5 bits per channel, dithered or flat, with hard alpha edges. */
export function bake(canvas: HTMLCanvasElement, dither = true): HTMLCanvasElement {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const o = (y * canvas.width + x) * 4;
      const dx = dither ? x : 0;
      const dy = dither ? y : 0;
      d[o] = post(d[o], dx, dy);
      d[o + 1] = post(d[o + 1], dx, dy);
      d[o + 2] = post(d[o + 2], dx, dy);
      d[o + 3] = d[o + 3] < 128 ? 0 : 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export interface Glyph {
  canvas: HTMLCanvasElement;
  /** Advance of the text in canvas pixels, for aligning it. */
  width: number;
  /** Where the text's baseline origin sits inside the sprite. */
  originX: number;
  originY: number;
}

const measure = sprite(1, 1)[1];

/** Heavy italic text with a dark outline and drop shadow, at `size` low-res pixels. */
export function drawGlyph(str: string, size: number, fill: Fill, squeeze = 1, edge = INK): Glyph {
  const outline = Math.max(1, size * (size > 20 ? 0.055 : 0.04));
  const bold = size * 0.05;
  const shift = Math.max(1, Math.round(outline * 1.5));
  const font = `italic 900 ${size}px ${FONT}`;
  measure.font = font;
  const width = measure.measureText(str).width * squeeze;
  const margin = Math.ceil(outline + bold + shift + size * 0.2);
  const originY = Math.ceil(margin + size * CAP);
  const [canvas, g] = sprite(width + margin * 2, originY + size * 0.25 + margin);
  g.translate(margin, originY);
  g.scale(squeeze, 1);
  g.font = font;
  g.textBaseline = 'alphabetic';
  g.lineJoin = 'round';
  g.lineWidth = outline * 2 + bold;
  g.fillStyle = SHADOW;
  g.strokeStyle = SHADOW;
  g.strokeText(str, shift, shift);
  g.fillText(str, shift, shift);
  g.strokeStyle = edge;
  g.strokeText(str, 0, 0);
  const shade = g.createLinearGradient(0, -size * CAP, 0, 0);
  shade.addColorStop(0, fill[0]);
  shade.addColorStop(0.5, fill[1]);
  shade.addColorStop(1, fill[2]);
  g.fillStyle = shade;
  g.strokeStyle = shade;
  g.lineWidth = bold;
  g.strokeText(str, 0, 0);
  g.fillText(str, 0, 0);
  bake(canvas, false);
  return { canvas, width, originX: margin, originY };
}

interface Label {
  text: string;
  size: number;
  fill: Fill;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** CSS pixels per low-res pixel. */
let px = 3;
const labels = new Map<HTMLElement, Label>();

function paint(el: HTMLElement, { text, size, fill }: Label): void {
  const { canvas } = drawGlyph(text, size, fill);
  canvas.className = 'pixel-label';
  canvas.dataset.pixel = '';
  canvas.style.width = `${canvas.width * px}px`;
  canvas.style.height = `${canvas.height * px}px`;
  el.replaceChildren(canvas);
  if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
}

/** Sets how many CSS pixels one low-res pixel covers, and redraws every label to match. */
export function setPixelScale(cssPerPixel: number): void {
  px = cssPerPixel;
  document.documentElement.style.setProperty('--px', `${px}px`);
  for (const [el, label] of labels) {
    if (el.isConnected) paint(el, label);
    else labels.delete(el);
  }
}

/** Fills an element with its text as pixels, `size` low-res pixels tall. drawPage copies it onto the screen. */
export function pixelLabel(el: HTMLElement, text: string, size: number, fill: Fill = WHITE): void {
  const label = { text, size, fill };
  labels.set(el, label);
  paint(el, label);
}

const shown = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/** A box as the page styles it: hard shadow, fill and border, each a whole number of low-res pixels. */
function drawBox(ctx: CanvasRenderingContext2D, el: HTMLElement, x: number, y: number, w: number, h: number, k: number): void {
  const style = getComputedStyle(el);
  const round = style.borderRadius.includes('%');
  const edge = Math.max(1, Math.round(parseFloat(style.borderTopWidth) * k));
  const hasEdge = parseFloat(style.borderTopWidth) > 0;
  const shape = (dx: number, dy: number) => {
    ctx.beginPath();
    if (round) ctx.ellipse(x + dx + w / 2, y + dy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.rect(x + dx, y + dy, w, h);
  };
  const shadow = /(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(style.boxShadow);
  if (shadow) {
    ctx.fillStyle = shadow[1];
    shape(Math.round(parseFloat(shadow[2]) * k), Math.round(parseFloat(shadow[3]) * k));
    ctx.fill();
  }
  ctx.fillStyle = style.backgroundColor;
  shape(0, 0);
  ctx.fill();
  if (!hasEdge) return;
  ctx.fillStyle = style.borderTopColor;
  if (round) {
    ctx.strokeStyle = style.borderTopColor;
    ctx.lineWidth = edge;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 - edge / 2, h / 2 - edge / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  ctx.fillRect(x, y, w, edge);
  ctx.fillRect(x, y + h - edge, w, edge);
  ctx.fillRect(x, y, edge, h);
  ctx.fillRect(x + w - edge, y, edge, h);
}

/**
 * Copies the page's pixel elements (marked data-pixel) onto the low-res layer, in page order. The page itself hides
 * them (class pixel-ghost) but keeps them for layout and for clicks and touches. `view` is where the layer sits on the
 * screen in CSS pixels, and `k` is layer pixels per CSS pixel.
 */
export function drawPage(ctx: CanvasRenderingContext2D, view: Rect, k: number): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-pixel]')) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    const x = Math.round((r.left - view.x) * k);
    const y = Math.round((r.top - view.y) * k);
    if (el instanceof HTMLCanvasElement) ctx.drawImage(el, x, y);
    else drawBox(ctx, el, x, y, Math.round(r.width * k), Math.round(r.height * k), k);
  }
}
