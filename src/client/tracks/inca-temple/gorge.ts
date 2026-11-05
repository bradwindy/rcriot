import * as THREE from 'three';
import { limitOf, ranges, sampleAt, type Sample, type Track } from '../../../shared/track';
import { Batch, boulder, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import { box, frame, headingAt, rope } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import { fallSheet, foamAt } from './cave';
import { RIVER, riverZ } from './ground';
import { v3 } from './kit';
import type { IncaMats } from './palette';

const SHALLOW = new THREE.Color(0.5, 0.82, 0.72);
const DEEP = new THREE.Color(0.12, 0.4, 0.42);

/** The river: one wavy sheet over the gorge, jade in the shallows and dark green where it runs deep. */
export function river(mats: Materials, terrain: Terrain): THREE.Mesh {
  const x0 = -345;
  const x1 = -60;
  const z0 = -305;
  const z1 = -160;
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 72, 36);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, RIVER.level, (z0 + z1) / 2);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / 16, pos.getZ(i) / 16);
    const depth = RIVER.level - terrain.height(pos.getX(i), pos.getZ(i));
    const c = SHALLOW.clone().lerp(DEEP, Math.max(0, Math.min(1, depth / 2.5)));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, mats.water);
  mesh.renderOrder = 1;
  return mesh;
}

/** The falls at the head of the gorge: two drops off the cliff into a foaming pool, with mist. */
function falls(batch: Batch, mats: Materials, inca: IncaMats, terrain: Terrain): void {
  const z = riverZ(RIVER.head);
  // The foot of the cliff: walk east up the gorge until the ground rises off the river bed.
  let x = RIVER.head - 30;
  while (x < RIVER.head + 20 && terrain.height(x, z) < RIVER.level + 2) x += 1;
  x -= 1.5;
  let top = RIVER.level;
  for (let k = 0; k < 24; k++) top = Math.max(top, terrain.height(x + k, z));
  fallSheet(batch, inca, v3(x, 0, z), -Math.PI / 2, 16, top + 0.5, RIVER.level - 0.2);
  fallSheet(batch, inca, v3(x - 0.8, 0, z + 1.5), -Math.PI / 2, 9, top - 2, RIVER.level - 0.2, [0.8, 0.9, 1]);
  for (let k = 0; k < 5; k++) foamAt(batch, inca, v3(x - 2 - hash2(k, 1, 3) * 3, RIVER.level - 0.4, z - 7 + k * 3.5), 4 + hash2(k, 2, 3) * 2, k);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const at = v3(x + 2 + k * 3, 0, z + side * (10 + k * 2));
      at.y = terrain.height(at.x, at.z);
      batch.geometry(mats.rock, boulder(40 + k * 3 + side, 6 + k, 0.9), xf(at.x, at.y + 1, at.z, k + side));
    }
  }
}

/** Big mossy rocks along the river banks, a few stepping stones and some crocodiles waiting by the ford. */
function banks(batch: Batch, mats: Materials, inca: IncaMats, terrain: Terrain, index: TrackIndex): void {
  for (let x = -330; x < -95; x += 9) {
    for (const side of [-1, 1]) {
      if (hash2(x, side, 5) < 0.35) continue;
      const z = riverZ(x) + side * (11 + hash2(x, side, 6) * 9);
      const y = terrain.height(x, z);
      if (y > RIVER.level + 4) continue;
      const near = index.nearest(x, z, 20);
      if (near && near.d < limitOf(near.sample) + 4) continue;
      batch.geometry(mats.rock, boulder(x * 3 + side, 2.5 + hash2(x, side, 7) * 3, 0.7), xf(x, Math.max(y, RIVER.level - 1), z, x), [0.85, 1, 0.8]);
    }
  }
  const crocs: [number, number, number][] = [
    [-200, -240, 0.6],
    [-118, -238, 2.4],
    [-230, -222, -1],
  ];
  for (const [x, z, yaw] of crocs) croc(batch, inca, v3(x, RIVER.level, z), yaw);
}

/** Just a crocodile's eyes, nostrils and the ridge of its back showing above the water. */
function croc(batch: Batch, inca: IncaMats, at: THREE.Vector3, yaw: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const skin: RGB = [0.45, 0.6, 0.3];
  batch.geometry(inca.croc, new THREE.BoxGeometry(1.6, 0.5, 4.2), m.clone().multiply(xf(0, 0, 0)), skin);
  batch.geometry(inca.croc, new THREE.BoxGeometry(1.0, 0.4, 2.6), m.clone().multiply(xf(0, 0.05, -3.2)), skin);
  for (const e of [-1, 1]) {
    batch.geometry(inca.croc, new THREE.BoxGeometry(0.45, 0.45, 0.5), m.clone().multiply(xf(e * 0.5, 0.35, -1.4)), skin);
    batch.geometry(inca.gold, new THREE.BoxGeometry(0.2, 0.18, 0.1), m.clone().multiply(xf(e * 0.5, 0.42, -1.66)));
  }
  for (let k = 0; k < 6; k++) batch.geometry(inca.croc, new THREE.ConeGeometry(0.2, 0.5, 4), m.clone().multiply(xf(0, 0.35, 0.2 + k * 0.9)), skin);
  for (let k = 0; k < 3; k++) batch.geometry(inca.croc, new THREE.BoxGeometry(0.9 - k * 0.2, 0.25, 1.4), m.clone().multiply(xf(0, 0, 2.6 + k * 1.3)), skin);
}

/** A post of the rope bridge, `side` of the road. */
function post(batch: Batch, mats: Materials, p: Sample, side: number, tall: number, thick: number): THREE.Vector3 {
  const at = frame(p, side * (limitOf(p) + 0.25), 0);
  box(batch, mats.planks, thick, tall + 1.4, thick, xf(at.x, at.y + tall / 2 - 0.7, at.z, headingAt(p)));
  return at.setY(at.y + tall);
}

/**
 * The rope bridge over the gorge, the shortcut: planks on cross-beams, posts and sagging hand ropes, tall A-frames at
 * each end, and a gap in the middle where planks have fallen out and the broken ends dangle over the river.
 */
export function ropeBridge(track: Track, batch: Batch, mats: Materials): void {
  const route = track.routes[0];
  const t = route.track;
  const [[a, b]] = ranges(t, (p) => p.zone === 'bridge' && p.s > route.rfrom && p.s < route.rto);
  const gaps = ranges(t, (p) => p.zone === 'bridge' && p.surface === 'void');
  const inGap = (s: number, pad = 0) => gaps.some(([g0, g1]) => s > g0 - pad && s < g1 + pad);

  // Cross-beams under the planks.
  for (let s = a + 1; s < b; s += 2) {
    if (inGap(s, 0.6)) continue;
    const p = sampleAt(t, s);
    const at = frame(p, 0, -0.3);
    box(batch, mats.planks, limitOf(p) * 2 + 0.8, 0.3, 0.4, xf(at.x, at.y, at.z, headingAt(p)), [0.7, 0.6, 0.5]);
  }
  // Posts every few metres, with a hand rope and a knee rope strung between them.
  const step = 5;
  for (const side of [-1, 1]) {
    let last: THREE.Vector3[] | null = null;
    for (let s = a; s <= b + 0.1; s += step) {
      const p = sampleAt(t, Math.min(s, b));
      if (inGap(s, 1.5)) {
        // The ropes broke here: their ends hang down into the gorge.
        if (last) for (const r of last) rope(batch, mats.rope, r, r.clone().add(v3(0, -4 - hash2(s, side, 1) * 3, 0)), 0.09);
        last = null;
        continue;
      }
      const top = post(batch, mats, p, side, 1.8, 0.28);
      const knee = top.clone().setY(top.y - 0.9);
      if (last) {
        const [lt, lk] = last;
        for (const [from, to] of [[lt, top], [lk, knee]]) {
          const mid = from.clone().lerp(to, 0.5).add(v3(0, -0.35, 0));
          rope(batch, mats.rope, from, mid, 0.08);
          rope(batch, mats.rope, mid, to, 0.08);
        }
        for (let k = 1; k < 4; k++) rope(batch, mats.rope, lt.clone().lerp(top, k / 4).add(v3(0, -0.2, 0)), lk.clone().lerp(knee, k / 4).setY(lk.y - 1), 0.04);
      } else if (s > a) {
        for (const r of [top, knee]) rope(batch, mats.rope, r, r.clone().add(v3(0, -4 - hash2(s, side, 2) * 3, 0)), 0.09);
      }
      last = [top, knee];
    }
  }
  // Planks hanging off the broken ends.
  for (const [g0, g1] of gaps) {
    for (const [s, dir] of [[g0 - 0.5, 1], [g1 + 0.5, -1]] as const) {
      const p = sampleAt(t, s);
      const h = headingAt(p);
      for (let k = -2; k <= 2; k++) {
        const len = 2 + hash2(s, k, 3) * 2.5;
        const at = frame(p, k * 1.6, -len / 2);
        box(batch, mats.planks, 1.3, len, 0.15, xf(at.x, at.y, at.z, h, dir * 0.25 * hash2(k, s, 1), (hash2(k, s, 2) - 0.5) * 0.5));
      }
    }
  }
  // Timber A-frames at both ends, lashed with rope, with a skull on a pike for good measure.
  for (const s of [a + 0.5, b - 0.5]) {
    const p = sampleAt(t, s);
    const h = headingAt(p);
    const span = limitOf(p) + 0.6;
    const peaks: THREE.Vector3[] = [];
    for (const side of [-1, 1]) {
      const foot = frame(p, side * span, -1.5);
      const peak = frame(p, side * (span - 0.2), 5.5);
      batch.beam(mats.planks, foot.clone().add(v3(p.tx * 1.2, 0, p.tz * 1.2)), peak, 0.45);
      batch.beam(mats.planks, foot.clone().add(v3(-p.tx * 1.2, 0, -p.tz * 1.2)), peak, 0.45);
      peaks.push(peak);
    }
    batch.beam(mats.planks, peaks[0], peaks[1], 0.4);
    const mid = peaks[0].clone().lerp(peaks[1], 0.5);
    batch.geometry(mats.white, new THREE.BoxGeometry(0.7, 0.6, 0.7), xf(mid.x, mid.y + 0.6, mid.z, h), [0.95, 0.9, 0.78]);
    for (const e of [-1, 1]) batch.geometry(mats.plastic, new THREE.BoxGeometry(0.18, 0.18, 0.05), xf(mid.x, mid.y + 0.65, mid.z, h).multiply(xf(e * 0.17, 0, -0.36)), [0.1, 0.08, 0.06]);
  }
}

export function buildGorge(track: Track, batch: Batch, mats: Materials, inca: IncaMats, terrain: Terrain, index: TrackIndex): void {
  falls(batch, mats, inca, terrain);
  banks(batch, mats, inca, terrain, index);
  ropeBridge(track, batch, mats);
}
