import * as THREE from 'three';
import { limitOf, sampleAt, type Sample, type Track } from '../../../shared/track';
import { SPOTS } from '../../../shared/tracks/lava-dig';
import { beam, boulder, taper, xf, type Batch } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import type { Materials } from '../../render/materials';
import { frame, headingAt } from '../../render/road';
import type { DigHall } from './caves';
import { block, put, type Cell } from './kit';
import type { LavaMats } from './materials';
import { along, Lights, LAMP_LIGHT } from './util';

/** A bar from a to b painted with an atlas cell. */
function bar(batch: Batch, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w: number, c: Cell, h = w): void {
  const [g, m] = beam(a, b, w, h);
  put(batch, mat, g, m, c);
}

/** A point on the dig's floor: `o` across from the centre line, on the hall's level line. */
function onFloor(p: Sample, o: number, hall: DigHall): THREE.Vector3 {
  return frame(p, o, 0).setY(hall.level(p.s));
}

/** Strings of bulbs along the crown of the hall, and the lights they give. */
function bulbs(track: Track, batch: Batch, m: LavaMats, hall: DigHall, lights: Lights): void {
  let last: THREE.Vector3 | null = null;
  along(track, hall.a + 4, hall.b - 2, 4.5, (p, s, k) => {
    const at = frame(p, Math.sin(k * 0.7) * 1.2, 0).setY(hall.level(s) + hall.height(s) * 0.86 - (k % 2) * 0.5);
    if (last) batch.beam(m.ropeIn, last, at, 0.05);
    batch.box(m.bulb, 0.32, 0.42, 0.32, xf(at.x, at.y - 0.3, at.z));
    if (k % 4 === 1) lights.add(at.clone().setY(at.y - 1), LAMP_LIGHT.clone().multiplyScalar(1.15), 22, 0.07, 9);
    last = at;
  });
}

/**
 * The fossil: a giant skeleton being dug out of the floor, its ribs arching right over the road so the cars drive
 * through its belly, its skull lying on the floor at the front with its jaws open.
 */
function fossil(track: Track, batch: Batch, m: LavaMats, hall: DigHall, wire: THREE.Material): void {
  const mid = track.marks[SPOTS.fossil];
  const spineAt = (s: number) => {
    const p = sampleAt(track, s);
    const t = (s - (mid - 18)) / 38;
    return frame(p, Math.sin(t * Math.PI) * -1.5, 0).setY(hall.level(s) + 7.4 + Math.sin(t * Math.PI) * 1.6);
  };
  // The spine, one vertebra at a time, and the tail curling down to the floor on the left.
  for (let s = mid - 18; s < mid + 26; s += 1.6) {
    const a = spineAt(s);
    const b = spineAt(s + 1.6);
    bar(batch, m.kitIn, a, b, 0.7, 'bone');
    const p = sampleAt(track, s);
    const fin = a.clone().add(new THREE.Vector3(0, 1.1, 0));
    bar(batch, m.kitIn, a, fin.addScaledVector(new THREE.Vector3(p.tx, 0, p.tz), 0.6), 0.25, 'bone', 0.5);
  }
  // Ribs, longest in the middle, from floor to floor over the road.
  for (let s = mid - 12; s <= mid + 14; s += 3.2) {
    const p = sampleAt(track, s);
    const top = spineAt(s);
    const t = (s - (mid - 12)) / 26;
    const reach = limitOf(p) + 0.8 + Math.sin(t * Math.PI) * 1.6;
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const a = (k / 6) * (Math.PI / 2);
        const o = side * Math.sin(a) * (reach + Math.sin(a * 2) * 1.2);
        const y = top.y - (1 - Math.cos(a)) * (top.y - hall.level(s) + 0.4);
        pts.push(frame(p, o, 0).setY(y));
      }
      pts[0] = top.clone();
      for (let k = 0; k < 6; k++) bar(batch, m.kitIn, pts[k], pts[k + 1], 0.42 - k * 0.03, 'bone');
      // A mound of earth where the rib still goes into the floor.
      const foot = pts[6];
      batch.geometry(m.strata, boulder(Math.round(s) * 3 + side, 1.8, 0.4), xf(foot.x, foot.y, foot.z, s));
    }
  }
  // The skull, on the floor by the right-hand wall, jaws agape towards the oncoming cars.
  const p = sampleAt(track, mid - 26);
  const at = onFloor(p, limitOf(p) + 4.2, hall);
  const yaw = headingAt(p) + Math.PI / 2 + 0.25;
  const skull = (x: number, y: number, z: number) => new THREE.Matrix4().makeRotationY(yaw).setPosition(at).multiply(xf(x, y, z));
  batch.geometry(m.strata, boulder(7, 7, 0.3), skull(0, 0, -1));
  put(batch, m.kitIn, taper(4.0, 4.6, 3.0, 3.0, 3.4), skull(0, 0.9, 0.4), 'bone');
  put(batch, m.kitIn, taper(3.0, 5.6, 2.0, 4.6, 2.3), skull(0, 1.4, -4.4), 'bone');
  put(batch, m.kitIn, taper(2.6, 6.4, 2.2, 6.0, 0.8), skull(0, 0.5, -3.6).multiply(xf(0, 0, 0, 0, 0.42)), 'bone');
  block(batch, m.kitIn, 2.0, 1.6, 4.2, skull(0, 1.6, -4.2).multiply(xf(0, 0, 0, 0, 0.2)), 'black');
  for (const side of [-1, 1]) {
    block(batch, m.kitIn, 0.3, 1.3, 1.4, skull(side * 1.55, 3.0, 0.6), 'black');
    block(batch, m.kitIn, 0.3, 0.8, 1.0, skull(side * 1.25, 2.4, -2.7), 'black');
    for (let k = 0; k < 5; k++) {
      put(batch, m.kitIn, new THREE.ConeGeometry(0.34, 1.3, 4), skull(side * 1.0, 1.0, -6.4 + k * 0.85).multiply(xf(0, 0, 0, 0, Math.PI)), 'bone');
      put(batch, m.kitIn, new THREE.ConeGeometry(0.3, 1.1, 4), skull(side * 0.9, 1.0 - k * 0.3, -6.0 + k * 0.85), 'bone');
    }
  }
  // Neck bones from the skull back up to the spine.
  const neck = spineAt(mid - 18);
  const head = at.clone().setY(at.y + 2.6);
  for (let k = 0; k < 6; k++) {
    const a = head.clone().lerp(neck, k / 6).setY(head.y + (neck.y - head.y) * Math.sin(((k / 6) * Math.PI) / 2));
    const b = head.clone().lerp(neck, (k + 1) / 6).setY(head.y + (neck.y - head.y) * Math.sin((((k + 1) / 6) * Math.PI) / 2));
    bar(batch, m.kitIn, a, b, 0.8, 'bone');
  }
  // String lines and pegs marking out the dig round it, and a tarp with tools.
  for (const side of [-1, 1]) {
    for (let s = mid - 22; s < mid + 22; s += 4) {
      const q = sampleAt(track, s);
      const peg = onFloor(q, side * (limitOf(q) + 6.5), hall);
      batch.box(m.timberIn, 0.12, 0.6, 0.12, xf(peg.x, peg.y + 0.3, peg.z));
      const r = sampleAt(track, s + 4);
      const next = onFloor(r, side * (limitOf(r) + 6.5), hall);
      batch.line(wire, peg.setY(peg.y + 0.5), next.setY(next.y + 0.5), [0.9, 0.88, 0.8]);
    }
  }
  const tq = sampleAt(track, mid + 4);
  const tarp = onFloor(tq, -(limitOf(tq) + 4.5), hall);
  put(batch, m.kitIn, new THREE.PlaneGeometry(5, 4), xf(tarp.x, tarp.y + 0.05, tarp.z, headingAt(tq), -Math.PI / 2), 'tarp');
  for (let k = 0; k < 4; k++) {
    block(batch, m.kitIn, 0.8, 0.8, 0.8, xf(tarp.x + (k % 2) * 1.4 - 0.7, tarp.y + 0.45, tarp.z + Math.floor(k / 2) * 1.4 - 0.7, k), k === 2 ? 'rust' : 'crate');
  }
}

/** The trench: a plank ramp up over a dig trench, propped on a timber trestle, with shored walls and ladders. */
function trench(track: Track, batch: Batch, m: LavaMats, hall: DigHall): void {
  const lip = track.marks[SPOTS.trench];
  // Trestle legs under the ramp.
  for (let s = lip - 9; s <= lip + 0.5; s += 2.4) {
    const p = sampleAt(track, s);
    for (const o of [-0.45, 0, 0.45]) {
      const top = frame(p, o * p.width, -0.15);
      const foot = top.clone().setY(Math.min(top.y - 0.2, hall.level(s) - 2.4));
      batch.beam(m.timberIn, foot, top, 0.3);
    }
    const l = frame(p, -p.width / 2, -0.5);
    const r = frame(p, p.width / 2, -0.5);
    batch.beam(m.timberIn, l, r, 0.25);
  }
  // Shoring boards along both banks of the trench, and ladders down into it.
  for (let s = lip + 2; s < lip + 26; s += 2.2) {
    const p = sampleAt(track, s);
    for (const side of [-1, 1]) {
      const top = frame(p, side * (limitOf(p) + 0.1), 0).setY(hall.level(s) + 0.3);
      const foot = frame(p, side * (limitOf(p) + 0.1), 0);
      if (top.y - foot.y < 0.4) continue;
      batch.beam(m.timberIn, foot.clone().setY(foot.y - 0.3), top, 0.25);
      if (Math.round(s) % 9 === 0) {
        const lad = frame(p, side * (limitOf(p) - 0.5), 0);
        for (const d of [-0.4, 0.4]) {
          const a = lad.clone().add(new THREE.Vector3(p.tx * d, 0, p.tz * d));
          batch.beam(m.timberIn, a, a.clone().setY(top.y + 1.2).addScaledVector(new THREE.Vector3(-p.tz, 0, p.tx), side * 0.5), 0.1);
        }
      }
    }
  }
  // Spoil heaps and sieves on the banks.
  for (const [ds, side] of [[6, -1], [12, 1], [20, -1]] as const) {
    const p = sampleAt(track, lip + ds);
    const at = onFloor(p, side * (limitOf(p) + 4), hall);
    batch.geometry(m.strata, boulder(ds * 7, 4.2, 0.45), xf(at.x, at.y, at.z, ds));
    const sv = onFloor(p, side * (limitOf(p) + 1.6), hall);
    bar(batch, m.kitIn, sv.clone().setY(sv.y + 0.9), sv.clone().setY(sv.y + 0.9).addScaledVector(new THREE.Vector3(p.tx, 0, p.tz), 1.6), 1.3, 'mesh', 0.15);
    for (const d of [0, 1.6]) {
      const leg = sv.clone().addScaledVector(new THREE.Vector3(p.tx, 0, p.tz), d);
      batch.beam(m.timberIn, leg, leg.clone().setY(leg.y + 0.9), 0.12);
    }
  }
}

/** The jeep you have to get under: a giant army jeep parked astride the road, headlights blazing. */
function jeep(track: Track, batch: Batch, m: LavaMats, hall: DigHall, lights: Lights): void {
  const s = track.marks[SPOTS.jeep];
  const p = sampleAt(track, s);
  const base = frame(p, 0, 0).setY(hall.level(s));
  const yaw = headingAt(p) + Math.PI;
  const half = limitOf(p) + 2.4;
  const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeRotationY(yaw).setPosition(base).multiply(xf(x, y, z));
  const R = 3.8;
  const wheelZ = [-13, 12];
  const width = half * 2 + 3.2;
  // Wheels, with olive hubs and a slab of tread.
  for (const z of wheelZ) {
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(R, R, 2.6, 12, 1, false);
      put(batch, m.kitIn, g, at(side * half, R, z).multiply(xf(0, 0, 0, 0, 0, Math.PI / 2)), 'tyre');
      put(batch, m.kitIn, new THREE.CircleGeometry(R * 0.62, 10), at(side * (half + 1.32), R, z).multiply(xf(0, 0, 0, (side * Math.PI) / 2)), 'hub');
      // Mudguard over each wheel.
      block(batch, m.kitIn, 3.4, 0.4, 9, at(side * half, R * 2 + 0.5, z), 'olive');
    }
  }
  // The tub: floor pan, sides, a long bonnet with a grille at the front, and the star.
  const floorY = R + 1.6;
  block(batch, m.kitIn, width - 2, 0.8, 34, at(0, floorY, -0.5), 'olive');
  for (const side of [-1, 1]) block(batch, m.kitIn, 0.8, 4.2, 18, at(side * (width / 2 - 1.4), floorY + 2.4, 5), 'olive');
  block(batch, m.kitIn, width - 2, 4.2, 0.8, at(0, floorY + 2.4, 14), 'olive');
  block(batch, m.kitIn, width - 6, 3.6, 13, at(0, floorY + 2.2, -10.5), 'olive');
  block(batch, m.kitIn, width - 6.5, 0.1, 6.5, at(0, floorY + 4.06, -10.5), 'star');
  block(batch, m.kitIn, width - 6.2, 3.6, 0.6, at(0, floorY + 2.2, -17.1), 'black');
  for (let k = -4; k <= 4; k++) block(batch, m.kitIn, 0.5, 3.0, 0.3, at(k * 1.4, floorY + 2.2, -17.5), 'olive');
  for (const side of [-1, 1]) {
    block(batch, m.kitIn, 0.15, 3.2, 3.2, at(side * (width / 2 - 1.0), floorY + 2.4, 6), 'star');
    // Headlights either side of the grille.
    const lamp = at(side * (width / 2 - 4.5), floorY + 2.6, -17.6);
    const pos = new THREE.Vector3().setFromMatrixPosition(lamp);
    batch.geometry(m.kitIn, new THREE.CylinderGeometry(1.0, 1.0, 0.6, 10), lamp.clone().multiply(xf(0, 0, 0, 0, Math.PI / 2)));
    batch.geometry(m.lamp, new THREE.CircleGeometry(0.85, 10), at(side * (width / 2 - 4.5), floorY + 2.6, -17.95).multiply(xf(0, 0, 0, Math.PI)));
    lights.add(pos.clone().addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), -6).setY(base.y + 1.5), LAMP_LIGHT.clone().multiplyScalar(1.6), 26, 0.04, 5);
  }
  // Windscreen frame, seats, steering wheel and the spare on the back.
  for (const side of [-1, 1]) block(batch, m.kitIn, 0.5, 5.6, 0.5, at(side * (width / 2 - 2.6), floorY + 7.0, -3.8), 'olive');
  block(batch, m.kitIn, width - 4.6, 0.5, 0.5, at(0, floorY + 9.6, -3.8), 'olive');
  block(batch, m.kitIn, width - 4.6, 0.5, 0.5, at(0, floorY + 4.6, -3.8), 'olive');
  for (const side of [-1, 1]) {
    block(batch, m.kitIn, 5, 1.0, 5, at(side * 4.5, floorY + 1.6, 2), 'canvas');
    block(batch, m.kitIn, 5, 5, 1.0, at(side * 4.5, floorY + 3.6, 4.6), 'canvas');
  }
  put(batch, m.kitIn, new THREE.TorusGeometry(1.6, 0.3, 4, 10), at(-4.5, floorY + 5.2, -1.6).multiply(xf(0, 0, 0, 0, 0.9)), 'black');
  put(batch, m.kitIn, new THREE.CylinderGeometry(3.0, 3.0, 1.4, 12), at(0, floorY + 3.4, 15.2).multiply(xf(0, 0, 0, 0, Math.PI / 2)), 'tyre');
  // Jerry cans and a shovel strapped on, like the real thing.
  for (const side of [-1, 1]) block(batch, m.kitIn, 1.4, 2.4, 2, at(side * 7, floorY + 1.2 + 0.4, 15.2), 'olive');
}

/** Timber shoring and scaffold towers along the walls, and a narrow-gauge cart track down the left of the floor. */
function works(track: Track, batch: Batch, m: LavaMats, hall: DigHall): void {
  const fossil = track.marks[SPOTS.fossil];
  const jeepS = track.marks[SPOTS.jeep];
  const trenchS = track.marks[SPOTS.trench];
  const near = (s: number, c: number, r: number) => Math.abs(s - c) < r;
  // Rails on sleepers.
  const railO = (p: Sample) => -(limitOf(p) + 2.2);
  along(track, hall.a + 26, hall.b - 30, 1.4, (p, s) => {
    if (near(s, trenchS, 14) || near(s, jeepS, 22)) return;
    const c = onFloor(p, railO(p), hall);
    const l = frame(p, railO(p) - 0.7, 0).setY(c.y + 0.08);
    const r = frame(p, railO(p) + 0.7, 0).setY(c.y + 0.08);
    batch.beam(m.timberIn, l.clone().addScaledVector(new THREE.Vector3(-p.tz, 0, p.tx), -0.2), r.clone().addScaledVector(new THREE.Vector3(-p.tz, 0, p.tx), 0.2), 0.3, 0.12);
    const q = sampleAt(track, s + 1.4);
    const cq = onFloor(q, railO(q), hall);
    for (const d of [-0.55, 0.55]) {
      const a = frame(p, railO(p) + d, 0).setY(c.y + 0.22);
      const b = frame(q, railO(q) + d, 0).setY(cq.y + 0.22);
      batch.beam(m.steelIn, a, b, 0.12, 0.16);
    }
  });
  // Ore carts parked on the rails.
  for (const s of [hall.a + 40, fossil + 34]) {
    const p = sampleAt(track, s);
    const c = onFloor(p, railO(p), hall);
    const yaw = headingAt(p);
    cart(batch, m, new THREE.Matrix4().makeRotationY(yaw).setPosition(c));
  }
  // Scaffold towers against the right-hand wall, with lamps on top.
  for (const s of [hall.a + 30, fossil + 40, trenchS + 30]) {
    const p = sampleAt(track, s);
    const L = limitOf(p) + 4.6;
    const yaw = headingAt(p);
    const fwd = new THREE.Vector3(p.tx, 0, p.tz);
    const side = new THREE.Vector3(-p.tz, 0, p.tx);
    const foot = onFloor(p, L, hall);
    const top = Math.min(hall.height(s) * 0.6, 7.5);
    for (const [a, b] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) {
      const leg = foot.clone().addScaledVector(fwd, a).addScaledVector(side, b);
      batch.beam(m.steelIn, leg, leg.clone().setY(leg.y + top), 0.14);
    }
    for (let h = 2.4; h <= top; h += 2.4) {
      block(batch, m.kitIn, 3.6, 0.2, 2.8, xf(foot.x, foot.y + h, foot.z, yaw), 'crate');
      const a = foot.clone().addScaledVector(fwd, -1.5).addScaledVector(side, -1.2).setY(foot.y + h - 2.4);
      const b = foot.clone().addScaledVector(fwd, 1.5).addScaledVector(side, -1.2).setY(foot.y + h);
      batch.beam(m.steelIn, a, b, 0.1);
    }
    const lampAt = foot.clone().setY(foot.y + top + 0.2);
    block(batch, m.kitIn, 1.2, 0.9, 0.8, xf(lampAt.x, lampAt.y + 0.5, lampAt.z, yaw + Math.PI / 2 + 0.6, -0.4), 'black');
  }
  // Crates and canvas-covered stacks along the floor.
  along(track, hall.a + 14, hall.b - 10, 11, (p, s, k) => {
    if (near(s, fossil, 30) || near(s, trenchS, 12) || near(s, jeepS, 22)) return;
    const side = k % 2 ? 1 : -1;
    const at = onFloor(p, side * (limitOf(p) + 5 + hash2(k, 1, 60) * 2), hall);
    const yaw = headingAt(p) + hash2(k, 2, 61);
    const n = 1 + Math.floor(hash2(k, 3, 62) * 3);
    for (let i = 0; i < n; i++) block(batch, m.kitIn, 1.5, 1.5, 1.5, xf(at.x + (i % 2) * 1.6, at.y + 0.75 + (i === 2 ? 1.5 : 0), at.z, yaw + i * 0.2), i === 1 ? 'canvas' : 'crate');
  });
}

/** An ore cart: a rusty iron tub on four small wheels, heaped with ore. */
export function cart(batch: Batch, m: LavaMats, at: THREE.Matrix4, mat: THREE.Material = m.kitIn): void {
  const p = (x: number, y: number, z: number) => at.clone().multiply(xf(x, y, z));
  put(batch, mat, new THREE.CylinderGeometry(1.15, 0.85, 1.3, 4, 1), p(0, 1.15, 0).multiply(xf(0, 0, 0, Math.PI / 4, 0, 0, 1, 1, 1.5)), 'rust');
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.9, 0.9]) put(batch, mat, new THREE.CylinderGeometry(0.32, 0.32, 0.16, 8), p(x, 0.34, z).multiply(xf(0, 0, 0, 0, 0, Math.PI / 2)), 'black');
  }
  batch.geometry(m.rubbleIn, boulder(3, 1.6, 0.5), p(0, 1.85, 0));
}

/** The mine portal at the cave mouth: timber posts and a lintel, a striped board and two lamps. */
function portal(track: Track, batch: Batch, m: LavaMats, hall: DigHall, lights: Lights): void {
  const s = hall.a + 1;
  const p = sampleAt(track, s);
  const yaw = headingAt(p);
  const L = limitOf(p) + 0.4;
  const top = 6.4;
  for (const side of [-1, 1]) {
    const foot = frame(p, side * L, 0);
    batch.box(m.timberIn, 0.8, top + 0.6, 0.8, xf(foot.x, foot.y + top / 2, foot.z, yaw));
    const brace = frame(p, side * (L - 1.8), top - 0.2);
    batch.beam(m.timberIn, foot.clone().setY(foot.y + top - 2), brace, 0.4);
    const lamp = frame(p, side * (L - 0.6), top - 1.2);
    block(batch, m.kitIn, 0.7, 0.6, 0.6, xf(lamp.x, lamp.y, lamp.z, yaw), 'black');
    batch.box(m.bulb, 0.4, 0.4, 0.1, xf(lamp.x - p.tx * 0.32, lamp.y, lamp.z - p.tz * 0.32, yaw));
  }
  const l = frame(p, -L - 0.6, top);
  const r = frame(p, L + 0.6, top);
  batch.beam(m.timberIn, l, r, 0.9);
  const board = frame(p, 0, top - 0.9).addScaledVector(new THREE.Vector3(p.tx, 0, p.tz), -0.5);
  block(batch, m.kitIn, 7, 0.9, 0.12, xf(board.x, board.y, board.z, yaw), 'stripes');
  lights.add(frame(p, 0, 3), LAMP_LIGHT.clone().multiplyScalar(1.2), 18, 0.05, 6);
}

/** Everything inside the dig's cavern. */
export function buildDig(track: Track, batch: Batch, mats: Materials, m: LavaMats, hall: DigHall, lights: Lights): void {
  bulbs(track, batch, m, hall, lights);
  portal(track, batch, m, hall, lights);
  fossil(track, batch, m, hall, mats.wire);
  trench(track, batch, m, hall);
  jeep(track, batch, m, hall, lights);
  works(track, batch, m, hall);
}
