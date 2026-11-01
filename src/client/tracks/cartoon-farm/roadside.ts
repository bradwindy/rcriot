import * as THREE from 'three';
import { fromMain } from '../../../shared/course';
import { limitOf, sampleAt, type Sample, type Track } from '../../../shared/track';
import { xf, type Batch } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2, valueNoise } from '../../render/noise';
import { frame, headingAt, loft, paveRoad, routeSpans, startLine } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import { C, rgb, type Looks } from './look';
import type { Toon } from './toon';

/** The road, its verges and skirts, in farm colours. */
export function paveFarm(track: Track, batch: Batch, L: Looks, mats: Materials, grid: { s: number; offset: number }[]): void {
  paveRoad(track, batch, {
    road: (p) => {
      if (p.surface === 'goo') return L.milk;
      if (p.surface === 'wood') return p.dark ? L.boardsIn : L.boards;
      if (p.surface === 'metal') return L.floor;
      if (p.surface === 'asphalt') return L.asphalt;
      return L.road;
    },
    verge: (p) => {
      if (p.surface === 'goo') return L.milk;
      if (p.zone === 'barn') return L.hayIn;
      if (p.cover === 'indoor') return L.floor;
      if (p.cover === 'deck' || p.surface === 'wood') return L.boards;
      if (p.surface === 'asphalt') return L.asphalt;
      return L.lawn;
    },
    skirt: (p) => {
      if (p.cover === 'open') return p.surface === 'wood' ? { mat: L.wood, drop: 3, out: 0 } : { mat: L.lawn, drop: 1.2, out: 0.8 };
      if (p.zone === 'barn') return { mat: L.barnIn, drop: p.y - 1.1, out: 0.3 };
      if (p.cover === 'deck') return { mat: L.wood, drop: 0.5, out: 0 };
      return null;
    },
  });
  // At the fork and the join, a second skin of road with no edge lines, so neither road's verge or kerb lies across the other.
  const fork = track.routes[0];
  for (const [a, b] of fork?.zones ?? []) {
    for (const route of [0, 1]) {
      const t = route ? fork.track : track;
      const s0 = route ? Math.max(fromMain(track, 1, a), fork.rfrom) : a;
      const s1 = route ? Math.min(fromMain(track, 1, b), fork.rto) : b;
      loft(batch, t, s0, s1, {
        spacing: 2,
        vScale: 6,
        outward: true,
        material: () => L.road,
        profile: (p) => [-0.43, -0.21, 0, 0.21, 0.43].map((f) => [f * p.width, route ? 0.1 : 0.08, 0.5 + f * 0.8]),
      });
    }
  }
  startLine(track, batch, mats, grid);
}

/** Where the main track or the fork runs, sample by sample. */
function eachSample(track: Track, step: number, f: (p: Sample, route: number, s: number) => void): void {
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    for (let s = s0 + (route ? 1 : 0); s < s1 - (route ? 1 : 0); s += step) f(sampleAt(t, s), route, s);
  }
}

/**
 * True where a fence would stand across the other road at a fork or join. Fences then run round the outside of both
 * roads and leave only the mouths open. The fork gives way, so one fence stays where the two roads still coincide.
 */
function acrossOtherRoad(track: Track, route: number, at: THREE.Vector3): boolean {
  const fork = track.routes[0];
  if (!fork) return false;
  const other = route ? track : fork.track;
  const [a, b] = route ? [fork.from - 30, fork.to + 30] : [fork.rfrom - 30, fork.rto + 30];
  const margin = route ? 1 : -0.5;
  return other.samples.some((q) => q.s > a && q.s < b && Math.hypot(q.x - at.x, q.z - at.z) < limitOf(q) + margin);
}

/** Wobbly white picket fences along the open road, with chunky posts. */
export function fences(track: Track, toon: Toon, L: Looks): void {
  const batch = toon.batch;
  const H = 1.25;
  for (const side of [-1, 1]) {
    let last: { foot: THREE.Vector3; top: THREE.Vector3; u: number } | null = null;
    let k = 0;
    eachSample(track, 2.5, (p, route, s) => {
      const falling = p.surface === 'wood' && p.grade < -0.1;
      const foot = frame(p, side * (limitOf(p) + 0.2), -0.25);
      if (p.cover !== 'open' || p.surface === 'goo' || falling || p.zone === 'works' || acrossOtherRoad(track, route, foot)) {
        last = null;
        return;
      }
      const wob = valueNoise(s * 0.21, side * 7 + route * 3, 5);
      const top = frame(p, side * (limitOf(p) + 0.2 + (wob - 0.5) * 0.35), H + (wob - 0.5) * 0.3);
      const prev: { foot: THREE.Vector3; top: THREE.Vector3; u: number } | null = last;
      const u = prev ? prev.u + prev.foot.distanceTo(foot) / 2.7 : 0;
      if (prev && prev.foot.distanceTo(foot) < 6) {
        const n = new THREE.Vector3().crossVectors(foot.clone().sub(prev.foot), prev.top.clone().sub(prev.foot)).normalize();
        const quad: [THREE.Vector3, number, number][] = [
          [prev.foot, prev.u, 0],
          [foot, u, 0],
          [prev.top, prev.u, 1],
          [prev.top, prev.u, 1],
          [foot, u, 0],
          [top, u, 1],
        ];
        for (const [v, uu, vv] of quad) batch.vertex(L.picket, v, n, uu, vv, [1, 1, 1]);
      }
      if (k++ % 4 === 0) {
        const h = headingAt(p) + (wob - 0.5) * 0.3;
        const mid = foot.clone().lerp(top, 0.5);
        toon.box(L.flat, 0.24, H + 0.55, 0.24, xf(mid.x, mid.y + 0.1, mid.z, h, (wob - 0.5) * 0.2, side * (wob - 0.5) * 0.3), rgb(C.cream), 0.05);
      }
      last = { foot, top, u };
    });
  }
}

/** True where a lower stretch of road runs under this spot, so no leg may stand there. */
function overRoad(track: Track, at: THREE.Vector3): boolean {
  return track.samples.some((q) => q.y < at.y - 4 && Math.hypot(q.x - at.x, q.z - at.z) < limitOf(q) + 0.8);
}

/** Rails and rickety legs under every deck: the trestle, the boardwalk and the hayloft chutes. */
export function decks(track: Track, toon: Toon, L: Looks, terrain: Terrain, water: number): void {
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    let k = 0;
    let rails: THREE.Vector3[] | null = null;
    for (let s = s0; s < s1; s += 3, k++) {
      const p = sampleAt(t, s);
      if (p.cover !== 'deck') {
        rails = null;
        continue;
      }
      const h = headingAt(p);
      const lim = limitOf(p);
      const chute = p.zone === 'chute';
      const post = chute || k % 2 === 0;
      const now: THREE.Vector3[] = [];
      for (const side of [-1, 1]) {
        const edge = frame(p, side * (lim + 0.1), 0);
        if (post) {
          toon.box(L.wood, 0.22, 1.3, 0.22, xf(edge.x, edge.y + 0.55, edge.z, h, 0, side * 0.06 * (hash2(k, side, route) - 0.5)), [1, 1, 1], 0.05);
          now.push(edge.clone().setY(edge.y + 1.1), edge.clone().setY(edge.y + 0.55));
        }
        if (k % 2 === 0 || chute) {
          const ground = Math.max(terrain.height(edge.x, edge.z), p.zone === 'boardwalk' ? water - 1.5 : -10);
          const top = edge.y - 0.3;
          const foot = frame(p, side * (lim - 0.6), 0).setY(ground);
          if (top - ground > 0.4 && !overRoad(track, foot.clone().setY(top))) {
            const lean = (hash2(k, side * 3, 7 + route) - 0.5) * 0.08;
            toon.beam(L.wood, foot, frame(p, side * (lim - 0.6 + lean * (top - ground)), -0.3), 0.45, 0.45, [0.85, 0.85, 0.85], 0.06);
          }
        }
      }
      if (post) {
        if (rails) for (let i = 0; i < 4; i++) toon.beam(L.wood, rails[i], now[i], 0.14, 0.18, [1, 1, 1], 0.04);
        rails = now;
      }
      // Cross bracing between the legs of the tall trestle.
      const left = frame(p, -(lim - 0.6), -0.3);
      const right = frame(p, lim - 0.6, -0.3);
      if (p.zone === 'trestle' && k % 2 === 0 && !overRoad(track, left) && !overRoad(track, right)) {
        const l = left;
        const r = right;
        const ground = Math.min(terrain.height(l.x, l.z), terrain.height(r.x, r.z));
        for (let y = l.y; y - 3.2 > ground; y -= 3.4) {
          const a = l.clone().setY(y);
          const b = r.clone().setY(y - 3.2);
          const c = r.clone().setY(y);
          const d = l.clone().setY(y - 3.2);
          toon.beam(L.wood, a, b, 0.22, 0.22, [0.8, 0.8, 0.8], 0.04);
          toon.beam(L.wood, c, d, 0.22, 0.22, [0.8, 0.8, 0.8], 0.04);
          toon.beam(L.wood, a, c, 0.26, 0.26, [0.9, 0.9, 0.9], 0.04);
        }
      }
      if (k % 2 === 0) {
        const under = frame(p, 0, -0.45);
        toon.box(L.wood, lim * 2 + 0.6, 0.35, 0.5, xf(under.x, under.y, under.z, h), [0.9, 0.9, 0.9], 0.05);
      }
    }
  }
}

/** The start: a farm gate arch with the race banner, a weathervane rooster and hay bales at its feet. */
export function startArch(track: Track, toon: Toon, L: Looks, mats: Materials): void {
  const p = sampleAt(track, 0);
  const h = headingAt(p);
  const span = limitOf(p) + 1.2;
  for (const side of [-1, 1]) {
    const b = frame(p, side * span, 0);
    toon.box(L.wood, 1.1, 11, 1.1, xf(b.x, b.y + 5.5, b.z, h), [1, 1, 1], 0.1);
    toon.ball(L.flat, 0.8, xf(b.x, b.y + 11.4, b.z), rgb(C.red), 0.1);
    const bale = frame(p, side * (span + 1.4), 0);
    toon.cyl(L.hay, 1.2, 1.2, 1.6, xf(bale.x, bale.y + 1.2, bale.z, h, 0, Math.PI / 2), [1, 1, 1], 0.08, 10);
    const bale2 = frame(p, side * (span + 1.0), 0);
    toon.cyl(L.hay, 1.2, 1.2, 1.6, xf(bale2.x + p.tx * 2.4, bale2.y + 1.2, bale2.z + p.tz * 2.4, h + 0.3, 0, Math.PI / 2), [1, 1, 1], 0.08, 10);
  }
  const top = frame(p, 0, 9.4);
  toon.box(L.wood, span * 2 + 2.4, 0.9, 0.9, xf(top.x, top.y + 1.4, top.z, h), [1, 1, 1], 0.1);
  const board = xf(top.x, top.y, top.z, h);
  toon.box(L.flat, span * 2 - 0.6, 2.9, 0.3, board, rgb(C.red), 0.1);
  toon.batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 1.2, 2.4), board.clone().multiply(xf(0, 0, 0.17)));
  toon.batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 1.2, 2.4), board.clone().multiply(xf(0, 0, -0.17, Math.PI)));
  // The rooster weathervane on top.
  const vane = frame(p, 0, 11.2);
  const m = xf(vane.x, vane.y, vane.z, h + Math.PI / 2);
  toon.box(L.flat, 0.12, 1.6, 0.12, m.clone().multiply(xf(0, 0.8, 0)), rgb(C.dark), 0.04);
  toon.ball(L.flat, 0.6, m.clone().multiply(xf(0, 2.0, 0)), rgb(C.white), 0.07, 1.3, 1, 0.8);
  toon.ball(L.flat, 0.32, m.clone().multiply(xf(0.7, 2.6, 0)), rgb(C.white), 0.06);
  toon.box(L.flat, 0.1, 0.4, 0.3, m.clone().multiply(xf(0.75, 3.0, 0)), rgb(C.red), 0.04);
  toon.shape(L.flat, new THREE.ConeGeometry(0.12, 0.4, 4), m.clone().multiply(xf(1.05, 2.6, 0, 0, 0, -Math.PI / 2)), rgb(C.yellow), 0.03);
  toon.shape(L.flat, new THREE.ConeGeometry(0.5, 1.0, 4), m.clone().multiply(xf(-0.85, 2.3, 0, 0, 0, Math.PI / 2.6)), rgb(C.orange), 0.05);
}
