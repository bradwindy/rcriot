import * as THREE from 'three';
import { limitOf, type Sample, type Track } from '../../../shared/track';
import { Batch, ball, xf, type RGB } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { frame } from '../../render/road';
import { allSamples } from '../../render/trackindex';
import type { Fx, Sparks } from './fx';
import { cube, drum, each } from './kit';
import type { MadMats } from './materials';
import { FLOOR, LAB } from './plan';

const BLUE: RGB = [0.6, 0.8, 1.25];
const GOO: RGB = [0.45, 1.0, 0.3];
const LADDER: RGB = [1.1, 0.8, 1.3];
const LAMP: RGB = [1.0, 0.72, 0.36];

/** Free floor: how far a spot is outside the nearest road corridor at floor level. */
export function gapper(track: Track): (x: number, z: number) => number {
  const near = allSamples(track).filter((p: Sample) => p.y < FLOOR + 4 && p.y > FLOOR - 2);
  return (x, z) => {
    let best = Infinity;
    for (const p of near) best = Math.min(best, Math.hypot(p.x - x, p.z - z) - limitOf(p));
    return best;
  };
}

/** A Tesla coil standing on the floor: brick plinth, copper winding, iron bands and a glowing toroid. Returns its top. */
export function coil(batch: Batch, m: MadMats, x: number, y: number, z: number, h: number, r = 0.8): THREE.Vector3 {
  drum(batch, m.stoneIn, x, y, z, r * 2.2, r * 2.4, 1.2, 8, 3);
  drum(batch, m.copperIn, x, y + 1.2, z, r, r * 0.9, h - 1.8, 10, 1.2);
  for (let k = y + 2; k < y + h - 1; k += 1.1) drum(batch, m.ironIn, x, k, z, r * 1.15, r * 1.15, 0.14, 10, 1);
  const torus = new THREE.TorusGeometry(r * 1.8, r * 0.45, 6, 14);
  torus.rotateX(Math.PI / 2);
  batch.geometry(m.orb, torus, xf(x, y + h, z));
  torus.dispose();
  batch.geometry(m.orb, ball(r * 0.6, 1, 1, 1, 6), xf(x, y + h + 0.5, z));
  return new THREE.Vector3(x, y + h + 0.5, z);
}

/** A tall glass vat of bubbling green, banded in iron, piped to the roof. */
function vat(batch: Batch, m: MadMats, x: number, z: number, r: number, h: number): void {
  const y = FLOOR;
  drum(batch, m.ironIn, x, y, z, r + 0.4, r + 0.5, 0.9, 10, 2);
  drum(batch, m.vat, x, y + 0.9, z, r, r, h, 10, 2.4);
  drum(batch, m.ironIn, x, y + 0.9 + h, z, r + 0.35, r + 0.2, 0.8, 10, 2);
  for (const k of [0.33, 0.66]) drum(batch, m.ironIn, x, y + 0.9 + h * k, z, r + 0.08, r + 0.08, 0.2, 10, 1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const px = x + Math.cos(a) * (r + 0.15);
    const pz = z + Math.sin(a) * (r + 0.15);
    cube(batch, m.ironIn, 0.18, h + 0.9, 0.18, xf(px, y + 0.9 + h / 2, pz), 2);
  }
  batch.beam(m.copperIn, new THREE.Vector3(x, y + h + 1.7, z), new THREE.Vector3(x, 17.5, z), 0.4);
}

/** A bench of glassware: flasks and retorts of glowing stuff over a coal burner. */
function bench(batch: Batch, m: MadMats, x: number, z: number, yaw: number, seed: number): void {
  const y = FLOOR;
  const top = xf(x, y + 1.1, z, yaw);
  cube(batch, m.timberIn, 4, 0.2, 1.6, top, 2);
  for (const [dx, dz] of [
    [-1.8, -0.6],
    [1.8, -0.6],
    [-1.8, 0.6],
    [1.8, 0.6],
  ]) {
    cube(batch, m.timberIn, 0.18, 1.1, 0.18, top.clone().multiply(xf(dx, -0.55, dz)), 2);
  }
  for (let k = 0; k < 4; k++) {
    const dx = -1.4 + k * 0.95;
    const s = 0.35 + hash2(seed, k, 3) * 0.3;
    const place = top.clone().multiply(xf(dx, 0.1 + s, 0));
    const tint: RGB = k % 2 ? [1, 1, 1] : [0.8, 1.4, 0.7];
    batch.geometry(m.flask, ball(s, 1, 1.15, 1, 6), place, tint);
    batch.geometry(m.flask, new THREE.CylinderGeometry(s * 0.25, s * 0.3, s * 1.4, 5), place.clone().multiply(xf(0, s * 1.4, 0)), tint);
  }
  const burner = top.clone().multiply(xf(0.5, -0.65, 0));
  batch.geometry(m.coal, new THREE.CylinderGeometry(0.4, 0.5, 0.3, 6), burner);
}

/** A wall of dials, lamps and knife switches, with a Jacob's ladder on top. Returns the ladder's two wire feet. */
function console(batch: Batch, m: MadMats, x: number, z: number, yaw: number, w: number): [THREE.Vector3, THREE.Vector3] {
  const y = FLOOR;
  const base = xf(x, y, z, yaw);
  cube(batch, m.ironIn, w, 3.2, 1.4, base.clone().multiply(xf(0, 1.6, 0)), 2);
  cube(batch, m.ironIn, w, 1.2, 0.6, base.clone().multiply(xf(0, 3.8, -0.4)), 2);
  for (let k = 0; k < Math.floor(w / 2.4); k++) {
    const dx = -w / 2 + 1.2 + k * 2.4;
    batch.geometry(m.panel, new THREE.PlaneGeometry(2.1, 2.1), base.clone().multiply(xf(dx, 2.0, 0.72)));
    cube(batch, m.brassIn, 0.12, 0.9, 0.12, base.clone().multiply(xf(dx + 0.6, 0.9, 0.85, 0, 0.5)), 1);
  }
  const l = base.clone().multiply(xf(-0.6, 4.4, -0.4));
  const r = base.clone().multiply(xf(0.6, 4.4, -0.4));
  const a = new THREE.Vector3().setFromMatrixPosition(l);
  const b = new THREE.Vector3().setFromMatrixPosition(r);
  for (const [p, lean] of [
    [a, -1],
    [b, 1],
  ] as const) {
    const tip = p.clone().add(new THREE.Vector3(Math.cos(yaw) * lean * 0.9, 3, -Math.sin(yaw) * lean * 0.9));
    batch.beam(m.copperIn, p, tip, 0.1);
    cube(batch, m.stoneIn, 0.4, 0.4, 0.4, xf(p.x, p.y, p.z, yaw), 1);
  }
  return [a, b];
}

/** A cage lamp hung from the trusses on a chain. */
function lamp(batch: Batch, m: MadMats, fx: Fx, x: number, z: number, y: number): void {
  batch.beam(m.ironIn, new THREE.Vector3(x, y + 0.5, z), new THREE.Vector3(x, 17.4, z), 0.08);
  batch.geometry(m.window, new THREE.CylinderGeometry(0.35, 0.5, 0.9, 6), xf(x, y, z));
  batch.geometry(m.ironIn, new THREE.ConeGeometry(0.9, 0.6, 6), xf(x, y + 0.7, z));
  fx.light(new THREE.Vector3(x, y - 0.6, z), LAMP, 20, 6, 0.12);
}

export interface Lab {
  update(time: number, storm: { flash: number; onCoil: boolean }): void;
}

/**
 * The great laboratory: the creature on its slab between two giant coils, a row of bubbling vats, consoles with
 * Jacob's ladders, glassware benches, a dynamo with a spinning flywheel, and the film crew's camera in the corner.
 */
export function laboratory(track: Track, batch: Batch, m: MadMats, fx: Fx, group: THREE.Group, sparks: Sparks): Lab {
  const gap = gapper(track);

  // The slab and its dais, inside the bend by the door, under a hoist.
  const slab = { x: 37, z: -28 };
  drum(batch, m.stoneIn, slab.x, FLOOR - 0.2, slab.z, 7, 7.4, 0.6, 16, 4);
  drum(batch, m.stoneIn, slab.x, FLOOR + 0.4, slab.z, 5.4, 5.8, 0.6, 16, 4);
  const table = xf(slab.x, FLOOR + 2.4, slab.z, 0.5, 0.18);
  cube(batch, m.stoneIn, 2.8, 0.5, 6.4, table, 3);
  for (const [dx, dz] of [
    [-1.1, -2.6],
    [1.1, -2.6],
    [-1.1, 2.6],
    [1.1, 2.6],
  ]) {
    const leg = new THREE.Vector3().setFromMatrixPosition(table.clone().multiply(xf(dx, 0, dz)));
    batch.beam(m.ironIn, leg, new THREE.Vector3(leg.x, FLOOR + 1, leg.z), 0.25);
    batch.beam(m.ironIn, leg, new THREE.Vector3(slab.x + dx * 0.6, 17.4, slab.z + dz * 0.4), 0.1);
  }
  // The creature under its sheet: only the great boots and the flat-topped, bolted head show.
  const body = table.clone().multiply(xf(0, 0.55, 0.3));
  batch.geometry(m.sheetIn, ball(1, 1.15, 0.45, 2.6, 8), body);
  batch.geometry(m.sheetIn, ball(0.7, 1, 0.5, 1, 6), body.clone().multiply(xf(0, 0.2, -1.6)));
  const head = body.clone().multiply(xf(0, 0.3, -3.1));
  cube(batch, m.skin, 0.95, 0.8, 1.15, head, 1);
  cube(batch, m.iron, 1.0, 0.25, 1.2, head.clone().multiply(xf(0, 0.45, 0)), 1);
  for (const side of [-1, 1]) {
    batch.geometry(m.brassIn, new THREE.CylinderGeometry(0.12, 0.12, 0.5, 6), head.clone().multiply(xf(side * 0.6, -0.25, 0.1, 0, 0, Math.PI / 2)));
    cube(batch, m.timberIn, 0.45, 0.8, 0.9, body.clone().multiply(xf(side * 0.42, 0.2, 2.9)), 1);
  }
  const coils = [coil(batch, m, slab.x - 7.5, FLOOR + 0.4, slab.z - 2, 7.5, 0.9), coil(batch, m, slab.x + 7.5, FLOOR + 0.4, slab.z + 2, 7.5, 0.9)];
  const heart = new THREE.Vector3().setFromMatrixPosition(body);
  fx.light(new THREE.Vector3(slab.x, FLOOR + 6, slab.z), BLUE, 22, 9, 0.35);

  // The vats along the north wall, and on the south side beyond the slab.
  for (let x = LAB.x0 + 8; x < LAB.x1 - 4; x += 7) {
    for (const z of [LAB.z0 + 4, LAB.z1 - 3.5]) {
      const r = 1.5 + hash2(x, z, 5) * 0.5;
      if (gap(x, z) < r + 1.5 || Math.hypot(x - slab.x, z - slab.z) < 12) continue;
      vat(batch, m, x, z, r, 4.5 + hash2(x, z, 9) * 2.5);
      if (Math.round(x) % 2 === 0) fx.light(new THREE.Vector3(x, FLOOR + 3.5, z + (z < -40 ? 3 : -3)), GOO, 13, 3, 0.25);
    }
  }

  // Consoles and benches in the open floor south of the hall's road, facing it.
  const ladders: [THREE.Vector3, THREE.Vector3][] = [];
  for (let x = -40; x < 22; x += 12) {
    const z = -21;
    if (gap(x, z) > 2.5) ladders.push(console(batch, m, x, z, 0, 7));
    if (gap(x + 6, -26) > 2) bench(batch, m, x + 6, -25.5, 0, x);
  }
  for (let x = -38; x < 24; x += 15) if (gap(x, -50) > 2) bench(batch, m, x, -50, Math.PI, x + 3);

  // The dynamo at the far east end: a brick bed, a copper armature and a flywheel that spins up with the coils.
  const dyn = { x: 78, z: -48 };
  cube(batch, m.stoneIn, 6, 1.4, 10, xf(dyn.x, FLOOR + 0.7, dyn.z), 3);
  drum(batch, m.copperIn, dyn.x, FLOOR + 1.4, dyn.z + 2.5, 1.8, 1.8, 2.4, 10, 1.2);
  for (const dz of [-1.5, 1.5]) cube(batch, m.ironIn, 0.6, 5, 0.6, xf(dyn.x, FLOOR + 3.4, dyn.z + dz - 2), 2);
  const wheel = new THREE.Group();
  const wb = new Batch();
  const rim = new THREE.TorusGeometry(3.2, 0.35, 5, 18);
  wb.geometry(m.ironIn, rim);
  for (let k = 0; k < 6; k++) wb.geometry(m.ironIn, new THREE.BoxGeometry(0.25, 6.2, 0.25), xf(0, 0, 0, 0, 0, (k / 6) * Math.PI));
  wb.geometry(m.brassIn, new THREE.CylinderGeometry(0.6, 0.6, 1, 8), xf(0, 0, 0, 0, Math.PI / 2));
  for (const mesh of wb.meshes()) wheel.add(mesh);
  rim.dispose();
  wheel.position.set(dyn.x, FLOOR + 4.4, dyn.z - 2);
  wheel.rotation.y = Math.PI / 2;
  const spin = new THREE.Group();
  spin.add(wheel);
  group.add(spin);
  const feed = [new THREE.Vector3(dyn.x, FLOOR + 3.6, dyn.z + 2.5), new THREE.Vector3(dyn.x, 15, dyn.z + 2.5), new THREE.Vector3(slab.x + 7.5, 15, slab.z + 2), new THREE.Vector3(slab.x + 7.5, FLOOR + 8.4, slab.z + 2)];
  for (let i = 0; i < feed.length - 1; i++) batch.beam(m.copperIn, feed[i], feed[i + 1], 0.35);

  // The film crew's camera and a studio lamp, set up to catch the creature waking.
  const cam = { x: 52, z: -16.5 };
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    batch.beam(m.timberIn, new THREE.Vector3(cam.x + Math.cos(a) * 1.1, FLOOR, cam.z + Math.sin(a) * 1.1), new THREE.Vector3(cam.x, FLOOR + 2.6, cam.z), 0.12);
  }
  const body3 = xf(cam.x, FLOOR + 3.1, cam.z, Math.atan2(cam.x - slab.x, cam.z - slab.z));
  cube(batch, m.ironIn, 0.9, 1, 1.6, body3, 1);
  for (const dz of [-0.2, 0.8]) batch.geometry(m.ironIn, new THREE.CylinderGeometry(0.7, 0.7, 0.2, 10), body3.clone().multiply(xf(0, 1.1, dz, 0, 0, Math.PI / 2)));
  batch.geometry(m.ironIn, new THREE.CylinderGeometry(0.3, 0.35, 0.8, 8), body3.clone().multiply(xf(0, 0, -1.1, 0, Math.PI / 2)));

  // Hanging lamps over the road through the hall.
  each(track, 22, (p) => p.zone === 'lab', (p, _t, _s, k) => {
    const side = k % 2 ? 1 : -1;
    const at = frame(p, side * (limitOf(p) + 1.5), 0);
    lamp(batch, m, fx, at.x, at.z, 9.5);
  }, 6);

  return {
    update(time, storm) {
      const tick = Math.floor(time * 16);
      const wild = storm.onCoil ? 1 : 0;
      spin.children[0].rotation.x = time * (2 + wild * 8);
      // The coils arc to each other over the slab, and to the creature when the storm feeds them.
      const pulse = (Math.sin(time * 1.7) + 1) / 2;
      if (pulse > 0.35 || wild) sparks.fork(coils[0], coils[1], 0.5, 2.2, 9, BLUE, 101, tick, 2);
      for (const [i, c] of coils.entries()) {
        if (wild || (tick + i * 3) % 7 < 2) sparks.fork(c, heart, 0.35, 1.2, 6, BLUE, 103 + i, tick, 1);
      }
      // Jacob's ladders: an arc climbing the V of wires, breaking at the top and starting again.
      for (const [i, [a, b]] of ladders.entries()) {
        const t = (time * 0.7 + i * 0.37) % 1;
        const l = a.clone().lerp(new THREE.Vector3(a.x, a.y + 3, a.z), t);
        const r = b.clone().lerp(new THREE.Vector3(b.x, b.y + 3, b.z), t);
        const out = new THREE.Vector3().subVectors(a, b).normalize().multiplyScalar(t * 0.9);
        sparks.arc(l.add(out), r.sub(out), 0.22, 0.3 + t * 0.4, 4, LADDER, 120 + i, tick);
      }
    },
  };
}
