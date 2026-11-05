import * as THREE from 'three';
import { routeTrack } from '../../../shared/course';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { limitOf, sampleAt, type Track } from '../../../shared/track';
import { Batch, ball, xf, type RGB } from '../../render/geometry';
import { dynamicLight } from '../../render/ps1';
import { frame, headingAt } from '../../render/road';
import type { Sparks } from './fx';
import { cube, drum } from './kit';
import type { MadMats } from './materials';

const ZAP = new THREE.Color(0.55, 0.75, 1.0);
const BLUE: RGB = [0.7, 0.85, 1.3];

export interface Rig {
  update(clock: number, time: number): void;
}

/** Merges a few parts into one moving group. */
function rigOf(build: (b: Batch) => void): THREE.Group {
  const b = new Batch();
  build(b);
  const g = new THREE.Group();
  for (const m of b.meshes()) g.add(m);
  return g;
}

/**
 * The great pendulum: a charged brass electrode on a long iron rod, swung across the laboratory from a geared pivot
 * in the roof trusses. It crackles to the floor as it passes, and lights the road under it.
 */
export function pendulum(track: Track, h: Hazard, batch: Batch, m: MadMats, group: THREE.Group, sparks: Sparks): Rig {
  const t = routeTrack(track, h.route);
  const p = sampleAt(t, h.s);
  const yaw = headingAt(p);
  const L = limitOf(p);
  const pivot = frame(p, h.offset, 15.5);
  const rod = pivot.y - (p.y + h.radius + 0.15);

  // The pivot's housing on a girder across the hall, with its gear wheels.
  const girder = frame(p, 0, 15.9);
  cube(batch, m.ironIn, (L + 10) * 2, 0.9, 1.2, xf(girder.x, girder.y, girder.z, yaw), 2);
  for (const side of [-1, 1]) {
    const leg = frame(p, side * (L + 9.5), 0);
    cube(batch, m.ironIn, 1, 16, 1, xf(leg.x, leg.y + 7.9, leg.z, yaw), 2);
  }
  cube(batch, m.ironIn, 2.4, 2, 2.4, xf(pivot.x, pivot.y + 0.4, pivot.z, yaw), 2);
  for (const side of [-1, 1]) {
    const wheel = new THREE.CylinderGeometry(1.6, 1.6, 0.3, 12);
    wheel.rotateZ(Math.PI / 2);
    const w = frame(p, h.offset + side * 1.4, 15.9);
    batch.geometry(m.brass, wheel, xf(w.x, w.y, w.z, yaw));
    wheel.dispose();
  }
  const lamp = frame(p, h.offset, 14.6);
  batch.geometry(m.lamp, new THREE.BoxGeometry(1.2, 0.5, 0.5), xf(lamp.x, lamp.y, lamp.z, yaw));

  const arm = rigOf((b) => {
    b.geometry(m.iron, new THREE.BoxGeometry(0.35, rod, 0.35), xf(0, -rod / 2, 0));
    b.geometry(m.brass, new THREE.CylinderGeometry(0.5, 0.5, 0.8, 8), xf(0, -rod + h.radius + 0.6, 0));
    for (const y of [-rod * 0.33, -rod * 0.66]) b.geometry(m.brass, new THREE.BoxGeometry(0.6, 0.3, 0.6), xf(0, y, 0));
    b.geometry(m.brass, ball(h.radius * 0.98, 1, 1, 1, 10), xf(0, -rod, 0));
    const band = new THREE.TorusGeometry(h.radius, 0.12, 4, 14);
    b.geometry(m.orb, band, xf(0, -rod, 0, 0, Math.PI / 2));
    b.geometry(m.orb, band, xf(0, -rod, 0));
  });
  const core = new THREE.Mesh(ball(h.radius * 0.55, 1, 1, 1, 8), m.orb);
  core.position.y = -rod;
  arm.add(core);
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  const roll = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  arm.position.copy(pivot);
  group.add(arm);
  const bob = new THREE.Vector3();
  const ground = new THREE.Vector3();

  return {
    update(clock, time) {
      const at = hazardAt(track, h, clock);
      const swing = Math.asin(Math.max(-1, Math.min(1, (at.offset - h.offset) / rod)));
      roll.setFromAxisAngle(zAxis, swing);
      arm.quaternion.copy(turn).multiply(roll);
      bob.set(0, -rod, 0).applyQuaternion(arm.quaternion).add(pivot);
      ground.set(at.x, at.y + 0.05, at.z);
      const tick = Math.floor(time * 18);
      const low = Math.cos(swing);
      sparks.arc(bob, ground, 0.35, 0.8, 5, [BLUE[0] * low, BLUE[1] * low, BLUE[2] * low], 3, tick);
      for (let k = 0; k < 3; k++) {
        const a = time * 7 + k * 2.1;
        const tip = bob.clone().add(new THREE.Vector3(Math.cos(a) * 2.4, Math.sin(a * 1.3) * 1.2, Math.sin(a) * 2.4));
        sparks.arc(bob, tip, 0.2, 0.5, 3, BLUE, 7 + k, tick);
      }
      dynamicLight(bob.x, bob.y + 0.5, bob.z, ZAP, 1.6, 16);
    },
  };
}

/**
 * The dungeon's great coil, hung upside down from the vault over the left of the road. It charges, crackling louder
 * round its toroid, then discharges into the copper floor plate under it for the live part of each cycle.
 */
export function teslaTrap(track: Track, h: Hazard, batch: Batch, m: MadMats, sparks: Sparks, ceiling: number): Rig {
  const t = routeTrack(track, h.route);
  const p = sampleAt(t, h.s);
  const yaw = headingAt(p);
  const spot = frame(p, h.offset, 0);
  const roof = ceiling - 0.4;
  const toroidY = spot.y + 5.2;

  // The coil: a copper winding hanging from an iron yoke, its toroid underneath.
  drum(batch, m.ironIn, spot.x, roof - 0.8, spot.z, 2.4, 2.4, 0.8, 10, 2);
  drum(batch, m.copper, spot.x, toroidY + 0.6, spot.z, 0.9, 0.9, roof - toroidY - 1.4, 10, 1.2);
  for (let y = toroidY + 1.2; y < roof - 1; y += 0.7) drum(batch, m.ironIn, spot.x, y, spot.z, 1.05, 1.05, 0.12, 10, 1);
  const torus = new THREE.TorusGeometry(1.6, 0.45, 6, 14);
  torus.rotateX(Math.PI / 2);
  batch.geometry(m.orbCoil, torus, xf(spot.x, toroidY, spot.z));
  torus.dispose();
  // The floor plate: exactly the reach of the discharge, a copper grid in an iron ring.
  const plate = new THREE.CylinderGeometry(h.radius, h.radius, 0.08, 16);
  batch.geometry(m.copper, plate, xf(spot.x, spot.y + 0.04, spot.z));
  plate.dispose();
  const ring = new THREE.TorusGeometry(h.radius, 0.14, 4, 20);
  ring.rotateX(Math.PI / 2);
  batch.geometry(m.ironIn, ring, xf(spot.x, spot.y + 0.08, spot.z));
  ring.dispose();
  for (let k = -2; k <= 2; k++) {
    const a = frame(p, h.offset + k * 1.1, 0.1);
    cube(batch, m.ironIn, 0.12, 0.06, Math.sqrt(Math.max(0, h.radius ** 2 - (k * 1.1) ** 2)) * 2, xf(a.x, a.y, a.z, yaw), 2);
  }

  const top = new THREE.Vector3(spot.x, toroidY, spot.z);
  return {
    update(clock, time) {
      const at = hazardAt(track, h, clock);
      const tick = Math.floor(time * 20);
      if (at.live) {
        const f = 0.75 + 0.25 * Math.sin(time * 60);
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + tick * 0.9;
          const r = h.radius * (0.2 + 0.75 * ((k * 0.37 + tick * 0.13) % 1));
          const hit = new THREE.Vector3(at.x + Math.cos(a) * r, at.y + 0.1, at.z + Math.sin(a) * r);
          sparks.fork(top, hit, k ? 0.35 : 0.6, 1.4, 7, [BLUE[0] * f, BLUE[1] * f, BLUE[2] * f], 20 + k, tick, k ? 1 : 3);
        }
        dynamicLight(at.x, at.y + 2.5, at.z, ZAP, 3.2, 20);
        m.orbCoil.uniforms.uGlow.value = 1.4;
      } else {
        // Charging: the crackle round the toroid grows towards the next discharge.
        const charge = (at.t - h.duty) / (1 - h.duty);
        const n = 1 + Math.floor(charge * 5);
        for (let k = 0; k < n; k++) {
          const a = time * 5 + k * 1.3;
          const from = top.clone().add(new THREE.Vector3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6));
          const to = from.clone().add(new THREE.Vector3(Math.cos(a + 1) * 1.4, -0.6 - charge, Math.sin(a + 1) * 1.4));
          sparks.arc(from, to, 0.18, 0.4, 3, BLUE, 40 + k, tick);
        }
        dynamicLight(top.x, top.y, top.z, ZAP, 0.4 + charge * 1.2, 10 + charge * 6);
        m.orbCoil.uniforms.uGlow.value = 0.2 + charge * 0.8;
      }
    },
  };
}
