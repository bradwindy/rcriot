import * as THREE from 'three';
import { INDOOR } from '../../render/materials';
import { ps1Material } from '../../render/ps1';
import { cache, hex, make, mixc, scale, type Painter, type RGBA } from '../../render/textures';

const CLEAR: RGBA = [0, 0, 0, 0];

/** Blocks of stone in courses, each a shade of its own, with a lit top edge and a shadowed bottom one. */
function courses(p: Painter, palette: RGBA[], mortar: RGBA, rows: number, widths: number[]): void {
  const rh = p.h / rows;
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -widths[0] / 2 : 0;
    while (x < p.w) {
      const w = widths[Math.floor(p.rng() * widths.length)];
      const c = palette[Math.floor(p.rng() * palette.length)];
      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < w; i++) {
          let k = c;
          if (j === 0 || i === 0) k = mortar;
          else if (j === 1 || i === 1) k = scale(c, 1.12);
          else if (j === rh - 1 || i === w - 1) k = scale(c, 0.84);
          p.set(x + i, r * rh + j, k);
        }
      }
      x += w;
    }
  }
}

/** Every texture of the graveyard, painted once per page. */
const gt = {
  grass: cache(() =>
    make(64, 64, 701, (p) => {
      p.each(() => hex('#33503a'));
      const patch = p.noise(32);
      p.each((x, y) => (patch(x, y) > 0.62 ? hex('#2c4632') : null));
      for (let i = 0; i < 90; i++) {
        const x = Math.floor(p.rng() * 64);
        const y = Math.floor(p.rng() * 64);
        const tall = p.rng() < 0.5;
        p.set(x, y, hex(tall ? '#4d7048' : '#41623f'));
        p.set(x, y - 1, hex(tall ? '#5c8052' : '#4d7048'));
        if (tall) p.set(x + 1, y - 2, hex('#6a8e5a'));
        p.set(x, y + 1, hex('#25392b'));
      }
      for (let i = 0; i < 10; i++) p.set(p.rng() * 64, p.rng() * 64, hex('#8a8a62'));
    }),
  ),

  path: cache(() =>
    make(64, 64, 702, (p) => {
      p.each((x) => {
        const edge = Math.min(x, 63 - x);
        const rut = (x > 12 && x < 21) || (x > 42 && x < 51);
        if (edge < 3) return hex('#4e4538');
        return hex(rut ? '#5a5042' : '#6c6150');
      });
      for (const c of [16, 46]) {
        for (let y = 0; y < 64; y += 4) {
          p.set(c - 2, y + ((c >> 3) % 2), hex('#4c4337'));
          p.set(c + 2, y + 2, hex('#4c4337'));
        }
      }
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(p.rng() * 64);
        const y = Math.floor(p.rng() * 64);
        const light = p.rng() < 0.55;
        p.set(x, y, hex(light ? '#8d8270' : '#463e33'));
        if (light) p.set(x, y + 1, hex('#4e4538'));
      }
    }),
  ),

  stone: cache(() =>
    make(32, 32, 703, (p) => {
      const blot = p.noise(12);
      p.each((x, y) => hex(blot(x, y) > 0.6 ? '#8a8e96' : blot(x, y) < 0.3 ? '#a2a5ab' : '#979ba2'));
      const moss = p.noise(8);
      p.each((x, y) => (moss(x, y) > 0.72 && y > 14 ? hex(moss(x, y) > 0.8 ? '#4f6a42' : '#5e7a4c') : null));
      for (let k = 0; k < 3; k++) {
        let x = Math.floor(p.rng() * 32);
        for (let y = Math.floor(p.rng() * 10); y < 32 && p.rng() < 0.93; y++) {
          p.set(x, y, hex('#5c5f66'));
          if (p.rng() < 0.35) x += p.rng() < 0.5 ? -1 : 1;
        }
      }
    }),
  ),

  blocks: cache(() =>
    make(64, 64, 704, (p) => courses(p, ['#6c6e78', '#74767f', '#666871', '#7c7e86', '#70727a'].map((c) => hex(c)), hex('#34353c'), 4, [16, 21, 24, 32])),
  ),

  cobble: cache(() =>
    make(64, 64, 705, (p) => {
      p.each(() => hex('#2e2d30'));
      for (let gy = 0; gy < 8; gy++) {
        for (let gx = 0; gx < 8; gx++) {
          const cx = gx * 8 + 4 + (gy % 2) * 4 + (p.rng() - 0.5) * 1.5;
          const cy = gy * 8 + 4 + (p.rng() - 0.5) * 1.5;
          const base = hex(['#5d5b5e', '#68666a', '#565458', '#727074'][Math.floor(p.rng() * 4)]);
          for (let j = -4; j <= 4; j++) {
            for (let i = -4; i <= 4; i++) {
              const d = Math.hypot(i / 3.6, j / 3.3);
              if (d > 1) continue;
              p.set(cx + i, cy + j, d > 0.75 && (i > 0 || j > 0) ? scale(base, 0.75) : d < 0.45 && i < 0 && j < 0 ? scale(base, 1.18) : base);
            }
          }
        }
      }
    }),
  ),

  iron: cache(() => make(16, 16, 706, (p) => p.each((x) => hex(x < 2 ? '#4a4d58' : x > 12 ? '#16171c' : '#25272e')))),

  bark: cache(() =>
    make(32, 32, 707, (p) => {
      const cols = Array.from({ length: 32 }, () => p.rng());
      p.each((x, y) => {
        const v = cols[x];
        const knot = (x * 7 + Math.floor(y / 9) * 13) % 23 === 0 && y % 9 < 2;
        if (knot) return hex('#26221f');
        return hex(v < 0.25 ? '#2f2a27' : v < 0.7 ? '#4a433e' : '#5b534c');
      });
    }),
  ),

  siding: cache(() =>
    make(64, 64, 708, (p) => {
      for (let b = 0; b < 8; b++) {
        const joint = Math.floor(p.rng() * 64);
        const tone = hex(['#4a4256', '#453d50', '#4f475c'][Math.floor(p.rng() * 3)]);
        for (let j = 0; j < 8; j++) {
          for (let x = 0; x < 64; x++) {
            let c = tone;
            if (j === 7) c = hex('#231e2b');
            else if (j === 6) c = scale(tone, 0.78);
            else if (j === 0) c = scale(tone, 1.18);
            if (x === joint && j < 7) c = hex('#2b2533');
            p.set(x, b * 8 + j, c);
          }
        }
      }
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(p.rng() * 56);
        const y = Math.floor(p.rng() * 8) * 8 + 2;
        const w = 3 + Math.floor(p.rng() * 6);
        p.rect(x, y, w, 3, hex('#77708a'));
      }
    }),
  ),

  shingle: cache(() =>
    make(64, 64, 709, (p) => {
      for (let r = 0; r < 8; r++) {
        for (let t = -1; t < 9; t++) {
          const x0 = t * 8 + (r % 2) * 4;
          const tone = hex(['#2c3242', '#333a4c', '#282d3b'][Math.floor(p.rng() * 3)]);
          for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
              const round = j > 4 && Math.hypot(i - 3.5, (j - 4) * 1.4) > 4.2;
              if (round) continue;
              const c = i === 0 ? hex('#161a24') : j === 7 || (j > 4 && Math.hypot(i - 3.5, (j - 4) * 1.4) > 3.4) ? scale(tone, 0.7) : tone;
              p.set(x0 + i, r * 8 + j, c);
            }
          }
        }
      }
    }),
  ),

  /** The haunted house's wallpaper. Along the wall is texture v, so its stripes run across the picture. */
  wallpaper: cache(() =>
    make(32, 64, 710, (p) => {
      p.each((x, y) => {
        const band = Math.floor(y / 8) % 2;
        if (x < 6) return hex(x === 5 ? '#1c1210' : x === 0 ? '#5a3a24' : '#3e2818');
        if (x === 6) return hex('#a07a3a');
        const c = hex(band ? '#4a1626' : '#5c1c2e');
        const fy = (y % 16) - 8;
        const fx = ((x - 6) % 13) - 6;
        if (band && Math.abs(fx) + Math.abs(fy) < 3) return hex(Math.abs(fx) + Math.abs(fy) < 2 ? '#c8a050' : '#8a6a34');
        return c;
      });
    }),
  ),

  /** The house floor: a red runner with a gold border on dark boards. `stairs` adds brass stair rods across it. */
  floor: cache(() => make(64, 64, 711, (p) => paintFloor(p, false))),
  stairs: cache(() => make(64, 64, 712, (p) => paintFloor(p, true))),

  window: cache(() =>
    make(64, 32, 713, (p) => {
      p.each((x, y) => {
        const lx = x % 32;
        const arch = y < 10 && Math.hypot(lx - 15.5, (10 - y) * 1.5) > 15;
        if (arch) return CLEAR;
        if (lx < 2 || lx > 29 || y > 29 || lx === 15 || lx === 16 || y === 15 || (y < 2 && !arch)) return hex('#1a1418');
        const warm = mixc(hex('#ffe08a'), hex('#ff8a2a'), y / 31);
        // The right-hand window has someone standing in it.
        if (x >= 32) {
          const head = Math.hypot(lx - 22, y - 10) < 3.2;
          const body = y > 12 && Math.abs(lx - 22) < 2 + (y - 12) * 0.35;
          if (head || body) return hex('#2a1a14');
        }
        return warm;
      });
    }, false),
  ),

  pumpkin: cache(() =>
    make(32, 32, 714, (p) => {
      p.each((x, y) => {
        const rib = x % 8;
        if (rib === 0) return hex('#9a4410');
        if (rib === 1 || rib === 7) return hex('#c45e16');
        if (rib === 3 && y > 6 && y < 26) return hex('#f2952e');
        return hex('#dc7420');
      });
    }),
  ),

  face: cache(() =>
    make(32, 32, 715, (p) => {
      p.each((x, y) => {
        const eye = (cx: number) => y > 7 && y < 14 && Math.abs(x - cx) < (y - 7) * 0.75;
        const nose = y > 14 && y < 18 && Math.abs(x - 15.5) < (y - 14) * 0.6;
        const mouth = y > 20 && y < 27 && x > 6 && x < 25 && !(y < 23 && (x === 11 || x === 20)) && !(y > 24 && x === 15);
        if (eye(10) || eye(21) || nose || mouth) return y > 22 ? hex('#ff8a1e') : hex('#ffd25a');
        return CLEAR;
      });
    }, false),
  ),

  bone: cache(() => make(16, 16, 716, (p) => p.each((x, y) => hex((x + y) % 7 === 0 ? '#a89e88' : '#c2b9a4')))),

  moon: cache(() =>
    make(64, 64, 717, (p) => {
      const maria = p.noise(16);
      p.each((x, y) => {
        const d = Math.hypot(x - 31.5, y - 31.5);
        if (d > 30) return CLEAR;
        let c = hex('#f4f1e2');
        if (maria(x, y) > 0.58) c = hex('#cfcdc2');
        if (maria(x, y) > 0.72) c = hex('#bab9b2');
        if (d > 27) c = scale(c, 0.9);
        return c;
      });
      for (const [cx, cy, r] of [[22, 40, 3], [40, 22, 2], [44, 44, 4], [18, 20, 2], [33, 50, 2]]) {
        p.each((x, y) => {
          const d = Math.hypot(x - cx, y - cy);
          if (d > r + 0.6 || Math.hypot(x - 31.5, y - 31.5) > 29) return null;
          return d > r - 0.6 ? hex(x + y < cx + cy ? '#a9a8a0' : '#ffffff') : null;
        });
      }
    }, false),
  ),

  halo: cache(() =>
    make(64, 64, 718, (p) => {
      p.each((x, y) => {
        const d = Math.hypot(x - 31.5, y - 31.5) / 31.5;
        const v = Math.max(0, 1 - d) ** 2.2;
        return [Math.round(150 * v), Math.round(170 * v), Math.round(215 * v), 255];
      });
    }, false, false),
  ),

  /** Low mist: soft streaks, fading out at both edges across the strip. */
  mist: cache(() =>
    make(32, 64, 719, (p) => {
      const n = p.noise(16);
      p.each((x, y) => {
        const across = Math.sin((x / 31) * Math.PI);
        const streak = 0.55 + 0.45 * Math.sin((y / 64) * Math.PI * 4 + n(x, y) * 5);
        const a = Math.max(0, Math.min(1, across * streak * (0.6 + n(x * 2, y) * 0.6)));
        return [196, 210, 236, Math.round(a * 255)];
      });
    }, true, false),
  ),

  ghost: cache(() =>
    make(32, 32, 720, (p) => {
      p.each((x, y) => {
        const hem = 26 + 2.5 * Math.sin(x * 0.9);
        const head = y < 14 ? Math.hypot(x - 15.5, (y - 13) * 1.05) < 11 : Math.abs(x - 15.5) < 11 + (y - 14) * 0.25 && y < hem;
        if (!head) return CLEAR;
        const eye = Math.hypot(x - 11.5, y - 11) < 2.2 || Math.hypot(x - 19.5, y - 11) < 2.2;
        const mouth = Math.hypot((x - 15.5) * 1.3, y - 18) < 2.6;
        if (eye || mouth) return hex('#0a1a2a');
        const edge = Math.abs(x - 15.5) > 8 || y > hem - 3;
        return edge ? hex('#7ab8e8') : hex('#c8ecff');
      });
    }, false),
  ),

  bat: cache(() =>
    make(32, 16, 721, (p) => {
      p.each((x, y) => {
        const dx = Math.abs(x - 15.5);
        const body = dx < 2.2 && y > 4 && y < 12;
        const ears = dx > 0.8 && dx < 2.2 && y > 2 && y <= 4;
        const top = 6 - Math.sin((dx / 15.5) * Math.PI) * 3;
        const scallop = 10 + 2.2 * Math.abs(Math.sin((dx / 15.5) * Math.PI * 2.5)) - dx * 0.25;
        const wing = dx < 15.5 && y > top && y < scallop;
        if (dx < 1.6 && y === 6 && dx > 0.4) return hex('#ff3a2a');
        if (body || ears || wing) return hex(dx > 10 ? '#2a2232' : '#1a1520');
        return CLEAR;
      });
    }, false),
  ),

  web: cache(() =>
    make(64, 64, 722, (p) => {
      p.each(() => CLEAR);
      const silk = hex('#d8dce4');
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + 0.2;
        p.line(31.5, 31.5, 31.5 + Math.cos(a) * 31, 31.5 + Math.sin(a) * 31, silk);
      }
      for (let r = 5; r < 31; r += 4.5) {
        for (let k = 0; k < 9; k++) {
          const a0 = (k / 9) * Math.PI * 2 + 0.2;
          const a1 = ((k + 1) / 9) * Math.PI * 2 + 0.2;
          const sag = 0.86;
          p.line(31.5 + Math.cos(a0) * r, 31.5 + Math.sin(a0) * r, 31.5 + Math.cos((a0 + a1) / 2) * r * sag, 31.5 + Math.sin((a0 + a1) / 2) * r * sag, silk);
          p.line(31.5 + Math.cos((a0 + a1) / 2) * r * sag, 31.5 + Math.sin((a0 + a1) / 2) * r * sag, 31.5 + Math.cos(a1) * r, 31.5 + Math.sin(a1) * r, silk);
        }
      }
    }, false),
  ),

  coffin: cache(() =>
    make(32, 32, 723, (p) => {
      p.each((x, y) => {
        if (x < 2 || x > 29 || y < 2 || y > 29) return hex('#2a1810');
        const cross = (Math.abs(x - 15.5) < 1.5 && y > 6 && y < 26) || (Math.abs(y - 12) < 1.5 && x > 9 && x < 22);
        if (cross) return hex('#b8923e');
        return hex(Math.floor(x / 5) % 2 ? '#4a2c1c' : '#42271a');
      });
    }),
  ),

  satin: cache(() => make(16, 16, 724, (p) => p.each((x, y) => hex((x + y * 2) % 8 < 3 ? '#e03048' : '#b01a30')))),

  weeds: cache(() =>
    make(32, 32, 725, (p) => {
      p.each(() => CLEAR);
      for (let b = 0; b < 18; b++) {
        const x = 3 + p.rng() * 26;
        const h = 8 + p.rng() * 20;
        const lean = (p.rng() - 0.5) * 10;
        const c = hex(['#8a8a62', '#6e7450', '#9a9268', '#5a6448'][Math.floor(p.rng() * 4)]);
        for (let y = 0; y < h; y++) p.set(x + (lean * y * y) / (h * h), 31 - y, c);
      }
    }, false),
  ),

  portrait: cache(() =>
    make(32, 32, 726, (p) => {
      p.each((x, y) => {
        const d = Math.min(x, y, 31 - x, 31 - y);
        if (d < 3) return hex(d === 1 ? '#e2c070' : '#a8803a');
        const face = Math.hypot((x - 15.5) * 1.25, y - 13) < 7;
        const body = y > 19 && Math.abs(x - 15.5) < 4 + (y - 19) * 0.9;
        if (face && y > 11 && y < 14 && (Math.abs(x - 12.5) < 1.2 || Math.abs(x - 18.5) < 1.2)) return hex('#ff3030');
        if (face) return hex('#b8b0a0');
        if (body) return hex('#1c1820');
        return hex(y < 16 ? '#2e2a3a' : '#262230');
      });
    }),
  ),

  glass: cache(() =>
    make(32, 32, 727, (p) => {
      const panes = ['#c02838', '#2848c0', '#d89a28', '#289a58', '#7a38b8'].map((c) => hex(c));
      p.each((x, y) => {
        const arch = y < 12 && Math.hypot(x - 15.5, (12 - y) * 1.25) > 15.5;
        if (arch) return CLEAR;
        if (x < 1 || x > 30 || y > 30 || x % 8 === 0 || y % 8 === 0) return hex('#121014');
        return panes[(Math.floor(x / 8) * 3 + Math.floor(y / 8) * 2) % panes.length];
      });
    }, false),
  ),

  skyline: cache(() =>
    make(128, 32, 728, (p) => {
      const hill = Array.from({ length: 128 }, (_, x) => 22 - 4 * Math.sin((x / 128) * Math.PI * 4) - 2 * Math.sin((x / 128) * Math.PI * 10));
      p.each((x, y) => (y > hill[x] ? hex('#0b0e17') : CLEAR));
      for (let t = 0; t < 9; t++) {
        const x0 = Math.floor(p.rng() * 128);
        const top = 3 + p.rng() * 8;
        const base = hill[x0];
        for (let y = Math.floor(top); y < base; y++) p.set(x0, y, hex('#0b0e17'));
        for (let k = 0; k < 6; k++) {
          const y0 = top + p.rng() * (base - top) * 0.6;
          const dir = p.rng() < 0.5 ? -1 : 1;
          const len = 2 + p.rng() * 6;
          for (let i = 0; i < len; i++) p.set(x0 + dir * i, y0 - i * 0.6, hex('#0b0e17'));
        }
      }
      // A far-off church spire.
      for (let y = 4; y < 22; y++) for (let x = 90; x < 96; x++) if (y > 12 || Math.abs(x - 92.5) < (y - 4) * 0.35) p.set(x, y, hex('#0b0e17'));
    }, true, true),
  ),

  water: cache(() =>
    make(64, 64, 729, (p) => {
      p.each(() => hex('#1c3448'));
      for (let i = 0; i < 40; i++) {
        const x = Math.floor(p.rng() * 64);
        const y = Math.floor(p.rng() * 64);
        const len = 2 + Math.floor(p.rng() * 5);
        for (let k = 0; k < len; k++) p.set(x + k, y, hex(k === 0 || k === len - 1 ? '#3e6480' : '#8cb4dc'));
      }
    }),
  ),

  spider: cache(() =>
    make(16, 16, 730, (p) => {
      p.each((x, y) => {
        const hour = Math.abs(y - 7.5) < 5 && Math.abs(x - 7.5) < Math.abs(y - 7.5) * 0.6 + 0.6;
        if (hour) return hex('#d0202a');
        return hex((x * 3 + y * 5) % 7 === 0 ? '#3a3040' : '#1e1a22');
      });
    }),
  ),

  green: cache(() => make(4, 4, 732, (p) => p.each(() => hex('#30e860')))),
  soil: cache(() =>
    make(32, 32, 734, (p) => {
      p.each(() => hex('#3e3226'));
      for (let i = 0; i < 40; i++) p.set(p.rng() * 32, p.rng() * 32, hex(p.rng() < 0.5 ? '#54463a' : '#2c231b'));
    }),
  ),
  gel: cache(() =>
    make(16, 16, 736, (p) => {
      p.each((x, y) => {
        const d = Math.hypot(x - 7.5, y - 7.5) / 7.5;
        return mixc(hex('#eef6ff'), hex('#6a9aff'), Math.min(1, d * d));
      });
    }),
  ),
  /** Dark slate flagstones for the lair floor and the crypt's steps. */
  flags: cache(() => make(32, 32, 735, (p) => courses(p, ['#3a3a44', '#40404a', '#36363f'].map((c) => hex(c)), hex('#1c1c22'), 2, [16, 13, 19]))),
};

function paintFloor(p: Painter, stairs: boolean): void {
  p.each((x, y) => {
    if (x >= 14 && x <= 49) {
      if (x <= 15 || x >= 48) return hex('#c8a040');
      const dx = Math.abs(x - 31.5);
      const dy = Math.abs((y % 16) - 8);
      if (dx + dy < 4 && dx + dy > 2) return hex('#b8862e');
      return hex('#7a1c26');
    }
    const board = Math.floor(x / 5) % 3;
    if (x % 5 === 0) return hex('#1e140e');
    return hex(['#4a3020', '#53361f', '#43291b'][board]);
  });
  if (!stairs) return;
  for (let y = 0; y < 64; y += 16) {
    for (let x = 0; x < 64; x++) {
      p.set(x, y, x >= 14 && x <= 49 ? hex('#f0d070') : hex('#a07a4a'));
      p.set(x, y + 1, x >= 14 && x <= 49 ? hex('#4a0e14') : hex('#140c08'));
      p.set(x, y + 2, x >= 14 && x <= 49 ? hex('#5a1218') : hex('#24180e'));
    }
  }
}

const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
const wired = (m: THREE.ShaderMaterial, tone: number[]) => {
  m.userData.wire = tone;
  return m;
};
const cutout = (map: THREE.Texture, shade = 1, sway = 0) =>
  ps1Material({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, shade, sway, swayWeight: [0, 1, 0] });
const glow = (map: THREE.Texture, amount: number, alphaTest = 0) =>
  ps1Material({ map, vertexColors: true, lit: false, glow: amount, alphaTest, side: alphaTest ? THREE.DoubleSide : THREE.FrontSide });

/** The graveyard's own materials, made once per page and shared by every build. */
export const gm = cache(() => ({
  grass: lit(gt.grass()),
  path: lit(gt.path()),
  pathIndoor: lit(gt.path(), INDOOR),
  stone: lit(gt.stone()),
  stoneIndoor: lit(gt.stone(), INDOOR),
  blocks: lit(gt.blocks()),
  blocksIndoor: ps1Material({ map: gt.blocks(), vertexColors: true, shade: INDOOR, side: THREE.DoubleSide }),
  cobble: lit(gt.cobble()),
  cobbleIndoor: lit(gt.cobble(), INDOOR),
  iron: wired(lit(gt.iron()), [0.16, 0.17, 0.2]),
  ironIndoor: wired(lit(gt.iron(), INDOOR), [0.16, 0.17, 0.2]),
  bark: lit(gt.bark()),
  siding: lit(gt.siding()),
  shingle: lit(gt.shingle()),
  wallpaper: ps1Material({ map: gt.wallpaper(), vertexColors: true, shade: INDOOR, side: THREE.DoubleSide }),
  floor: lit(gt.floor(), INDOOR),
  stairs: lit(gt.stairs(), INDOOR),
  window: glow(gt.window(), 0.55, 0.5),
  pumpkin: lit(gt.pumpkin()),
  face: glow(gt.face(), 0.9, 0.5),
  bone: lit(gt.bone()),
  moon: ps1Material({ map: gt.moon(), lit: false, fog: 0, alphaTest: 0.5, depthWrite: false, tint: 0xd8d8d0 }),
  halo: ps1Material({ map: gt.halo(), lit: false, fog: 0, additive: true, depthWrite: false }),
  mist: ps1Material({ map: gt.mist(), vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide, scroll: [0, 0.03] }),
  ghost: ps1Material({ map: gt.ghost(), vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide, tint: 0x8a9aaa, fog: 0.5 }),
  bat: ps1Material({ map: gt.bat(), vertexColors: true, lit: false, alphaTest: 0.5, side: THREE.DoubleSide, fog: 0.5 }),
  web: ps1Material({ map: gt.web(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, tint: 0xb0b8c8 }),
  coffin: lit(gt.coffin()),
  satin: glow(gt.satin(), 0.7),
  weeds: cutout(gt.weeds(), 1, 0.12),
  portrait: lit(gt.portrait(), INDOOR),
  glass: glow(gt.glass(), 0.45, 0.5),
  skyline: ps1Material({ map: gt.skyline(), vertexColors: true, lit: false, alphaTest: 0.5, side: THREE.DoubleSide, fog: 0.35 }),
  water: ps1Material({ map: gt.water(), vertexColors: true, lit: false, transparent: true, opacity: 0.92, scroll: [0.004, 0.012] }),
  spider: lit(gt.spider()),
  wisp: ps1Material({ map: gt.green(), vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide }),
  soil: lit(gt.soil()),
  flags: lit(gt.flags()),
  gel: glow(gt.gel(), 0.6),
}));

export type GraveMats = ReturnType<typeof gm>;
