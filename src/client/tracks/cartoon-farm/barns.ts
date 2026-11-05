import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Track } from '../../../shared/track';
import { xf } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { addPointLight, type PointLight } from '../../render/ps1';
import { headingAt } from '../../render/road';
import { C, rgb, type Looks } from './look';
import type { Toon } from './toon';

/** Ground level round the barns, where the farm is flattened for them. */
const FLOOR = 1.4;

export interface Lamp {
  light: PointLight;
  base: THREE.Color;
  seed: number;
}

/**
 * A wall in the gambrel barn's outline, 0.35 thick from z = 0, with a door: a notch from the ground when it starts at
 * the floor, or a hole higher up.
 */
function gable(W: number, H: number, door: [number, number, number, number]): THREE.ExtrudeGeometry {
  const [u0, v0, u1, v1] = door;
  const s = new THREE.Shape();
  s.moveTo(-W / 2, 0);
  if (v0 <= 0) {
    s.lineTo(u0, 0);
    s.lineTo(u0, v1);
    s.lineTo(u1, v1);
    s.lineTo(u1, 0);
  }
  s.lineTo(W / 2, 0);
  s.lineTo(W / 2, H);
  s.lineTo(W * 0.31, H + 4.4);
  s.lineTo(0, H + 6.2);
  s.lineTo(-W * 0.31, H + 4.4);
  s.lineTo(-W / 2, H);
  s.closePath();
  if (v0 > 0) {
    const h = new THREE.Path();
    h.moveTo(u0, v0);
    h.lineTo(u0, v1);
    h.lineTo(u1, v1);
    h.lineTo(u1, v0);
    h.closePath();
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false });
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  return g;
}

/**
 * The rickety barns on the shortcut: in at the big doors, up a dark ramp past the hay and out of the hayloft door.
 * Built in each barn's own frame: x to the right of the road, y up from the floor, -z forward.
 */
export function barns(track: Track, toon: Toon, L: Looks): Lamp[] {
  const lamps: Lamp[] = [];
  const fork = track.routes[0]?.track;
  if (!fork) return lamps;
  zoneRanges(fork, 'barn').forEach(([a, b], n) => {
    const door = sampleAt(fork, a);
    const loft = sampleAt(fork, b);
    const lim = limitOf(door);
    const len = b - a;
    const yaw = headingAt(door);
    const lean = n === 1 ? 0.045 : -0.02;
    const M = xf(door.x, FLOOR, door.z, yaw, 0, lean);
    const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => M.clone().multiply(xf(x, y, z, ry, rx, rz));
    const W = 2 * (lim + 2.4);
    const H = 10;
    const doorTop = 7.4;
    const loftY = loft.y - FLOOR;
    const T = 0.1;
    const white = rgb(C.white);

    // Walls: red boards outside, dark bare wood inside.
    const front = gable(W, H, [-(lim + 0.3), 0, lim + 0.3, doorTop]);
    const back = gable(W, H, [-(lim + 0.3), loftY - 0.4, lim + 0.3, loftY + 5.2]);
    toon.shape(L.barn, front, at(0, 0, 0), [1, 1, 1], T);
    toon.batch.geometry(L.barnIn, front, at(0, 0, -0.36));
    toon.shape(L.barn, back, at(0, 0, -len - 0.35), [1, 1, 1], T);
    toon.batch.geometry(L.barnIn, back, at(0, 0, -len + 0.01));
    for (const side of [-1, 1]) {
      toon.box(L.barn, 0.35, H, len, at(side * (W / 2 + 0.175), H / 2, -len / 2), [1, 1, 1], T);
      toon.batch.box(L.barnIn, 0.2, H, len, at(side * (W / 2 - 0.1), H / 2, -len / 2));
      // A gambrel roof: a steep lower pitch and a shallow upper one, with a dark underside.
      const eave = new THREE.Vector2(side * (W / 2 + 0.9), H - 0.5);
      const knee = new THREE.Vector2(side * W * 0.31, H + 4.4);
      const ridge = new THREE.Vector2(0, H + 6.2);
      for (const [p, q] of [
        side > 0 ? [knee, eave] : [eave, knee],
        side > 0 ? [ridge, knee] : [knee, ridge],
      ]) {
        const mid = p.clone().add(q).multiplyScalar(0.5);
        const d = q.clone().sub(p);
        const ang = Math.atan2(d.y, d.x);
        const m = at(mid.x, mid.y + 0.3, -len / 2, 0, 0, ang);
        toon.box(L.shingles, d.length() + 0.5, 0.4, len + 2, m, [1, 1, 1], T);
        toon.batch.box(L.barnIn, d.length(), 0.1, len, m.clone().multiply(xf(0, -0.28, 0)));
      }
      // White corner boards and the trim along the roofline.
      for (const z of [0.2, -len - 0.2]) {
        toon.box(L.flat, 0.5, H, 0.5, at(side * (W / 2 + 0.2), H / 2, z), white, 0.06);
        toon.beam(L.flat, new THREE.Vector3(side * (W / 2 + 0.9), H - 0.3, z).applyMatrix4(M), new THREE.Vector3(side * W * 0.31, H + 4.6, z).applyMatrix4(M), 0.5, 0.4, white);
        toon.beam(L.flat, new THREE.Vector3(side * W * 0.31, H + 4.6, z).applyMatrix4(M), new THREE.Vector3(0, H + 6.5, z).applyMatrix4(M), 0.5, 0.4, white);
      }
      // The big doors, swung wide open, with the white X.
      const dw = lim + 0.3;
      const leaf = at(side * (dw + 0.25), doorTop / 2 - 0.5, dw / 2 + 0.2, -side * Math.PI * 0.42);
      toon.box(L.barn, dw, doorTop - 0.6, 0.25, leaf, [1, 1, 1], T);
      for (const [x0, y0, x1, y1] of [
        [-dw / 2, -doorTop / 2 + 0.6, dw / 2, doorTop / 2 - 0.9],
        [-dw / 2, doorTop / 2 - 0.9, dw / 2, -doorTop / 2 + 0.6],
      ]) {
        toon.beam(L.flat, new THREE.Vector3(x0, y0, 0.18).applyMatrix4(leaf), new THREE.Vector3(x1, y1, 0.18).applyMatrix4(leaf), 0.35, 0.12, white, 0.04);
      }
      toon.box(L.flat, dw + 0.2, 0.35, 0.3, leaf.clone().multiply(xf(0, doorTop / 2 - 0.45, 0.05)), white, 0.04);
      toon.box(L.flat, dw + 0.2, 0.35, 0.3, leaf.clone().multiply(xf(0, -doorTop / 2 + 0.45, 0.05)), white, 0.04);
      // Hay bales stacked inside along the walls, and a couple outside by the door.
      for (let k = 0; k < Math.floor(len / 2.6); k++) {
        const z = -1.8 - k * 2.6;
        const rows = 1 + Math.floor(hash2(k, side, n + 3) * 3);
        for (let r = 0; r < rows; r++) {
          toon.box(L.hayIn, 1.6, 1.1, 2.3, at(side * (W / 2 - 1.0), 0.55 + r * 1.1, z, hash2(k, r, side) * 0.2 - 0.1), [1, 1, 1], 0.05);
        }
      }
      for (let r = 0; r < 2; r++) {
        toon.box(L.hay, 2.3, 1.1, 1.6, at(side * (W / 2 + 2.2), 0.55 + r * 1.1, 2.4 - r * 0.3, 0.2 * side), [1, 1, 1], 0.06);
      }
      // A high window in each side wall, with sunlight slanting in through it.
      const wz = -len * (0.35 + 0.3 * (side > 0 ? 1 : 0));
      toon.box(L.flat, 0.5, 2.0, 2.6, at(side * (W / 2 + 0.25), H - 2.5, wz), rgb(C.white), 0.06);
      toon.batch.box(L.flat, 0.55, 1.5, 2.1, at(side * (W / 2 + 0.25), H - 2.5, wz), [0.25, 0.2, 0.18]);
      const shaft = new THREE.PlaneGeometry(2.2, 11);
      toon.batch.geometry(L.shaft, shaft, at(side * (W / 2 - 3.4), H - 7.2, wz, Math.PI / 2, 0, side * 0.55), [0.8, 0.75, 0.55]);
    }
    // The hayloft door at the back: a door leaf hanging open and a hoist beam with a bale on a rope.
    toon.box(L.flat, 2 * (lim + 0.3) + 0.6, 0.45, 0.5, at(0, loftY + 5.4, -len - 0.2), white, 0.05);
    for (const side of [-1, 1]) toon.box(L.flat, 0.45, 5.8, 0.5, at(side * (lim + 0.55), loftY + 2.5, -len - 0.2), white, 0.05);
    toon.box(L.barn, lim + 0.3, 5.0, 0.22, at(lim + 0.3 + (lim + 0.3) / 2, loftY + 2.4, -len - 0.7, 0.25), [1, 1, 1], T);
    const beamEnd = new THREE.Vector3(0, H + 4.0, -len - 4.5).applyMatrix4(M);
    toon.beam(L.wood, new THREE.Vector3(0, H + 4.0, -len + 1).applyMatrix4(M), beamEnd, 0.5, 0.5);
    toon.ball(L.flat, 0.4, xf(beamEnd.x, beamEnd.y - 0.5, beamEnd.z), rgb(C.dark), 0.05);
    toon.beam(L.flat, beamEnd.clone().setY(beamEnd.y - 0.8), beamEnd.clone().setY(beamEnd.y - 3.4), 0.06, 0.06, [0.85, 0.75, 0.5], 0);

    // The barn floor beside the ramp, and lanterns over the road, the only light inside.
    toon.batch.geometry(L.boardsIn, new THREE.PlaneGeometry(W, len, 4, 6), at(0, 0.05, -len / 2, 0, -Math.PI / 2));
    for (const f of [0.3, 0.75]) {
      const s = a + len * f;
      const p = sampleAt(fork, s);
      const y = p.y + 4.6;
      const lamp = new THREE.Vector3(p.x, y, p.z);
      toon.box(L.glow, 0.5, 0.7, 0.5, xf(lamp.x, lamp.y, lamp.z, yaw), [1, 0.8, 0.4], 0.06);
      toon.box(L.flat, 0.7, 0.15, 0.7, xf(lamp.x, lamp.y + 0.42, lamp.z, yaw), rgb(C.dark), 0.04);
      toon.batch.beam(L.flatIn, lamp.clone().setY(lamp.y + 0.5), new THREE.Vector3(0, H + 5.6, 0).applyMatrix4(M).setX(lamp.x).setZ(lamp.z), 0.06, 0.06, [0.4, 0.4, 0.4]);
      const base = new THREE.Color(1.0, 0.72, 0.38).multiplyScalar(1.6);
      lamps.push({ light: addPointLight(lamp.clone().setY(y - 0.6), base.clone(), 17), base, seed: n * 10 + f * 7 });
    }
  });
  return lamps;
}
