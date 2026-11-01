import * as THREE from 'three';
import { INDOOR } from '../../render/materials';
import { ps1Material } from '../../render/ps1';
import { cache, hex, make, mixc, scale, tex, type Painter, type RGBA } from '../../render/textures';

/** Monster Docks' own textures and materials, painted once per page and shared by every build. */

const paint = {
  asphalt: () =>
    make(64, 64, 501, (p) => {
      const n = p.noise(8);
      p.each((x, y) => scale(hex('#3c3b44'), 0.92 + n(x, y) * 0.12));
      for (let y = 0; y < 64; y++) {
        for (const x of [2, 3, 60, 61]) p.set(x, y, hex('#d8d4c8'));
        if (y % 32 < 16) for (const x of [31, 32]) p.set(x, y, hex('#e8b830'));
      }
    }),
  hatch: () =>
    make(32, 32, 502, (p) => p.each((x, y) => ((x + y) % 16 < 5 ? hex('#d8a830') : scale(hex('#34333a'), 0.95 + ((x * 7 + y * 3) % 5) * 0.02)))),
  concrete: () =>
    make(64, 64, 503, (p) => {
      const tones = Array.from({ length: 4 }, () => 0.9 + p.rng() * 0.14);
      p.each((x, y) => {
        if (x % 32 === 0 || y % 32 === 0) return hex('#6a6560');
        const t = tones[Math.floor(x / 32) + Math.floor(y / 32) * 2];
        return scale(hex('#9a948c'), t + ((x * 13 + y * 7) % 11 === 0 ? -0.06 : 0));
      });
    }),
  /** Light plated steel, coloured by vertex tint: black hull, red bottom, white superstructure, painted cranes. */
  plate: () =>
    make(64, 64, 504, (p) => {
      p.each((x, y) => {
        const seam = y % 16 === 0 || (x + (Math.floor(y / 16) % 2) * 16) % 32 === 0;
        if (seam) return hex('#8c8c90');
        const rivet = (y % 16 === 2 || y % 16 === 14) && x % 4 === 1;
        return rivet ? hex('#e2e2e6') : scale(hex('#c4c4c8'), 0.96 + ((x >> 3) % 2) * 0.03);
      });
    }),
  superstructure: () =>
    make(64, 32, 505, (p) => {
      p.each((x, y) => {
        if (y < 2) return hex('#c8b49a');
        const wx = x % 8;
        const row = y >= 8 && y < 14 ? 0 : y >= 20 && y < 26 ? 1 : -1;
        if (row >= 0 && wx >= 2 && wx < 6) {
          const lit = (Math.floor(x / 8) * 5 + row * 3) % 7 < 4;
          return lit ? hex(wx === 2 ? '#ffd890' : '#ffe8b0') : hex('#283040');
        }
        return scale(hex('#f0ece4'), y % 16 === 15 ? 0.82 : 1);
      });
    }),
  tread: () =>
    make(32, 32, 506, (p) => {
      p.each((x, y) => {
        const d = (x + y) % 8;
        const e = (x - y + 64) % 8;
        if ((d === 0 && y % 16 < 8) || (e === 0 && y % 16 >= 8)) return hex('#a8acb0');
        return scale(hex('#6a6e74'), 0.95 + ((x >> 4) + (y >> 4)) % 2 * 0.05);
      });
      for (let x = 0; x < 32; x++) {
        p.set(x, 0, hex('#d8a830'));
        p.set(x, 1, hex('#1a1a1a'));
      }
    }),
  corrugated: () =>
    make(32, 32, 507, (p) =>
      p.each((x, y) => {
        const rib = x % 4;
        const v = rib === 0 ? 0.72 : rib === 1 ? 1.05 : rib === 2 ? 0.95 : 0.85;
        return scale(hex('#d4d6d8'), v * (y === 31 ? 0.7 : 1));
      }),
    ),
  container: () =>
    make(32, 32, 508, (p) =>
      p.each((x, y) => {
        if (y < 2 || y > 29) return hex('#7a7a7a');
        if (x < 1 || x > 30) return hex('#9a9a9a');
        const rib = (x - 1) % 3;
        return scale(hex('#e6e6e6'), rib === 0 ? 0.74 : rib === 1 ? 1 : 0.9);
      }),
    ),
  truss: () =>
    make(
      32,
      32,
      509,
      (p) =>
        p.each((x, y) => {
          const frame = x < 3 || x > 28;
          const brace = Math.abs(x - y) < 2 || Math.abs(x - (31 - y)) < 2;
          const rung = y < 2;
          if (frame || brace || rung) return scale(hex('#ffffff'), frame ? 1 : 0.85);
          return [0, 0, 0, 0];
        }),
      true,
      true,
    ),
  stripes: () => make(32, 32, 510, (p) => p.each((x, y) => ((x + y) % 16 < 8 ? hex('#f0c020') : hex('#1c1c1c')))),
  skyline: () =>
    make(64, 64, 511, (p) => {
      p.each((x, y) => {
        const wx = x % 4;
        const wy = y % 6;
        if (wx === 0 || wy < 2) return hex('#2a2236');
        const lit = ((Math.floor(x / 4) * 37 + Math.floor(y / 6) * 91) ^ 0x5a) % 9;
        if (lit < 3) return hex(lit === 0 ? '#ffd27a' : lit === 1 ? '#ffe9b0' : '#ff9a4a');
        return hex('#1a1626');
      });
    }),
  beam: () =>
    make(
      16,
      64,
      512,
      (p) =>
        p.each((x, y) => {
          const across = 1 - Math.abs(x - 7.5) / 8;
          const along = y / 63;
          const v = Math.min(1, across * 1.4) * along * along;
          return [255 * v, 255 * v, 255 * v, 255];
        }),
      false,
      false,
    ),
  /** Rings rising up the tractor beam, as a band that repeats. */
  rings: () =>
    make(16, 32, 514, (p) =>
      p.each((_x, y) => {
        const v = 0.28 + 0.72 * Math.max(0, Math.cos(((y % 32) / 32) * Math.PI * 2)) ** 3;
        return [255 * v, 255 * v, 255 * v, 255];
      }),
    ),
  smoke: () =>
    make(
      32,
      64,
      513,
      (p) => {
        const puffs = Array.from({ length: 14 }, () => [p.rng() * 32, p.rng() * 64, 5 + p.rng() * 6] as const);
        p.each((x, y) => {
          let best = 0;
          for (const [cx, cy, r] of puffs) {
            for (const oy of [-64, 0, 64]) best = Math.max(best, 1 - Math.hypot((x - cx) * 1.5, y - cy - oy) / r);
          }
          const edge = 1 - Math.abs(x - 15.5) / 16;
          const v = best * edge * 1.6;
          if (v < 0.25 || (v < 0.5 && (x + y) % 2 === 1)) return [0, 0, 0, 0];
          return scale(hex('#3a3238'), 0.8 + v * 0.5);
        });
      },
      true,
      true,
    ),
};

/** 128px atlas of 32px tiles for the creatures and machines, so they share one material. */
export const ATLAS = {
  fur: [0, 0],
  skin: [1, 0],
  scales: [2, 0],
  belly: [3, 0],
  bone: [0, 1],
  gum: [1, 1],
  chitin: [2, 1],
  raptor: [3, 1],
  ufo: [0, 2],
  iron: [1, 2],
  fin: [2, 2],
  white: [3, 2],
  rust: [0, 3],
  wing: [1, 3],
} as const satisfies Record<string, [number, number]>;
export type Tile = keyof typeof ATLAS;

function tileFill(p: Painter, ox: number, oy: number, f: (x: number, y: number) => RGBA): void {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(ox + x, oy + y, f(x, y));
}

const atlasTexture = () =>
  make(128, 128, 520, (p) => {
    const at = (t: Tile, f: (x: number, y: number) => RGBA) => tileFill(p, ATLAS[t][0] * 32, ATLAS[t][1] * 32, f);
    const strands = Array.from({ length: 32 }, () => p.rng() * 4);
    at('fur', (x, y) => {
      const s = (y + strands[x] * 2) % 6;
      return scale(hex('#4a3a32'), s < 2 ? 0.7 : s < 4 ? 1 : 1.18);
    });
    at('skin', (x, y) => scale(hex('#5e5250'), 0.9 + ((x * 5 + y * 3) % 7) * 0.025 - (y % 8 === 0 ? 0.12 : 0)));
    at('scales', (x, y) => {
      const row = Math.floor(y / 4);
      const cx = (x + (row % 2) * 3) % 6;
      const edge = cx === 0 || y % 4 === 0;
      return edge ? hex('#1e4a26') : scale(hex('#3f8a3a'), 0.9 + (cx / 6) * 0.25);
    });
    at('belly', (_x, y) => (y % 5 === 0 ? hex('#7a8a3a') : scale(hex('#b8c060'), 0.95 + (y % 5) * 0.02)));
    at('bone', (x, y) => scale(hex('#efe6cc'), 0.92 + (y / 32) * 0.1 - (x % 9 === 0 ? 0.05 : 0)));
    at('gum', (x, y) => scale(hex('#8a2030'), 0.85 + (((x >> 2) + (y >> 2)) % 2) * 0.12));
    at('chitin', (x, y) => {
      const band = y % 10 < 2;
      const shine = x > 10 && x < 15 && y % 10 > 3 && y % 10 < 7;
      return shine ? hex('#c86a40') : band ? hex('#2a0e0a') : hex('#6a2214');
    });
    at('raptor', (x, y) => {
      const stripe = (x + Math.floor(y / 2)) % 10 < 3;
      return stripe ? hex('#3a4a20') : scale(hex('#8a9a48'), 0.92 + ((x * 3 + y) % 5) * 0.03);
    });
    at('ufo', (x, y) => {
      if (y % 8 === 0 || x % 16 === 0) return hex('#6a7078');
      return scale(hex('#c8d0d8'), 0.92 + (y % 8) * 0.015);
    });
    at('iron', (x, y) => scale(hex('#3a3634'), 0.9 + ((x * 7 + y * 11) % 13) * 0.012));
    at('fin', (x, y) => scale(hex('#2a6a5a'), 0.85 + ((x + y) % 8) * 0.03));
    at('white', () => hex('#ffffff'));
    at('rust', (x, y) => scale(hex('#8a4a2a'), 0.85 + ((x * 3 + y * 5) % 9) * 0.03));
    at('wing', (x, y) => scale(hex('#c8d8e0'), 0.9 + ((x + y) % 4) * 0.03));
  });

/** 64px atlas of 16px tiles of things that glow: lamps, windows, eyes, beacons. */
export const GLOW = {
  sodium: [0, 0],
  window: [1, 0],
  red: [2, 0],
  amber: [3, 0],
  eye: [0, 1],
  apeEye: [1, 1],
  green: [2, 1],
  white: [3, 1],
  fire: [0, 2],
  blue: [1, 2],
  porthole: [2, 2],
  magenta: [3, 2],
} as const satisfies Record<string, [number, number]>;
export type GlowTile = keyof typeof GLOW;

const glowTexture = () =>
  make(64, 64, 521, (p) => {
    const at = (t: GlowTile, f: (x: number, y: number) => RGBA) => {
      const [ox, oy] = GLOW[t];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(ox * 16 + x, oy * 16 + y, f(x, y));
    };
    const radial = (inner: string, outer: string) => (x: number, y: number) => mixc(hex(inner), hex(outer), Math.min(1, Math.hypot(x - 7.5, y - 7.5) / 8));
    at('sodium', radial('#fff4d0', '#ff9a30'));
    at('window', (x, y) => (x % 8 === 0 || y % 8 === 0 ? hex('#3a2a20') : hex((x >> 3) + (y >> 3) === 1 ? '#ffe0a0' : '#ffc860')));
    at('red', radial('#ffd0c0', '#e01810'));
    at('amber', radial('#fff0b0', '#ff8a00'));
    at('eye', (x, y) => (Math.abs(x - 7.5) < 1.2 ? hex('#200800') : mixc(hex('#fffaa0'), hex('#f08a00'), Math.min(1, Math.hypot(x - 7.5, y - 7.5) / 8))));
    at('apeEye', radial('#fff0c0', '#e04010'));
    at('green', radial('#e8ffe0', '#30e060'));
    at('white', () => hex('#ffffff'));
    at('fire', (x, y) => mixc(hex('#fff2b0'), hex('#ff5a10'), Math.min(1, (y / 16) * 0.6 + Math.abs(x - 7.5) / 12)));
    at('blue', radial('#ffffff', '#80b0ff'));
    at('porthole', (x, y) => (Math.hypot(x - 7.5, y - 7.5) > 6.5 ? hex('#606468') : hex('#ffd890')));
    at('magenta', radial('#ffe0ff', '#c020c0'));
  });

/** Maps a geometry's 0..1 uvs into one tile of an atlas, a hair inside its edges. */
export function inTile(g: THREE.BufferGeometry, tile: readonly [number, number], tiles: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  const size = 1 / tiles;
  for (let i = 0; i < uv.count; i++) {
    const u = Math.min(1, Math.max(0, uv.getX(i)));
    const v = Math.min(1, Math.max(0, uv.getY(i)));
    uv.setXY(i, (tile[0] + 0.03 + u * 0.94) * size, 1 - (tile[1] + 0.03 + (1 - v) * 0.94) * size);
  }
  return g;
}

export const skin = (g: THREE.BufferGeometry, t: Tile) => inTile(g, ATLAS[t], 4);
export const lamp = (g: THREE.BufferGeometry, t: GlowTile) => inTile(g, GLOW[t], 4);

const wired = (m: THREE.ShaderMaterial, tone: number[]) => {
  m.userData.wire = tone;
  return m;
};

export const looks = cache(() => {
  const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
  const plate = paint.plate();
  const corrugated = paint.corrugated();
  const concrete = paint.concrete();
  const atlas = atlasTexture();
  const beam = paint.beam();
  return {
    asphalt: lit(paint.asphalt()),
    hatch: lit(paint.hatch()),
    concrete: lit(concrete),
    concreteIndoor: lit(concrete, INDOOR),
    plate: wired(lit(plate), [0.45, 0.45, 0.48]),
    plateIndoor: ps1Material({ map: plate, vertexColors: true, shade: INDOOR, side: THREE.DoubleSide }),
    superstructure: lit(paint.superstructure()),
    tread: lit(paint.tread(), INDOOR),
    crateIndoor: lit(tex.crate(), INDOOR),
    alarm: ps1Material({ map: tex.white(), vertexColors: true, lit: false, glow: 1 }),
    corrugated: lit(corrugated),
    corrugatedIndoor: ps1Material({ map: corrugated, vertexColors: true, shade: INDOOR, side: THREE.DoubleSide }),
    container: lit(paint.container()),
    truss: wired(ps1Material({ map: paint.truss(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }), [0.7, 0.45, 0.15]),
    stripes: lit(paint.stripes()),
    creature: ps1Material({ map: atlas, vertexColors: true }),
    glow: ps1Material({ map: glowTexture(), vertexColors: true, lit: false, glow: 0.9 }),
    skyline: ps1Material({ map: paint.skyline(), vertexColors: true, lit: false, fog: 0.55, glow: 0.25, side: THREE.DoubleSide }),
    beam: ps1Material({ map: beam, vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide, fog: 0.3 }),
    tractor: ps1Material({ map: paint.rings(), vertexColors: true, lit: false, additive: true, side: THREE.DoubleSide, scroll: [0, 0.5] }),
    smoke: ps1Material({ map: paint.smoke(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, scroll: [0, -0.12], fog: 0.7 }),
    water: ps1Material({ map: tex.water(), vertexColors: true, transparent: true, opacity: 0.86, wave: 0.18, scroll: [0.012, 0.007] }),
  };
});

export type Looks = ReturnType<typeof looks>;
