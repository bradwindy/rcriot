import * as THREE from 'three';
import { INDOOR } from '../../render/materials';
import { ps1Material } from '../../render/ps1';
import { cache, hex, make, mixc, planks, scale, type Painter, type RGBA } from '../../render/textures';

/** Dark interiors: the laboratory and the dungeon. The tower is open to the sky, so it keeps a little moonlight. */
const TOWER_SHADE = 0.45;

/** Courses of dressed blocks with a lit top edge and a dark joint, each block one flat tone. */
function blocks(p: Painter, tones: string[], joint: string, rowH: number, blockW: number): void {
  const rows = Math.round(p.h / rowH);
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 ? blockW / 2 : 0;
    const count = Math.round(p.w / blockW);
    for (let b = 0; b < count; b++) {
      const tone = hex(tones[Math.floor(p.rng() * tones.length)]);
      for (let y = 0; y < rowH; y++) {
        for (let x = 0; x < blockW; x++) {
          let c = tone;
          if (y === 0 || x === 0) c = hex(joint);
          else if (y === 1) c = scale(tone, 1.18);
          else if (y === rowH - 1 || x === blockW - 1) c = scale(tone, 0.82);
          p.set(b * blockW + x + shift, r * rowH + y, c);
        }
      }
    }
  }
}

/** Posterised soft blotches: a few flat tones, never grain. */
function blotches(p: Painter, tones: string[], cell: number): void {
  const n = p.noise(cell);
  const m = p.noise(cell / 2);
  p.each((x, y) => p.pick(tones.map((c) => hex(c)), n(x, y) * 0.75 + m(x, y) * 0.25));
}

export const tex = {
  stone: cache(() => make(64, 64, 301, (p) => blocks(p, ['#56606e', '#4e5865', '#5d6674', '#48515d'], '#262b33', 8, 16))),
  dungeon: cache(() => make(64, 64, 302, (p) => blocks(p, ['#4f5a4c', '#46503f', '#56604f', '#3f4838'], '#1f241c', 10, 21))),
  flags: cache(() =>
    make(64, 64, 303, (p) => {
      const tones = ['#5a5f62', '#53585b', '#61666a', '#4d5255'].map((c) => hex(c));
      const cuts = [0, 14, 30, 46, 64];
      for (let j = 0; j < 4; j++) {
        const off = j % 2 ? 9 : 0;
        for (let i = 0; i < 4; i++) {
          const tone = tones[Math.floor(p.rng() * tones.length)];
          const x0 = cuts[i] + off;
          const w = cuts[i + 1] - cuts[i];
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < w; x++) {
              const c = y === 0 || x === 0 ? hex('#2c3033') : y === 1 || x === 1 ? scale(tone, 1.12) : tone;
              p.set(x0 + x, j * 16 + y, c);
            }
          }
        }
      }
    }),
  ),
  setts: cache(() => make(32, 32, 304, (p) => blocks(p, ['#4a4c52', '#525459', '#44464c', '#58595e'], '#1e1f23', 6, 8))),
  mud: cache(() =>
    make(32, 64, 305, (p) => {
      blotches(p, ['#3d3127', '#45382c', '#4c3e30'], 12);
      for (const ru of [8, 23]) {
        for (let y = 0; y < 64; y++) {
          const w = 3 + Math.round(Math.sin(y * 0.3) * 0.6);
          for (let x = -w; x <= w; x++) p.set(ru + x, y, scale(p.get(ru + x, y), Math.abs(x) === w ? 0.78 : 0.7));
        }
      }
      for (let k = 0; k < 3; k++) {
        const cx = 6 + p.rng() * 20;
        const cy = p.rng() * 64;
        for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) if ((x / 5) ** 2 + (y / 3) ** 2 < 1) p.set(cx + x, cy + y, hex(y < -1 ? '#7b8a9c' : '#4e5a68'));
      }
    }),
  ),
  grass: cache(() => make(64, 64, 306, (p) => blotches(p, ['#2e3424', '#353b28', '#3d412c', '#433f2d'], 16))),
  cliff: cache(() =>
    make(32, 32, 307, (p) => {
      blotches(p, ['#3e4045', '#46484d', '#4f5156'], 10);
      for (let k = 0; k < 7; k++) {
        const x = p.rng() * 32;
        const y = p.rng() * 32;
        const len = 4 + p.rng() * 8;
        p.line(x, y, x + len, y + len * 0.6, hex('#2a2b30'));
        p.line(x, y - 1, x + len, y + len * 0.6 - 1, hex('#62646a'));
      }
    }),
  ),
  timber: cache(() => make(32, 32, 308, (p) => planks(p, ['#4a3423', '#3f2c1e', '#553c28'].map((c) => hex(c)), hex('#1c130c'), 4, true))),
  iron: cache(() =>
    make(16, 16, 309, (p) => {
      p.each((_x, y) => hex(y === 7 ? '#1a1d22' : y === 8 ? '#4a505a' : '#30353d'));
      for (const [x, y] of [[2, 2], [13, 2], [2, 12], [13, 12]]) p.set(x, y, hex('#7a808a'));
    }),
  ),
  copper: cache(() => make(16, 16, 310, (p) => p.each((_x, y) => hex(y % 3 === 0 ? '#5a2c16' : y % 3 === 1 ? '#c8743a' : '#9a5228')))),
  brass: cache(() =>
    make(16, 16, 311, (p) => p.each((x, y) => hex(x === 0 || y === 0 ? '#5c4618' : x === 15 || y === 15 ? '#e8c870' : (x + y) % 9 === 0 ? '#d8b458' : '#b8922e'))),
  ),
  bubbles: cache(() =>
    make(16, 32, 312, (p) => {
      p.each((x) => mixc(hex('#3fd23a'), hex('#9cff6a'), Math.abs(x - 7.5) < 3 ? 0.6 : 0.2));
      for (let k = 0; k < 9; k++) {
        const cx = 2 + p.rng() * 12;
        const cy = p.rng() * 32;
        const r = 0.8 + p.rng() * 1.6;
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, y) < r) p.set(cx + x, cy + y, hex(Math.hypot(x, y) > r - 0.9 ? '#eaffd0' : '#7ef05a'));
      }
    }),
  ),
  glass: cache(() =>
    make(16, 16, 313, (p) => p.each((x, y) => (x === 4 || x === 5) && y > 2 && y < 13 ? hex('#ffffff') : hex(y < 4 ? '#d0d0d0' : '#a8a8a8'))),
  ),
  sheet: cache(() =>
    make(32, 32, 314, (p) => {
      p.each((x, y) => {
        const fold = Math.sin(x * 0.55 + Math.sin(y * 0.2) * 2);
        return hex(fold > 0.75 ? '#bfbcb2' : fold < -0.85 ? '#f4f1e8' : '#e2ded2');
      });
    }),
  ),
  slate: cache(() =>
    make(32, 32, 315, (p) => {
      p.each((x, y) => {
        const row = Math.floor(y / 6);
        const lx = (x + (row % 2) * 4) % 8;
        const ly = y % 6;
        const edge = Math.hypot(lx - 3.5, ly - 5.5) > 4.6;
        return hex(edge ? '#1d2129' : ly < 2 ? '#3c4352' : row % 3 ? '#323845' : '#363d4b');
      });
    }),
  ),
  /** A lit gothic window: warm panes and leading, the arch cut out at the top. */
  window: cache(() =>
    make(16, 32, 316, (p) => {
      p.each((x, y) => {
        const arch = y < 8 && Math.hypot(x - 7.5, y - 8) > 7.5;
        if (arch) return [0, 0, 0, 0];
        if (x === 0 || x === 15 || y === 31 || x === 7 || x === 8 || y % 8 === 0) return hex('#2a1c10');
        return mixc(hex('#ffd27a'), hex('#ff9a3a'), y / 32);
      });
    }, false),
  ),
  /** The laboratory's tall windows seen from inside: the storm, blue-black, flaring white in a flash. */
  storm: cache(() =>
    make(16, 32, 317, (p) => {
      p.each((x, y) => {
        const arch = y < 8 && Math.hypot(x - 7.5, y - 8) > 7.5;
        if (arch) return [0, 0, 0, 0];
        if (x === 0 || x === 15 || y === 31 || x === 7 || x === 8 || y % 8 === 0) return hex('#0c0e14');
        const streak = (x * 3 + y) % 11 === 0;
        return streak ? hex('#9ab4e0') : mixc(hex('#3a5280'), hex('#1c2a48'), y / 32);
      });
    }, false),
  ),
  /** Across an electric arc: a white core with blue edges that fade to black, drawn additively. */
  arc: cache(() =>
    make(16, 4, 318, (p) => {
      p.each((x) => {
        const d = Math.abs(x - 7.5) / 7.5;
        return d < 0.25 ? hex('#ffffff') : d < 0.55 ? hex('#a8d8ff') : d < 0.85 ? hex('#3a6cd8') : hex('#000000');
      });
    }),
  ),
  goo: cache(() =>
    make(32, 32, 319, (p) => {
      const n = p.noise(10);
      p.each((x, y) => {
        const v = n(x, y);
        const band = Math.abs(((v * 5) % 1) - 0.5) < 0.08;
        return hex(band ? '#7cd84a' : v > 0.55 ? '#2f6a24' : '#24521c');
      });
    }),
  ),
  cloud: cache(() =>
    make(64, 32, 320, (p) => {
      const n = p.noise(12);
      p.each((x, y) => {
        const edge = Math.sin((x / 64) * Math.PI) * 0.55 + n(x, y) * 0.6;
        const t = y / 31;
        if (t > edge + 0.2) return [0, 0, 0, 0];
        return hex(t < edge * 0.45 ? '#3a3448' : '#26222f');
      });
    }, false),
  ),
  banner: cache(() =>
    make(16, 32, 321, (p) => {
      p.each((x, y) => {
        const tatter = y > 26 + ((x * 7) % 5);
        if (tatter) return [0, 0, 0, 0];
        if (x < 1 || x > 14) return hex('#1a0c0c');
        const bolt = Math.abs(x - 7.5 - (y < 14 ? (y - 8) * 0.5 : (14 - y) * 0.6 + 3)) < 1.2 && y > 6 && y < 22;
        return bolt ? hex('#f0e070') : hex(y % 10 === 0 ? '#4a1414' : '#6e1a1a');
      });
    }, false),
  ),
  plaster: cache(() =>
    make(32, 32, 322, (p) => {
      p.each((x, y) => {
        const beam = x < 2 || x > 29 || y < 2 || y > 29 || Math.abs(x - y) < 1.5 || (y > 14 && y < 17);
        return hex(beam ? '#2e2016' : (x + y * 3) % 17 === 0 ? '#bdb59e' : '#cfc7ae');
      });
    }),
  ),
  thatch: cache(() => make(32, 32, 323, (p) => p.each((x, y) => hex((x * 3 + (y % 4)) % 7 < 2 ? '#4a3a22' : y % 8 < 1 ? '#3a2c18' : '#6a5532')))),
  panel: cache(() =>
    make(32, 32, 324, (p) => {
      p.each(() => hex('#24282e'));
      for (const [cx, cy] of [[8, 9], [23, 9]]) {
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x, y) < 5) p.set(cx + x, cy + y, hex(Math.hypot(x, y) > 4.2 ? '#b8922e' : '#e8e2c8'));
        p.line(cx, cy, cx + 3, cy - 2, hex('#c81e1e'));
      }
      const lights = ['#ff3a2a', '#ffd23a', '#4aff5a', '#4ac8ff'];
      for (let i = 0; i < 6; i++) p.rect(3 + i * 5, 19, 3, 3, hex(lights[i % 4]));
      for (let i = 0; i < 4; i++) p.rect(4 + i * 7, 25, 2, 5, hex('#8a8f96'));
    }),
  ),
  bark: cache(() => make(16, 32, 325, (p) => p.each((x, y) => hex((x + Math.floor(y / 5)) % 5 === 0 ? '#1e1a17' : x % 4 === 1 ? '#3e3732' : '#2f2925')))),
  tile: cache(() => make(32, 32, 326, (p) => p.each((x, y) => (x % 16 === 0 || y % 16 === 0 ? hex('#15161a') : (Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? hex('#2c2f36') : hex('#4a4e57'))))),
  /** Falling rain: thin blue-white streaks on black, drawn additively round the camera. */
  rain: cache(() =>
    make(32, 64, 328, (p) => {
      p.each(() => hex('#000000'));
      for (let k = 0; k < 14; k++) {
        const x = Math.floor(p.rng() * 32);
        const y = Math.floor(p.rng() * 64);
        const len = 6 + Math.floor(p.rng() * 10);
        for (let i = 0; i < len; i++) p.set(x, y + i, mixc(hex('#202838'), hex('#8a9cc0'), i / len));
      }
    }),
  ),
  white: cache(() => make(4, 4, 329, (p) => p.each(() => hex('#ffffff')))),
  /** A charged electrode's skin: pale blue-white with a darker crackle. */
  orb: cache(() =>
    make(16, 16, 330, (p) => {
      p.each((x, y) => hex(Math.abs(Math.sin(x * 0.9 + y * 0.4)) < 0.18 ? '#4a7ad8' : (x * 7 + y * 3) % 11 === 0 ? '#ffffff' : '#a8d4ff'));
    }),
  ),
  /** A green warning lamp lens and a red one, side by side. */
  lamp: cache(() => make(16, 8, 331, (p) => p.each((x, y) => hex(Math.hypot((x % 8) - 3.5, y - 3.5) > 3.4 ? '#202020' : x < 8 ? '#ff4a2a' : '#7aff4a')))),
  /** The creature's grey-green hide, with a stitched seam. */
  skin: cache(() =>
    make(16, 16, 332, (p) => {
      p.each((x, y) => hex((x + y * 2) % 13 === 0 ? '#5e7a52' : '#6e8c5e'));
      for (let x = 2; x < 14; x++) p.set(x, 8, hex('#2a3226'));
      for (let x = 3; x < 14; x += 3) for (const y of [7, 9]) p.set(x, y, hex('#2a3226'));
    }),
  ),
  /** A searchlight's beam: bright at the lamp, fading to nothing far up, drawn additively. */
  beam: cache(() => make(4, 32, 333, (p) => p.each((_x, y) => mixc(hex('#000000'), hex('#6a7490'), Math.pow(1 - y / 31, 1.6))))),
  coal: cache(() => make(16, 16, 327, (p) => p.each((x, y) => hex((x * 5 + y * 3) % 7 === 0 ? '#ffb03a' : (x + y) % 3 === 0 ? '#c8401a' : '#5a1a0c')))),
};

const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
const wired = (m: THREE.ShaderMaterial, tone: number[]) => {
  m.userData.wire = tone;
  return m;
};
const glow = (map: THREE.Texture, amount: number, extra: Partial<Parameters<typeof ps1Material>[0]> = {}) =>
  ps1Material({ map, vertexColors: true, lit: false, glow: amount, ...extra });

/** Mad Lab's own materials, made once per page. */
export const madMats = cache(() => ({
  stone: lit(tex.stone()),
  stoneIn: lit(tex.stone(), INDOOR),
  stoneTower: ps1Material({ map: tex.stone(), vertexColors: true, shade: TOWER_SHADE, side: THREE.DoubleSide }),
  dungeon: lit(tex.dungeon(), INDOOR),
  flags: lit(tex.flags()),
  setts: lit(tex.setts()),
  settsIn: lit(tex.setts(), INDOOR),
  settsTower: lit(tex.setts(), TOWER_SHADE),
  tile: lit(tex.tile(), INDOOR),
  mud: lit(tex.mud()),
  grass: lit(tex.grass()),
  cliff: lit(tex.cliff()),
  /** The far crags keep some of their shape through the fog, so they read as a black skyline. */
  crag: ps1Material({ map: tex.cliff(), vertexColors: true, fog: 0.72, side: THREE.DoubleSide }),
  timber: wired(lit(tex.timber()), [0.3, 0.2, 0.13]),
  timberIn: lit(tex.timber(), INDOOR),
  iron: wired(lit(tex.iron()), [0.22, 0.24, 0.28]),
  ironIn: wired(lit(tex.iron(), INDOOR), [0.16, 0.17, 0.2]),
  copper: lit(tex.copper(), 0.6),
  brass: lit(tex.brass(), 0.6),
  copperIn: lit(tex.copper(), INDOOR),
  brassIn: lit(tex.brass(), INDOOR),
  skin: lit(tex.skin(), INDOOR),
  sheetIn: lit(tex.sheet(), INDOOR),
  sheet: lit(tex.sheet(), 0.5),
  sail: ps1Material({ map: tex.sheet(), vertexColors: true, side: THREE.DoubleSide }),
  slate: lit(tex.slate()),
  plaster: lit(tex.plaster()),
  thatch: lit(tex.thatch()),
  bark: wired(lit(tex.bark()), [0.12, 0.1, 0.09]),
  /** Bubbling green in the vats and the moat, rising and rolling. */
  vat: glow(tex.bubbles(), 0.7, { scroll: [0, 0.25] }),
  flask: glow(tex.glass(), 0.6),
  window: glow(tex.window(), 0.55, { alphaTest: 0.5, side: THREE.DoubleSide }),
  storm: glow(tex.storm(), 0, { alphaTest: 0.5, side: THREE.DoubleSide }),
  panel: glow(tex.panel(), 0.15),
  coal: glow(tex.coal(), 0.8),
  /** Electric arcs, Tesla toroids and the lightning: added on top, pushed into the bloom. */
  arc: ps1Material({ map: tex.arc(), vertexColors: true, lit: false, glow: 1.2, additive: true, side: THREE.DoubleSide, fog: 0.3 }),
  goo: ps1Material({ map: tex.goo(), vertexColors: true, lit: false, glow: 0.15, wave: 0.12, scroll: [0.012, 0.008] }),
  cloud: ps1Material({ map: tex.cloud(), vertexColors: true, lit: false, fog: 0, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: false }),
  /** The pendulum's electrode and the coils' toroids when charged: their glow is turned up and down as they work. */
  orb: glow(tex.orb(), 0.6),
  orbCoil: glow(tex.orb(), 0.3),
  lamp: glow(tex.lamp(), 0.8),
  /** Plain white for things coloured by their vertex colours alone: the villagers' clothes and faces. */
  paint: lit(tex.white()),
  beam: ps1Material({ map: tex.beam(), vertexColors: true, lit: false, fog: 0.4, additive: true, side: THREE.DoubleSide }),
  rain: ps1Material({ map: tex.rain(), vertexColors: true, lit: false, fog: 0, additive: true, side: THREE.DoubleSide, scroll: [0, 1.6] }),
  /** Washes the sky white-blue in a lightning flash: added over the dome, black the rest of the time. */
  flash: ps1Material({ map: tex.white(), vertexColors: true, lit: false, fog: 0, additive: true, side: THREE.BackSide }),
  banner: ps1Material({ map: tex.banner(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, sway: 0.35, swayWeight: [0, -1, 1] }),
}));

export type MadMats = ReturnType<typeof madMats>;

export function tone(c: string): [number, number, number] {
  const v = hex(c);
  return [v[0] / 255, v[1] / 255, v[2] / 255];
}

export type { RGBA };
