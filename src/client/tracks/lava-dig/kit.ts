import * as THREE from 'three';
import { Batch, type RGB } from '../../render/geometry';
import { cache, hex, make, mixc, scale, type Painter, type RGBA } from '../../render/textures';

/** Cells of the props atlas: one texture, so every prop in a place draws in one call. */
export const CELL = {
  olive: 0,
  star: 1,
  tyre: 2,
  hub: 3,
  crate: 4,
  canvas: 5,
  bone: 6,
  stripes: 7,
  steel: 8,
  rust: 9,
  black: 10,
  tarp: 11,
  paper: 12,
  mesh: 13,
  clapper: 14,
  brass: 15,
} as const;
export type Cell = keyof typeof CELL;

const SIZE = 32;

/** Paints one 32 px cell of the atlas with `f(x, y)`, which gets cell-local pixels. */
function cell(p: Painter, k: number, f: (x: number, y: number) => RGBA): void {
  const cx = (k % 4) * SIZE;
  const cy = Math.floor(k / 4) * SIZE;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) p.set(cx + x, cy + y, f(x, y));
}

const OLIVE = hex('#5a6438');
const OLIVE_DARK = hex('#3c4224');

export const atlas = cache(() =>
  make(128, 128, 520, (p) => {
    const r = p.rng;
    cell(p, CELL.olive, (x, y) => (x === 0 || y === 0 || y === 20 ? OLIVE_DARK : y > 26 ? hex('#4c5430') : OLIVE));
    cell(p, CELL.star, (x, y) => {
      const dx = x - 15.5;
      const dy = y - 15.5;
      const d = Math.hypot(dx, dy);
      if (d > 13 && d < 15) return hex('#e8e4d8');
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      const sector = (Math.PI * 2) / 5;
      const k = Math.abs(((a % sector) + sector) % sector - sector / 2) / (sector / 2);
      return d < 4.5 + 7 * (1 - k) ** 1.6 ? hex('#e8e4d8') : OLIVE;
    });
    cell(p, CELL.tyre, (x, y) => hex((x % 8 < 4) !== (y % 8 < 4) && x > 2 && x < 29 ? '#3c3a38' : '#232120'));
    cell(p, CELL.hub, (x, y) => {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d > 14) return hex('#232120');
      if (d > 11) return hex('#2e2c2a');
      if (d > 9.5) return OLIVE_DARK;
      if (d < 3) return hex('#2a2a26');
      const a = Math.atan2(y - 15.5, x - 15.5);
      return d > 6 && d < 8 && Math.cos(a * 5) > 0.85 ? hex('#22241a') : OLIVE;
    });
    cell(p, CELL.crate, (x, y) => {
      const frame = x < 3 || x > 28 || y < 3 || y > 28 || Math.abs(x - y) < 2;
      const plank = Math.floor(y / 8) % 2 ? hex('#9a7244') : hex('#a67c4a');
      return frame ? hex('#6e4c2a') : y % 8 === 0 ? hex('#5a3e22') : plank;
    });
    cell(p, CELL.canvas, (x, y) => (x % 16 === 0 ? hex('#6e6644') : y % 6 < 3 ? hex('#a69c6a') : hex('#9c9262')));
    cell(p, CELL.bone, (x, y) => mixc(hex('#efe2c0'), hex('#c4ac80'), (Math.sin(y * 0.45 + Math.sin(x * 0.3) * 2) * 0.5 + 0.5) * 0.7));
    cell(p, CELL.stripes, (x, y) => hex((x + y) % 16 < 8 ? '#f2c12e' : '#1c1a18'));
    cell(p, CELL.steel, (x, y) => {
      if (x === 0 || y === 0) return hex('#4a4e54');
      if ((x === 4 || x === 27) && (y === 4 || y === 27)) return hex('#c8ccd2');
      return y < 16 ? hex('#7a7f86') : hex('#70757c');
    });
    cell(p, CELL.rust, (x, y) => {
      if (y < 3 || y > 28) return hex('#3a2418');
      if (x === 10 || x === 21) return hex('#4a2c1c');
      return (x * 7 + y * 13) % 23 === 0 ? hex('#c06a2a') : y % 9 < 5 ? hex('#8a3e22') : hex('#7c3820');
    });
    cell(p, CELL.black, (x, y) => (x === 0 || y === 0 ? hex('#3a3a3e') : (x === 3 || x === 28) && (y === 3 || y === 28) ? hex('#8a8a90') : hex('#1e1e22')));
    cell(p, CELL.tarp, (x, y) => (x % 10 === 0 || y % 10 === 0 ? hex('#1e4e94') : hex('#2a64b4')));
    cell(p, CELL.paper, (x, y) => (x % 8 === 0 || y % 8 === 0 ? hex('#9cb4cc') : hex('#e8e4d4')));
    cell(p, CELL.mesh, (x, y) => (x % 4 === 0 || y % 4 === 0 ? hex('#8a8478') : x < 2 || y < 2 ? hex('#6e5434') : hex('#4a3c2c')));
    cell(p, CELL.clapper, (x, y) => (y < 10 ? hex((x + y) % 12 < 6 ? '#f0f0f0' : '#141414') : y === 10 ? hex('#606060') : hex('#1c1c1c')));
    cell(p, CELL.brass, (_x, y) => scale(hex(y % 8 < 2 ? '#a0782c' : '#c8982e'), 0.9 + r() * 0.15));
  }),
);

/** Squeezes a geometry's 0-1 uvs into one cell of the atlas, inset half a texel so neighbours don't bleed in. */
export function inCell(g: THREE.BufferGeometry, c: Cell): THREE.BufferGeometry {
  const k = CELL[c];
  const u0 = (k % 4) / 4;
  const v0 = 1 - (Math.floor(k / 4) + 1) / 4;
  const inset = 0.5 / 128;
  const span = 0.25 - inset * 2;
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const u = Math.min(1, Math.max(0, uv.getX(i)));
    const v = Math.min(1, Math.max(0, uv.getY(i)));
    uv.setXY(i, u0 + inset + u * span, v0 + inset + v * span);
  }
  return g;
}

/** Adds a geometry to the batch painted with one atlas cell. */
export function put(batch: Batch, mat: THREE.Material, g: THREE.BufferGeometry, m: THREE.Matrix4, c: Cell, color?: RGB): void {
  batch.geometry(mat, inCell(g, c), m, color);
  g.dispose();
}

/** A box painted with one atlas cell. */
export function block(batch: Batch, mat: THREE.Material, w: number, h: number, d: number, m: THREE.Matrix4, c: Cell, color?: RGB): void {
  put(batch, mat, new THREE.BoxGeometry(w, h, d), m, c, color);
}

/** A rigid moving part: whatever `build` adds, merged into meshes under one group. */
export function part(build: (b: Batch) => void): THREE.Group {
  const b = new Batch();
  build(b);
  const g = new THREE.Group();
  for (const m of b.meshes()) g.add(m);
  return g;
}
