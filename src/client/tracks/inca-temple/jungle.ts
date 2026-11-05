import * as THREE from 'three';
import { toMain } from '../../../shared/course';
import { HALL_Z, PYRAMID } from '../../../shared/tracks/inca-temple';
import { mulberry32 } from '../../../shared/rng';
import { limitOf, sampleAt, type Track } from '../../../shared/track';
import { Batch, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { fbm, hash2 } from '../../render/noise';
import { atJunction, frame, headingAt, loft, routeSpans } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import { BOUNDS, RIVER } from './ground';
import { cards, v3 } from './kit';
import type { IncaMats } from './palette';

/** Zones where the road runs between jungle hedges. */
const HEDGED = new Set(['jungle', 'start', 'village', 'gorge']);

/** Places kept clear of trees: the pyramid and hall, the village huts and the start. */
function clear(x: number, z: number): boolean {
  if (Math.abs(x - PYRAMID.x) < 44 && z > PYRAMID.z - 44 && z < HALL_Z + 18) return true;
  if (Math.abs(x - PYRAMID.x - 10) < 70 && Math.abs(z - HALL_Z) < 18) return true;
  return false;
}

/** A head of leaves: a squashed icosahedron in the cut-out leaf texture, so it reads as a clump with holes in it. */
function crown(batch: Batch, inca: IncaMats, at: THREE.Vector3, r: number, spin: number, tint?: RGB): void {
  batch.geometry(inca.leaf, new THREE.IcosahedronGeometry(r, 0), xf(at.x, at.y, at.z, spin, 0, 0, 1, 0.55, 1), tint);
}

/** A kapok: a pale trunk on plank roots, a few thick boughs and round heads of leaves. `full` adds roots and boughs. */
export function kapok(batch: Batch, inca: IncaMats, base: THREE.Vector3, size: number, rng: () => number, full = true): void {
  const h = 14 * size;
  const r = 0.9 * size;
  const tint: RGB = [0.9 + rng() * 0.2, 0.9 + rng() * 0.15, 0.9];
  batch.geometry(inca.trunk, new THREE.CylinderGeometry(r * 0.55, r, h, 5, 1, true), xf(base.x, base.y + h / 2 - 0.5, base.z, rng() * 6), tint);
  const spin = rng() * Math.PI;
  const top = base.clone().setY(base.y + h - 0.6);
  if (!full) {
    crown(batch, inca, top.clone().setY(top.y + 2 * size), 5 * size, spin);
    return;
  }
  for (let k = 0; k < 3; k++) {
    const a = spin + (k / 3) * Math.PI * 2;
    const out = v3(Math.cos(a), 0, Math.sin(a));
    batch.beam(inca.trunk, base.clone().addScaledVector(out, r * 2.8).setY(base.y - 0.3), base.clone().addScaledVector(out, r * 0.6).setY(base.y + h * 0.18), 0.25 * size, 1.4 * size, tint);
  }
  for (let k = 0; k < 3; k++) {
    const a = spin + 1 + (k / 3) * Math.PI * 2 + rng() * 0.6;
    const len = (3.5 + rng() * 2.5) * size;
    const end = top.clone().add(v3(Math.cos(a) * len, (1.5 + rng() * 2) * size, Math.sin(a) * len));
    batch.beam(inca.trunk, top, end, 0.5 * size, 0.5 * size, tint);
    crown(batch, inca, end.setY(end.y + 0.6 * size), 3.6 * size, rng() * 6, [0.8 + rng() * 0.3, 0.85 + rng() * 0.25, 0.8 + rng() * 0.2]);
  }
  crown(batch, inca, top.clone().setY(top.y + 3 * size), 4 * size, rng() * 6);
}

/** A coconut palm, after Pirate Cove's: a curved ringed trunk and drooping fronds. */
export function palm(batch: Batch, mats: Materials, base: THREE.Vector3, rng: () => number, height = 9 + rng() * 5): void {
  const lean = rng() * Math.PI * 2;
  const bend = 1.5 + rng() * 3;
  const dir = v3(Math.cos(lean), 0, Math.sin(lean));
  const rings = 6;
  const sides = 5;
  const centre = (t: number) => base.clone().addScaledVector(dir, bend * t * t).setY(base.y + height * t);
  const pts: THREE.Vector3[][] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const c = centre(t);
    const r = 0.45 - 0.2 * t;
    pts.push(Array.from({ length: sides + 1 }, (_, k) => c.clone().add(v3(Math.cos((k / sides) * Math.PI * 2) * r, 0, Math.sin((k / sides) * Math.PI * 2) * r))));
  }
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < sides; k++) {
      const quad = [pts[j][k], pts[j + 1][k], pts[j][k + 1], pts[j][k + 1], pts[j + 1][k], pts[j + 1][k + 1]];
      const uv = [[k, j], [k, j + 1], [k + 1, j], [k + 1, j], [k, j + 1], [k + 1, j + 1]];
      quad.forEach((v, i) => batch.vertex(mats.bark, v, v.clone().sub(centre(uv[i][1] / rings)).normalize(), uv[i][0] / 2.5, uv[i][1] / 1.5));
    }
  }
  const top = centre(1);
  const fronds = 7;
  const spin = rng() * Math.PI;
  for (let f = 0; f < fronds; f++) {
    const a = spin + (f / fronds) * Math.PI * 2;
    const len = 4.5 + rng() * 1.5;
    const out = v3(Math.cos(a), 0, Math.sin(a));
    const side = v3(-out.z, 0, out.x).multiplyScalar(0.8);
    const mid = top.clone().addScaledVector(out, len * 0.5).setY(top.y + 0.6);
    const tip = top.clone().addScaledVector(out, len).setY(top.y - 1.6 - rng());
    const tint: RGB = [0.8 + rng() * 0.2, 0.95 + rng() * 0.2, 0.8];
    const strip = [
      [top.clone().sub(side), top.clone().add(side), 0],
      [mid.clone().sub(side.clone().multiplyScalar(1.3)), mid.clone().add(side.clone().multiplyScalar(1.3)), 0.5],
      [tip.clone().sub(side.clone().multiplyScalar(0.3)), tip.clone().add(side.clone().multiplyScalar(0.3)), 1],
    ] as const;
    for (let i = 0; i < 2; i++) {
      const [l0, r0, v0] = strip[i];
      const [l1, r1, v1] = strip[i + 1];
      const n = new THREE.Vector3().crossVectors(r0.clone().sub(l0), l1.clone().sub(l0)).normalize();
      if (n.y < 0) n.negate();
      const verts: [THREE.Vector3, number, number][] = [[l0, 0, v0], [l1, 0, v1], [r0, 1, v0], [r0, 1, v0], [l1, 0, v1], [r1, 1, v1]];
      for (const [p, u, v] of verts) batch.vertex(mats.frond, p, n, u, v, tint);
    }
  }
}

/** Leafy hedges along both edges of the open jungle road, where the invisible barrier is. */
function hedges(track: Track, batch: Batch, inca: IncaMats): void {
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    for (const side of [-1, 1]) {
      loft(batch, t, s0, s1, {
        spacing: 2,
        vScale: 7,
        outward: side < 0,
        material: (p) => (p.cover === 'open' && HEDGED.has(p.zone ?? '') && !atJunction(track, toMain(track, route, p.s), 4) ? inca.hedge : null),
        profile: (p) => {
          const o = side * (limitOf(p) + 0.35);
          const tall = 1.5 + 0.7 * fbm(p.s / 9, side * 3, 2, 21);
          return [[o, -0.6, 0], [o + side * 0.5, tall, 1]];
        },
      });
    }
  }
}

/** Ferns, broad leaves, palms and kapoks over the open ground, thick near the road and thinning into the haze. */
function forest(batch: Batch, mats: Materials, inca: IncaMats, index: TrackIndex, terrain: Terrain): void {
  const rng = mulberry32(77);
  const step = 6;
  for (let z = BOUNDS.z0 + 4; z < BOUNDS.z1 - 4; z += step) {
    for (let x = BOUNDS.x0 + 4; x < BOUNDS.x1 - 4; x += step) {
      const px = x + (hash2(x, z, 1) - 0.5) * step;
      const pz = z + (hash2(x, z, 2) - 0.5) * step;
      if (clear(px, pz)) continue;
      const near = index.nearest(px, pz, 70);
      const gap = near ? near.d - limitOf(near.sample) : 70;
      if (gap < 1.6) continue;
      const y = terrain.height(px, pz);
      if (y < RIVER.level + 0.4) continue;
      if (near && near.sample.cover === 'tunnel' && gap < 8) continue;
      if (near && near.sample.cover === 'deck' && gap < 4) continue;
      const at = v3(px, y - 0.2, pz);
      const roll = hash2(x, z, 3);
      const dense = fbm(px / 40, pz / 40, 2, 31);
      if (gap < 9) {
        if (roll < 0.5) cards(batch, inca.fern, at, 2.6, 1.7, roll * 20, 2, [0.85 + roll * 0.3, 1, 0.85]);
        else if (roll < 0.72) cards(batch, inca.leaf, at, 2.6, 2.4, roll * 30, 2);
        else if (roll < 0.8 && gap > 4) palm(batch, mats, at, rng);
        continue;
      }
      const odds = gap < 35 ? 0.12 + dense * 0.22 : gap < 110 ? 0.05 + dense * 0.12 : 0;
      if (hash2(x, z, 6) > odds) {
        if (gap < 35 && roll < 0.3) cards(batch, inca.fern, at, 3, 2, roll * 20, 2);
        continue;
      }
      if (gap < 35 && hash2(x, z, 4) < 0.25) palm(batch, mats, at, rng, 10 + rng() * 6);
      else kapok(batch, inca, at, 0.9 + hash2(x, z, 5) * 0.8 + Math.min(1, gap / 80) * 0.4, rng, gap < 35);
    }
  }
}

/**
 * Over the jungle trail, now and then, a giant tree leans a bough right across the road with vines hanging off it,
 * and sunlight falls through the gap in the canopy.
 */
function boughs(track: Track, batch: Batch, inca: IncaMats, terrain: Terrain): void {
  const rng = mulberry32(91);
  let k = 0;
  for (let s = 20; s < track.length - 40; s += 23) {
    const p = sampleAt(track, s);
    if (p.zone !== 'jungle' || p.cover !== 'open' || atJunction(track, s, 10)) continue;
    k++;
    const h = headingAt(p);
    const side = k % 2 ? 1 : -1;
    if (k % 3 === 0) {
      const foot = frame(p, side * (limitOf(p) + 6), 0);
      foot.y = terrain.height(foot.x, foot.z);
      kapok(batch, inca, foot, 1.5, rng);
      const from = foot.clone().setY(foot.y + 11);
      const to = frame(p, -side * (limitOf(p) + 4), 12 + rng() * 3);
      batch.beam(inca.trunk, from, to, 0.9, 0.9);
      crown(batch, inca, to.clone().setY(to.y + 1.2), 4.5, s);
      for (let i = 1; i < 7; i++) {
        const at = from.clone().lerp(to, i / 7);
        const len = 4 + hash2(s, i, 3) * 5;
        batch.geometry(inca.vine, new THREE.PlaneGeometry(0.9, len), xf(at.x, at.y - len / 2, at.z, h + Math.PI / 2 + (i % 2) * 0.5));
      }
    }
    if (k % 2 === 0) {
      const at = frame(p, side * 2, 0);
      for (const turn of [0, Math.PI / 2]) batch.geometry(inca.shaft, new THREE.PlaneGeometry(4.5, 16), xf(at.x, at.y + 8, at.z, h + turn + 0.5, 0, 0.35 * side));
    }
  }
}

export function buildJungle(track: Track, batch: Batch, mats: Materials, inca: IncaMats, index: TrackIndex, terrain: Terrain): void {
  hedges(track, batch, inca);
  forest(batch, mats, inca, index, terrain);
  boughs(track, batch, inca, terrain);
}
