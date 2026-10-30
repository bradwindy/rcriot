import * as THREE from 'three';
import { mulberry32 } from '../../shared/rng';
import type { Pattern } from '../../shared/roster';
import { drawText, textWidth } from './font';

/** Every texture is painted here at PS1 sizes (16 to 128 px), so there are no image files. */

type RGBA = [number, number, number, number];

function hex(c: string, a = 255): RGBA {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function scale(c: RGBA, f: number): RGBA {
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f), c[3]];
}

function mixc(a: RGBA, b: RGBA, t: number): RGBA {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}

const smooth = (t: number) => t * t * (3 - 2 * t);

class Painter {
  readonly data: Uint8ClampedArray<ArrayBuffer>;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly rng: () => number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, c: RGBA): void {
    const i = ((((Math.floor(y) % this.h) + this.h) % this.h) * this.w + (((Math.floor(x) % this.w) + this.w) % this.w)) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  get(x: number, y: number): RGBA {
    const i = ((((Math.floor(y) % this.h) + this.h) % this.h) * this.w + (((Math.floor(x) % this.w) + this.w) % this.w)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  each(f: (x: number, y: number) => RGBA | null): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = f(x, y);
        if (c) this.set(x, y, c);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, c: RGBA): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGBA): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
  }

  /** Pick from a palette by a 0..1 value. */
  pick(palette: RGBA[], v: number): RGBA {
    return palette[Math.max(0, Math.min(palette.length - 1, Math.floor(v * palette.length)))];
  }

  /** Seamless value noise with lattice cells about `cell` pixels wide. */
  noise(cell: number): (x: number, y: number) => number {
    const gw = Math.max(1, Math.round(this.w / cell));
    const gh = Math.max(1, Math.round(this.h / cell));
    const grid = Array.from({ length: gw * gh }, this.rng);
    const g = (i: number, j: number) => grid[(((j % gh) + gh) % gh) * gw + (((i % gw) + gw) % gw)];
    return (x, y) => {
      const fx = (x / this.w) * gw;
      const fy = (y / this.h) * gh;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const top = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
      const bottom = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
      return top + (bottom - top) * ty;
    };
  }

  text(s: string, x: number, y: number, size: number, c: RGBA): void {
    drawText(s, x, y, size, (px, py) => this.set(px, py, c));
  }
}

export const allTextures: THREE.Texture[] = [];

function toCanvas(data: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  ctx.putImageData(new ImageData(data, w, h), 0, 0);
  return canvas;
}

/**
 * Mip levels for a cut-out that keep its coverage. Plain averaging turns a thin leaf into faint alpha that fails the
 * alpha test, so leaves thin out with distance and flicker as they cross pixels. Here each smaller level's alpha is
 * scaled until the same share of texels passes the test as at full size, so a palm keeps its shape far away.
 */
function coverageMips(data: Uint8ClampedArray<ArrayBuffer>, w: number, h: number): HTMLCanvasElement[] {
  const coverage = (d: Uint8ClampedArray, scale: number) => {
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] * scale >= 128) n++;
    return n / (d.length / 4);
  };
  const target = coverage(data, 1);
  const levels = [toCanvas(data, w, h)];
  let src = data;
  let sw = w;
  let sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1);
    const dh = Math.max(1, sh >> 1);
    const out = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let flat = [0, 0, 0];
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            const k = (Math.min(sh - 1, y * 2 + j) * sw + Math.min(sw - 1, x * 2 + i)) * 4;
            const al = src[k + 3];
            r += src[k] * al;
            g += src[k + 1] * al;
            b += src[k + 2] * al;
            a += al;
            flat = [flat[0] + src[k], flat[1] + src[k + 1], flat[2] + src[k + 2]];
          }
        }
        const o = (y * dw + x) * 4;
        // Colour is weighted by alpha, so see-through texels don't darken the edges.
        if (a > 0) out.set([r / a, g / a, b / a, a / 4], o);
        else out.set([flat[0] / 4, flat[1] / 4, flat[2] / 4, 0], o);
      }
    }
    let lo = 0.5;
    let hi = 8;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (coverage(out, mid) < target) lo = mid;
      else hi = mid;
    }
    for (let i = 3; i < out.length; i += 4) out[i] = Math.min(255, out[i] * hi);
    levels.push(toCanvas(out, dw, dh));
    src = out;
    sw = dw;
    sh = dh;
  }
  return levels;
}

/** Cut-outs (leaves, flags, flames, clouds) carry hand-made mipmaps that keep their shape, and their own switch. */
function make(w: number, h: number, seed: number, paint: (p: Painter) => void, repeat = true, cutout = !repeat): THREE.Texture {
  const p = new Painter(w, h, mulberry32(seed));
  paint(p);
  const tex = new THREE.CanvasTexture(toCanvas(p.data, w, h));
  if (cutout) tex.mipmaps = coverageMips(p.data, w, h);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.userData.cutout = cutout;
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  allTextures.push(tex);
  return tex;
}

/**
 * Up close, textures stay as sharp or smooth as `pixelated` says. With `mipmaps`, distant textures read from smaller
 * pre-shrunk copies instead of skipping texels, which stops them shimmering. Pixelated mode keeps nearest sampling
 * inside each copy, so the far ground calms down without going soft.
 */
export function setFiltering(pixelated: boolean, mipmaps: boolean, cutouts: boolean): void {
  for (const t of allTextures) {
    const mip = mipmaps && (cutouts || !t.userData.cutout);
    t.generateMipmaps = mip && !t.userData.cutout;
    t.magFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    if (mip) t.minFilter = pixelated ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter;
    else t.minFilter = pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    t.needsUpdate = true;
  }
}

function speckle(p: Painter, palette: RGBA[], cell: number, grain: number): void {
  const n = p.noise(cell);
  p.each((x, y) => p.pick(palette, n(x, y) * (1 - grain) + p.rng() * grain));
}

function planks(p: Painter, palette: RGBA[], gap: RGBA, count: number, nails: boolean): void {
  const ph = p.h / count;
  const grain = p.noise(6);
  for (let k = 0; k < count; k++) {
    const base = palette[Math.floor(p.rng() * palette.length)];
    const joint = Math.floor(p.rng() * p.w);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < p.w; x++) {
        const streak = grain(x * 0.4, k * ph + y * 3);
        let c = scale(base, 0.82 + streak * 0.3 + (p.rng() - 0.5) * 0.08);
        if (y === 0) c = gap;
        if (y === ph - 1) c = scale(c, 0.8);
        if (x === joint && y > 0) c = gap;
        p.set(x, k * ph + y, c);
      }
    }
    if (nails) {
      for (const nx of [3, p.w - 4, (joint + 3) % p.w]) {
        p.set(nx, k * ph + Math.floor(ph / 2), hex('#3a3633'));
      }
    }
  }
}

function cache<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
}

export const tex = {
  white: cache(() => make(4, 4, 1, (p) => p.each(() => hex('#ffffff')))),

  sand: cache(() =>
    make(64, 64, 2, (p) => {
      speckle(p, ['#c9a265', '#d2ae70', '#d8b77a', '#dcbf86', '#e2c993'].map((c) => hex(c)), 10, 0.45);
      for (let i = 0; i < 26; i++) p.set(p.rng() * 64, p.rng() * 64, hex(p.rng() < 0.6 ? '#9c7b4f' : '#f2e8d2'));
    }),
  ),

  dirt: cache(() =>
    make(64, 64, 3, (p) => {
      speckle(p, ['#7e5f3e', '#876644', '#906d49', '#99754f', '#a27d56'].map((c) => hex(c)), 8, 0.4);
      for (const centre of [16, 48]) {
        for (let y = 0; y < 64; y++) {
          for (let x = centre - 5; x <= centre + 5; x++) {
            const c = p.get(x, y);
            const tread = (y + (x < centre ? 0 : 2)) % 4 === 0 ? 0.78 : 0.88;
            p.set(x, y, scale(c, Math.abs(x - centre) > 4 ? 0.94 : tread));
          }
        }
      }
      for (let y = 0; y < 64; y++) {
        for (const x of [0, 1, 62, 63]) p.set(x, y, scale(p.get(x, y), 1.08));
      }
    }),
  ),

  planks: cache(() =>
    make(64, 64, 4, (p) => planks(p, ['#8f5f36', '#9c6a3d', '#845531', '#a37243', '#7c5030'].map((c) => hex(c)), hex('#3b2414'), 8, true)),
  ),

  hull: cache(() =>
    make(64, 64, 5, (p) => {
      planks(p, ['#5e4a3a', '#544232', '#665241', '#4c3c2e'].map((c) => hex(c)), hex('#241a12'), 8, false);
      const moss = p.noise(12);
      p.each((x, y) => (moss(x, y) > 0.68 && p.rng() < 0.6 ? hex(p.rng() < 0.5 ? '#4f5e3a' : '#5d6b40') : null));
      // Turn the planks to run along the hull, which the loft maps to v.
      const copy = p.data.slice();
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.data.set(copy.subarray((x * 64 + y) * 4, (x * 64 + y) * 4 + 4), (y * 64 + x) * 4);
    }),
  ),

  rock: cache(() =>
    make(64, 64, 6, (p) => {
      const big = p.noise(20);
      const small = p.noise(5);
      const palette = ['#5e5246', '#6d6052', '#7a6a5a', '#8b7b68', '#9c8c76'].map((c) => hex(c));
      p.each((x, y) => p.pick(palette, big(x, y) * 0.6 + small(x, y) * 0.3 + p.rng() * 0.15));
      for (let i = 0; i < 9; i++) {
        let x = p.rng() * 64;
        let y = p.rng() * 64;
        for (let k = 0; k < 14; k++) {
          p.set(x, y, hex('#3d342c'));
          x += Math.round(p.rng() * 2 - 1);
          y += 1;
        }
      }
    }),
  ),

  cave: cache(() =>
    make(64, 64, 7, (p) => {
      const big = p.noise(16);
      const palette = ['#3f3832', '#4b433b', '#564d44', '#62574c', '#706455'].map((c) => hex(c));
      p.each((x, y) => p.pick(palette, big(x, y) * 0.7 + p.rng() * 0.3));
      for (let i = 0; i < 40; i++) p.set(p.rng() * 64, p.rng() * 64, hex(p.rng() < 0.5 ? '#2c2622' : '#8a7c66'));
    }),
  ),

  bark: cache(() =>
    make(32, 32, 8, (p) => {
      p.each((x, y) => {
        const band = Math.floor(y / 4) % 2 === 0;
        const notch = (x + Math.floor(y / 4) * 4) % 8 === 0 && y % 4 < 2;
        if (notch) return hex('#4e3722');
        return scale(hex(band ? '#7a5a3a' : '#6b4c30'), 0.9 + p.rng() * 0.2);
      });
    }),
  ),

  frond: cache(() =>
    make(32, 64, 9, (p) => {
      const greens = ['#2e6b22', '#3f8a2e', '#4f9a34', '#5aa83a'].map((c) => hex(c));
      for (let y = 0; y < 64; y++) {
        p.set(15, y, hex('#4a6b2a'));
        p.set(16, y, hex('#557a30'));
      }
      for (let y = 2; y < 62; y += 3) {
        const len = Math.round(13 * Math.sin((y / 64) * Math.PI) + 2);
        for (let i = 1; i <= len; i++) {
          const c = greens[Math.floor(p.rng() * greens.length)];
          p.set(16 + i, y - Math.floor(i * 0.5), c);
          p.set(15 - i, y - Math.floor(i * 0.5), c);
          if (i < len - 1) {
            p.set(16 + i, y - Math.floor(i * 0.5) + 1, scale(c, 0.8));
            p.set(15 - i, y - Math.floor(i * 0.5) + 1, scale(c, 0.8));
          }
        }
      }
    }, false),
  ),

  grass: cache(() =>
    make(32, 32, 10, (p) => {
      const blades = ['#7a8a3a', '#5f7a2e', '#9aa04a', '#b0a858'].map((c) => hex(c));
      for (let b = 0; b < 22; b++) {
        const x = 2 + p.rng() * 28;
        const h = 10 + p.rng() * 20;
        const lean = (p.rng() - 0.5) * 8;
        const c = blades[Math.floor(p.rng() * blades.length)];
        for (let y = 0; y < h; y++) p.set(x + (lean * y) / h, 31 - y, y > h - 3 ? scale(c, 1.15) : c);
      }
    }, false),
  ),

  barrel: cache(() =>
    make(32, 32, 11, (p) => {
      p.each((x, y) => {
        if ((y >= 5 && y <= 7) || (y >= 24 && y <= 26)) return hex(y === 5 || y === 24 ? '#8a8e92' : '#55595e');
        if (x % 5 === 0) return hex('#3b2414');
        return scale(hex(Math.floor(x / 5) % 2 ? '#8a5a30' : '#7a4e2a'), 0.9 + p.rng() * 0.18);
      });
    }),
  ),

  crate: cache(() =>
    make(32, 32, 12, (p) => {
      p.each((_x, y) => scale(hex(Math.floor(y / 6) % 2 ? '#a0743f' : '#94693a'), 0.92 + p.rng() * 0.14));
      p.each((x, y) => (x < 3 || y < 3 || x > 28 || y > 28 ? scale(hex('#7a5530'), 0.9 + p.rng() * 0.15) : null));
      for (let i = 3; i < 29; i++) {
        p.set(i, i, hex('#6e4c28'));
        p.set(i + 1, i, hex('#86602f'));
      }
      for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30]]) p.set(x, y, hex('#3a3633'));
    }),
  ),

  rope: cache(() => make(16, 16, 13, (p) => p.each((x, y) => hex((x + y) % 6 < 3 ? '#c8b07a' : '#9e8754')))),

  sail: cache(() =>
    make(32, 32, 14, (p) => {
      const n = p.noise(8);
      p.each((x, y) => scale(hex(n(x, y) > 0.65 ? '#cfc3a6' : '#e6dcc4'), 0.92 + p.rng() * 0.1 - y * 0.004));
      for (let i = 0; i < 6; i++) {
        const cx = p.rng() * 32;
        const cy = 8 + p.rng() * 24;
        const r = 1 + p.rng() * 2.5;
        p.each((x, y) => ((x - cx) ** 2 + (y - cy) ** 2 < r * r ? [0, 0, 0, 0] : null));
      }
      for (let x = 0; x < 32; x++) {
        const tear = Math.floor(p.rng() * 5);
        for (let y = 32 - tear; y < 32; y++) p.set(x, y, [0, 0, 0, 0]);
      }
    }, false),
  ),

  flag: cache(() =>
    make(32, 20, 15, (p) => {
      p.each(() => hex('#161414'));
      const skull = [
        '...#####...',
        '..#######..',
        '..#.###.#..',
        '..#######..',
        '...#.#.#...',
        '...#####...',
      ];
      skull.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && p.set(10 + x, 3 + y, hex('#eeeae0'))));
      for (let i = 0; i < 9; i++) {
        p.set(10 + i, 10 + i * 0.8, hex('#eeeae0'));
        p.set(20 - i, 10 + i * 0.8, hex('#eeeae0'));
      }
      for (let x = 26; x < 32; x++) {
        const tear = Math.floor(p.rng() * 6);
        for (let y = 0; y < tear; y++) p.set(x, p.rng() * 20, [0, 0, 0, 0]);
      }
    }, false),
  ),

  checker: cache(() => make(16, 16, 16, (p) => p.each((x, y) => hex((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? '#1a1a1a' : '#f2f2ea')))),

  banner: cache(() =>
    make(64, 16, 17, (p) => {
      p.each((x, y) => (y < 3 || y > 12 ? hex((Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? '#1a1a1a' : '#f2f2ea') : hex('#b0281f')));
      const t = 'RC RIOT';
      p.text(t, Math.round((64 - textWidth(t, 1)) / 2) + 1, 6, 1, hex('#5a120d'));
      p.text(t, Math.round((64 - textWidth(t, 1)) / 2), 5, 1, hex('#ffe9a8'));
    }),
  ),

  sign: cache(() =>
    make(64, 32, 18, (p) => {
      planks(p, ['#7c5030', '#845531', '#8f5f36'].map((c) => hex(c)), hex('#3b2414'), 4, true);
      for (const [t, y] of [['PIRATE', 6], ['COVE', 19]] as const) {
        const w = textWidth(t, 1) * 1;
        p.text(t, Math.round((64 - w) / 2) + 1, y + 1, 1, hex('#2a1a0e'));
        p.text(t, Math.round((64 - w) / 2), y, 1, hex('#f2d36b'));
      }
    }),
  ),

  billboard: cache(() =>
    make(128, 32, 19, (p) => {
      p.each((x, y) => hex(y < 2 || y > 29 || x < 2 || x > 125 ? '#f2d36b' : (x + y) % 16 < 8 ? '#2a3a8a' : '#24327a'));
      const t = 'RC RIOT STUDIOS';
      p.text(t, Math.round((128 - textWidth(t, 1)) / 2) + 1, 8, 1, hex('#101830'));
      p.text(t, Math.round((128 - textWidth(t, 1)) / 2), 7, 1, hex('#ffffff'));
      const s = 'STAGE 7';
      p.text(s, Math.round((128 - textWidth(s, 1)) / 2), 19, 1, hex('#f2d36b'));
    }),
  ),

  water: cache(() =>
    make(64, 64, 20, (p) => {
      const n = p.noise(16);
      p.each((x, y) => {
        const v = n(x, y);
        const ripple = Math.sin((x + n(y, x) * 20) * 0.4 + y * 0.2) > 0.85;
        if (ripple && p.rng() < 0.8) return hex('#ffffff', 255);
        return scale(hex('#c4dce4'), 0.85 + v * 0.25);
      });
    }),
  ),

  tyre: cache(() =>
    make(32, 16, 21, (p) => p.each((x, y) => hex((x % 4 < 2) !== (y % 8 < 4) && y > 1 && y < 14 ? '#3e3e3e' : '#262626')),
    ),
  ),

  hub: cache(() =>
    make(16, 16, 22, (p) => {
      p.each((x, y) => {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 5.2) return hex(d > 7 ? '#1e1e1e' : '#2e2e2e');
        if (d > 4.3) return hex('#9aa0a8');
        if (d < 1.4) return hex('#555a60');
        const a = Math.atan2(y - 7.5, x - 7.5);
        return Math.cos(a * 5) > 0.5 ? hex('#d8dce2') : hex('#5e646c');
      });
    }),
  ),

  metal: cache(() =>
    make(16, 16, 23, (p) => {
      p.each((_x, y) => scale(hex('#6e7378'), 0.9 + (y % 3 === 0 ? 0.1 : 0) + p.rng() * 0.08));
      for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) p.set(x, y, hex('#b8bcc0'));
    }),
  ),

  plastic: cache(() => make(16, 16, 24, (p) => p.each(() => scale(hex('#2c2c30'), 0.9 + p.rng() * 0.2)))),

  lens: cache(() =>
    make(16, 16, 25, (p) => {
      p.each((x, y) => {
        const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
        return mixc(hex('#fffbe8'), hex('#ffcf6e'), Math.min(1, d * d));
      });
    }),
  ),

  flame: cache(() =>
    make(16, 32, 26, (p) => {
      p.each((x, y) => {
        const t = y / 31;
        const w = 6.5 * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.2)) * (0.75 + 0.25 * t);
        const d = Math.abs(x - 7.5);
        if (d > w + (p.rng() - 0.5) * 1.5) return [0, 0, 0, 0];
        const core = d / Math.max(w, 0.5);
        if (core < 0.35 && t > 0.35) return hex('#fff6c8');
        if (core < 0.7) return hex('#ffb43a');
        return hex('#e8541c');
      });
    }, false),
  ),

  lantern: cache(() =>
    make(16, 16, 27, (p) => p.each((x, y) => (x % 5 === 0 || y < 2 || y > 13 ? hex('#3a2a1a') : scale(hex('#ffcc66'), 0.92 + p.rng() * 0.12)))),
  ),

  sun: cache(() =>
    make(32, 32, 28, (p) => {
      p.each((x, y) => {
        const d = Math.hypot(x - 15.5, y - 15.5);
        if (d < 8) return hex('#fff6dc');
        if (d < 15 && (x + y) % 2 === 0 && p.rng() < (15 - d) / 7) return hex('#ffd9a0');
        return [0, 0, 0, 0];
      });
    }, false),
  ),

  cloud: cache(() =>
    make(128, 32, 29, (p) => {
      const puffs = Array.from({ length: 20 }, () => [p.rng() * 128, 14 + p.rng() * 10, 4 + p.rng() * 8] as const);
      p.each((x, y) => {
        let best = 0;
        for (const [cx, cy, r] of puffs) {
          for (const ox of [-128, 0, 128]) best = Math.max(best, 1 - Math.hypot(x - cx - ox, (y - cy) * 1.6) / r);
        }
        if (best <= 0) return [0, 0, 0, 0];
        if (best < 0.25 && (x + y) % 2 === 1) return [0, 0, 0, 0];
        return mixc(hex('#f6c9a8'), hex('#fff6ee'), Math.min(1, best * 1.6 + (31 - y) / 60));
      });
    }, true, true),
  ),

  dust: cache(() =>
    make(16, 16, 30, (p) => {
      p.each((x, y) => {
        const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
        if (d > 1) return [0, 0, 0, 0];
        if (d > 0.6 && (x + y) % 2 === 0) return [0, 0, 0, 0];
        return [255, 255, 255, 255];
      });
    }, false),
  ),

  shadow: cache(() =>
    make(32, 32, 31, (p) => {
      p.each((x, y) => {
        const d = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
        return [0, 0, 0, Math.max(0, Math.min(1, (1 - d) * 1.8)) * 150];
      });
    }, false, false),
  ),

  chest: cache(() =>
    make(16, 16, 32, (p) => p.each((x, y) => (y === 5 || x < 2 || x > 13 ? hex('#c8a040') : scale(hex('#6e4426'), 0.9 + p.rng() * 0.2)))),
  ),

  itembox: cache(() =>
    make(16, 16, 34, (p) => {
      p.each((x, y) => {
        if (x === 0 || y === 0 || x === 15 || y === 15) return hex('#e8f4ff');
        return mixc(hex('#1e6ad8'), hex('#58c8ff'), (x + y) / 30);
      });
      p.text('?', 6, 6, 1, hex('#0a2a5a'));
      p.text('?', 5, 5, 1, hex('#ffffff'));
    }),
  ),

  oil: cache(() =>
    make(32, 32, 35, (p) => {
      const spikes = Array.from({ length: 9 }, () => [p.rng() * Math.PI * 2, 8 + p.rng() * 6, 1.2 + p.rng()] as const);
      const drops = Array.from({ length: 8 }, () => {
        const a = p.rng() * Math.PI * 2;
        const d = 11 + p.rng() * 4;
        return [16 + Math.cos(a) * d, 16 + Math.sin(a) * d, 0.8 + p.rng() * 1.2] as const;
      });
      p.each((x, y) => {
        const dx = x - 15.5;
        const dy = y - 15.5;
        const r = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        let inside = r < 6.5 + Math.sin(ang * 5) * 0.8;
        for (const [a, len, w] of spikes) {
          const along = dx * Math.cos(a) + dy * Math.sin(a);
          const across = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
          if (along > 0 && along < len && across < w * (1 - along / len) + 0.5) inside = true;
        }
        for (const [cx, cy, rr] of drops) if ((x - cx) ** 2 + (y - cy) ** 2 < rr * rr) inside = true;
        if (!inside) return [0, 0, 0, 0];
        const sheen = Math.sin(x * 0.5 + y * 0.3) > 0.8 && r < 7;
        return sheen ? hex(p.rng() < 0.5 ? '#5a3a9a' : '#3a6a8a') : hex(p.rng() < 0.2 ? '#1a1820' : '#0e0c12');
      });
    }, false, false),
  ),

  /** A shimmering hex mesh for shield and water bubbles, scrolled across them. */
  shimmer: cache(() =>
    make(32, 32, 36, (p) => {
      p.each((x, y) => {
        const row = Math.floor(y / 8);
        const cx = ((x + (row % 2) * 4) % 8) - 3.5;
        const cy = (y % 8) - 3.5;
        const edge = Math.abs(cx) > 2.8 || Math.abs(cy) > 2.8 || Math.abs(cx) + Math.abs(cy) > 4.5;
        const glint = Math.sin((x + y) * 0.4) > 0.9;
        if (glint) return hex('#ffffff');
        return edge ? hex('#e0ffe8') : hex('#8aa8b0');
      });
    }),
  ),

  gold: cache(() => make(8, 8, 33, (p) => p.each(() => hex(p.rng() < 0.3 ? '#fff2a0' : p.rng() < 0.5 ? '#e8b830' : '#c89420')))),
};

/** Body paint for one car: a base colour, a pattern in the second colour, and dirt along the sills. */
export function livery(color: string, second: string, seed: number, pattern: Pattern): THREE.Texture {
  return make(32, 32, 100 + seed, (p) => {
    const base = hex(color);
    const ink = hex(second);
    const spots = Array.from({ length: 9 }, () => [p.rng() * 32, p.rng() * 32, 1.8 + p.rng() * 2.2] as const);
    const flame = Array.from({ length: 32 }, (_, x) => 10 + 9 * Math.abs(Math.sin(x * 0.55 + p.rng() * 0.4)));
    p.each((x, y) => {
      let c = scale(base, 0.94 + p.rng() * 0.1);
      if (pattern === 'stripe') {
        if (x >= 12 && x < 20) c = ink;
        if (x === 11 || x === 20) c = scale(base, 0.7);
      } else if (pattern === 'pinstripe') {
        if (x === 5 || x === 26 || (y === 6 && x > 5 && x < 26)) c = ink;
      } else if (pattern === 'zebra') {
        if ((x + y * 0.5 + 3 * Math.sin(y * 0.4) + 64) % 11 < 4.5) c = scale(ink, 0.95 + p.rng() * 0.1);
      } else if (pattern === 'spots') {
        for (const [sx, sy, r] of spots) {
          for (const ox of [-32, 0, 32]) {
            for (const oy of [-32, 0, 32]) if ((x - sx - ox) ** 2 + (y - sy - oy) ** 2 < r * r) c = scale(ink, 0.9 + p.rng() * 0.15);
          }
        }
      } else if (pattern === 'flames') {
        const h = flame[x];
        const up = 31 - y;
        if (up < h) c = up < h * 0.55 ? hex('#f2c12e') : ink;
      }
      if (y > 26 && p.rng() < (y - 26) / 6) c = mixc(c, hex('#6e5434'), 0.6);
      return c;
    });
  });
}

export function numberPlate(n: number): THREE.Texture {
  return make(16, 16, 200 + n, (p) => {
    p.each((x, y) => (Math.hypot(x - 7.5, y - 7.5) < 7.6 ? hex('#f4f2ea') : hex('#202020')));
    p.text(String(n), Math.round((16 - textWidth(String(n), 1)) / 2), 6, 1, hex('#141414'));
  });
}
