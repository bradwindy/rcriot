import * as THREE from 'three';
import { INDOOR } from '../../render/materials';
import { ps1Material } from '../../render/ps1';
import { cache, hex, make, mixc, scale, type Painter, type RGBA } from '../../render/textures';

/** Fitted Inca ashlar: courses of flat blocks with a lit top edge and a dark joint below. */
function ashlar(p: Painter, palette: RGBA[], rows: number, joint: RGBA): void {
  const rh = p.h / rows;
  for (let r = 0; r < rows; r++) {
    let x = Math.floor(p.rng() * 12);
    const y0 = r * rh;
    while (x < p.w + 12) {
      const w = 12 + Math.floor(p.rng() * 14);
      const base = palette[Math.floor(p.rng() * palette.length)];
      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < w; i++) {
          let c = scale(base, 1.05 - (j / rh) * 0.14);
          if (j === 1 || i === 1) c = scale(base, 1.16);
          if (j === rh - 2 || i === w - 2) c = scale(base, 0.86);
          if (j === rh - 1 || i === w - 1 || j === 0 || i === 0) c = joint;
          p.set(x + i, y0 + j, c);
        }
      }
      x += w;
    }
  }
}

const STONE = ['#a99f86', '#b4aa8f', '#9d947c', '#aea489', '#a39a80'].map((c) => hex(c));

/** A frieze of stepped crosses and frets, carved deep, between plain courses. */
function carve(p: Painter): void {
  ashlar(p, STONE, 4, hex('#4e483c'));
  const deep = hex('#5c5545');
  const lit = hex('#d2c8ab');
  const band = (y0: number, h: number) => {
    p.rect(0, y0, 64, h, hex('#988f77'));
    for (let x = 0; x < 64; x++) {
      p.set(x, y0, lit);
      p.set(x, y0 + h - 1, deep);
    }
  };
  band(16, 32);
  // Stepped crosses (the chakana) and a meander between them.
  const cross = ['...###...', '...#.#...', '.###.###.', '.#.....#.', '##.....##', '.#.....#.', '.###.###.', '...#.#...', '...###...'];
  for (const cx of [4, 36]) {
    cross.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && p.rect(cx + x * 2, 19 + y * 3, 2, 3, deep)));
    p.rect(cx + 8, 31, 2, 3, hex('#e8c45a'));
  }
  for (const x0 of [24, 56]) {
    for (let k = 0; k < 4; k++) {
      p.rect(x0, 20 + k * 6, 6, 2, deep);
      p.rect(x0 + (k % 2 ? 0 : 4), 20 + k * 6, 2, 6, deep);
    }
  }
  for (let x = 0; x < 64; x++) {
    for (let y = 17; y < 47; y++) {
      const c = p.get(x, y);
      if (c[0] === deep[0] && p.get(x + 1, y + 1)[0] !== deep[0]) p.set(x + 1, y + 1, lit);
    }
  }
}

export const tx = {
  stone: cache(() => make(64, 64, 401, (p) => ashlar(p, STONE, 4, hex('#4e483c')))),

  carved: cache(() => make(64, 64, 402, carve)),

  /** The same frieze turned a quarter, for walls lofted along the road, where u runs up the wall. */
  carvedSide: cache(() =>
    make(64, 64, 419, (p) => {
      carve(p);
      const copy = p.data.slice();
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.data.set(copy.subarray((x * 64 + y) * 4, (x * 64 + y) * 4 + 4), (y * 64 + x) * 4);
    }),
  ),

  /** Stair treads for the road up the pyramid: eight steps a repeat, run across the road. */
  stair: cache(() =>
    make(32, 64, 403, (p) => {
      const tread = hex('#b6ac91');
      p.each((x, y) => {
        const k = y % 8;
        const block = Math.floor((x + (Math.floor(y / 8) % 2) * 8) / 16);
        let c = scale(tread, 0.96 + 0.06 * ((block + Math.floor(y / 8)) % 2));
        if (k === 0) c = hex('#ddd3b8');
        else if (k >= 6) c = hex(k === 6 ? '#6f6653' : '#5a5243');
        else if ((x + (Math.floor(y / 8) % 2) * 8) % 16 === 0) c = hex('#8a8170');
        return c;
      });
      for (let y = 0; y < 64; y++) {
        for (const x of [0, 31]) p.set(x, y, hex('#7d745f'));
      }
    }),
  ),

  /** Jungle floor: overlapping leaves in a few greens over dark soil. */
  ground: cache(() =>
    make(64, 64, 404, (p) => {
      p.each(() => hex('#3f6526'));
      const greens = ['#4a7a2a', '#578a30', '#3a5f22', '#62953a', '#4f8030'].map((c) => hex(c));
      for (let i = 0; i < 70; i++) {
        const cx = p.rng() * 64;
        const cy = p.rng() * 64;
        const a = p.rng() * Math.PI;
        const len = 3 + p.rng() * 4;
        const wid = 1.2 + p.rng() * 1.3;
        const c = p.rng() < 0.08 ? hex('#7a6a32') : greens[Math.floor(p.rng() * greens.length)];
        for (let dy = -7; dy <= 7; dy++) {
          for (let dx = -7; dx <= 7; dx++) {
            const u = dx * Math.cos(a) + dy * Math.sin(a);
            const v = -dx * Math.sin(a) + dy * Math.cos(a);
            if ((u / len) ** 2 + (v / wid) ** 2 < 1) p.set(cx + dx, cy + dy, Math.abs(v) < 0.4 && Math.abs(u) < len * 0.7 ? scale(c, 1.2) : c);
          }
        }
      }
    }),
  ),

  /** Wet river mud: brown bands with dark tyre-churned ruts and a few flat puddles of sky. */
  mud: cache(() =>
    make(64, 64, 405, (p) => {
      const n = p.noise(16);
      p.each((x, y) => (n(x, y) > 0.6 ? hex('#5a3e24') : n(x, y) > 0.42 ? hex('#6b4b2c') : hex('#7a5734')));
      for (const x0 of [14, 44]) for (let y = 0; y < 64; y++) p.rect(x0 + Math.round(Math.sin(y / 9) * 1.5), y, 5, 1, hex('#4a3420'));
      for (let i = 0; i < 4; i++) {
        const cx = p.rng() * 64;
        const cy = p.rng() * 64;
        p.each((x, y) => {
          const d = ((x - cx) / 7) ** 2 + ((y - cy) / 3) ** 2;
          return d < 1 ? (d < 0.3 && x > cx ? hex('#b8c8b8') : hex('#7e8a80')) : null;
        });
      }
    }),
  ),

  /**
   * A ragged wall of jungle leaves with a cut-out top, for the hedges lofted along the road. Painted on its side: u runs
   * up the hedge (the leafy top at u = 1) and v along the road.
   */
  hedge: cache(() =>
    make(32, 64, 420, (p) => {
      const greens = ['#2c5a1c', '#3a7224', '#478a2c', '#336a20', '#56a034'].map((c) => hex(c));
      const put = (along: number, up: number, c: RGBA) => up >= 0 && up < 32 && p.set(up, along, c);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 20; x++) p.set(x, y, hex(x < 5 ? '#1e3a14' : '#264e18'));
      for (let i = 0; i < 90; i++) {
        const ca = p.rng() * 64;
        const cu = 2 + p.rng() * 26;
        const a = Math.PI / 2 + (p.rng() - 0.5) * 2.2;
        const len = 3 + p.rng() * 4;
        const c = greens[Math.floor(p.rng() * greens.length)];
        for (let t = 0; t <= len; t += 0.5) {
          const w = Math.sin((t / len) * Math.PI) * 1.8;
          for (let k = -w; k <= w; k += 0.5) put(ca + Math.cos(a) * t - Math.sin(a) * k, cu + Math.sin(a) * t + Math.cos(a) * k, Math.abs(k) < 0.5 ? scale(c, 1.25) : c);
        }
      }
    }, true, true),
  ),

  /** Pale kapok bark with moss up one side and long vertical folds. */
  trunk: cache(() =>
    make(32, 64, 421, (p) => {
      p.each((x, y) => {
        const fold = (x + Math.round(Math.sin(y / 7 + x) * 1.2)) % 8;
        let c = hex(fold === 0 ? '#6e6a58' : fold === 1 ? '#a8a48c' : '#8e8a74');
        if (x > 18 && x < 28 && (y * 7 + x * 3) % 11 < 6) c = hex(x < 23 ? '#4f7a2c' : '#5f8a34');
        return c;
      });
    }),
  ),

  /** Crocodile hide: rows of knobbly scutes. */
  croc: cache(() =>
    make(16, 16, 423, (p) => {
      p.each((x, y) => {
        const edge = x % 4 === 0 || y % 4 === 0;
        return hex(edge ? '#2c3a1c' : (x + y) % 8 < 2 ? '#7a8a4a' : '#56683a');
      });
    }),
  ),

  /** Felt for the giant hat: soft diagonal twill. */
  felt: cache(() =>
    make(16, 16, 424, (p) => {
      p.each((x, y) => hex((x + y) % 4 === 0 ? '#c8c0b4' : (x + y) % 4 === 2 ? '#e8e2d8' : '#d8d2c6'));
    }),
  ),

  /** Feathers: plain white, coloured per vertex. */
  plain: cache(() => make(4, 4, 425, (p) => p.each(() => hex('#ffffff')))),

  /** Churned white water at the foot of a fall. */
  foam: cache(() =>
    make(32, 32, 422, (p) => {
      p.each((x, y) => {
        const r = Math.hypot(x - 15.5, (y - 20) * 1.4);
        const lump = 11 + Math.sin(Math.atan2(y - 20, x - 15.5) * 7) * 2.5;
        if (r > lump || y > 29) return [0, 0, 0, 0];
        return (x * 5 + y * 3) % 7 < 2 ? hex('#cfe8f0') : hex('#ffffff');
      });
    }, false),
  ),

  thatch: cache(() =>
    make(32, 32, 406, (p) => {
      const straw = ['#c9a24a', '#b88f3c', '#d8b45a', '#a98236'].map((c) => hex(c));
      for (let x = 0; x < 32; x++) {
        const c = straw[Math.floor(p.rng() * straw.length)];
        const shift = Math.floor(p.rng() * 3);
        for (let y = 0; y < 32; y++) {
          const k = (y + shift) % 8;
          p.set(x, y, k === 7 ? hex('#6e5224') : k === 6 ? scale(c, 0.8) : k === 0 ? scale(c, 1.12) : c);
        }
      }
    }),
  ),

  /** Hut walls: poles bound with cane, daubed with clay. */
  wattle: cache(() =>
    make(32, 32, 407, (p) => {
      p.each((x, y) => {
        if (x % 8 === 0) return hex('#5e4026');
        if (x % 8 === 1) return hex('#7c5634');
        return (y + (Math.floor(x / 8) % 2) * 3) % 6 < 3 ? hex('#b48a58') : hex('#a27a4a');
      });
      for (const y of [6, 22]) for (let x = 0; x < 32; x++) p.set(x, y, hex('#d8b878'));
    }),
  ),

  /** Broad jungle leaves fanned out from the stem, for canopies and big plants. */
  leaf: cache(() =>
    make(64, 64, 408, (p) => {
      const greens = ['#2f6a1e', '#3c8226', '#4d9530', '#5aa636', '#2a5a1a'].map((c) => hex(c));
      for (let i = 0; i < 26; i++) {
        const cx = 6 + p.rng() * 52;
        const cy = 6 + p.rng() * 52;
        const a = p.rng() * Math.PI * 2;
        const len = 9 + p.rng() * 8;
        const c = greens[Math.floor(p.rng() * greens.length)];
        for (let t = 0; t <= len; t += 0.5) {
          const w = Math.sin((t / len) * Math.PI) * (2.4 + len * 0.14);
          for (let s = -w; s <= w; s += 0.5) {
            const x = cx + Math.cos(a) * t - Math.sin(a) * s;
            const y = cy + Math.sin(a) * t + Math.cos(a) * s;
            if (x < 1 || y < 1 || x > 62 || y > 62) continue;
            p.set(x, y, Math.abs(s) < 0.6 ? scale(c, 1.3) : s > 0 ? scale(c, 0.86) : c);
          }
        }
      }
    }, false),
  ),

  fern: cache(() =>
    make(32, 32, 409, (p) => {
      const greens = ['#3f8a2a', '#4f9c32', '#5fae3c'].map((c) => hex(c));
      for (let f = 0; f < 7; f++) {
        const a = Math.PI * (0.12 + (f / 6) * 0.76);
        const len = 14 + p.rng() * 4;
        const c = greens[f % 3];
        for (let t = 0; t < len; t += 0.5) {
          const bend = (t / len) ** 2 * 4;
          const x = 15.5 + Math.cos(a) * t;
          const y = 31 - Math.sin(a) * t + bend;
          p.set(x, y, scale(c, 0.8));
          const leaflet = Math.round(3.2 * (1 - t / len) + 0.6);
          if (Math.round(t * 2) % 3 === 0) {
            for (let k = 1; k <= leaflet; k++) {
              p.set(x - Math.sin(a) * k, y - Math.cos(a) * k + k * 0.4, c);
              p.set(x + Math.sin(a) * k, y + Math.cos(a) * k + k * 0.4, c);
            }
          }
        }
      }
    }, false),
  ),

  vine: cache(() =>
    make(16, 64, 410, (p) => {
      for (let y = 0; y < 64; y++) {
        const x = 7.5 + Math.sin((y / 32) * Math.PI * 2) * 1.5;
        p.set(x, y, hex('#4a5e22'));
        p.set(x + 1, y, hex('#3a4c1a'));
        if (y % 5 === 0) {
          const side = y % 10 === 0 ? 1 : -1;
          for (let k = 1; k <= 3; k++) p.set(x + side * k, y + k * 0.5, hex(k === 3 ? '#6aaa3a' : '#4f8a2c'));
          p.set(x + side * 2, y + 2, hex('#5a9a32'));
        }
      }
    }, true, true),
  ),

  gold: cache(() =>
    make(16, 16, 411, (p) => {
      p.each((x, y) => {
        const v = (Math.sin(x * 0.9 + y * 0.4) + 1) / 2;
        if ((x * 7 + y * 3) % 23 === 0) return hex('#fffbe0');
        return mixc(hex('#c88a18'), hex('#ffd85a'), v);
      });
    }),
  ),

  /** A pale faceted column, tinted per vertex into crystals of different colours. */
  crystal: cache(() =>
    make(16, 32, 412, (p) => {
      p.each((x, y) => {
        const facet = x < 5 ? 0.7 : x < 11 ? 1 : 0.82;
        const tip = 1 - y / 40;
        const c = mixc(hex('#ffffff'), hex('#9aa8c8'), (1 - tip) * 0.8);
        return (x + y) % 9 === 0 ? hex('#ffffff') : scale(c, facet);
      });
    }),
  ),

  /** Spotted toadstool cap, tinted per vertex. */
  cap: cache(() =>
    make(16, 16, 413, (p) => {
      p.each((x, y) => {
        const spot = [[4, 4], [11, 6], [6, 11], [12, 12], [1, 9]].some(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2 < 3);
        return spot ? hex('#ffffff') : hex('#b0b0b0');
      });
    }),
  ),

  /** Inti, the sun: a gold face ringed with rays. */
  sun: cache(() =>
    make(32, 32, 414, (p) => {
      p.each((x, y) => {
        const dx = x - 15.5;
        const dy = y - 15.5;
        const r = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        if (r < 9) {
          if (r > 8) return hex('#a8640e');
          return mixc(hex('#ffe27a'), hex('#e09a22'), r / 9);
        }
        const ray = Math.cos(a * 12) > 0.2 ? 15.5 : 12.5;
        if (r < ray) return r > ray - 1 ? hex('#a8640e') : hex('#f2b234');
        return [0, 0, 0, 0];
      });
      const ink = hex('#7a3e08');
      for (const ex of [11, 18]) {
        p.rect(ex, 12, 3, 2, ink);
        p.set(ex + 1, 11, ink);
      }
      p.rect(15, 14, 2, 4, hex('#c07818'));
      p.rect(12, 19, 8, 1, ink);
      p.rect(13, 20, 6, 1, ink);
    }, false),
  ),

  falls: cache(() =>
    make(16, 64, 415, (p) => {
      p.each((x, y) => {
        const streak = (Math.sin(x * 2.1) + Math.sin(x * 0.7 + 1)) * 6;
        const v = (y + streak + 64) % 16;
        if (v < 2) return hex('#ffffff', 235);
        if (v < 6) return hex('#d8f0ff', 200);
        return hex('#8ac8e0', 150);
      });
    }),
  ),

  /** A soft vertical beam: sunlight through the canopy, or down through a hole in a roof. */
  shaft: cache(() =>
    make(16, 64, 416, (p) => {
      p.each((x, y) => {
        const across = 1 - Math.abs(x - 7.5) / 8;
        const along = Math.sin((y / 63) * Math.PI);
        const a = Math.max(0, across) ** 1.5 * along;
        return [255, 236, 170, Math.round(a * 120)];
      });
    }, false, false),
  ),

  /** Painted totem and mask faces for the village posts. */
  totem: cache(() =>
    make(32, 64, 417, (p) => {
      const bands = [hex('#8a4a22'), hex('#b0702c'), hex('#6a3a1c')];
      p.each((_x, y) => bands[Math.floor(y / 16) % 3]);
      for (let k = 0; k < 4; k++) {
        const y0 = k * 16;
        p.rect(6, y0 + 4, 6, 3, hex('#f2e2b0'));
        p.rect(20, y0 + 4, 6, 3, hex('#f2e2b0'));
        p.rect(8, y0 + 5, 2, 2, hex('#1a1410'));
        p.rect(22, y0 + 5, 2, 2, hex('#1a1410'));
        p.rect(14, y0 + 7, 4, 4, hex(k % 2 ? '#2a8a8a' : '#c83a22'));
        p.rect(9, y0 + 12, 14, 2, hex('#1a1410'));
        for (let x = 10; x < 22; x += 3) p.rect(x, y0 + 12, 1, 2, hex('#f2e2b0'));
        for (let x = 0; x < 32; x++) p.set(x, y0 + 15, hex('#3a2010'));
      }
    }),
  ),

  /** Woven cloth: striped Andean textile for awnings and banners. */
  cloth: cache(() =>
    make(32, 32, 418, (p) => {
      const stripes = ['#c8302a', '#f2b234', '#1e6a8a', '#f2e8d0', '#2a8a4a', '#c8302a', '#3a1a2a', '#f2b234'].map((c) => hex(c));
      p.each((x, y) => {
        const s = stripes[Math.floor(y / 4)];
        const zig = (y % 4 === 1 || y % 4 === 2) && (x + (y % 4)) % 4 === 0;
        return zig ? scale(s, 0.6) : s;
      });
    }),
  ),
};

const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
const cutout = (map: THREE.Texture, sway: number, swayWeight: [number, number, number] = [0, 1, 0], shade = 1) =>
  ps1Material({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, sway, swayWeight, shade });
const glow = (map: THREE.Texture, amount: number, extra: Partial<Parameters<typeof ps1Material>[0]> = {}) =>
  ps1Material({ map, vertexColors: true, lit: false, glow: amount, ...extra });

/** Inca Temple's own materials, made once per page and shared by every build. */
export const incaMats = cache(() => {
  const m = {
    stone: lit(tx.stone()),
    stoneIndoor: lit(tx.stone(), INDOOR),
    carved: lit(tx.carved()),
    carvedIndoor: lit(tx.carved(), INDOOR),
    carvedSide: lit(tx.carvedSide(), INDOOR),
    stair: lit(tx.stair()),
    ground: lit(tx.ground()),
    mud: lit(tx.mud()),
    hedge: cutout(tx.hedge(), 0.12, [1, 0, 0]),
    trunk: lit(tx.trunk()),
    croc: lit(tx.croc()),
    felt: lit(tx.felt()),
    bird: ps1Material({ map: tx.plain(), vertexColors: true, side: THREE.DoubleSide }),
    trunkIndoor: lit(tx.trunk(), INDOOR),
    foam: ps1Material({ map: tx.foam(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, lit: false, sway: 0.3 }),
    thatch: lit(tx.thatch()),
    wattle: lit(tx.wattle()),
    totem: lit(tx.totem()),
    cloth: cutout(tx.cloth(), 0.25, [0, -1, 1]),
    leaf: cutout(tx.leaf(), 0.3, [0, 0, 1]),
    leafIndoor: cutout(tx.leaf(), 0, [0, 0, 1], 0.2),
    fern: cutout(tx.fern(), 0.18, [0, -1, 1]),
    vine: cutout(tx.vine(), 0.35, [0, -1, 1]),
    gold: glow(tx.gold(), 0.55),
    crystal: glow(tx.crystal(), 0.9),
    cap: glow(tx.cap(), 0.7),
    sun: ps1Material({ map: tx.sun(), vertexColors: true, lit: false, glow: 0.35, alphaTest: 0.5, side: THREE.DoubleSide }),
    falls: ps1Material({ map: tx.falls(), vertexColors: true, transparent: true, lit: false, scroll: [0, 0.9], side: THREE.DoubleSide }),
    shaft: ps1Material({ map: tx.shaft(), vertexColors: true, additive: true, lit: false, side: THREE.DoubleSide, fog: 0.6 }),
  };
  m.stone.userData.wire = [0.5, 0.47, 0.4];
  return m;
});

export type IncaMats = ReturnType<typeof incaMats>;
