import * as THREE from 'three';
import { limitOf, type Track } from '../../../shared/track';
import { xf, type Batch, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { frame, headingAt } from '../../render/road';
import { CEILING, COVERED } from './edges';
import type { Fx, Sparks } from './fx';
import { cube, each } from './kit';
import type { MadMats } from './materials';
import { sconce } from './tower';

const BLUE: RGB = [0.55, 0.75, 1.2];

/** Out from the road's centre line towards one side, flat. */
function across(p: { tx: number; tz: number }, side: number): THREE.Vector3 {
  return new THREE.Vector3(-p.tz * side, 0, p.tx * side);
}

/**
 * The dungeon, gatehouse and battlements: fire baskets on the walls, cell doors and hanging chains below, a pair of
 * electrodes arcing across the vault, and braziers along the rampart walk.
 */
export function halls(track: Track, batch: Batch, mats: Materials, m: MadMats, fx: Fx): { update(time: number, sparks: Sparks): void } {
  const vault = (p: { zone: string; y: number }) => p.zone === 'dungeon' && p.y <= COVERED;
  const pairs: [THREE.Vector3, THREE.Vector3][] = [];

  each(track, 13, (p, route) => route === 1 && vault(p), (p, _t, _s, k) => {
    const yaw = headingAt(p);
    const L = limitOf(p);
    const side = k % 2 ? 1 : -1;
    const wallAt = frame(p, side * (L + 0.05), 3.4);
    sconce(batch, mats, m, fx, wallAt, yaw, across(p, -side), 14);
    // A cell door in the other wall: a black recess behind iron bars.
    const door = frame(p, -side * (L - 0.03), 0);
    const turn = yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    cube(batch, m.ironIn, 3.2, 0.3, 0.3, xf(door.x, door.y + 3.6, door.z, yaw), 1);
    batch.geometry(m.ironIn, new THREE.PlaneGeometry(2.8, 3.4), xf(door.x, door.y + 1.7, door.z, turn), [0.05, 0.05, 0.06]);
    for (let i = 0; i < 6; i++) {
      const bar = frame(p, -side * (L - 0.15), 0);
      const off = new THREE.Vector3(p.tx, 0, p.tz).multiplyScalar(-1.25 + i * 0.5);
      cube(batch, m.ironIn, 0.1, 3.5, 0.1, xf(bar.x + off.x, bar.y + 1.75, bar.z + off.z), 1);
    }
    // Chains from the vault, swinging free.
    for (const o of [-2.5, 2.5]) {
      const top = frame(p, o + side, CEILING - p.y - 0.3);
      batch.beam(m.ironIn, top, top.clone().setY(top.y - 2.2 - (k % 3)), 0.09);
    }
    if (k % 3 === 1) pairs.push([frame(p, -L, 5.2), frame(p, L, 5.2)]);
  }, 5);
  for (const [a, b] of pairs) {
    for (const end of [a, b]) {
      cube(batch, m.ironIn, 0.5, 0.5, 0.5, xf(end.x, end.y, end.z), 1);
      batch.geometry(m.orb, new THREE.IcosahedronGeometry(0.35, 0), xf(end.x, end.y, end.z));
    }
  }

  // The gatehouse passage: a fire basket each side.
  each(track, 14, (p, route) => route === 0 && p.zone === 'gate', (p) => {
    for (const side of [-1, 1]) sconce(batch, mats, m, fx, frame(p, side * (limitOf(p) + 0.1), 3.4), headingAt(p), across(p, -side), 16);
  }, 4);

  // Braziers on the battlements, every few merlons, alternating sides.
  each(track, 24, (p, route) => route === 0 && p.zone === 'rampart', (p, _t, _s, k) => {
    const side = k % 2 ? 1 : -1;
    const at = frame(p, side * (limitOf(p) + 0.4), 1.1);
    batch.geometry(m.iron, new THREE.CylinderGeometry(0.5, 0.3, 0.6, 6), xf(at.x, at.y + 0.3, at.z));
    batch.geometry(m.coal, new THREE.CylinderGeometry(0.42, 0.42, 0.05, 6), xf(at.x, at.y + 0.58, at.z));
    for (const turn of [0, Math.PI / 2]) batch.geometry(mats.flame, new THREE.PlaneGeometry(0.9, 1.3), xf(at.x, at.y + 1.15, at.z, headingAt(p) + turn));
    fx.flames.push(at.clone().setY(at.y + 1.3));
    fx.light(at.clone().setY(at.y + 1.6).add(across(p, -side).multiplyScalar(1.5)), [1.0, 0.5, 0.2], 18, 7, 0.22);
  }, 8);

  return {
    update(time, sparks) {
      const tick = Math.floor(time * 14);
      pairs.forEach(([a, b], i) => {
        if ((tick + i * 5) % 9 < 5) sparks.arc(a, b, 0.3, 1.2, 8, BLUE, 300 + i, tick);
      });
    },
  };
}
