import * as THREE from 'three';
import { limitOf, type Sample, type Track } from '../../../shared/track';
import { boulder, xf, type Batch } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import { allSamples } from '../../render/trackindex';
import type { Fx } from './fx';
import { cube, drum } from './kit';
import type { MadMats } from './materials';
import { FLOOR, GATE, KEEP, TOWER, YARD } from './plan';

/** A gas lamp on an iron post, lit. */
function lampPost(batch: Batch, mats: Materials, m: MadMats, fx: Fx, x: number, z: number): void {
  cube(batch, m.iron, 0.2, 4, 0.2, xf(x, FLOOR + 2, z), 1);
  cube(batch, m.iron, 0.5, 0.3, 0.5, xf(x, FLOOR + 0.15, z), 1);
  cube(batch, mats.lantern, 0.55, 0.8, 0.55, xf(x, FLOOR + 4.4, z), 1);
  batch.geometry(m.iron, new THREE.ConeGeometry(0.5, 0.4, 4), xf(x, FLOOR + 5, z, Math.PI / 4));
  fx.light(new THREE.Vector3(x, FLOOR + 4.2, z), [1.0, 0.75, 0.42], 18, 4, 0.08);
}

/** The body-snatchers' cart: a two-wheeled cart with a coffin roped on. */
function cart(batch: Batch, m: MadMats, x: number, z: number, yaw: number): void {
  const base = xf(x, FLOOR, z, yaw);
  cube(batch, m.timber, 2.4, 0.3, 3.6, base.clone().multiply(xf(0, 1.1, 0, 0, 0.08)), 2);
  for (const side of [-1, 1]) {
    const wheel = new THREE.CylinderGeometry(0.95, 0.95, 0.2, 10);
    wheel.rotateZ(Math.PI / 2);
    batch.geometry(m.timber, wheel, base.clone().multiply(xf(side * 1.35, 0.95, 0.3)));
    wheel.dispose();
    cube(batch, m.timber, 0.15, 0.15, 2.6, base.clone().multiply(xf(side * 0.8, 0.6, -2.6, 0, -0.3)), 1);
  }
  cube(batch, m.timber, 1.0, 0.7, 2.6, base.clone().multiply(xf(0, 1.65, 0.1, 0, 0.08)), 1, [0.6, 0.45, 0.4]);
  cube(batch, m.timber, 1.1, 0.12, 2.7, base.clone().multiply(xf(0, 2.05, 0.12, 0, 0.08)), 1, [0.5, 0.38, 0.32]);
}

/**
 * The castle yard: lamps round the dungeon's trapdoor and along the roads, the body-snatchers' cart, crates, barrels
 * and rubble, and a studio light on a scaffold aimed at the laboratory door.
 */
export function courtyard(track: Track, batch: Batch, mats: Materials, m: MadMats, fx: Fx): void {
  const all = allSamples(track);
  const gap = (x: number, z: number) => {
    let best = Infinity;
    for (const p of all as Sample[]) best = Math.min(best, Math.hypot(p.x - x, p.z - z) - limitOf(p) - (p.y > FLOOR + 3 ? 1.5 : 0));
    return best;
  };
  const inYard = (x: number, z: number) =>
    x > YARD.x0 + 3 && x < YARD.x1 - 3 && z > YARD.z0 + 3 && z < YARD.z1 - 3 && Math.hypot(x - TOWER.x, z - TOWER.z) > KEEP.outer + 3 && !(Math.abs(x - GATE.x) < 18 && z > GATE.z0 - 2);

  // Lamps where the roads part at the trapdoor, and along the yard's edges.
  for (const [x, z] of [
    [-31, 78],
    [-9, 84],
    [-34, 60],
    [-6, 50],
    [30, 30],
    [48, 6],
    [74, -6],
    [56, -14],
  ]) {
    if (gap(x, z) > 0.8 && inYard(x, z)) lampPost(batch, mats, m, fx, x, z);
  }

  // Clutter: crates, barrels and rubble, wherever the floor is free.
  let placed = 0;
  for (let i = 0; i < 400 && placed < 46; i++) {
    const x = YARD.x0 + hash2(i, 1, 71) * (YARD.x1 - YARD.x0);
    const z = YARD.z0 + hash2(i, 2, 71) * (YARD.z1 - YARD.z0);
    if (!inYard(x, z) || gap(x, z) < 2.5) continue;
    placed++;
    const kind = hash2(i, 3, 71);
    const yaw = hash2(i, 4, 71) * Math.PI;
    if (kind < 0.4) {
      const s = 1 + hash2(i, 5, 71) * 0.6;
      cube(batch, mats.crate, s, s, s, xf(x, FLOOR + s / 2, z, yaw), s);
      if (kind < 0.15) cube(batch, mats.crate, s * 0.8, s * 0.8, s * 0.8, xf(x + 0.1, FLOOR + s * 1.4, z, yaw + 0.5), s);
    } else if (kind < 0.7) {
      drum(batch, mats.barrel, x, FLOOR, z, 0.55, 0.55, 1.3, 8, 1.3);
    } else if (kind < 0.85) {
      batch.geometry(m.stone, boulder(i, 1.8, 0.6), xf(x, FLOOR + 0.3, z, yaw));
    } else if (gap(x, z) > 4.5) {
      cart(batch, m, x, z, yaw);
    }
  }

  // The studio light: a scaffold tower with a big lamp turned on the laboratory door.
  const rig = { x: 30, z: 6 };
  if (gap(rig.x, rig.z) > 3) {
    for (const [dx, dz] of [
      [-1.2, -1.2],
      [1.2, -1.2],
      [-1.2, 1.2],
      [1.2, 1.2],
    ]) {
      cube(batch, m.iron, 0.16, 9, 0.16, xf(rig.x + dx, FLOOR + 4.5, rig.z + dz), 1);
    }
    for (let y = 1.5; y < 9; y += 2.5) {
      cube(batch, m.iron, 2.6, 0.12, 0.12, xf(rig.x, FLOOR + y, rig.z - 1.2), 1);
      cube(batch, m.iron, 2.6, 0.12, 0.12, xf(rig.x, FLOOR + y, rig.z + 1.2), 1);
      cube(batch, m.iron, 0.12, 0.12, 2.6, xf(rig.x - 1.2, FLOOR + y, rig.z), 1);
      cube(batch, m.iron, 0.12, 0.12, 2.6, xf(rig.x + 1.2, FLOOR + y, rig.z), 1);
    }
    cube(batch, m.timber, 3, 0.2, 3, xf(rig.x, FLOOR + 9, rig.z), 1);
    const aim = Math.atan2(-(64 - rig.x), -(-18 - rig.z));
    const head = xf(rig.x, FLOOR + 10.3, rig.z, aim, -0.35);
    batch.geometry(m.iron, new THREE.CylinderGeometry(1.0, 0.8, 1.8, 10).rotateX(Math.PI / 2), head);
    batch.geometry(mats.lens, new THREE.CircleGeometry(0.9, 10), head.clone().multiply(xf(0, 0, -0.92, Math.PI)));
    fx.light(new THREE.Vector3(rig.x + (64 - rig.x) * 0.5, FLOOR + 5, rig.z + (-18 - rig.z) * 0.5), [0.95, 0.95, 1.0], 22);
  }
}
