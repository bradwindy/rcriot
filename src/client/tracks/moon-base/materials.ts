import * as THREE from 'three';
import { INDOOR } from '../../render/materials';
import { ps1Material } from '../../render/ps1';
import { cache, hex, make, mixc, scale, type Painter, type RGBA } from '../../render/textures';

const CLEAR: RGBA = [0, 0, 0, 0];
/** Takes the white cladding down, so full sun shows its panels instead of blowing out. */
const HULL = 0xc2c6ce;

/** A little crater pressed into a texture: lit on the upper left of its rim, shaded on the lower right. */
function dent(p: Painter, cx: number, cy: number, r: number, base: RGBA): void {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d > r + 0.6) continue;
      const lit = (-x - y) / Math.max(d, 0.1);
      if (d > r - 0.9) p.set(cx + x, cy + y, scale(base, lit > 0 ? 0.72 : 1.22));
      else if (d > r - 1.9) p.set(cx + x, cy + y, scale(base, lit > 0 ? 1.12 : 0.86));
      else p.set(cx + x, cy + y, scale(base, 0.92));
    }
  }
}

/** Flat tones in broad patches, so the ground reads clean rather than noisy. */
function patches(p: Painter, tones: RGBA[], cell: number): void {
  const n = p.noise(cell);
  p.each((x, y) => p.pick(tones, n(x, y) * 0.999));
}

const T = {
  regolith: cache(() =>
    make(64, 64, 501, (p) => {
      patches(p, ['#8a8984', '#92918c', '#9a9994'].map((c) => hex(c)), 24);
      for (let i = 0; i < 7; i++) dent(p, p.rng() * 64, p.rng() * 64, 2 + Math.floor(p.rng() * 4), hex('#93928d'));
      for (let i = 0; i < 16; i++) {
        const x = p.rng() * 64;
        const y = p.rng() * 64;
        p.set(x, y, hex('#62615d'));
        p.set(x - 1, y - 1, hex('#b4b3ad'));
      }
    }),
  ),

  /** The groomed rover lane: darker packed dust with two tread tracks and pale edges. */
  lane: cache(() =>
    make(64, 64, 502, (p) => {
      patches(p, ['#706f6c', '#757471', '#7a7976'].map((c) => hex(c)), 32);
      for (const centre of [17, 47]) {
        for (let y = 0; y < 64; y++) {
          for (let x = centre - 5; x <= centre + 5; x++) {
            const chevron = (y + Math.abs(x - centre)) % 6 < 2;
            p.set(x, y, scale(p.get(x, y), Math.abs(x - centre) > 4 ? 0.9 : chevron ? 0.74 : 0.86));
          }
        }
      }
      for (let y = 0; y < 64; y++) for (const x of [0, 1, 62, 63]) p.set(x, y, hex('#a2a19c'));
    }),
  ),

  /** Riveted deck plates for the base floors and the tube. */
  plates: cache(() =>
    make(64, 64, 503, (p) => {
      p.each((x, y) => {
        const seam = x % 32 === 0 || y % 32 === 0;
        if (seam) return hex('#33373d');
        const edge = x % 32 === 1 || y % 32 === 1;
        const tread = (x + y * 3) % 8 === 0 && (x * 3 - y) % 8 < 3;
        return edge ? hex('#7d848c') : tread ? hex('#565c64') : hex('#646a72');
      });
      for (let i = 0; i < 4; i++) for (const [x, y] of [[4, 4], [28, 4], [4, 28], [28, 28]]) p.set(x + (i % 2) * 32, y + Math.floor(i / 2) * 32, hex('#a6adb5'));
    }),
  ),

  stripes: cache(() =>
    make(32, 32, 504, (p) => p.each((x, y) => ((x + y) % 16 < 8 ? hex('#f2b818') : hex('#222226'))))),

  /** Wall panels. u runs up the wall, v along the corridor: a seam round each panel and a blue band low down. */
  wall: cache(() =>
    make(32, 64, 505, (p) => {
      p.each((x, y) => {
        if (y === 0 || y === 63) return hex('#5e646c');
        if (x === 0 || x === 31) return hex('#6e747c');
        if (x >= 5 && x <= 8) return hex('#2c6cc0');
        if (x === 9) return hex('#1c4a88');
        if (y === 1 || x === 1) return hex('#e8ecf0');
        return hex('#c4c9cf');
      });
      for (const y of [12, 28, 44]) p.rect(18, y, 6, 3, hex('#8c939b'));
    }),
  ),

  ceiling: cache(() =>
    make(32, 32, 506, (p) => p.each((x, y) => (y % 16 < 2 ? hex('#2a2e34') : x % 8 === 0 ? hex('#3c4148') : hex('#4c525a'))))),

  /** White module cladding for the outsides of the base, in big clean panels. */
  hull: cache(() =>
    make(64, 64, 507, (p) => {
      p.each((x, y) => {
        if (x % 32 === 0 || y % 16 === 0) return hex('#9ea2a6');
        if (x % 32 === 1 || y % 16 === 1) return hex('#ffffff');
        return hex('#e2e3e0');
      });
      for (const [x, y] of [[8, 6], [40, 22], [20, 38], [52, 54]]) p.rect(x, y, 5, 3, hex('#6c7076'));
    }),
  ),

  glass: cache(() =>
    make(32, 32, 508, (p) => {
      p.each((x, y) => {
        const streak = (x + y) % 32;
        if (streak === 3 || streak === 4 || streak === 9) return [235, 250, 255, 120];
        return [160, 215, 240, 64];
      });
    }, true, false),
  ),

  strip: cache(() => make(8, 8, 509, (p) => p.each((x) => (x === 0 || x === 7 ? hex('#9cc8ff') : hex('#f2f8ff'))))),

  /** Four screens in one: radar, bars, a map of the moon and a trace. */
  screens: cache(() =>
    make(64, 64, 510, (p) => {
      p.each(() => hex('#06100c'));
      // Radar
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const d = Math.hypot(x - 15.5, y - 15.5);
          if (Math.abs(d - 13) < 0.6 || Math.abs(d - 8) < 0.5 || Math.abs(x - 15.5) < 0.5 || Math.abs(y - 15.5) < 0.5) p.set(x, y, hex('#1f7a3a'));
          const a = Math.atan2(y - 15.5, x - 15.5);
          if (d < 13 && a > 0.2 && a < 0.9) p.set(x, y, mixc(hex('#0d2a16'), hex('#56f07a'), (a - 0.2) / 0.7));
        }
      }
      for (const [x, y] of [[21, 9], [8, 20], [24, 22]]) p.rect(x, y, 2, 2, hex('#c8ffd0'));
      // Bars
      p.rect(32, 0, 32, 32, hex('#05101a'));
      for (let i = 0; i < 6; i++) {
        const h = 6 + Math.floor(p.rng() * 20);
        p.rect(35 + i * 5, 29 - h, 3, h, i % 2 ? hex('#3ad0ff') : hex('#ffb02e'));
      }
      for (let x = 33; x < 63; x++) p.set(x, 29, hex('#8ab0c8'));
      // Moon map
      p.rect(0, 32, 32, 32, hex('#081018'));
      for (let y = 32; y < 64; y++) {
        for (let x = 0; x < 32; x++) {
          if (x % 8 === 0 || y % 8 === 0) p.set(x, y, hex('#163048'));
          const d = Math.hypot(x - 15.5, y - 47.5);
          if (d < 11) p.set(x, y, d > 10 ? hex('#a8c8e0') : hex(d < 4 || (x - 9) ** 2 + (y - 44) ** 2 < 6 ? '#3a5a78' : '#5c7c98'));
        }
      }
      p.rect(19, 41, 2, 2, hex('#ff4040'));
      // Trace
      p.rect(32, 32, 32, 32, hex('#140a04'));
      for (let x = 32; x < 64; x++) {
        p.set(x, 48, hex('#3a2208'));
        const y = 48 + Math.round(Math.sin(x * 0.55) * 7 * Math.sin(x * 0.12));
        p.set(x, y, hex('#ffb040'));
        p.set(x, y + 1, hex('#a8601c'));
      }
    }),
  ),

  solar: cache(() =>
    make(32, 32, 511, (p) => {
      p.each((x, y) => {
        if (x < 1 || y < 1 || x > 30 || y > 30) return hex('#c0c4c8');
        if (x % 6 === 0 || y % 6 === 0) return hex('#5a78b0');
        return (x + y) % 11 === 0 ? hex('#2a4a90') : hex('#16306c');
      });
    }),
  ),

  gold: cache(() =>
    make(32, 32, 512, (p) => {
      const tones = ['#b8862a', '#d8a838', '#f0cc5a', '#9c6e1e'].map((c) => hex(c));
      p.each((x, y) => {
        const cx = Math.floor(x / 8);
        const cy = Math.floor(y / 8);
        const upper = (x % 8) + (y % 8) < 8;
        return tones[(cx * 3 + cy * 5 + (upper ? 1 : 0)) % tones.length];
      });
    }),
  ),

  moonrock: cache(() =>
    make(32, 32, 513, (p) => {
      patches(p, ['#7c7b77', '#8a8984', '#96958f'].map((c) => hex(c)), 12);
      for (let i = 0; i < 3; i++) dent(p, p.rng() * 32, p.rng() * 32, 2, hex('#8a8984'));
    }),
  ),

  beacon: cache(() => make(8, 8, 514, (p) => p.each((x, y) => (Math.hypot(x - 3.5, y - 3.5) < 2 ? hex('#ffe0d0') : hex('#ff2a1a'))))),

  door: cache(() =>
    make(32, 32, 515, (p) => {
      p.each((x, y) => {
        if (y > 26) return (x + y) % 8 < 4 ? hex('#f2b818') : hex('#222226');
        if (x === 0 || x === 31 || y === 0) return hex('#4a5058');
        if (x >= 12 && x <= 19 && y >= 6 && y <= 13) return hex('#8fd8ff');
        return y % 6 === 0 ? hex('#7a828c') : hex('#9aa2ac');
      });
    }),
  ),

  belt: cache(() => make(16, 16, 516, (p) => p.each((_x, y) => (y % 4 === 0 ? hex('#5a5e62') : hex('#2c2e32'))))),

  /** A latitude and longitude net with bright crossings, for the hologram. */
  holo: cache(() =>
    make(32, 32, 517, (p) => {
      p.each((x, y) => {
        if (x % 8 === 0 && y % 8 === 0) return hex('#ffffff');
        if (x % 8 === 0 || y % 8 === 0) return hex('#38c8ff');
        return (x * 7 + y * 3) % 23 === 0 ? hex('#1a5a78') : CLEAR;
      });
    }, true, false),
  ),

  /** Running lights: bright dashes that the scroll chases along the tube. */
  chase: cache(() => make(4, 16, 518, (p) => p.each((_x, y) => (y < 4 ? hex('#b8f0ff') : y < 6 ? hex('#2a6a9a') : hex('#0a1622'))))),

  flag: cache(() =>
    make(32, 20, 519, (p) => {
      p.each((_x, y) => (Math.floor(y / 2) % 2 ? hex('#f4f2ee') : hex('#c8202a')));
      p.rect(0, 0, 14, 10, hex('#1a2e78'));
      for (let y = 1; y < 10; y += 2) for (let x = 1 + (y % 4 === 1 ? 0 : 1); x < 14; x += 3) p.set(x, y, hex('#f4f2ee'));
    }),
  ),

  earth: cache(() =>
    make(128, 64, 520, (p) => {
      const land = p.noise(18);
      const fine = p.noise(6);
      const cloud = p.noise(10);
      p.each((x, y) => {
        const lat = Math.abs(y - 31.5) / 32;
        if (lat > 0.86) return hex('#f4f8ff');
        const l = land(x, y) * 0.75 + fine(x, y) * 0.25;
        const c = cloud(x * 2, y);
        let col = l > 0.56 ? (lat > 0.55 || l > 0.66 ? hex('#c8b07a') : hex('#4c8c3a')) : l > 0.52 ? hex('#3a7ac8') : hex('#1c4aa0');
        if (lat > 0.7 && l > 0.5) col = hex('#e8eef4');
        if (c > 0.62 && (x + y) % 3 !== 0) col = mixc(col, hex('#ffffff'), 0.85);
        return col;
      });
    }),
  ),

  plant: cache(() =>
    make(32, 32, 521, (p) => {
      const greens = ['#3a8c2e', '#4ea838', '#62c046', '#2c6e24'].map((c) => hex(c));
      p.each(() => CLEAR);
      for (let b = 0; b < 9; b++) {
        const cx = 4 + p.rng() * 24;
        const cy = 4 + p.rng() * 20;
        const r = 3 + p.rng() * 4;
        const c = greens[b % greens.length];
        p.each((x, y) => (Math.hypot(x - cx, (y - cy) * 1.3) < r ? scale(c, y < cy ? 1.1 : 0.9) : null));
      }
      for (let y = 22; y < 32; y++) p.rect(14, y, 3, 1, hex('#5a3c1e'));
    }, false),
  ),
};

/** A material that keeps a one-pixel line when it is far off, for thin posts and rails. */
function wired(m: THREE.ShaderMaterial, tone: [number, number, number]): THREE.ShaderMaterial {
  m.userData.wire = tone;
  return m;
}

/** Moon Base's own materials, made once per page and shared by every build of the track. */
export const moonMats = cache(() => {
  const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
  const glow = (map: THREE.Texture, amount: number) => ps1Material({ map, vertexColors: true, lit: false, glow: amount });
  return {
    regolith: lit(T.regolith()),
    lane: lit(T.lane()),
    plates: lit(T.plates()),
    platesIn: lit(T.plates(), INDOOR),
    stripes: lit(T.stripes()),
    stripesIn: lit(T.stripes(), INDOOR),
    wall: lit(T.wall(), INDOOR),
    ceiling: lit(T.ceiling(), INDOOR),
    hull: ps1Material({ map: T.hull(), vertexColors: true, tint: HULL }),
    frame: wired(ps1Material({ map: T.hull(), vertexColors: true, tint: HULL }), [0.62, 0.63, 0.64]),
    glass: ps1Material({ map: T.glass(), vertexColors: true, lit: false, transparent: true, side: THREE.DoubleSide, fog: 0.6 }),
    strip: glow(T.strip(), 0.9),
    screens: glow(T.screens(), 0.5),
    solar: lit(T.solar()),
    gold: lit(T.gold()),
    rock: lit(T.moonrock()),
    beacon: glow(T.beacon(), 1.2),
    belt: ps1Material({ map: T.belt(), vertexColors: true, shade: INDOOR, scroll: [0, 0.6] }),
    chase: ps1Material({ map: T.chase(), vertexColors: true, lit: false, glow: 0.8, scroll: [0, -1.5] }),
    flag: ps1Material({ map: T.flag(), vertexColors: true, side: THREE.DoubleSide }),
    plant: ps1Material({ map: T.plant(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, shade: 0.6, sway: 0.08 }),
    door: ps1Material({ map: T.door(), vertexColors: true, shade: 0.5 }),
    holo: ps1Material({ map: T.holo(), lit: false, additive: true, side: THREE.DoubleSide, glow: 0.6, scroll: [0.02, 0] }),
    earth: ps1Material({ map: T.earth(), fog: 0 }),
    warn: glow(T.beacon(), 1.2),
    halo: ps1Material({ map: T.strip(), lit: false, fog: 0, additive: true, depthWrite: false, tint: 0x2a5aa0 }),
    laser: ps1Material({ map: T.strip(), lit: false, additive: true, glow: 1.4, tint: 0xff3020, depthWrite: false, side: THREE.DoubleSide }),
    exhaust: ps1Material({ map: T.strip(), lit: false, additive: true, glow: 1.2, tint: 0xffa040, depthWrite: false, side: THREE.DoubleSide }),
    lamp: ps1Material({ map: T.beacon(), lit: false, glow: 1.4 }),
    go: ps1Material({ map: T.strip(), lit: false, glow: 1.4, tint: 0x40ff60 }),
    mountains: ps1Material({ map: T.regolith(), vertexColors: true, fog: 0.35 }),
  };
});

export type MoonMats = ReturnType<typeof moonMats>;
