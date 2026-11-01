import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { SPOTS } from '../../../shared/tracks/lava-dig';
import { Batch, xf } from '../../render/geometry';
import { hash2, smoothstep } from '../../render/noise';
import { frame, headingAt, loft, type Profile } from '../../render/road';
import type { LavaMats } from './materials';
import { along, levelOf, lift, Lights, LAVA_LIGHT } from './util';

/** The dig's cavern: how far its floor reaches beyond the barrier, and how high its roof is, along the lap. */
export interface DigHall {
  a: number;
  b: number;
  level: (s: number) => number;
  /** 0 at the narrow portal and the far end, 1 in the open hall. */
  open: (s: number) => number;
  side: (s: number) => number;
  height: (s: number) => number;
}

export function digHall(track: Track): DigHall {
  const [a, b] = zoneRanges(track, 'dig')[0];
  const level = levelOf(track);
  const jeep = track.marks[SPOTS.jeep];
  const open = (s: number) => smoothstep(a + 8, a + 26, s) * (1 - smoothstep(b - 14, b - 2, s));
  return {
    a,
    b,
    level,
    open,
    side: (s) => 0.6 + 8 * open(s),
    height: (s) => 7.6 + 5.4 * open(s) + 5 * smoothstep(26, 8, Math.abs(s - jeep)),
  };
}

/** A rough arch over the road from wall foot to wall foot, `side` beyond the barrier and `height` over the level line. */
function arch(p: Sample, ring: number, y0: number, side: number, height: number, rough: number, seed: number): [number, number][] {
  const span = limitOf(p) + side;
  const out: [number, number][] = [];
  for (let k = 0; k <= 12; k++) {
    const ang = Math.PI * (1 - k / 12);
    const bulge = Math.sin(ang);
    let o = Math.cos(ang) * (span + 1.6 * Math.sqrt(bulge));
    let h = bulge ** 0.8 * height;
    if (k > 0 && k < 12) {
      o += (hash2(ring, k, seed) - 0.5) * rough;
      h += (hash2(ring, k, seed + 1) - 0.5) * rough * 0.8;
    } else {
      o += Math.sign(o) * 0.4;
      h = -0.6;
    }
    out.push([o, lift(p, o, y0 + h)]);
  }
  return out;
}

/** A floor strip from the road's edge out to `side` beyond the barrier, on the level line, stepping down into dips. */
function floor(side: number, dir: -1 | 1, level: (s: number) => number, width: (s: number) => number): Profile {
  return (p) => {
    const l = limitOf(p);
    const y0 = level(p.s);
    const pts: [number, number, number][] = [
      [dir * (l - 0.05), -0.04, 0],
      [dir * (l + 0.3), lift(p, dir * (l + 0.3), y0 + 0.02), 0.06],
      [dir * (l + width(p.s) + side), lift(p, dir * (l + width(p.s) + side), y0 + 0.02), (width(p.s) + side) / 8],
    ];
    return dir < 0 ? pts.reverse() : pts;
  };
}

/** The dig's cavern: excavated earth walls under a vaulted roof, floored with marked-out squares. */
export function buildDigHall(track: Track, batch: Batch, m: LavaMats, hall: DigHall): void {
  const { a, b, level } = hall;
  for (const dir of [-1, 1] as const) {
    loft(batch, track, a - 4, b + 2, { spacing: 2, vScale: 8, outward: true, material: () => m.digFloor, profile: floor(0, dir, level, hall.side) });
  }
  loft(batch, track, a - 4, b + 2, {
    spacing: 2,
    vScale: 7,
    uScale: 7,
    material: () => m.strata,
    profile: (p, ring) => arch(p, ring, level(p.s), hall.side(p.s), hall.height(p.s), 1.4, 11),
  });
  // Timber shoring every so often, like a mine.
  for (let s = a + 10; s < b - 4; s += 16) {
    const p = sampleAt(track, s);
    const h = headingAt(p);
    const span = limitOf(p) + hall.side(s) - 0.8;
    const top = level(s) + hall.height(s) * 0.82;
    for (const dir of [-1, 1]) {
      const foot = frame(p, dir * span, 0);
      foot.y = level(s);
      batch.box(m.timberIn, 0.6, top - foot.y, 0.6, xf(foot.x, (top + foot.y) / 2, foot.z, h));
      const knee = frame(p, dir * (span - 2.4), 0);
      knee.y = top;
      batch.beam(m.timberIn, foot.clone().setY(top - 2.4), knee, 0.4);
    }
    const l = frame(p, -span, 0).setY(top + 0.3);
    const r = frame(p, span, 0).setY(top + 0.3);
    batch.beam(m.timberIn, l, r, 0.7);
  }
}

/** Lava flowing in a channel along one side of a tunnel, `inner` to `outer` beyond the barrier, `drop` below the level. */
function channel(dir: -1 | 1, inner: number, outer: number, drop: number, level: (s: number) => number): Profile {
  return (p) => {
    const l = limitOf(p);
    const y = level(p.s) - drop;
    const pts: [number, number, number][] = [
      [dir * (l + inner), lift(p, dir * (l + inner), y), 0],
      [dir * (l + outer), lift(p, dir * (l + outer), y), 1],
    ];
    return dir < 0 ? pts.reverse() : pts;
  };
}

/** A sheet of lava pouring from `top` down to `bottom`, `width` wide, facing `normal`. */
export function lavafall(batch: Batch, m: LavaMats, top: THREE.Vector3, bottom: THREE.Vector3, width: number, normal: THREE.Vector3, bulge = 0.6): void {
  const side = new THREE.Vector3(-normal.z, 0, normal.x).normalize().multiplyScalar(width / 2);
  const steps = 6;
  const rows: THREE.Vector3[][] = [];
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const c = top.clone().lerp(bottom, t).addScaledVector(normal, Math.sin(t * Math.PI) * bulge + t * 0.4);
    const w = 1 + t * 0.35;
    rows.push([c.clone().addScaledVector(side, -w), c.clone().addScaledVector(side, w)]);
  }
  const v = (j: number) => ((steps - j) / steps) * (top.y - bottom.y) * 0.12;
  for (let j = 0; j < steps; j++) {
    const quad: [THREE.Vector3, number, number][] = [
      [rows[j][0], 0, v(j)],
      [rows[j + 1][0], 0, v(j + 1)],
      [rows[j][1], 1, v(j)],
      [rows[j][1], 1, v(j)],
      [rows[j + 1][0], 0, v(j + 1)],
      [rows[j + 1][1], 1, v(j + 1)],
    ];
    for (const [p, u, vv] of quad) batch.vertex(m.fall, p, normal, u, vv);
  }
}

/** A pool of lava filling a pit across the road, from s0 to s1 at the level line less `drop`. */
export function pitPool(batch: Batch, m: LavaMats, track: Track, s0: number, s1: number, drop: number, level: (s: number) => number, extra = 1): void {
  loft(batch, track, s0, s1, {
    spacing: 1.5,
    vScale: 8,
    outward: true,
    material: () => m.lava,
    profile: (p) => {
      const l = limitOf(p) + extra;
      const y = level(p.s) - drop;
      return [-l, 0, l].map((o, k) => [o, lift(p, o, y), k * 0.5 * (l / 4)]);
    },
  });
}

/** The lava tube: a smooth round bore with lava running down both sides of the road and a pit across it. */
export function buildTube(track: Track, batch: Batch, m: LavaMats, lights: Lights, flames: THREE.Vector3[]): void {
  const level = levelOf(track);
  for (const [a, b] of zoneRanges(track, 'tube')) {
    loft(batch, track, a - 2, b + 3.6, {
      spacing: 2,
      vScale: 7,
      uScale: 6,
      material: () => m.basaltIn,
      profile: (p, ring) => {
        const l = limitOf(p);
        const y0 = level(p.s);
        const pts: [number, number][] = [];
        const shape: [number, number][] = [
          [l + 0.2, -0.7], [l + 0.6, -1.9], [l + 3.6, -2.0], [l + 4.4, 0.2], [l + 5.0, 3.0], [l + 4.0, 6.0], [l + 1.6, 8.2], [0, 8.8],
        ];
        for (const [o, h] of shape) pts.push([-o, h]);
        for (let k = shape.length - 2; k >= 0; k--) pts.push([shape[k][0], shape[k][1]]);
        return pts.map(([o, h], k) => {
          const end = k === 0 || k === pts.length - 1;
          const jitter = end ? 0 : (hash2(ring, k, 5) - 0.5) * 0.5;
          return [o + jitter, lift(p, o, y0 + h + jitter)];
        });
      },
    });
    for (const dir of [-1, 1] as const) {
      loft(batch, track, a - 2, b + 3.6, { spacing: 2, vScale: 9, outward: true, material: () => m.lavaFlow, profile: channel(dir, 0.4, 3.9, 1.1, level) });
    }
    along(track, a + 4, b - 2, 14, (p, s, k) => {
      const dir = k % 2 ? 1 : -1;
      const at = frame(p, dir * (limitOf(p) + 2), 0).setY(level(s) + 0.6);
      lights.add(at, LAVA_LIGHT.clone().multiplyScalar(1.6), 20, 0.25, 1.5);
      flames.push(at.clone().setY(at.y - 0.5));
    });
    // Lava pouring out of the bore's wall into each channel.
    for (const [f, dir] of [[0.15, 1], [0.78, -1]] as const) {
      const s = a + (b - a) * f;
      const p = sampleAt(track, s);
      const y0 = level(s);
      const top = frame(p, dir * (limitOf(p) + 4.2), 0).setY(y0 + 5.2);
      const bottom = frame(p, dir * (limitOf(p) + 2.4), 0).setY(y0 - 1.1);
      lavafall(batch, m, top, bottom, 2.2, new THREE.Vector3(p.tz * dir, 0, -p.tx * dir), 0.3);
      lights.add(bottom.clone().setY(y0 + 1.5), LAVA_LIGHT.clone().multiplyScalar(2), 22, 0.35, 3);
    }
  }
  const lip = track.marks[SPOTS.pit];
  const land = track.samples.findIndex((q, i) => i * track.step > lip && q.surface !== 'lava' && track.samples[i - 1]?.surface === 'lava');
  const far = land * track.step;
  pitPool(batch, m, track, lip + 1, far, 1.1, level, 4);
  const mid = sampleAt(track, (lip + far) / 2);
  lights.add(frame(mid, 0, 0).setY(level(mid.s) + 0.5), LAVA_LIGHT.clone().multiplyScalar(2.4), 26, 0.3, 2.5);
  for (const o of [-4, 0, 4]) flames.push(frame(mid, o, 0).setY(level(mid.s) - 0.8));
}

/** The way out: a rough, low tunnel through the flank, with lava spilling from cracks into a gutter on its left. */
export function buildExitTunnel(track: Track, batch: Batch, m: LavaMats, lights: Lights, flames: THREE.Vector3[]): void {
  const level = levelOf(track);
  for (const [a, b] of zoneRanges(track, 'exit')) {
    loft(batch, track, a - 3, b + 3.6, {
      spacing: 2.2,
      vScale: 7,
      uScale: 6,
      material: () => m.basaltIn,
      profile: (p, ring) => {
        const l = limitOf(p);
        const y0 = level(p.s);
        const pts: [number, number][] = [];
        for (let k = 0; k <= 10; k++) {
          const ang = Math.PI * (1 - k / 10);
          const bulge = Math.sin(ang);
          const left = Math.cos(ang) < 0;
          let o = Math.cos(ang) * (l + (left ? 3.4 : 1.2) * Math.sqrt(bulge));
          let h = bulge * 7.6;
          if (k > 0 && k < 10) {
            o += (hash2(ring, k, 7) - 0.5) * 1.1;
            h += (hash2(ring, k, 8) - 0.5) * 1.0;
          } else {
            o += Math.sign(o) * (left ? 3.2 : 0.3);
            h = left ? -1.8 : -0.6;
          }
          pts.push([o, lift(p, o, y0 + h)]);
        }
        pts.splice(1, 0, [-(l + 3.0), lift(p, -(l + 3.0), y0 + 0.2)]);
        pts.unshift([-(l + 0.2), lift(p, -(l + 0.2), y0 - 0.6)], [-(l + 0.5), lift(p, -(l + 0.5), y0 - 1.8)]);
        return pts;
      },
    });
    loft(batch, track, a - 3, b + 3.6, { spacing: 2.2, vScale: 9, outward: true, material: () => m.lavaFlow, profile: channel(-1, 0.4, 3.2, 1.2, level) });
    along(track, a + 12, b - 8, 32, (p, s) => {
      const y0 = level(s);
      const top = frame(p, -(limitOf(p) + 4.2), 0).setY(y0 + 5.6);
      const bottom = frame(p, -(limitOf(p) + 2.0), 0).setY(y0 - 1.2);
      lavafall(batch, m, top, bottom, 2.0, new THREE.Vector3(-p.tz * -1, 0, p.tx * -1).negate(), 0.3);
      const glow = frame(p, -(limitOf(p) + 1), 0).setY(y0 + 1.2);
      lights.add(glow, LAVA_LIGHT.clone().multiplyScalar(2), 22, 0.35, 2.5);
      flames.push(bottom.clone().setY(y0 - 0.6));
    });
  }
}
