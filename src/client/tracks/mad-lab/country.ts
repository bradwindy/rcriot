import * as THREE from 'three';
import { limitOf, sampleAt, type Sample, type Track } from '../../../shared/track';
import { Batch, ball, taper, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import { frame, headingAt } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import { allSamples } from '../../render/trackindex';
import type { Fx, Sparks } from './fx';
import { coil } from './lab';
import { cube, drum, each } from './kit';
import type { MadMats } from './materials';
import { land } from './plan';

const GREEN: RGB = [0.7, 1.3, 0.8];
const FIRE: RGB = [1.0, 0.5, 0.2];

/** How far a spot is outside every road corridor on the banks. */
function clearance(track: Track): (x: number, z: number) => number {
  const banks = allSamples(track).filter((p: Sample) => p.y < 6);
  return (x, z) => {
    let best = Infinity;
    for (const p of banks) best = Math.min(best, Math.hypot(p.x - x, p.z - z) - limitOf(p));
    return best;
  };
}

/** Out to the left of the road, flat. */
const left = (p: Sample) => new THREE.Vector3(p.tz, 0, -p.tx);

export interface Country {
  update(time: number, sparks: Sparks): void;
}

/**
 * Outside the castle walls: the start under a pair of crackling pylons, studio searchlights sweeping the clouds, the
 * village with its torch-waving mob, the burning windmill, gas lamps along the banks and dead trees on the hills.
 */
export function countryside(track: Track, terrain: Terrain, batch: Batch, mats: Materials, m: MadMats, fx: Fx, group: THREE.Group): Country {
  const gap = clearance(track);
  const taken: [number, number, number][] = [];
  const free = (x: number, z: number, r: number) => gap(x, z) > r && land(x, z) > 0.98 && taken.every(([a, b, rr]) => Math.hypot(a - x, b - z) > r + rr);
  const ground = (x: number, z: number) => terrain.height(x, z);

  // The start: two lattice pylons with Tesla toroids, arcing over the line, and the banner between them.
  const p0 = sampleAt(track, 0);
  const yaw0 = headingAt(p0);
  const span = limitOf(p0) + 1.6;
  const tops: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const b = frame(p0, side * span, 0);
    const h = 11;
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const foot = b.clone().add(new THREE.Vector3(dx * 1.2, 0, dz * 1.2));
      batch.beam(m.iron, foot, b.clone().add(new THREE.Vector3(dx * 0.4, h, dz * 0.4)), 0.22);
    }
    for (let y = 2; y < h; y += 2.2) {
      const w = 1.2 - (y / h) * 0.8;
      cube(batch, m.iron, w * 2, 0.15, 0.15, xf(b.x, b.y + y, b.z + w, 0), 1);
      cube(batch, m.iron, w * 2, 0.15, 0.15, xf(b.x, b.y + y, b.z - w, 0), 1);
      cube(batch, m.iron, 0.15, 0.15, w * 2, xf(b.x + w, b.y + y, b.z, 0), 1);
      cube(batch, m.iron, 0.15, 0.15, w * 2, xf(b.x - w, b.y + y, b.z, 0), 1);
    }
    tops.push(coil(batch, m, b.x, b.y + h - 0.5, b.z, 2.2, 0.55));
    fx.light(b.clone().setY(b.y + 6), [0.4, 0.6, 1.0], 18, 6, 0.3);
  }
  const ban = frame(p0, 0, 8);
  for (const turn of [0, Math.PI]) batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 2.6, 2.4), xf(ban.x, ban.y, ban.z, yaw0 + turn).multiply(xf(0, 0, 0.06)));
  cube(batch, m.iron, span * 2 - 2, 0.3, 0.3, xf(ban.x, ban.y + 1.3, ban.z, yaw0), 1);
  cube(batch, m.iron, span * 2 - 2, 0.3, 0.3, xf(ban.x, ban.y - 1.3, ban.z, yaw0), 1);
  taken.push([p0.x, p0.z, span + 3]);

  // Searchlights on the banks, sweeping the clouds like a premiere.
  const beams: { mesh: THREE.Mesh; seed: number }[] = [];
  const cone = new THREE.CylinderGeometry(16, 0.9, 300, 10, 1, true);
  cone.translate(0, 150, 0);
  cone.setAttribute('color', new THREE.Float32BufferAttribute(new Array(cone.getAttribute('position').count * 3).fill(1), 3));
  for (const [x, z] of [
    [168, 30],
    [176, 128],
    [-30, 212],
    [60, -205],
    [190, -100],
  ]) {
    const y = ground(x, z);
    cube(batch, m.iron, 3, 1.4, 4.4, xf(x, y + 0.7, z), 2);
    for (const dx of [-1.4, 1.4]) for (const dz of [-1.6, 1.6]) batch.geometry(m.iron, new THREE.CylinderGeometry(0.5, 0.5, 0.4, 8), xf(x + dx, y + 0.5, z + dz, 0, 0, Math.PI / 2));
    drum(batch, m.iron, x, y + 1.4, z, 1.1, 1.1, 1.6, 10, 2);
    batch.geometry(mats.lens, new THREE.CircleGeometry(0.95, 10), xf(x, y + 3.05, z, 0, -Math.PI / 2));
    const mesh = new THREE.Mesh(cone, m.beam);
    mesh.position.set(x, y + 3, z);
    mesh.frustumCulled = false;
    group.add(mesh);
    beams.push({ mesh, seed: beams.length * 1.7 });
    taken.push([x, z, 4]);
    fx.light(new THREE.Vector3(x, y + 4, z), [0.9, 0.9, 1.0], 14);
  }

  // The village south of the castle: cottages along the outside of the bend, lamplight in their windows.
  each(track, 15, (p) => p.zone === 'bank' && p.z > 168, (p, _t, _s, k) => {
    const out = left(p);
    const d = limitOf(p) + 7 + hash2(k, 1, 61) * 5;
    const x = p.x + out.x * d;
    const z = p.z + out.z * d;
    if (!free(x, z, 5)) return;
    taken.push([x, z, 5]);
    cottage(batch, m, x, ground(x, z) - 0.3, z, headingAt(p) + Math.PI / 2 + (hash2(k, 2, 61) - 0.5) * 0.4, k);
  });

  // The mob gathered at the edge of the village, torches and pitchforks up.
  const mobAt = sampleAt(track, 205);
  const mobOut = left(mobAt);
  const mobC = new THREE.Vector3(mobAt.x, 0, mobAt.z).addScaledVector(mobOut, limitOf(mobAt) + 4.5);
  for (let i = 0; i < 14; i++) {
    const a = hash2(i, 3, 63) * Math.PI * 2;
    const r = Math.sqrt(hash2(i, 4, 63)) * 4;
    const x = mobC.x + Math.cos(a) * r * 1.4;
    const z = mobC.z + Math.sin(a) * r;
    villager(batch, mats, m, fx, x, ground(x, z) - 0.1, z, Math.atan2(-(-70 - x), -(-60 - z)), i);
  }
  fx.light(new THREE.Vector3(mobC.x, ground(mobC.x, mobC.z) + 4, mobC.z), FIRE, 22, 8, 0.3);
  taken.push([mobC.x, mobC.z, 7]);

  // The windmill on the north bank, its cap alight, its sails still turning.
  const millS = nearestS(track, 24, -186);
  const mp = sampleAt(track, millS);
  const mo = left(mp);
  const mill = new THREE.Vector3(mp.x, 0, mp.z).addScaledVector(mo, limitOf(mp) + 10);
  mill.y = ground(mill.x, mill.z) - 0.3;
  const sails = windmill(batch, mats, m, fx, mill, Math.atan2(-mo.x, -mo.z) + Math.PI);
  group.add(sails);
  taken.push([mill.x, mill.z, 8]);

  // Gas lamps along the outer fence.
  each(track, 42, (p) => p.zone === 'bank', (p) => {
    const at = frame(p, -(limitOf(p) + 0.6), 0);
    if (!taken.every(([a, b, r]) => Math.hypot(a - at.x, b - at.z) > r)) return;
    cube(batch, m.iron, 0.18, 3.6, 0.18, xf(at.x, at.y + 1.8, at.z), 1);
    const head = at.clone().add(left(p).multiplyScalar(-0.6)).setY(at.y + 3.6);
    batch.beam(m.iron, at.clone().setY(at.y + 3.5), head, 0.1);
    cube(batch, mats.lantern, 0.5, 0.7, 0.5, xf(head.x, head.y - 0.45, head.z), 1);
    batch.geometry(m.iron, new THREE.ConeGeometry(0.45, 0.35, 4), xf(head.x, head.y, head.z, Math.PI / 4));
    fx.light(head.clone().setY(head.y - 0.8), [1.0, 0.78, 0.45], 16, 4, 0.08);
  }, 21);

  // Dead trees on the slopes.
  for (let i = 0; i < 70; i++) {
    const a = hash2(i, 5, 67) * Math.PI * 2;
    const r = 175 + hash2(i, 6, 67) * 90;
    const x = 20 + Math.cos(a) * r * 1.1;
    const z = -10 + Math.sin(a) * r;
    if (!free(x, z, 3)) continue;
    deadTree(batch, m, x, ground(x, z) - 0.2, z, i);
  }

  return {
    update(time, sparks) {
      const tick = Math.floor(time * 15);
      sparks.fork(tops[0], tops[1], 0.45, 1.6, 12, GREEN, 400, tick, 2);
      for (const { mesh, seed } of beams) {
        mesh.rotation.set(0.35 + 0.18 * Math.sin(time * 0.31 + seed), time * 0.12 + seed * 2, 0, 'YXZ');
      }
      sails.children[0].rotation.z = time * 0.6;
    },
  };
}

function nearestS(track: Track, x: number, z: number): number {
  let best = 0;
  let d = Infinity;
  for (const p of track.samples) {
    const e = Math.hypot(p.x - x, p.z - z);
    if (e < d) {
      d = e;
      best = p.s;
    }
  }
  return best;
}

/** A plaster-and-beam cottage under a thatch roof, with a chimney and lit windows. */
function cottage(batch: Batch, m: MadMats, x: number, y: number, z: number, yaw: number, k: number): void {
  const w = 6 + hash2(k, 7, 61) * 2;
  const d = 4.5;
  const h = 3.6;
  const base = xf(x, y, z, yaw);
  cube(batch, m.plaster, w, h, d, base.clone().multiply(xf(0, h / 2, 0)), 4);
  for (const side of [-1, 1]) {
    const run = d / 2 + 0.6;
    const rise = 2.6;
    cube(batch, m.thatch, w + 1, 0.4, Math.hypot(run, rise), base.clone().multiply(xf(0, h + rise / 2, (side * run) / 2, 0, -side * Math.atan2(rise, run))), 3);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const g = base.clone().multiply(xf(side * (w / 2 + 0.02), h + 0.35 + i * 0.75, 0, side * (Math.PI / 2)));
      batch.geometry(m.plaster, new THREE.PlaneGeometry(d * (1 - i / 3.2), 0.8), g);
    }
  }
  cube(batch, m.stone, 0.9, 3, 0.9, base.clone().multiply(xf(w * 0.3, h + 2, 0.6)), 2);
  for (const dz of [-1, 1]) {
    for (const dx of [-w * 0.25, w * 0.25]) {
      if (hash2(k, Math.round(dx * 10) + dz, 59) < 0.3) continue;
      batch.geometry(m.window, new THREE.PlaneGeometry(0.9, 1.3), base.clone().multiply(xf(dx, 1.9, dz * (d / 2 + 0.03), dz > 0 ? 0 : Math.PI)));
    }
  }
}

/** A villager: legs, a coat, a head and a raised torch or pitchfork. */
function villager(batch: Batch, mats: Materials, m: MadMats, fx: Fx, x: number, y: number, z: number, yaw: number, i: number): void {
  const coats: RGB[] = [
    [0.36, 0.26, 0.18],
    [0.28, 0.3, 0.24],
    [0.4, 0.2, 0.16],
    [0.24, 0.24, 0.3],
  ];
  const coat = coats[i % coats.length];
  const s = 0.9 + hash2(i, 8, 63) * 0.25;
  const base = xf(x, y, z, yaw, 0, 0, s);
  for (const dx of [-0.2, 0.2]) batch.geometry(m.paint, new THREE.BoxGeometry(0.28, 1, 0.3), base.clone().multiply(xf(dx, 0.5, 0)), [0.18, 0.16, 0.15]);
  batch.geometry(m.paint, taper(0.9, 0.55, 0.65, 0.4, 1.2), base.clone().multiply(xf(0, 0.95, 0)), coat);
  batch.geometry(m.paint, ball(0.27, 1, 1.1, 1, 6), base.clone().multiply(xf(0, 2.45, 0)), [0.78, 0.6, 0.48]);
  batch.geometry(m.paint, new THREE.CylinderGeometry(0.28, 0.34, 0.18, 6), base.clone().multiply(xf(0, 2.7, 0)), [0.2, 0.18, 0.16]);
  const shoulder = new THREE.Vector3(0.38, 2.05, 0).applyMatrix4(base);
  const hand = new THREE.Vector3(0.55, 2.75, -0.2).applyMatrix4(base);
  batch.beam(m.paint, shoulder, hand, 0.16, 0.16, coat);
  if (i % 2 === 0) {
    const tip = new THREE.Vector3(0.6, 3.5, -0.25).applyMatrix4(base);
    batch.beam(m.timber, hand.clone().setY(hand.y - 0.4), tip, 0.1);
    for (const turn of [0, Math.PI / 2]) batch.geometry(mats.flame, new THREE.PlaneGeometry(0.45, 0.75), xf(tip.x, tip.y + 0.3, tip.z, yaw + turn));
    fx.flames.push(tip.clone().setY(tip.y + 0.4));
  } else {
    const tip = new THREE.Vector3(0.6, 4.1, -0.3).applyMatrix4(base);
    batch.beam(m.timber, new THREE.Vector3(0.5, 1.2, -0.1).applyMatrix4(base), tip, 0.08);
    for (const dx of [-0.18, 0, 0.18]) {
      const prong = new THREE.Vector3(0.6 + dx, 4.1, -0.3).applyMatrix4(base);
      batch.beam(m.iron, prong, new THREE.Vector3(0.6 + dx, 4.55, -0.3).applyMatrix4(base), 0.05);
    }
    cube(batch, m.iron, 0.42 * s, 0.05, 0.05, xf(tip.x, tip.y, tip.z, yaw), 1);
  }
}

/** The windmill: a tapering tower, a thatch cap on fire and four lattice sails on a hub. Returns the turning sails. */
function windmill(batch: Batch, mats: Materials, m: MadMats, fx: Fx, at: THREE.Vector3, yaw: number): THREE.Group {
  drum(batch, m.plaster, at.x, at.y, at.z, 4.6, 3.4, 13, 10, 5);
  for (let y = 3; y < 12; y += 4) {
    const a = yaw + y;
    batch.geometry(m.window, new THREE.PlaneGeometry(0.9, 1.4), xf(at.x + Math.sin(a) * 4.05, at.y + y, at.z + Math.cos(a) * 4.05, a));
  }
  const capY = at.y + 13;
  const g = new THREE.ConeGeometry(4.2, 4, 10, 1, true);
  batch.geometry(m.thatch, g, xf(at.x, capY + 2, at.z));
  g.dispose();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const r = 2.6 - (k % 2) * 0.8;
    const f = new THREE.Vector3(at.x + Math.cos(a) * r, capY + 1.4 + (k % 2) * 1.2, at.z + Math.sin(a) * r);
    for (const turn of [0, Math.PI / 2]) batch.geometry(mats.flame, new THREE.PlaneGeometry(1.6, 2.6), xf(f.x, f.y + 1, f.z, a + turn));
    fx.flames.push(f.clone().setY(f.y + 1.8));
  }
  fx.light(new THREE.Vector3(at.x, capY + 3, at.z), FIRE, 34, 9, 0.35);

  const hub = new THREE.Vector3(at.x + Math.sin(yaw) * -4.2, capY + 0.6, at.z + Math.cos(yaw) * -4.2);
  const outer = new THREE.Group();
  const spin = new THREE.Group();
  const b = new Batch();
  b.geometry(m.timber, new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8), xf(0, 0, 0, 0, Math.PI / 2));
  for (let k = 0; k < 4; k++) {
    const r = xf(0, 0, 0, 0, 0, (k / 4) * Math.PI * 2);
    b.geometry(m.timber, new THREE.BoxGeometry(0.35, 11, 0.35), r.clone().multiply(xf(0, 5.5, -0.5)));
    for (let j = 1; j < 6; j++) b.geometry(m.timber, new THREE.BoxGeometry(2.2, 0.12, 0.12), r.clone().multiply(xf(0.9, 1 + j * 1.8, -0.5)));
    b.geometry(m.timber, new THREE.BoxGeometry(0.12, 9.5, 0.12), r.clone().multiply(xf(2, 6, -0.5)));
  }
  for (const mesh of b.meshes()) spin.add(mesh);
  outer.add(spin);
  outer.position.copy(hub);
  outer.rotation.y = yaw;
  return outer;
}

/** A gnarled dead tree: a leaning trunk and a few crooked limbs. */
function deadTree(batch: Batch, m: MadMats, x: number, y: number, z: number, i: number): void {
  const h = 5 + hash2(i, 9, 67) * 5;
  const lean = (hash2(i, 10, 67) - 0.5) * 0.5;
  const top = new THREE.Vector3(x + lean * h, y + h, z + lean * h * 0.5);
  batch.beam(m.bark, new THREE.Vector3(x, y, z), top, 0.7, 0.7);
  for (let k = 0; k < 4; k++) {
    const t = 0.45 + k * 0.15;
    const from = new THREE.Vector3(x, y, z).lerp(top, t);
    const a = hash2(i, 11 + k, 67) * Math.PI * 2;
    const len = (1 - t) * h * 0.8 + 1;
    const to = from.clone().add(new THREE.Vector3(Math.cos(a) * len, len * 0.6, Math.sin(a) * len));
    batch.beam(m.bark, from, to, 0.3 - k * 0.04, 0.3 - k * 0.04);
    batch.beam(m.bark, to, to.clone().add(new THREE.Vector3(Math.cos(a + 1) * len * 0.4, len * 0.4, Math.sin(a + 1) * len * 0.4)), 0.14, 0.14);
  }
}
