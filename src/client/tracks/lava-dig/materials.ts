import * as THREE from 'three';
import { textWidth } from '../../render/font';
import type { RGB } from '../../render/geometry';
import { INDOOR } from '../../render/materials';
import { ps1Material, type Ps1Material } from '../../render/ps1';
import { cache, hex, make, scale, tex, type Painter, type RGBA } from '../../render/textures';
import { atlas } from './kit';

const pal = (...c: string[]): RGBA[] => c.map((v) => hex(v));

/** Random cracks: short dark walks across a texture. */
function cracks(p: Painter, n: number, len: number, c: RGBA): void {
  for (let i = 0; i < n; i++) {
    let x = p.rng() * p.w;
    let y = p.rng() * p.h;
    const dx = p.rng() < 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) {
      p.set(x, y, c);
      if (p.rng() < 0.5) x += dx;
      else y += 1;
    }
  }
}

export const lavaTex = {
  /** Columnar basalt: tall columns, each its own shade, with dark joints and breaks. */
  basalt: cache(() =>
    make(64, 64, 501, (p) => {
      const shades = pal('#2b2624', '#322c29', '#3a332f', '#423a35', '#4b413b');
      for (let c = 0; c < 8; c++) {
        let y = Math.floor(p.rng() * 64);
        const end = y + 64;
        while (y < end) {
          const len = 9 + Math.floor(p.rng() * 16);
          const base = shades[Math.floor(p.rng() * shades.length)];
          for (let j = 0; j < Math.min(len, end - y); j++) {
            for (let i = 0; i < 8; i++) {
              const edge = i === 0 ? 0.55 : i === 1 ? 1.18 : i === 7 ? 0.82 : 1;
              p.set(c * 8 + i, y + j, scale(base, edge));
            }
          }
          for (let i = 0; i < 8; i++) p.set(c * 8 + i, y, scale(base, 0.6));
          y += len;
        }
      }
    }),
  ),

  /** Broken basalt ground: big flat patches with a few cracks. */
  rubble: cache(() =>
    make(64, 64, 502, (p) => {
      const big = p.noise(16);
      const shades = pal('#2c2725', '#342e2a', '#3c3531', '#453c37', '#4f4540');
      p.each((x, y) => p.pick(shades, big(x, y) * 0.9 + p.rng() * 0.08));
      cracks(p, 10, 12, hex('#1b1716'));
    }),
  ),

  /** Molten rock with plates of dark crust drifting on it. */
  lava: cache(() =>
    make(64, 64, 503, (p) => {
      const n = p.noise(14);
      const m = p.noise(6);
      p.each((x, y) => {
        const v = n(x, y) * 0.75 + m(x, y) * 0.25;
        if (v > 0.66) return hex('#2e100a');
        if (v > 0.6) return hex('#55180c');
        if (v > 0.55) return hex('#c4380f');
        if (v > 0.45) return hex('#f26a18');
        if (v > 0.32) return hex('#ff9c2c');
        return hex('#ffd66e');
      });
    }),
  ),

  /** Lava pouring down a wall: bright streaks that scroll down. */
  fall: cache(() =>
    make(32, 64, 504, (p) => {
      const n = p.noise(8);
      const colours = pal('#c8400f', '#f26a18', '#ff9c2c', '#ffc556', '#ffe79a');
      p.each((x, y) => {
        const wobble = Math.sin(y * 0.2 + x * 0.7) * 1.5;
        const v = n(x * 3 + wobble, y * 0.35) * 0.85 + 0.15 * Math.sin((x / 32) * Math.PI);
        return p.pick(colours, v);
      });
    }),
  ),

  ash: cache(() =>
    make(64, 64, 505, (p) => {
      const big = p.noise(20);
      const shades = pal('#5a524d', '#625953', '#6a605a', '#736861');
      p.each((x, y) => p.pick(shades, big(x, y) * 0.92 + p.rng() * 0.06));
      for (let i = 0; i < 26; i++) {
        const x = p.rng() * 64;
        const y = p.rng() * 64;
        const c = hex(p.rng() < 0.6 ? '#3a3431' : '#8c827a');
        p.set(x, y, c);
        p.set(x + 1, y, c);
      }
    }),
  ),

  /** Black gravel road, tyre-worn in two bands. */
  road: cache(() =>
    make(64, 64, 506, (p) => {
      const big = p.noise(10);
      const shades = pal('#38322f', '#3f3834', '#463e39', '#4d443e');
      p.each((x, y) => p.pick(shades, big(x, y) * 0.9 + p.rng() * 0.08));
      for (const centre of [16, 48]) {
        for (let y = 0; y < 64; y++) for (let x = centre - 5; x <= centre + 5; x++) p.set(x, y, scale(p.get(x, y), 0.82));
      }
      for (let y = 0; y < 64; y++) for (const x of [0, 1, 62, 63]) p.set(x, y, scale(p.get(x, y), 1.25));
    }),
  ),

  /** The dig floor: ochre soil marked out in squares with white string and pegs. */
  digFloor: cache(() =>
    make(64, 64, 507, (p) => {
      const big = p.noise(16);
      const shades = pal('#7c5c3a', '#866440', '#8f6c46', '#98744c');
      p.each((x, y) => p.pick(shades, big(x, y) * 0.92 + p.rng() * 0.06));
      for (let i = 0; i < 64; i++) {
        p.set(i, 0, hex('#e6dcc2'));
        p.set(0, i, hex('#e6dcc2'));
        p.set(i, 32, hex('#e6dcc2'));
        p.set(32, i, hex('#e6dcc2'));
      }
      for (const [x, y] of [[0, 0], [32, 0], [0, 32], [32, 32]]) p.rect(x - 1, y - 1, 3, 3, hex('#b88a4a'));
    }),
  ),

  /** An excavated wall: bands of earth laid down over ages. */
  strata: cache(() =>
    make(64, 64, 508, (p) => {
      const bands = pal('#7a5434', '#946c42', '#64462e', '#a8804e', '#5a4230', '#8a6644', '#b48c5a', '#6e5236');
      const heights = [9, 6, 10, 7, 8, 9, 6, 9];
      const wave = p.noise(16);
      p.each((x, y) => {
        const yy = (y + Math.round((wave(x, 0) - 0.5) * 6) + 64) % 64;
        let acc = 0;
        let k = 0;
        while (k < heights.length - 1 && yy >= acc + heights[k]) acc += heights[k++];
        const edge = yy === acc ? 0.78 : 1;
        return scale(bands[k], edge);
      });
      for (let i = 0; i < 18; i++) {
        const x = p.rng() * 64;
        const y = p.rng() * 64;
        p.rect(x, y, 2, 2, hex(p.rng() < 0.5 ? '#3a2c22' : '#c8b088'));
      }
    }),
  ),






  banner: cache(() =>
    make(64, 16, 514, (p) => {
      p.each((x, y) => (y < 2 || y > 13 ? hex((x + y) % 8 < 4 ? '#f2c12e' : '#1c1a18') : hex('#241612')));
      const t = 'LAVA DIG';
      const x = Math.round((64 - textWidth(t, 1)) / 2);
      p.text(t, x + 1, 6, 1, hex('#5a1608'));
      p.text(t, x, 5, 1, hex('#ffb43a'));
    }),
  ),

  /** A bulb's glass, for the strings of work lamps. */
  bulb: cache(() => make(8, 8, 515, (p) => p.each((x, y) => (Math.hypot(x - 3.5, y - 3.5) < 2.5 ? hex('#fffbe0') : hex('#ffd27a'))))),

  /** A soft puff for smoke and heat, cut out with a dither at its rim. */
  puff: cache(() =>
    make(32, 32, 516, (p) => {
      p.each((x, y) => {
        const d = Math.hypot(x - 15.5, y - 15.5) / 15.5;
        if (d > 1) return [0, 0, 0, 0];
        if (d > 0.7 && (x + y) % 2 === 0) return [0, 0, 0, 0];
        return scale(hex('#ffffff'), 1 - d * 0.25);
      });
    }, false),
  ),

  /** A column of erupting lava, bright at the core. */
  spout: cache(() =>
    make(32, 64, 517, (p) => {
      const n = p.noise(8);
      p.each((x, y) => {
        const across = Math.abs(x - 15.5) / 15.5;
        const ragged = 0.75 + 0.25 * n(x, y);
        if (across > ragged) return [0, 0, 0, 0];
        return across < 0.3 ? hex('#fff0a8') : across < 0.6 ? hex('#ffb43a') : hex('#e8541c');
      });
    }, false),
  ),
};

const wired = (m: Ps1Material, tone: RGB): Ps1Material => {
  m.userData.wire = tone;
  return m;
};

/** Lava Dig's own materials, made once per page. Inside ones take little sun, so the lava and lamps light them. */
export const lavaMats = cache(() => {
  const lit = (map: THREE.Texture, shade = 1, side: THREE.Side = THREE.FrontSide) => ps1Material({ map, vertexColors: true, shade, side });
  const glow = (map: THREE.Texture, glow: number, scroll: [number, number] = [0, 0], wave = 0) =>
    ps1Material({ map, vertexColors: true, lit: false, glow, scroll, wave, side: THREE.DoubleSide });
  return {
    ground: lit(lavaTex.ash()),
    groundRock: lit(lavaTex.basalt()),
    groundRubble: lit(lavaTex.rubble()),
    road: lit(lavaTex.road()),
    roadIn: lit(lavaTex.road(), INDOOR),
    basaltOut: lit(lavaTex.basalt()),
    basaltIn: lit(lavaTex.basalt(), INDOOR, THREE.DoubleSide),
    rubbleIn: lit(lavaTex.rubble(), INDOOR),
    rubbleOut: lit(lavaTex.rubble()),
    digFloor: lit(lavaTex.digFloor(), INDOOR),
    digRoad: lit(tex.dirt(), INDOOR),
    strata: lit(lavaTex.strata(), INDOOR, THREE.DoubleSide),
    kit: wired(lit(atlas()), [0.4, 0.4, 0.4]),
    kitIn: wired(lit(atlas(), INDOOR), [0.18, 0.18, 0.18]),
    banner: ps1Material({ map: lavaTex.banner(), vertexColors: true, side: THREE.DoubleSide }),
    steelIn: wired(lit(tex.metal(), INDOOR), [0.16, 0.16, 0.18]),
    steel: wired(lit(tex.metal()), [0.42, 0.43, 0.46]),
    timberIn: wired(lit(tex.planks(), INDOOR), [0.2, 0.14, 0.09]),
    ropeIn: wired(lit(tex.rope(), INDOOR), [0.3, 0.26, 0.18]),
    lava: glow(lavaTex.lava(), 0.7, [0.012, 0.02], 0.12),
    lavaVent: glow(lavaTex.lava(), 0.2, [0.03, 0.05]),
    lavaFlow: glow(lavaTex.lava(), 0.7, [0, -0.09]),
    fall: glow(lavaTex.fall(), 0.9, [0, 0.55]),
    bulb: ps1Material({ map: lavaTex.bulb(), vertexColors: true, lit: false, glow: 0.9 }),
    lamp: ps1Material({ map: tex.lens(), vertexColors: true, lit: false, glow: 0.7 }),
    smoke: ps1Material({ map: lavaTex.puff(), vertexColors: true, lit: false, alphaTest: 0.5, side: THREE.DoubleSide, fog: 0.6 }),
    spout: ps1Material({ map: lavaTex.spout(), vertexColors: true, lit: false, alphaTest: 0.5, side: THREE.DoubleSide, glow: 1.1, scroll: [0, 1.6] }),
  };
});

export type LavaMats = ReturnType<typeof lavaMats>;
