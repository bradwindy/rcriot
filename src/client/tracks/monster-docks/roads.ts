import * as THREE from 'three';
import { toMain } from '../../../shared/course';
import { limitOf, sampleAt, type Sample, type Track } from '../../../shared/track';
import { Batch, boulder, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import type { PointLight } from '../../render/ps1';
import { atJunction, box, frame, headingAt, loft, paveRoad, routeSpans, startLine } from '../../render/road';
import { LAND } from './ground';
import { beacon, container, filmLight, lampPost, PAINT } from './kit';
import type { Looks } from './look';

const roofless = (p: Sample) => p.zone !== 'warehouse' && p.zone !== 'liner' && p.zone !== 'hold';

export function pave(track: Track, batch: Batch, mats: Materials, looks: Looks, grid: { s: number; offset: number }[]): void {
  paveRoad(track, batch, {
    road: (p) => {
      if (p.surface === 'void') return null;
      if (p.zone === 'warehouse') return p.surface === 'wood' ? mats.planksIndoor : looks.concreteIndoor;
      if (p.zone === 'liner' || p.zone === 'hold') return looks.tread;
      if (p.surface === 'wood') return mats.planks;
      if (p.surface === 'metal') return looks.container;
      return looks.asphalt;
    },
    verge: (p) => {
      if (p.surface === 'void') return null;
      if (p.zone === 'warehouse') return looks.concreteIndoor;
      if (p.zone === 'liner' || p.zone === 'hold') return looks.tread;
      if (p.cover === 'deck') return p.zone === 'viaduct' ? looks.concrete : mats.planks;
      return looks.hatch;
    },
    skirt: (p) => {
      if (p.surface === 'void') return null;
      if (p.cover === 'open') return { mat: looks.concrete, drop: 1, out: 0.4 };
      if (p.zone === 'pier') return { mat: mats.planks, drop: 0.5, out: 0 };
      if (p.zone === 'viaduct') return { mat: looks.concrete, drop: 1.4, out: 0 };
      return null;
    },
  });
  startLine(track, batch, mats, grid);
}

/** The lowest road under a point, if another stretch passes well below it there. */
function under(track: Track, x: number, z: number, y: number): boolean {
  return track.samples.some((p) => p.y < y - 5 && Math.hypot(p.x - x, p.z - z) < limitOf(p) + 2);
}

/** Jersey barriers along open roads, rails along the piers, parapets on the viaduct, and lamps over them all. */
export function barriers(track: Track, batch: Batch, mats: Materials, looks: Looks): PointLight[] {
  const lights: PointLight[] = [];
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    const ms = (p: Sample) => toMain(track, route, p.s);
    for (const side of [-1, 1]) {
      // Concrete jersey barriers with a band of hazard paint along the open dock roads.
      loft(batch, t, s0, s1, {
        spacing: 2,
        vScale: 3,
        uScale: 2,
        outward: true,
        material: (p) => (p.cover === 'open' && !atJunction(track, ms(p), 2) ? looks.concrete : null),
        profile: (p) => {
          const l = limitOf(p);
          const pts: [number, number][] = [
            [l + 0.05, -0.6],
            [l + 0.1, 0.25],
            [l + 0.32, 0.55],
            [l + 0.4, 0.95],
            [l + 0.8, 0.95],
            [l + 0.88, 0.55],
            [l + 1.1, 0.25],
            [l + 1.15, -0.6],
          ];
          const out = pts.map(([o, h]) => [o * side, h] as [number, number]);
          return side < 0 ? out.reverse() : out;
        },
      });
      loft(batch, t, s0, s1, {
        spacing: 2,
        vScale: 4,
        outward: true,
        material: (p) => (p.cover === 'open' && !atJunction(track, ms(p), 2) ? looks.stripes : null),
        profile: (p) => {
          const l = limitOf(p);
          const pts: [number, number, number][] = [
            [(l + 0.4) * side, 0.97, 0],
            [(l + 0.8) * side, 0.97, 0.15],
          ];
          return side < 0 ? pts.reverse() : pts;
        },
      });
      // Viaduct parapets: a solid concrete wall.
      loft(batch, t, s0, s1, {
        spacing: 2,
        vScale: 5,
        uScale: 5,
        outward: true,
        material: (p) => (p.zone === 'viaduct' && p.grade > -0.2 ? looks.concrete : null),
        profile: (p) => {
          const l = limitOf(p);
          const pts: [number, number][] = [
            [l, -0.2],
            [l, 1.1],
            [l + 0.5, 1.2],
            [l + 0.6, -1.4],
          ];
          const out = pts.map(([o, h]) => [o * side, h] as [number, number]);
          return side < 0 ? out.reverse() : out;
        },
      });
    }
    // Pier rails: posts and two steel rails.
    let last: THREE.Vector3[] | null = null;
    for (let s = s0; s < s1; s += 3) {
      const p = sampleAt(t, s);
      if (p.zone !== 'pier' || atJunction(track, ms(p), 2)) {
        last = null;
        continue;
      }
      const tops: THREE.Vector3[] = [];
      for (const side of [-1, 1]) {
        const b = frame(p, side * (limitOf(p) + 0.1), 0);
        box(batch, mats.metal, 0.16, 1.2, 0.16, xf(b.x, b.y + 0.6, b.z, headingAt(p)), [0.75, 0.62, 0.2]);
        tops.push(b.clone().setY(b.y + 1.15), b.clone().setY(b.y + 0.6));
      }
      if (last) for (let k = 0; k < 4; k++) batch.beam(mats.metal, last[k], tops[k], 0.1, 0.1, [0.75, 0.62, 0.2]);
      last = tops;
    }
  }

  // Sodium lamps along the open roads, the piers and the viaduct, alternating sides.
  let k = 0;
  for (let s = 20; s < track.length - 10; s += 34) {
    const p = sampleAt(track, s);
    if (!roofless(p) || p.surface === 'void' || atJunction(track, s, 6)) continue;
    const side = k++ % 2 ? 1 : -1;
    const extra = p.cover === 'open' ? 1.6 : 0.4;
    const base = frame(p, side * (limitOf(p) + extra), 0);
    if (p.cover === 'open') base.y = LAND;
    const light = lampPost(batch, mats, looks, base, frame(p, 0, 0), p.cover === 'open' ? 8 : 6.5);
    if (light) lights.push(light);
  }
  return lights;
}

/** The viaduct: T-shaped concrete piers under the deck, clear of the road beneath, and its broken, slumped end. */
export function viaduct(track: Track, batch: Batch, mats: Materials, looks: Looks): void {
  const L = track.length;
  for (let s = 0; s < L; s += 14) {
    const p = sampleAt(track, s);
    if (p.zone !== 'viaduct' || p.grade < -0.2) continue;
    const deck = p.y - 1.4;
    const ground = Math.min(LAND, deck);
    if (deck - ground < 1.5) continue;
    const h = headingAt(p);
    const mid = frame(p, 0, -1.4);
    // No pier in the road below: the deck spans it on the steel girders.
    if (under(track, mid.x, mid.z, p.y)) continue;
    box(batch, looks.concrete, 2.2, deck - ground + 0.5, 2.2, xf(mid.x, (deck + ground) / 2 - 0.5, mid.z, h), [0.92, 0.9, 0.88]);
    box(batch, looks.concrete, limitOf(p) * 2, 1, 2.4, xf(mid.x, deck - 0.5, mid.z, h), [0.85, 0.83, 0.8]);
  }
  // Steel girders carrying the deck over the yard road, painted so the crossing reads from below.
  for (let s = 0; s < L; s += 4) {
    const p = sampleAt(track, s);
    if (p.zone !== 'viaduct' || p.grade < -0.2) continue;
    const near = frame(p, 0, -1.4);
    if (!under(track, near.x, near.z, p.y + 3)) continue;
    const q = sampleAt(track, s + 4);
    for (const o of [-5, -1.7, 1.7, 5]) {
      batch.beam(looks.plate, frame(p, o, -2.1), frame(q, o, -2.1), 0.7, 1.5, [0.85, 0.5, 0.14]);
    }
  }
  // The broken end: rebar bristling from the snapped deck over the slumped slab.
  for (let i = 0; i < track.samples.length; i++) {
    const p = track.samples[i];
    const next = track.samples[(i + 1) % track.samples.length];
    if (p.zone !== 'viaduct' || p.grade > -0.25 || next.grade < p.grade) continue;
    const h = headingAt(p);
    for (let o = -limitOf(p); o <= limitOf(p); o += 0.9) {
      const a = frame(p, o, -0.6 - hash2(Math.round(o * 10), i, 3) * 0.4);
      const b = a.clone().add(new THREE.Vector3(-Math.sin(h) * 1.6, 0.8 + hash2(Math.round(o * 10), i, 4), -Math.cos(h) * 1.6));
      batch.beam(mats.metal, a, b, 0.07, 0.07, [0.55, 0.35, 0.25]);
    }
    // Rubble down both edges of the slab that slumped to the ground, and a cracked stripe across its top.
    for (let s = p.s + 1, k = 0; s < L; s += 2.6, k++) {
      const q = sampleAt(track, s);
      if (q.zone !== 'viaduct') break;
      for (const side of [-1, 1]) {
        const at = frame(q, side * (limitOf(q) + 0.6 + hash2(k, side, 5)), -0.4);
        const size = 2 + hash2(k, side, 6) * 2.6;
        batch.geometry(looks.concrete, boulder(k * 3 + side, size, 0.8), xf(at.x, Math.max(LAND + size * 0.25, at.y), at.z, k * 1.7), [0.8, 0.76, 0.72]);
        if (k % 2 === 0) {
          batch.geometry(looks.concrete, boulder(k * 5 + side, size * 0.8, 0.7), xf(at.x + side * 2, LAND + 0.5, at.z + (k % 3) - 1, k), [0.7, 0.66, 0.62]);
        }
      }
    }
    const lip = frame(p, 0, 0.08);
    box(batch, looks.stripes, limitOf(p) * 2, 0.08, 0.9, xf(lip.x, lip.y, lip.z, h));
    break;
  }
}

/** Under the piers: pilings into the harbour and cross beams, with old tyres hung as fenders, and the bitten edge. */
export function piers(track: Track, batch: Batch, mats: Materials): void {
  const tyre: RGB = [0.5, 0.5, 0.5];
  for (let s = 0, k = 0; s < track.length; s += 5, k++) {
    const p = sampleAt(track, s);
    if (p.zone !== 'pier') continue;
    const h = headingAt(p);
    const l = limitOf(p);
    for (const side of [-1, 1]) {
      const edge = frame(p, side * (l - 0.3), 0);
      box(batch, mats.planks, 0.6, edge.y + 5, 0.6, xf(edge.x, (edge.y - 5) / 2 - 0.3, edge.z, h));
      if (k % 3 === 0) {
        const fender = frame(p, side * (l + 0.5), -1.5);
        batch.geometry(mats.plastic, new THREE.TorusGeometry(0.75, 0.3, 5, 8), xf(fender.x, fender.y, fender.z, h + Math.PI / 2), tyre);
      }
    }
    const mid = frame(p, 0, -0.75);
    box(batch, mats.planks, l * 2, 0.4, 0.5, xf(mid.x, mid.y, mid.z, h));
    const low = frame(p, 0, -2.2);
    if (k % 2 === 0) box(batch, mats.planks, l * 2, 0.3, 0.3, xf(low.x, low.y, low.z, h));
  }
  // Splintered plank ends either side of the bite taken out of the deck.
  const gaps: number[] = [];
  for (let s = 1; s < track.length; s += 1) {
    const a = sampleAt(track, s - 1);
    const b = sampleAt(track, s);
    if ((a.zone === 'gap') !== (b.zone === 'gap')) gaps.push(s);
  }
  for (const [s, dir] of [
    [gaps[0] - 1, 1],
    [gaps[1] + 1, -1],
  ] as const) {
    const p = sampleAt(track, s);
    for (let o = -limitOf(p); o <= limitOf(p); o += 1) {
      const reach = 1 + hash2(Math.round(o * 4), s, 8) * 3.6;
      const a = frame(p, o, -0.1);
      const b = a.clone().add(new THREE.Vector3(p.tx * dir * reach, -0.9 * hash2(Math.round(o * 4), s, 9), p.tz * dir * reach));
      batch.beam(mats.planks, a, b, 0.8, 0.14);
    }
  }
}

/** The start gate: container stacks either side, a steel beam across with the banner, beacons and film lights. */
export function startGate(track: Track, batch: Batch, mats: Materials, looks: Looks): void {
  const p = sampleAt(track, 0);
  const h = headingAt(p);
  const span = limitOf(p) + 2.4;
  for (const side of [-1, 1]) {
    const at = frame(p, side * span, 0);
    at.y = LAND;
    for (let k = 0; k < 3; k++) {
      container(batch, looks, xf(at.x, at.y + k * 2.6, at.z, h + Math.PI / 2 + (k === 2 ? 0.08 * side : 0)), PAINT[(k + (side > 0 ? 3 : 0)) % PAINT.length], false);
    }
    beacon(batch, mats, looks, at.clone().setY(at.y + 7.9));
  }
  const top = frame(p, 0, 9.2);
  top.y = LAND + 9.2;
  const m = xf(top.x, top.y, top.z, h);
  batch.geometry(looks.truss, new THREE.BoxGeometry(span * 2 + 3, 1.6, 1.6), m, [0.95, 0.62, 0.15]);
  batch.geometry(looks.stripes, new THREE.BoxGeometry(span * 2 + 3.2, 0.3, 1.7), m.clone().multiply(xf(0, -0.95, 0)));
  for (const turn of [0, Math.PI]) {
    batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 2, 2.6), m.clone().multiply(xf(0, -2.6, 0, turn)).multiply(xf(0, 0, 0.1)));
  }
  for (let k = -2; k <= 2; k++) {
    const lampAt = new THREE.Vector3(k * 2.2, -1.2, 0.9).applyMatrix4(m);
    batch.geometry(looks.glow, new THREE.CircleGeometry(0.45, 8), xf(lampAt.x, lampAt.y, lampAt.z, h + Math.PI), [1, 0.3, 0.25]);
  }
  // Film lights and a camera crane: the studio behind the monster movie.
  const along = (o: number, s: number) => {
    const q = sampleAt(track, s);
    const v = frame(q, o, 0);
    v.y = LAND;
    return v;
  };
  filmLight(batch, mats, looks, along(-17, 16), frame(sampleAt(track, 6), 0, 1));
  filmLight(batch, mats, looks, along(17, -22), frame(sampleAt(track, -12), 0, 1), false);
  filmLight(batch, mats, looks, along(-17, -40), frame(sampleAt(track, -30), 0, 1), false);
}
