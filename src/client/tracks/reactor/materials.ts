import * as THREE from 'three';
import { INDOOR } from '../../render/materials';
import { ps1Material } from '../../render/ps1';
import { cache, hex, make, mixc, scale, tex, type Painter, type RGBA } from '../../render/textures';

const YELLOW = hex('#e8b820');
const INK = hex('#1c1c1e');

/** Yellow edge lines down both sides of a road texture whose u runs across the road. */
function edges(p: Painter, c: RGBA = YELLOW): void {
  const w = p.w;
  for (let y = 0; y < p.h; y++) {
    for (const x of [1, 2, w - 3, w - 2]) p.set(x, y, c);
  }
}

const T = {
  floor: cache(() =>
    make(64, 64, 101, (p) => {
      p.each((x, y) => {
        const tile = (Math.floor(x / 32) + Math.floor(y / 32)) % 2;
        let c = tile ? hex('#5b6066') : hex('#555a60');
        if (x % 32 === 0 || y % 32 === 0) c = hex('#2c2f33');
        else if (x % 32 === 1 || y % 32 === 1) c = hex('#6c7278');
        return c;
      });
      for (const [x, y] of [[4, 4], [28, 4], [4, 28], [28, 28]]) {
        for (const o of [0, 32]) {
          p.set(x + o, y, hex('#7c838a'));
          p.set(x, y + o, hex('#7c838a'));
          p.set(x + o, y + o, hex('#7c838a'));
        }
      }
    }),
  ),
  asphalt: cache(() =>
    make(32, 64, 102, (p) => {
      p.each((x, y) => ((x * 7 + y * 13) % 29 === 0 ? hex('#3a3c41') : hex('#2d2f33')));
      edges(p);
      for (let y = 0; y < 32; y++) for (const x of [15, 16]) p.set(x, y, hex('#d8d8d0'));
    }),
  ),
  plate: cache(() =>
    make(32, 32, 103, (p) => {
      p.each((x, y) => {
        const row = Math.floor(y / 4) % 2;
        const dx = (x + row * 4) % 8;
        const dy = y % 4;
        if (dx === dy * 2 || dx === dy * 2 + 1) return hex('#7a838c');
        if (dx === dy * 2 + 2) return hex('#3c4248');
        return hex('#555c64');
      });
      edges(p);
    }),
  ),
  grating: cache(() =>
    make(32, 32, 104, (p) => {
      p.each((x, y) => {
        const bar = x % 8 < 2 || y % 8 < 2;
        if (!bar) return hex('#131518');
        return x % 8 === 0 || y % 8 === 0 ? hex('#78808a') : hex('#5a616a');
      });
      edges(p);
    }),
  ),
  stripes: cache(() => make(16, 16, 105, (p) => p.each((x, y) => (Math.floor((x + y) / 4) % 2 ? YELLOW : INK)))),
  wall: cache(() =>
    make(32, 32, 106, (p) => {
      p.each((x, y) => {
        if (y === 0) return hex('#22292e');
        if (y === 1) return hex('#5a6870');
        const k = x % 8;
        if (k === 0) return hex('#283036');
        if (k === 1) return hex('#56646c');
        return hex('#3d4a52');
      });
    }),
  ),
  cladding: cache(() =>
    make(32, 32, 107, (p) => {
      p.each((x, y) => {
        if (y < 2) return hex('#3a4044');
        return Math.floor(x / 2) % 2 ? hex('#69737a') : hex('#58616a');
      });
    }),
  ),
  concrete: cache(() =>
    make(32, 32, 108, (p) => {
      p.each((x, y) => {
        if (x === 0 || y === 0) return hex('#6c6c66');
        if ((x === 8 || x === 24) && (y === 8 || y === 24)) return hex('#5e5e58');
        return y < 16 ? hex('#8e8e86') : hex('#88887f');
      });
    }),
  ),
  tube: cache(() =>
    make(32, 32, 109, (p) => {
      p.each((x, y) => {
        if (y < 2) return hex('#1e2428');
        if (x === 15 || x === 16) return hex('#2a3238');
        if (y === 2 || y === 31) return hex('#59646c');
        return hex('#3f4a52');
      });
      for (const x of [4, 27]) for (const y of [6, 26]) p.set(x, y, hex('#76828a'));
    }),
  ),
  paint: cache(() =>
    make(16, 16, 110, (p) => {
      p.each((x, y) => {
        if (x === 0 || y === 0) return hex('#8c8c8c');
        if (x === 15 || y === 15) return hex('#b4b4b4');
        return hex('#d4d4d4');
      });
    }),
  ),
  goo: cache(() =>
    make(32, 32, 111, (p) => {
      const blobs = Array.from({ length: 9 }, () => [p.rng() * 32, p.rng() * 32, 2 + p.rng() * 4] as const);
      p.each((x, y) => {
        let best = 0;
        for (const [cx, cy, r] of blobs) {
          for (const ox of [-32, 0, 32]) {
            for (const oy of [-32, 0, 32]) best = Math.max(best, 1 - Math.hypot(x - cx - ox, y - cy - oy) / r);
          }
        }
        if (best > 0.55) return hex('#e4ff9a');
        if (best > 0.15) return hex('#8cff46');
        return hex('#3fd424');
      });
    }),
  ),
  glow: cache(() => make(8, 8, 112, (p) => p.each((x, y) => (x === 0 || x === 7 || y === 0 || y === 7 ? hex('#4cff70') : hex('#d6ffd8'))))),
  amber: cache(() => make(8, 8, 113, (p) => p.each((x, y) => (x + y < 5 ? hex('#fff0b0') : hex('#ffa412'))))),
  red: cache(() => make(8, 8, 114, (p) => p.each((x, y) => (x + y < 5 ? hex('#ffc0a8') : hex('#ff2a14'))))),
  core: cache(() =>
    make(32, 32, 115, (p) => {
      p.each((x, y) => {
        if (x % 8 < 2) return hex('#0c2a22');
        const t = Math.abs(y - 15.5) / 16;
        return mixc(hex('#eafff4'), hex('#38f0b0'), t);
      });
    }),
  ),
  /** White neon with a soft edge, tinted by vertex colour: strips, hoops, lamp lenses. */
  neon: cache(() => make(8, 8, 116, (p) => p.each((_x, y) => (y === 0 || y === 7 ? hex('#b8b8b8') : y === 1 || y === 6 ? hex('#e4e4e4') : hex('#ffffff'))))),
  /** Bright pulses running along a conduit, v along its length. */
  pulse: cache(() =>
    make(8, 32, 117, (p) => {
      p.each((x, y) => {
        const d = Math.abs(y - 6) / 6;
        const edge = x === 0 || x === 7 ? 0.7 : 1;
        if (y < 12) return scale(mixc(hex('#ffffff'), hex('#606060'), Math.min(1, d)), edge);
        return scale(hex(y % 4 < 2 ? '#3a3a3a' : '#4c4c4c'), edge);
      });
    }),
  ),
  /** The gas giant: soft bands of rust, cream and ochre with a storm. */
  planet: cache(() =>
    make(64, 32, 118, (p) => {
      const bands = [hex('#c4703a'), hex('#e8c08a'), hex('#a85030'), hex('#f0d8a8'), hex('#d08848'), hex('#8a4428'), hex('#e0b070'), hex('#b86038')];
      p.each((x, y) => {
        const wob = Math.sin(x * 0.4 + y * 0.7) * 0.6;
        const c = bands[Math.floor((y + wob) / 4) % bands.length];
        const sx = (x - 40) / 6;
        const sy = (y - 19) / 2.2;
        if (sx * sx + sy * sy < 1) return hex('#7a2a1c');
        if (sx * sx + sy * sy < 1.8) return hex('#e89a68');
        return c;
      });
    }),
  ),
  /** The planet's ring: u across it, banded, with gaps. */
  rings: cache(() =>
    make(32, 4, 119, (p) => {
      p.each((x) => {
        if (x < 2 || x > 29 || x === 12 || x === 13) return [0, 0, 0, 0];
        return x % 5 === 0 ? hex('#8a7058') : x < 12 ? hex('#d8c4a4') : hex('#b89c7c');
      });
    }, true, true),
  ),
  /** A control desk screen: graph bars and a scope trace in green on black. */
  screen: cache(() =>
    make(32, 16, 120, (p) => {
      p.each((x, y) => (x === 0 || y === 0 || x === 31 || y === 15 ? hex('#3a4248') : hex('#04140c')));
      for (let i = 0; i < 6; i++) {
        const h = 2 + Math.floor(p.rng() * 9);
        p.rect(2 + i * 2, 14 - h, 1, h, i % 2 ? hex('#40ff90') : hex('#ffd040'));
      }
      for (let x = 16; x < 30; x++) p.set(x, 8 + Math.round(Math.sin(x * 0.9) * 3), hex('#80fff0'));
    }),
  ),
  /** Station walls at night: dark cladding with rows of lit windows. */
  windows: cache(() =>
    make(32, 32, 121, (p) => {
      p.each((x) => (x % 8 === 0 ? hex("#1a1e24") : hex('#262c34')));
      for (let wy = 4; wy < 32; wy += 10) {
        for (let wx = 2; wx < 32; wx += 8) {
          const lit = p.rng() < 0.6;
          p.rect(wx, wy, 4, 4, lit ? (p.rng() < 0.3 ? hex('#a0ffe0') : hex('#ffe8a8')) : hex('#0c1014'));
        }
      }
    }),
  ),
  /** A fuel tank: white with red and black hoops. */
  tank: cache(() =>
    make(32, 32, 122, (p) => {
      p.each((x, y) => {
        if (y > 4 && y < 8) return hex('#c8241c');
        if (y > 24 && y < 27) return hex('#1a1a1c');
        return x % 8 === 7 ? hex('#c8ccd0') : hex('#e8ecee');
      });
    }),
  ),
  barrel: cache(() =>
    make(16, 32, 117, (p) => {
      p.each((x, y) => {
        if (y < 3 || y > 28 || y === 15 || y === 16) return hex('#2a2a26');
        const d = Math.hypot(x - 7.5, y - 9.5);
        const a = Math.atan2(y - 9.5, x - 7.5);
        if (d < 1.2) return INK;
        if (d < 4.2 && d > 1.8 && Math.cos(a * 3) > 0.3) return INK;
        return x % 4 === 3 ? scale(YELLOW, 0.85) : YELLOW;
      });
    }),
  ),
};

const wired = <M extends THREE.Material>(m: M, tone: [number, number, number]): M => {
  m.userData.wire = tone;
  return m;
};

const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
const glowing = (map: THREE.Texture, glow: number, extra: Partial<Parameters<typeof ps1Material>[0]> = {}) =>
  ps1Material({ map, vertexColors: true, lit: false, glow, ...extra });

/** Reactor's own materials, made once per page and shared by every build of the track. */
export const reactorMats = cache(() => ({
  floorIn: lit(T.floor(), INDOOR),
  floorOut: lit(T.floor()),
  asphalt: lit(T.asphalt()),
  plateIn: lit(T.plate(), INDOOR),
  plateOut: lit(T.plate()),
  gratingIn: lit(T.grating(), INDOOR),
  gratingOut: lit(T.grating()),
  stripesIn: lit(T.stripes(), INDOOR),
  stripesOut: lit(T.stripes()),
  wall: lit(T.wall(), INDOOR),
  cladding: lit(T.cladding()),
  concrete: lit(T.concrete()),
  concreteIn: lit(T.concrete(), INDOOR),
  tube: lit(T.tube(), INDOOR),
  paintIn: wired(lit(T.paint(), INDOOR), [0.3, 0.32, 0.34]),
  paintOut: wired(lit(T.paint()), [0.42, 0.44, 0.46]),
  barrel: lit(T.barrel(), INDOOR),
  tank: lit(T.tank()),
  windows: glowing(T.windows(), 0.15),
  screen: glowing(T.screen(), 0.5),
  neon: glowing(T.neon(), 0.9),
  pulse: glowing(T.pulse(), 0.8, { scroll: [0, -1.4] }),
  planet: ps1Material({ map: T.planet(), fog: 0, lit: false }),
  rings: ps1Material({ map: T.rings(), fog: 0, lit: false, depthWrite: false, alphaTest: 0.5, side: THREE.DoubleSide }),
  goo: glowing(T.goo(), 0.55, { scroll: [0.015, 0.008], wave: 0.05 }),
  gooFall: glowing(T.goo(), 0.7, { scroll: [0, 1.1] }),
  glow: glowing(T.glow(), 0.8),
  amber: glowing(T.amber(), 0.9),
  red: glowing(T.red(), 0.9),
  core: glowing(T.core(), 0.7, { scroll: [0, 0.35] }),
  shine: ps1Material({ map: T.neon(), vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide, glow: 0.5, fog: 0.4 }),
  beam: ps1Material({ map: tex.beam(), vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide, glow: 0.3 }),
  spark: ps1Material({ map: tex.dust(), vertexColors: true, lit: false, additive: true, alphaTest: 0.5, glow: 1.2 }),
  smoke: ps1Material({ map: tex.dust(), vertexColors: true, lit: false, transparent: true, alphaTest: 0.5 }),
}));

export type ReactorMats = ReturnType<typeof reactorMats>;
