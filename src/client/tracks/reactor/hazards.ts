import * as THREE from 'three';
import { routeTrack } from '../../../shared/course';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { limitOf, sampleAt, type Track } from '../../../shared/track';
import { ball, Batch, xf, type RGB } from '../../render/geometry';
import { dynamicLight } from '../../render/ps1';
import { frame, headingAt, loft } from '../../render/road';
import type { Quads, Rig } from './fx';
import { column } from './kit';
import type { ReactorMats } from './materials';

const DARK: RGB = [0.3, 0.32, 0.36];
const ORANGE: RGB = [1, 0.5, 0.12];
const UP = new THREE.Vector3(0, 1, 0);
const UPPER = 9.5;
const FORE = 9.5;

export interface HazardFx {
  update(clock: number, time: number, sparks: Quads): void;
}

/** A segment along +y from 0 to `len`, for rig parts that are placed by start and direction. */
function limb(w: number, d: number, len: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, len, d).translate(0, len / 2, 0);
}

function along(from: THREE.Vector3, to: THREE.Vector3, spin = 0): THREE.Matrix4 {
  const dir = to.clone().sub(from).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  return new THREE.Matrix4().compose(from, q, new THREE.Vector3(1, 1, 1));
}

/**
 * The welding robot on the ring: a big orange arm on a pedestal outside the rail, whose welding head sweeps across the
 * road. The head is where the hazard is, so what you see is what hits.
 */
export function robotArm(track: Track, h: Hazard, batch: Batch, m: ReactorMats, armRig: Rig, neonRig: Rig): HazardFx {
  const route = routeTrack(track, h.route);
  const p = sampleAt(route, h.s);
  const yawRoad = headingAt(p);
  const base = frame(p, limitOf(p) + 3.6, 0);
  base.y = p.y;
  // Pedestal platform and its column down to the floor, with stripes.
  batch.box(m.paintIn, 5, 0.6, 5, xf(base.x, base.y - 0.3, base.z, yawRoad), DARK);
  column(batch, m.paintIn, base.x, base.z, 0, base.y - 0.6, 1.4, yawRoad, DARK);
  batch.geometry(m.stripesIn, new THREE.CylinderGeometry(2.1, 2.3, 1.2, 10), xf(base.x, base.y + 0.6, base.z));
  // A striped band across the road under the sweep, so it reads as a danger zone.
  loft(batch, route, h.s - 2.2, h.s + 2.2, {
    spacing: 1.1,
    vScale: 2,
    outward: true,
    material: () => m.stripesIn,
    profile: (q) => [-1, 0, 1].map((f) => [f * (q.width / 2), 0.03, f * 3]),
  });

  const turret = armRig.add(new THREE.CylinderGeometry(1.6, 1.8, 2.4, 10).translate(0, 1.2, 0), undefined, ORANGE);
  const upper = armRig.addGroup([
    [limb(1.1, 1.3, UPPER), undefined, ORANGE],
    [new THREE.CylinderGeometry(1, 1, 1.8, 8), new THREE.Matrix4().makeRotationZ(Math.PI / 2), [0.25, 0.25, 0.27]],
  ]);
  const fore = armRig.addGroup([
    [limb(0.8, 0.9, FORE - 1.4), undefined, ORANGE],
    [new THREE.CylinderGeometry(0.8, 0.8, 1.4, 8), new THREE.Matrix4().makeRotationZ(Math.PI / 2), [0.25, 0.25, 0.27]],
    [new THREE.CylinderGeometry(0.5, 0.25, 1.4, 6).translate(0, FORE - 0.7, 0), undefined, [0.25, 0.25, 0.27]],
  ]);
  const glow = neonRig.add(ball(0.6, 1, 1, 1, 6), undefined, [1, 0.85, 0.5]);
  const shoulder = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const target = new THREE.Vector3();
  const flash = new THREE.Color(1, 0.6, 0.25);

  return {
    update(clock, time, sparks) {
      const at = hazardAt(track, h, clock);
      target.set(at.x, at.y + 1.3, at.z);
      const yaw = Math.atan2(target.x - base.x, target.z - base.z);
      armRig.set(turret, new THREE.Matrix4().compose(base, new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1)));
      shoulder.copy(base).setY(base.y + 3.4);
      const d = Math.min(target.distanceTo(shoulder), UPPER + FORE - 0.01);
      const dir = target.clone().sub(shoulder).normalize();
      const lift = UP.clone().addScaledVector(dir, -UP.dot(dir)).normalize();
      const reach = (d * d + UPPER * UPPER - FORE * FORE) / (2 * d);
      elbow.copy(shoulder).addScaledVector(dir, reach).addScaledVector(lift, Math.sqrt(Math.max(0, UPPER * UPPER - reach * reach)));
      armRig.set(upper, along(shoulder, elbow));
      armRig.set(fore, along(elbow, target));
      neonRig.set(glow, new THREE.Matrix4().setPosition(target.x, target.y - 0.9, target.z));
      for (let i = 0; i < 10; i++) {
        const k = (time * 3 + i / 10) % 1;
        const a = i * 2.4 + Math.floor(time * 3) * 1.3;
        sparks.puff(target.x + Math.cos(a) * k * 2.2, target.y - 0.9 + k * 1.6 - k * k * 3.4, target.z + Math.sin(a) * k * 2.2, 0.14, [1, 0.7 - k * 0.4, 0.3], 1);
      }
      dynamicLight(target.x, target.y - 0.6, target.z, flash, 1.3 + 0.5 * Math.sin(time * 40), 12);
    },
  };
}

/**
 * The plasma vent in the coil: a nozzle on the inner rail that blasts a column of plasma across the inner half of the
 * road for part of each cycle. It sputters and glows for two seconds first.
 */
export function plasmaVent(track: Track, h: Hazard, batch: Batch, m: ReactorMats): HazardFx {
  const route = routeTrack(track, h.route);
  const p = sampleAt(route, h.s);
  const yaw = headingAt(p);
  const nozzle = frame(p, -limitOf(p) - 0.6, 1.2);
  batch.box(m.paintOut, 2.4, 3.2, 4.5, xf(nozzle.x, nozzle.y, nozzle.z, yaw), DARK);
  batch.box(m.stripesOut, 2.6, 0.6, 4.7, xf(nozzle.x, nozzle.y + 1.9, nozzle.z, yaw));
  const mouth = frame(p, -limitOf(p) + 0.7, 1.1);
  batch.geometry(m.neon, new THREE.CylinderGeometry(1.1, 1.1, 0.3, 10), xf(mouth.x, mouth.y, mouth.z, yaw, 0, Math.PI / 2), [1, 0.35, 0.9]);
  loft(batch, route, h.s - h.radius, h.s + h.radius, {
    spacing: 1,
    vScale: 2,
    outward: true,
    material: () => m.stripesOut,
    profile: (q) => [
      [-q.width / 2, 0.03, 0],
      [h.offset + h.radius, 0.03, 2],
    ],
  });
  const pink = new THREE.Color(1, 0.3, 0.9);
  const warn = 2 / h.period;

  return {
    update(clock, time, sparks) {
      const at = hazardAt(track, h, clock);
      if (at.live) {
        const fade = Math.min(1, at.t / 0.03, (h.duty - at.t) / 0.03);
        for (let i = 0; i < 56; i++) {
          const k = (time * 2.2 + i / 56) % 1;
          const a = i * 2.39996 + time * 3;
          const r = h.radius * (0.25 + 0.75 * ((i * 7) % 10) / 10) * (0.5 + k * 0.5);
          const c: RGB = i % 4 ? [0.8 - k * 0.4, 0.15, 0.7 - k * 0.2] : [0.9, 0.6, 0.9];
          sparks.puff(at.x + Math.cos(a) * r, at.y + 0.3 + k * h.height * 1.3, at.z + Math.sin(a) * r, (0.3 + (1 - k) * 0.45) * fade, c, 1);
        }
        for (let i = 0; i < 8; i++) {
          const k = (time * 4 + i / 8) % 1;
          sparks.puff(mouth.x + (at.x - mouth.x) * k, mouth.y + Math.sin(k * Math.PI) * 1.2, mouth.z + (at.z - mouth.z) * k, 0.5, [0.9, 0.4, 0.9], 1);
        }
        dynamicLight(at.x, at.y + 2, at.z, pink, 2.4 * fade, 22);
      } else if (at.t > 1 - warn) {
        const k = (at.t - (1 - warn)) / warn;
        for (let i = 0; i < 6; i++) {
          const f = (time * 5 + i / 6) % 1;
          sparks.puff(mouth.x + (at.x - mouth.x) * f * 0.4, mouth.y - f * f * 1.1, mouth.z + (at.z - mouth.z) * f * 0.4, 0.2 + k * 0.4, [1, 0.4, 0.9], 1);
        }
        dynamicLight(mouth.x, mouth.y, mouth.z, pink, k * (0.6 + 0.4 * Math.sin(time * 30)), 12);
      }
    },
  };
}
