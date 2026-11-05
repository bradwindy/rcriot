import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Track } from '../../../shared/track';
import { SILO } from '../../../shared/tracks/reactor';
import { ball, Batch, xf, type RGB } from '../../render/geometry';
import { addPointLight } from '../../render/ps1';
import { frame, headingAt, loft } from '../../render/road';
import type { Rig } from './fx';
import { SHAFT } from './ground';
import type { Pulse } from './hall';
import { column, overRoad, pipe, railing } from './kit';
import type { ReactorMats } from './materials';

const DARK: RGB = [0.3, 0.32, 0.36];
const PINK: RGB = [1, 0.3, 0.85];
const CYAN: RGB = [0.35, 1, 0.95];
const SPIRE = 7;
const TOP = 52;

export interface Spire {
  orbit: number[];
}

/** The plasma spire and the accelerator coil that winds up round it: hoops, arms, columns, rails and undersides. */
export function buildSilo(track: Track, batch: Batch, m: ReactorMats, neonRig: Rig, pulses: Pulse[]): Spire {
  const { x, z } = SILO;
  // The spire: a dark column banded with neon, rising out of a glowing shaft.
  batch.geometry(m.paintOut, new THREE.CylinderGeometry(SPIRE, SPIRE, TOP + 14, 12, 1, true), xf(x, (TOP - 14) / 2, z), DARK);
  for (let y = -10; y < TOP; y += 4) {
    batch.geometry(m.neon, new THREE.CylinderGeometry(SPIRE + 0.25, SPIRE + 0.25, 0.6, 12, 1, true), xf(x, y, z), y % 8 === 0 ? PINK : CYAN);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    column(batch, m.paintOut, x + Math.cos(a) * (SPIRE + 0.6), z + Math.sin(a) * (SPIRE + 0.6), -14, TOP, 0.9, -a, DARK);
  }
  batch.geometry(m.paintOut, new THREE.CylinderGeometry(4, SPIRE + 1, 4, 12), xf(x, TOP + 2, z), DARK);
  batch.geometry(m.core, ball(4.5, 1, 1, 1, 10), xf(x, TOP + 8, z), [1, 0.7, 1]);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const foot = new THREE.Vector3(x + Math.cos(a) * 4.5, TOP + 3, z + Math.sin(a) * 4.5);
    const tip = new THREE.Vector3(x + Math.cos(a) * 7.5, TOP + 14, z + Math.sin(a) * 7.5);
    batch.beam(m.paintOut, foot, tip, 0.6, 0.6, DARK);
    batch.geometry(m.neon, ball(0.8, 1, 1, 1, 6), xf(tip.x, tip.y + 0.4, tip.z), PINK);
  }
  // The shaft: a glowing well under the spire.
  batch.geometry(m.shine, new THREE.CylinderGeometry(SHAFT, SHAFT, 13, 12, 1, true), xf(x, -7.5, z), [0.5, 0.15, 0.45]);
  batch.geometry(m.stripesOut, new THREE.CylinderGeometry(SHAFT + 1.2, SHAFT + 1.2, 0.5, 16), xf(x, 0, z));
  for (const [y, range, c] of [
    [-4, 26, new THREE.Color(1.4, 0.4, 1.3)],
    [TOP + 8, 40, new THREE.Color(1.3, 0.5, 1.5)],
  ] as const) {
    pulses.push({ light: addPointLight(new THREE.Vector3(x, y, z), c, range), base: c.clone(), speed: 3, phase: y, depth: 0.4 });
  }
  const orbit = [0, 1].map((i) => neonRig.add(new THREE.TorusGeometry(9 + i * 3, 0.35, 4, 24), new THREE.Matrix4().makeRotationX(Math.PI / 2), i ? CYAN : PINK));

  for (const zone of ['ramp', 'tube', 'gantry']) {
    for (const [a, b] of zoneRanges(track, zone)) {
      underside(batch, m, track, a, b);
      for (const side of [-1, 1]) railing(batch, m.paintOut, track, a + 1, b, side, [0.9, 0.75, 0.2], () => false, 2.5);
      for (let s = a + 3, k = 0; s < b; s += 8, k++) {
        const p = sampleAt(track, s);
        const h = headingAt(p);
        const limit = limitOf(p);
        const mid = frame(p, 0, -1);
        batch.box(m.paintOut, limit * 2 + 0.6, 0.6, 0.7, xf(mid.x, mid.y, mid.z, h, 0, p.bank), DARK);
        const r = Math.hypot(p.x - x, p.z - z);
        const coil = zone !== 'ramp' && r < 60;
        if (coil) {
          // A cantilever arm from the spire, and a strut under it.
          const inner = frame(p, -limit, -1);
          const root = new THREE.Vector3(x + ((p.x - x) / r) * (SPIRE + 0.5), inner.y - 1, z + ((p.z - z) / r) * (SPIRE + 0.5));
          batch.beam(m.paintOut, root, inner, 0.9, 1.2, DARK);
          batch.beam(m.paintOut, root.clone().setY(root.y - 9), frame(p, -limit + 3, -1), 0.6, 0.6, DARK);
          if (k % 2 === 0) pipe(batch, m.pulse, root.clone().setY(root.y + 0.9), inner.clone().setY(inner.y + 0.9), 0.25, 6, 6, PINK);
        }
        for (const side of [-1, 1]) {
          const foot = frame(p, side * (limit - 0.3), -1);
          if (foot.y < 2.5 || overRoad(track, foot.x, foot.z, foot.y - 1, 0.6)) continue;
          if (coil && side < 0) continue;
          column(batch, m.paintOut, foot.x, foot.z, -0.5, foot.y, 0.8, h, DARK);
        }
      }
    }
  }

  // The accelerator hoops over the coil, alternating pink and cyan, with a light in every fourth.
  for (const [a, b] of zoneRanges(track, 'tube')) {
    for (let s = a + 2, k = 0; s < b; s += 7, k++) {
      const p = sampleAt(track, s);
      const limit = limitOf(p) + 0.4;
      const pts: THREE.Vector3[] = [];
      const lit: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const ang = Math.PI * (i / 8);
        pts.push(frame(p, Math.cos(ang) * limit, Math.sin(ang) * 6.8));
        lit.push(frame(p, Math.cos(ang) * (limit - 0.45), Math.sin(ang) * 6.8 - 0.45));
      }
      const color = k % 2 ? CYAN : PINK;
      for (let i = 0; i < 8; i++) {
        batch.beam(m.paintOut, pts[i], pts[i + 1], 0.7, 0.9, DARK);
        if (i > 0 && i < 7) batch.beam(m.neon, lit[i], lit[i + 1], 0.25, 0.25, color);
      }
      if (k % 4 === 1) {
        const c = k % 8 === 1 ? new THREE.Color(1.3, 0.35, 1.1) : new THREE.Color(0.4, 1.2, 1.3);
        pulses.push({ light: addPointLight(frame(p, 0, 5), c, 22), base: c, speed: 0, phase: 0, depth: 0 });
      }
    }
  }

  // Lamps on the open gantry.
  for (const [a, b] of zoneRanges(track, 'gantry')) {
    for (let s = a + 10, k = 0; s < b - 10; s += 26, k++) {
      const p = sampleAt(track, s);
      const side = k % 2 ? 1 : -1;
      const pole = frame(p, side * (limitOf(p) + 0.3), 0);
      batch.box(m.paintOut, 0.3, 5, 0.3, xf(pole.x, pole.y + 2.5, pole.z), DARK);
      batch.box(m.neon, 0.7, 0.7, 0.7, xf(pole.x, pole.y + 5.3, pole.z), [1, 0.55, 0.15]);
      const c = new THREE.Color(1.3, 0.75, 0.3);
      pulses.push({ light: addPointLight(pole.clone().setY(pole.y + 4), c, 20), base: c, speed: 0, phase: 0, depth: 0 });
    }
  }
  return { orbit };
}

/** The flat underside of a deck, so a road above shows solid from below. */
function underside(batch: Batch, m: ReactorMats, track: Track, a: number, b: number): void {
  loft(batch, track, a, b, {
    spacing: 2,
    vScale: 6,
    outward: true,
    material: () => m.gratingOut,
    profile: (p) => [
      [limitOf(p), -0.7],
      [-limitOf(p), -0.7],
    ],
  });
}

export function placeOrbit(neonRig: Rig, spire: Spire, time: number): void {
  spire.orbit.forEach((part, i) => {
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35 * Math.sin(time * 0.7 + i * 2), time * (i ? -0.9 : 1.2), 0.3 * Math.cos(time * 0.5 + i)));
    neonRig.set(part, new THREE.Matrix4().compose(new THREE.Vector3(SILO.x, TOP + 8 + Math.sin(time * 1.3 + i) * 1.2, SILO.z), tilt, new THREE.Vector3(1, 1, 1)));
  });
}
