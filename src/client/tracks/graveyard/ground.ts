import * as THREE from 'three';
import { limitOf, type Sample, type Track } from '../../../shared/track';
import type { Batch, RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { fbm, smoothstep, valueNoise } from '../../render/noise';
import { atJunction, frame, routeSpans } from '../../render/road';
import type { GroundSpec, Terrain } from '../../render/terrain';
import type { GraveMats } from './textures';

/** Where the full moon hangs, low in the north-east, and the way its light falls. */
export const MOON_DIR: [number, number, number] = [0.55, 0.42, -0.72];

/** Height of the open ground, a little under the road. */
export const GROUND = 0.8;
export const AREA = { x0: -292, x1: 248, z0: -292, z1: 260 };

/** The pond the boardwalk crosses: centre and radii. */
export const POND = { x: -34, z: 120, rx: 30, rz: 26 };

function table(rows: [number, number][], v: number): number {
  if (v <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    if (v <= rows[i][0]) {
      const [a, ya] = rows[i - 1];
      const [b, yb] = rows[i];
      return ya + ((yb - ya) * (v - a)) / (b - a);
    }
  }
  return rows[rows.length - 1][1];
}

export function pondDepth(x: number, z: number): number {
  const e = ((x - POND.x) / POND.rx) ** 2 + ((z - POND.z) / POND.rz) ** 2;
  return 1 - smoothstep(0.45, 1.0, e);
}

/**
 * The land before the road is cut in: a gently rolling graveyard, Hangman's Hill as a dome over the crypt with a ridge
 * running north along the hill road, and the pond. It settles to plain ground height at the edges of the map.
 */
export function naturalHeight(x: number, z: number): number {
  const edge = Math.min(x - AREA.x0, AREA.x1 - x, z - AREA.z0, AREA.z1 - z);
  let h = GROUND + (fbm(x / 50, z / 50, 2, 31) - 0.5) * 0.9 * smoothstep(0, 40, edge);
  const dome = 12.2 * smoothstep(58, 22, Math.hypot(x, z + 2));
  const top = table([[-160, 2], [-128, 5.4], [-98, 7.6], [-56, 10.4], [-20, 12]], z);
  const spine = table([[-160, -12], [-128, 0], [-98, 6], [-56, 0]], z);
  const ridge = z < 0 ? top * smoothstep(36, 12, Math.abs(x - spine)) * smoothstep(-175, -145, z) : 0;
  h = Math.max(h, dome, ridge);
  const pond = pondDepth(x, z);
  return h * (1 - pond) - 2.2 * pond;
}

export function groundSpec(mats: Materials, g: GraveMats): GroundSpec {
  return {
    ...AREA,
    height: naturalHeight,
    paint: ({ steep, low }) => (low < -0.4 ? g.soil : steep ? mats.rock : g.grass),
    cliffs: [mats.rock],
    headwall: g.blocks,
    tint: (x, z, h, mat): RGB => {
      const v = 0.9 + valueNoise(x / 11, z / 11, 3) * 0.2;
      if (mat === mats.rock) return [0.62 * v, 0.64 * v, 0.72 * v];
      if (mat === g.soil) return [0.7 * v, 0.7 * v, 0.75 * v];
      const dead = smoothstep(0.55, 0.7, fbm(x / 35, z / 35, 2, 17));
      const wet = smoothstep(0.6, 0.0, h);
      return [v * (1 + dead * 0.35 - wet * 0.2), v * (1 + dead * 0.12 - wet * 0.1), v * (1 - dead * 0.25)];
    },
  };
}

/** A plain beyond the mapped ground, and a ring of black hills, dead trees and a far spire against the sky. */
export function horizon(batch: Batch, g: GraveMats): void {
  // Fog is worked out per vertex, so the plain needs vertices close enough together to fade evenly.
  const plane = new THREE.PlaneGeometry(1400, 1400, 28, 28);
  plane.rotateX(-Math.PI / 2);
  const uv = plane.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 140, uv.getY(i) * 140);
  // Sits just under the mapped ground, whose edges settle to plain height.
  const m = new THREE.Matrix4().makeTranslation(-20, GROUND - 0.12, -20);
  batch.geometry(g.grass, plane, m, [0.8, 0.85, 0.85]);

  const n = 40;
  const r = 620;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = new THREE.Vector3(-20 + Math.cos(a0) * r, 0, -20 + Math.sin(a0) * r);
    const p1 = new THREE.Vector3(-20 + Math.cos(a1) * r, 0, -20 + Math.sin(a1) * r);
    const lo = GROUND - 2;
    const hi = 70 + 26 * valueNoise(i * 0.7, 2, 9);
    const n0 = new THREE.Vector3(-Math.cos(a0), 0, -Math.sin(a0));
    const quad: [THREE.Vector3, number, number][] = [
      [p0.clone().setY(lo), i / 2, 0],
      [p1.clone().setY(lo), (i + 1) / 2, 0],
      [p0.clone().setY(hi), i / 2, 1],
      [p0.clone().setY(hi), i / 2, 1],
      [p1.clone().setY(lo), (i + 1) / 2, 0],
      [p1.clone().setY(hi), (i + 1) / 2, 1],
    ];
    for (const [v, u, vv] of quad) batch.vertex(g.skyline, v, n0, u, vv, [1, 1, 1]);
  }
}

/** Dark water at the waterline: one sheet over the pond. */
export function pondWater(batch: Batch, g: GraveMats): void {
  const geo = new THREE.CircleGeometry(1, 28);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 5);
  batch.geometry(g.water, geo, new THREE.Matrix4().compose(new THREE.Vector3(POND.x, 0, POND.z), new THREE.Quaternion(), new THREE.Vector3(POND.rx * 0.98, 1, POND.rz * 0.98)), [0.9, 1, 1.1]);
}

/**
 * Low mist lying on the ground beside the road, out past the barriers. It follows the ground, not the road, so it
 * pools in the hollows and over the pond and thins on the hill.
 */
export function mist(track: Track, batch: Batch, g: GraveMats, terrain: Terrain): void {
  const lift = 0.55;
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    for (const side of [-1, 1]) {
      let strip: { p: Sample; pts: THREE.Vector3[] }[] = [];
      const flush = () => {
        for (let j = 0; j < strip.length - 1; j++) {
          const a = strip[j];
          const b = strip[j + 1];
          for (let k = 0; k < a.pts.length - 1; k++) {
            const quad: [THREE.Vector3, number, number][] = [
              [a.pts[k], k / (a.pts.length - 1), a.p.s / 22],
              [b.pts[k], k / (a.pts.length - 1), b.p.s / 22],
              [a.pts[k + 1], (k + 1) / (a.pts.length - 1), a.p.s / 22],
              [a.pts[k + 1], (k + 1) / (a.pts.length - 1), a.p.s / 22],
              [b.pts[k], k / (a.pts.length - 1), b.p.s / 22],
              [b.pts[k + 1], (k + 1) / (a.pts.length - 1), b.p.s / 22],
            ];
            for (const [v, u, vv] of quad) batch.vertex(g.mist, v, UP, u, vv, [0.75, 0.82, 1]);
          }
        }
        strip = [];
      };
      for (let s = s0; s <= s1; s += 4) {
        const p = t.samples[Math.round(s / t.step) % t.samples.length];
        const ms = route === 0 ? s : track.routes[route - 1].from + s - track.routes[route - 1].rfrom;
        if (p.cover === 'indoor' || p.cover === 'tunnel' || p.zone === 'lair' || atJunction(track, ms, 6) || p.zone === 'stairs') {
          flush();
          continue;
        }
        const limit = limitOf(p);
        const pts = [1.5, 5, 9, 14].map((o) => {
          const at = frame(p, side * (limit + o), 0);
          return at.setY(Math.max(terrain.height(at.x, at.z), 0) + lift + o * 0.03);
        });
        strip.push({ p, pts });
      }
      flush();
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
