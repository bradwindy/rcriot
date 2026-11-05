import * as THREE from 'three';
import type { Track } from '../../../shared/track';
import { xf, type Batch, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { dynamicLight } from '../../render/ps1';
import type { Fx, Sparks } from './fx';
import { cube, each } from './kit';
import type { MadMats } from './materials';
import { KEEP, TOWER } from './plan';

const BLUE: RGB = [0.6, 0.8, 1.3];
const FIRE: RGB = [1.0, 0.5, 0.2];
const COIL = new THREE.Color(0.45, 0.65, 1.0);

/** An iron fire basket on a bracket, with its flame and a flickering light. */
export function sconce(batch: Batch, mats: Materials, m: MadMats, fx: Fx, at: THREE.Vector3, yaw: number, out: THREE.Vector3, range = 16): void {
  const cup = at.clone().addScaledVector(out, 0.7);
  batch.beam(m.iron, at, cup, 0.14);
  batch.geometry(m.iron, new THREE.CylinderGeometry(0.42, 0.22, 0.45, 6), xf(cup.x, cup.y, cup.z));
  batch.geometry(m.coal, new THREE.CylinderGeometry(0.36, 0.36, 0.05, 6), xf(cup.x, cup.y + 0.2, cup.z));
  for (const turn of [0, Math.PI / 2]) batch.geometry(mats.flame, new THREE.PlaneGeometry(0.7, 1.0), xf(cup.x, cup.y + 0.65, cup.z, yaw + turn));
  fx.flames.push(cup.clone().setY(cup.y + 0.8));
  fx.light(cup.clone().addScaledVector(out, 0.6).setY(cup.y + 1), FIRE, range, 7, 0.22);
}

/**
 * The tower's life: fire baskets along the wall all the way up, the great coil's hum and blue light, and arcs from
 * its top to the battlements, wild when the lightning strikes it.
 */
export function towerFx(track: Track, batch: Batch, mats: Materials, m: MadMats, fx: Fx, sparks: Sparks, coil: THREE.Vector3): { update(time: number, storm: { flash: number; onCoil: boolean }): void } {
  const { x: cx, z: cz } = TOWER;
  each(track, 16, (p, route) => route === 0 && p.zone === 'tower' && Math.hypot(p.x - cx, p.z - cz) < KEEP.inner, (p) => {
    const a = Math.atan2(p.z - cz, p.x - cx);
    const out = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
    const at = new THREE.Vector3(cx + Math.cos(a) * (KEEP.inner - 0.1), p.y + 3.2, cz + Math.sin(a) * (KEEP.inner - 0.1));
    cube(batch, m.stoneTower, 0.6, 0.6, 0.6, xf(at.x, at.y, at.z, Math.PI / 2 - a), 1);
    sconce(batch, mats, m, fx, at, Math.PI / 2 - a, out, 15);
  }, 6);
  const hum = fx.light(new THREE.Vector3(cx, 22, cz), [0.35, 0.5, 0.9], 30, 4, 0.3);
  const ends = Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2;
    return new THREE.Vector3(cx + Math.cos(a) * (KEEP.outer - 0.6), 37 + (k % 2), cz + Math.sin(a) * (KEEP.outer - 0.6));
  });
  return {
    update(time, storm) {
      const tick = Math.floor(time * 15);
      const wild = storm.onCoil ? storm.flash : 0;
      const n = wild > 0.1 ? 6 : 1 + (tick % 5 === 0 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const end = ends[(tick * 3 + k * 7) % ends.length];
        sparks.fork(coil, end, 0.6 + wild, 3, 8, BLUE, 200 + k, tick, 2);
      }
      if (wild > 0.1) dynamicLight(coil.x, coil.y, coil.z, COIL, 2.5 * wild, 60);
      hum.base.setRGB(0.35, 0.5, 0.9).multiplyScalar(1 + wild * 3);
    },
  };
}
