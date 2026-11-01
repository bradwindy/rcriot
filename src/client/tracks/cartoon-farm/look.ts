import * as THREE from 'three';
import { INDOOR } from '../../render/materials';
import { ps1Material } from '../../render/ps1';
import { cache, hex, make, scale, tex, type Painter, type RGBA } from '../../render/textures';

/** Cartoon Farm's paint box: flat colours, bold ink lines and clean shapes, made once per page. */

export const INK = '#2b1d33';
const ink = hex(INK);

/** Rounded outline: draws `inside` where the test passes and ink on a ring `w` pixels round it. */
function outlined(p: Painter, inside: (x: number, y: number) => RGBA | null, w = 1): void {
  const fill: (RGBA | null)[] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) fill.push(inside(x, y));
  const at = (x: number, y: number) => (y < 0 || y >= p.h ? null : fill[y * p.w + (((x % p.w) + p.w) % p.w)]);
  p.each((x, y) => {
    const c = at(x, y);
    if (!c) {
      for (let j = -w; j <= w; j++) for (let i = -w; i <= w; i++) if (at(x + i, y + j)) return ink;
      return [0, 0, 0, 0];
    }
    return c;
  });
}

const textures = {
  grass: cache(() =>
    make(32, 32, 301, (p) => {
      p.each(() => hex('#ffffff'));
      // Little ticks of darker grass in a loose grid, like a cartoon background painter's.
      for (let k = 0; k < 10; k++) {
        const x = (k * 13 + (k % 3) * 5) % 32;
        const y = (k * 7 + Math.floor(k / 3) * 11) % 32;
        for (const [dx, dy] of [[0, 0], [1, -1], [2, 0], [-1, -1]]) p.set(x + dx, y + dy, hex('#c6dcb8'));
      }
    }),
  ),

  lawn: cache(() =>
    make(32, 32, 326, (p) => {
      p.each(() => hex('#5cc23f'));
      for (let k = 0; k < 10; k++) {
        const x = (k * 13 + (k % 3) * 5) % 32;
        const y = (k * 7 + Math.floor(k / 3) * 11) % 32;
        for (const [dx, dy] of [[0, 0], [1, -1], [2, 0], [-1, -1]]) p.set(x + dx, y + dy, hex('#45a52f'));
      }
    }),
  ),

  road: cache(() =>
    make(32, 32, 302, (p) => {
      p.each((x) => {
        if (x < 2 || x > 29) return hex('#6b3f22');
        if (x < 4 || x > 27) return hex('#f2c483');
        if ((x > 8 && x < 12) || (x > 19 && x < 23)) return hex('#d39a55');
        return hex('#e3ad66');
      });
      for (const [x, y] of [[6, 4], [15, 11], [25, 20], [14, 27], [7, 18], [17, 3]]) {
        p.set(x, y, hex('#b07a3c'));
        p.set(x + 1, y, hex('#f6d9a8'));
      }
    }),
  ),

  asphalt: cache(() =>
    make(32, 32, 303, (p) => {
      p.each((x, y) => {
        if (x < 2 || x > 29) return hex('#2e2f3a');
        if (x === 3 || x === 28) return hex('#f4f1e6');
        if ((x === 15 || x === 16) && y < 16) return hex('#ffd23a');
        return hex((x + y * 3) % 11 === 0 ? '#6a6e7c' : '#737786');
      });
    }),
  ),

  floor: cache(() =>
    make(32, 32, 304, (p) => {
      p.each((x, y) => {
        if (x < 4 || x > 27) return Math.floor((x + y) / 4) % 2 ? hex('#ffcf2e') : hex('#2b2b33');
        const d = (x + y) % 8 === 0 || (x - y + 64) % 8 === 0;
        return hex(d ? '#9aa6b8' : '#7d889a');
      });
    }),
  ),

  boards: cache(() =>
    make(32, 32, 305, (p) => {
      const tones = ['#c98a4a', '#bb7c3f', '#d39552', '#c08243'];
      p.each((x, y) => {
        if (y % 8 === 0) return hex('#5e3417');
        const c = hex(tones[Math.floor(y / 8)]);
        return x === (Math.floor(y / 8) * 11 + 5) % 32 ? hex('#5e3417') : scale(c, y % 8 === 7 ? 0.86 : 1);
      });
      for (let k = 0; k < 4; k++) for (const x of [2, 29]) p.set(x, k * 8 + 4, hex('#3a2a20'));
    }),
  ),

  barn: cache(() =>
    make(32, 32, 306, (p) => {
      p.each((x, y) => {
        const board = x % 8;
        if (board === 0) return hex('#6e1a14');
        if (board === 1) return hex('#ea5a44');
        const knot = (x * 7 + Math.floor(y / 9) * 13) % 37 === 0;
        return knot ? hex('#a92c22') : hex('#d4402f');
      });
    }),
  ),

  wood: cache(() =>
    make(32, 32, 307, (p) => {
      p.each((x, y) => {
        const board = x % 8;
        if (board === 0) return hex('#4a2e1a');
        if ((y * 3 + x * 5) % 29 === 0) return hex('#6e4528');
        return hex(board === 1 ? '#a8774a' : '#93653d');
      });
    }),
  ),

  hay: cache(() =>
    make(32, 32, 308, (p) => {
      p.each(() => hex('#f4cb52'));
      for (let k = 0; k < 40; k++) {
        const x = (k * 11) % 32;
        const y = (k * 7 + Math.floor(k / 4) * 3) % 32;
        const c = hex(k % 3 ? '#d9a531' : '#fbe38a');
        for (let i = 0; i < 4; i++) p.set(x + i, y + (k % 2 ? i >> 1 : -(i >> 1)), c);
      }
    }),
  ),

  shingles: cache(() =>
    make(32, 32, 309, (p) => {
      p.each((x, y) => {
        const row = Math.floor(y / 8);
        const cx = (x + (row % 2) * 4) % 8;
        const yy = y % 8;
        if (yy === 7 || (cx === 0 && yy > 2)) return hex('#4b1c22');
        return hex(yy < 2 ? '#a8414a' : '#8f3039');
      });
    }),
  ),

  tin: cache(() =>
    make(32, 32, 310, (p) => p.each((x) => hex(x % 8 < 2 ? '#2d6f7d' : x % 8 < 4 ? '#5fb6c4' : '#4596a6'))),
  ),

  panels: cache(() =>
    make(32, 32, 311, (p) => {
      p.each((x, y) => {
        if (y < 6) return y === 5 ? hex('#7a1d1a') : hex('#e2493d');
        if (x % 16 === 0 || y === 31) return hex('#b8a780');
        if ((x % 16 === 2 || x % 16 === 14) && (y === 8 || y === 29)) return hex('#8d7f62');
        return hex('#f4e7c3');
      });
    }),
  ),

  hall: cache(() =>
    make(32, 32, 312, (p) => {
      p.each((x, y) => {
        if (x % 16 === 0 || y % 16 === 0) return hex('#3a4252');
        if ((x % 16 === 2 || x % 16 === 14) && (y % 16 === 2 || y % 16 === 14)) return hex('#aab4c4');
        return hex(y < 16 ? '#8d98ab' : '#7f8a9d');
      });
    }),
  ),

  cow: cache(() =>
    make(32, 32, 313, (p) => {
      const blobs = [[6, 7, 5], [22, 4, 4], [17, 19, 6], [4, 26, 4], [28, 26, 4], [28, 14, 3]];
      p.each((x, y) => {
        for (const [cx, cy, r] of blobs) {
          for (const [ox, oy] of [[0, 0], [32, 0], [-32, 0], [0, 32], [0, -32]]) {
            const d = Math.hypot(x - cx - ox, (y - cy - oy) * 1.2);
            if (d < r) return hex('#1e1a22');
          }
        }
        return hex('#fbfaf4');
      });
    }),
  ),

  picket: cache(() =>
    make(30, 32, 314, (p) => {
      outlined(p, (x, y) => {
        const k = x % 10;
        const fromTop = 31 - y;
        if (k >= 2 && k <= 7) {
          const point = Math.abs(k - 4.5);
          if (fromTop < 28 - point * 1.4) return hex(k === 3 ? '#ffffff' : '#f2efe4');
        }
        if ((y >= 6 && y <= 8) || (y >= 18 && y <= 20)) return hex('#ddd8c8');
        return null;
      });
    }, true, true),
  ),

  milk: cache(() =>
    make(32, 32, 315, (p) => {
      p.each((x, y) => {
        const wave = Math.round(3 * Math.sin((x / 32) * Math.PI * 4 + Math.floor(y / 8)));
        if ((y + wave + 64) % 8 === 0) return hex('#d6e2ee');
        return hex('#fffdf4');
      });
    }),
  ),

  water: cache(() =>
    make(32, 32, 316, (p) => {
      p.each((x, y) => {
        const wave = Math.round(1.5 * Math.sin((x / 32) * Math.PI * 4 + Math.floor(y / 11) * 2));
        if ((y + wave + 64) % 11 === 0 && (x + Math.floor(y / 11) * 9) % 16 < 10) return hex('#ffffff');
        return hex('#56b9ea');
      });
    }),
  ),

  cloud: cache(() =>
    make(128, 64, 317, (p) => {
      const puffs = [[22, 40, 14], [42, 30, 18], [66, 24, 21], [90, 32, 17], [106, 42, 12], [56, 44, 14], [78, 44, 13]];
      outlined(
        p,
        (x, y) => {
          if (y > 54) return null;
          let best = -1;
          for (const [cx, cy, r] of puffs) best = Math.max(best, 1 - Math.hypot(x - cx, y - cy) / r);
          if (best < 0) return null;
          return y > 44 ? hex('#dfe9f6') : best < 0.25 && y > 30 ? hex('#eef3fb') : hex('#ffffff');
        },
        2,
      );
    }, false),
  ),

  sun: cache(() =>
    make(64, 64, 318, (p) => {
      outlined(
        p,
        (x, y) => {
          const dx = x - 31.5;
          const dy = y - 31.5;
          const d = Math.hypot(dx, dy);
          if (d > 27) return null;
          for (const ex of [-9, 9]) {
            const e = Math.hypot((x - 31.5 - ex) / 3.2, (y - 25) / 5);
            if (e < 1) return Math.hypot(x - 31.5 - ex + 1, y - 23) < 1.6 ? hex('#ffffff') : ink;
          }
          if (Math.hypot(x - 31.5 - 15, y - 35) < 4 || Math.hypot(x - 31.5 + 15, y - 35) < 4) return hex('#ff9a6a');
          const smile = Math.hypot(dx, dy - 28);
          if (smile > 13.5 && smile < 16 && dy > -1 && Math.abs(dx) < 11) return ink;
          return d > 23 ? hex('#ffb428') : hex('#ffe04a');
        },
        2,
      );
    }, false),
  ),

  corn: cache(() =>
    make(32, 64, 319, (p) => {
      p.each(() => [0, 0, 0, 0]);
      for (const sx of [5, 16, 26]) {
        for (let y = 4; y < 64; y++) p.set(sx + Math.round(Math.sin(y * 0.2 + sx) * 0.6), y, hex(y < 8 ? '#e8d27a' : '#3f8f2c'));
        for (let k = 0; k < 4; k++) {
          const y0 = 18 + k * 11;
          const dir = k % 2 ? 1 : -1;
          for (let i = 0; i < 7; i++) p.set(sx + dir * i, y0 - Math.round(i * 0.6) + (i > 4 ? 1 : 0), hex(i < 2 ? '#3f8f2c' : '#62b43c'));
        }
        for (let y = 24; y < 32; y++) for (let i = 0; i < 2; i++) p.set(sx + 1 + i, y, hex(y < 26 ? '#7ab84a' : '#ffd23f'));
      }
    }, false),
  ),

  flowers: cache(() =>
    make(32, 16, 320, (p) => {
      p.each(() => [0, 0, 0, 0]);
      const heads = [[4, 5, '#ffffff'], [12, 3, '#ff5a7a'], [19, 6, '#ffffff'], [27, 4, '#ffd23f']] as const;
      for (const [x, y, c] of heads) {
        for (let j = y + 2; j < 16; j++) p.set(x, j, hex('#3d8a2a'));
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(x + dx, y + dy, hex(c));
        p.set(x, y, hex(c === '#ffd23f' ? '#ff8a2a' : '#ffd23f'));
      }
    }, false),
  ),

  reeds: cache(() =>
    make(32, 32, 321, (p) => {
      p.each(() => [0, 0, 0, 0]);
      for (let k = 0; k < 9; k++) {
        const x = 2 + k * 3.4;
        const h = 18 + ((k * 7) % 11);
        for (let y = 0; y < h; y++) p.set(x + (y * (k % 3 - 1)) / 14, 31 - y, hex('#4c9a35'));
        if (k % 2 === 0) for (let y = h - 6; y < h - 1; y++) for (let i = 0; i < 2; i++) p.set(x + i + (y * (k % 3 - 1)) / 14, 31 - y, hex('#7a4a26'));
      }
    }, false),
  ),

  mesh: cache(() =>
    make(16, 16, 322, (p) => {
      p.each((x, y) => ((x + y) % 8 === 0 || (x - y + 16) % 8 === 0 ? hex('#d8dce0') : [0, 0, 0, 0]));
    }, true, true),
  ),

  shaft: cache(() =>
    make(16, 64, 323, (p) => {
      p.each((x, y) => {
        const edge = 1 - Math.abs(x - 7.5) / 8;
        const v = Math.max(0, edge) * (y / 63) ** 1.5;
        return [255, 244, 200, Math.round(v * 150)];
      });
    }, false, false),
  ),

  gauge: cache(() =>
    make(32, 32, 324, (p) => {
      outlined(
        p,
        (x, y) => {
          const dx = x - 15.5;
          const dy = y - 15.5;
          const d = Math.hypot(dx, dy);
          if (d > 14) return null;
          if (d > 12.5) return hex('#c9ccd2');
          const a = Math.atan2(dy, dx);
          if (d > 9 && d < 12 && a > 0.2 && a < 1.2) return hex('#ff3b3b');
          if (d > 9.5 && d < 12 && Math.abs(Math.sin(a * 6)) < 0.18 && (a < 0.2 || a > 1.2 || a < 0)) return ink;
          return hex('#fff6d6');
        },
        1,
      );
    }, false),
  ),

  label: cache(() =>
    make(32, 16, 325, (p) => {
      p.each((x, y) => {
        if (y < 2 || y > 13) return hex('#ffffff');
        const d = Math.hypot((x - 15.5) / 1.6, y - 7.5);
        if (d < 5.2 && d > 3.8) return hex('#ffffff');
        if (d < 3.8) return hex('#ff5a5a');
        return hex('#2f6fd6');
      });
    }),
  ),
};

const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
const wired = (m: THREE.ShaderMaterial, tone: number[]) => {
  m.userData.wire = tone;
  return m;
};

/** The track's own materials, made the first time a farm is built and kept for the page. */
export const looks = cache(() => ({
  grass: lit(textures.grass()),
  road: lit(textures.road()),
  lawn: lit(textures.lawn()),
  asphalt: lit(textures.asphalt()),
  floor: lit(textures.floor(), INDOOR),
  boards: wired(lit(textures.boards()), [0.45, 0.28, 0.16]),
  boardsIn: lit(textures.boards(), INDOOR * 1.4),
  barn: lit(textures.barn()),
  barnIn: lit(textures.wood(), INDOOR),
  wood: wired(lit(textures.wood()), [0.4, 0.26, 0.15]),
  hay: lit(textures.hay()),
  hayIn: lit(textures.hay(), INDOOR * 1.6),
  shingles: lit(textures.shingles()),
  tin: lit(textures.tin()),
  panels: lit(textures.panels()),
  hall: lit(textures.hall(), INDOOR),
  cow: lit(textures.cow()),
  picket: ps1Material({ map: textures.picket(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  mesh: ps1Material({ map: textures.mesh(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  milk: ps1Material({ map: textures.milk(), vertexColors: true, scroll: [0, -0.35], glow: 0.15 }),
  pour: ps1Material({ map: textures.milk(), vertexColors: true, scroll: [0, 1.6], glow: 0.2, side: THREE.DoubleSide }),
  water: ps1Material({ map: textures.water(), vertexColors: true, transparent: true, opacity: 0.88, wave: 0.12, scroll: [0.01, 0.02] }),
  corn: ps1Material({ map: textures.corn(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, sway: 0.25 }),
  flowers: ps1Material({ map: textures.flowers(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, sway: 0.08 }),
  reeds: ps1Material({ map: textures.reeds(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, sway: 0.2 }),
  /** Flat colour from the vertex colours, for most props. */
  flat: wired(lit(tex.white()), [0.3, 0.3, 0.32]),
  flatIn: lit(tex.white(), INDOOR),
  /** Bold outlines: the back faces of a slightly fattened copy, drawn in ink. */
  ink: ps1Material({ map: tex.white(), tint: INK, lit: false, side: THREE.BackSide }),
  /** Lamps, neon and anything that lights itself. */
  glow: ps1Material({ map: tex.white(), vertexColors: true, lit: false, glow: 0.9 }),
  neon: ps1Material({ map: tex.white(), vertexColors: true, lit: false, glow: 1.4 }),
  gauge: ps1Material({ map: textures.gauge(), vertexColors: true, lit: false, alphaTest: 0.5, glow: 0.25 }),
  label: lit(textures.label()),
  shaft: ps1Material({ map: textures.shaft(), vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide, fog: 0.5 }),
  shadow: ps1Material({ map: tex.shadow(), lit: false, transparent: true, depthWrite: false }),
  sun: ps1Material({ map: textures.sun(), lit: false, fog: 0, alphaTest: 0.5, depthWrite: false }),
  rays: ps1Material({ map: tex.white(), vertexColors: true, lit: false, fog: 0, depthWrite: false, side: THREE.DoubleSide }),
  cloud: ps1Material({ map: textures.cloud(), lit: false, fog: 0, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide }),
  hills: ps1Material({ map: tex.white(), vertexColors: true, fog: 0.55, side: THREE.DoubleSide }),
}));

export type Looks = ReturnType<typeof looks>;

/** Cartoon colours, as vertex colours on the flat materials. */
export const C = {
  white: [1, 1, 1],
  cream: [1, 0.95, 0.82],
  ink: [0.17, 0.11, 0.2],
  red: [0.9, 0.22, 0.17],
  barnRed: [0.83, 0.25, 0.18],
  orange: [1, 0.55, 0.12],
  yellow: [1, 0.84, 0.2],
  green: [0.36, 0.78, 0.25],
  leaf: [0.3, 0.72, 0.22],
  leafDark: [0.2, 0.55, 0.18],
  trunk: [0.55, 0.33, 0.18],
  blue: [0.25, 0.5, 0.9],
  sky: [0.55, 0.8, 1],
  steel: [0.72, 0.76, 0.82],
  dark: [0.22, 0.22, 0.26],
  pink: [1, 0.55, 0.65],
  wool: [0.97, 0.96, 0.92],
  face: [0.16, 0.14, 0.18],
  hayGold: [0.96, 0.8, 0.32],
  milk: [0.98, 0.98, 0.95],
  glass: [0.8, 0.92, 1],
} as const satisfies Record<string, readonly [number, number, number]>;

export function rgb(c: readonly [number, number, number]): [number, number, number] {
  return [c[0], c[1], c[2]];
}
