import * as THREE from 'three';
import { routeTrack } from '../../../shared/course';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { limitOf, sampleAt, type Track } from '../../../shared/track';
import { Batch, xf } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { dynamicLight } from '../../render/ps1';
import { box, frame, headingAt } from '../../render/road';
import { heights } from './base';
import type { MoonMats } from './materials';

export interface Rig {
  flames: THREE.Vector3[];
  update(clock: number, time: number): void;
}

const LASER = new THREE.Color(1, 0.18, 0.1);
const BLAST = new THREE.Color(1, 0.62, 0.25);
const AWAY = -9999;

/** Merges a little batch of parts into one moving group. */
function rigOf(build: (b: Batch) => void): THREE.Group {
  const b = new Batch();
  build(b);
  const g = new THREE.Group();
  for (const m of b.meshes()) g.add(m);
  return g;
}

/** The mining laser: a carriage riding the gantry across the hall, its beam cutting a glowing line in the floor. */
export function laserRig(track: Track, h: Hazard, batch: Batch, mats: Materials, mm: MoonMats, group: THREE.Group): Rig {
  const t = routeTrack(track, h.route);
  const p = sampleAt(t, h.s);
  const yaw = headingAt(p);
  const { wall } = heights(t, h.s);
  const L = limitOf(p);
  const rail = wall + 1.0;
  const bridge = frame(p, 0, rail + 0.3);
  box(batch, mm.stripesIn, L * 2 + 1.5, 1.0, 1.6, xf(bridge.x, bridge.y, bridge.z, yaw));
  for (const side of [-1, 1]) {
    const end = frame(p, side * (L + 0.2), rail - 0.4);
    box(batch, mats.metalIndoor, 1.2, 2.2, 2.4, xf(end.x, end.y, end.z, yaw));
  }
  // The floor scorched where the beam sweeps.
  const scorch = frame(p, 0, 0.03);
  batch.geometry(mm.ceiling, new THREE.PlaneGeometry((h.reach + h.radius) * 2, 1.4), xf(scorch.x, scorch.y, scorch.z, yaw, -Math.PI / 2), [0.5, 0.42, 0.4]);

  const carriage = rigOf((b) => {
    b.geometry(mats.metalIndoor, new THREE.BoxGeometry(2.6, 1.4, 2.4), xf(0, 0, 0), [1.2, 1.1, 0.6]);
    b.geometry(mats.metalIndoor, new THREE.CylinderGeometry(0.45, 0.7, 1.8, 8), xf(0, -1.6, 0));
    b.geometry(mm.lamp, new THREE.CylinderGeometry(0.32, 0.32, 0.3, 8), xf(0, -2.55, 0));
    for (const side of [-1, 1]) b.geometry(mm.beacon, new THREE.BoxGeometry(0.3, 0.3, 0.3), xf(side * 1.1, 0.85, 0));
  });
  carriage.rotation.y = yaw;
  const beamH = rail - 2.7;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, beamH, 0.22), mm.laser);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.8, beamH, 0.8), mm.laser);
  glow.scale.set(1, 1, 1);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(1.5, 12), mm.laser);
  for (const m of [beam, glow]) m.rotation.y = yaw;
  spot.rotation.set(-Math.PI / 2, 0, 0);
  group.add(carriage, beam, glow, spot);
  const flames = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  return {
    flames,
    update(clock, time) {
      const at = hazardAt(track, h, clock);
      const q = sampleAt(t, at.s);
      const top = frame(q, at.offset, rail - 0.2);
      carriage.position.copy(top);
      beam.position.set(at.x, at.y + beamH / 2, at.z);
      glow.position.copy(beam.position);
      const pulse = 0.85 + 0.3 * Math.sin(time * 37) * Math.sin(time * 23);
      glow.scale.set(pulse, 1, pulse);
      spot.position.set(at.x, at.y + 0.06, at.z);
      spot.scale.setScalar(0.8 + 0.25 * pulse);
      flames.forEach((f, i) => f.set(at.x + Math.cos(i * 2.1 + time * 9) * 0.6, at.y + 0.5, at.z + Math.sin(i * 2.1 + time * 9) * 0.6));
      dynamicLight(at.x, at.y + 0.8, at.z, LASER, 2.2 * pulse, 11, -4);
    },
  };
}

/** The lander, standing over the shortcut on four legs. Its descent engine fires straight down between them. */
export function landerRig(track: Track, h: Hazard, batch: Batch, mats: Materials, mm: MoonMats, group: THREE.Group): Rig {
  const t = routeTrack(track, h.route);
  const p = sampleAt(t, h.s);
  const yaw = headingAt(p);
  const base = frame(p, 0, 0);
  const m = xf(base.x, p.y, base.z, yaw);
  const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const deck = 10.5;
  // Descent stage: a gold octagon on four splayed legs with round pads, ladder on the front leg.
  batch.geometry(mm.gold, new THREE.CylinderGeometry(7.2, 7.2, 4.6, 8), m.clone().multiply(xf(0, deck + 2.3, 0, Math.PI / 8)));
  batch.geometry(mats.metal, new THREE.CylinderGeometry(7.4, 7.4, 0.3, 8), m.clone().multiply(xf(0, deck, 0, Math.PI / 8)));
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const hip = local(x * 4.6, deck + 1, z * 4.6);
    const knee = local(x * 9.5, deck - 2.5, z * 9.5);
    const foot = local(x * 11.2, 0.4, z * 11.2);
    batch.beam(mm.frame, hip, knee, 0.6);
    batch.beam(mm.frame, knee, foot, 0.5);
    batch.beam(mm.frame, local(x * 5.8, deck - 0.2, z * 3), knee, 0.3);
    batch.beam(mm.frame, local(x * 3, deck - 0.2, z * 5.8), knee, 0.3);
    batch.geometry(mm.hull, new THREE.CylinderGeometry(1.6, 1.9, 0.5, 10), xf(foot.x, foot.y - 0.2, foot.z), [0.85, 0.85, 0.82]);
  }
  for (let y = 1.5; y < deck - 2; y += 1.2) {
    const k = y / (deck - 2.5);
    const a = local(-11.2 + 1.7 * k - 0.6, y, -11.2 + 1.7 * k + 0.6);
    const b = local(-11.2 + 1.7 * k + 0.6, y, -11.2 + 1.7 * k - 0.6);
    batch.beam(mats.metal, a, b, 0.1);
  }
  // Engine bell under the middle.
  batch.geometry(mats.metal, new THREE.CylinderGeometry(1.0, 2.3, 2.6, 12, 1, true), m.clone().multiply(xf(0, deck - 1.3, 0)), [0.7, 0.66, 0.6]);
  batch.geometry(mats.metal, new THREE.CylinderGeometry(2.25, 1.0, 2.5, 12, 1, true), m.clone().multiply(xf(0, deck - 1.3, 0)), [0.35, 0.3, 0.28]);
  // Ascent stage: an angular white cabin with dark windows, antennas and a dish.
  batch.geometry(mm.hull, new THREE.CylinderGeometry(4.4, 5.2, 4.2, 6), m.clone().multiply(xf(0, deck + 6.7, 0.4)), [0.92, 0.92, 0.9]);
  batch.geometry(mm.hull, new THREE.BoxGeometry(4.2, 2.6, 2.4), m.clone().multiply(xf(0, deck + 6.4, -4.4)), [0.86, 0.86, 0.84]);
  for (const side of [-1, 1]) {
    batch.geometry(mm.glass, new THREE.PlaneGeometry(1.4, 1.2), m.clone().multiply(xf(side * 1.1, deck + 6.8, -5.62, Math.PI, 0.25)), [0.4, 0.5, 0.6]);
  }
  batch.beam(mats.metal, local(2.4, deck + 8.8, 1), local(3.4, deck + 13.5, 2), 0.14);
  batch.beam(mats.metal, local(-2.6, deck + 8.8, 0.5), local(-3.2, deck + 12, -0.6), 0.1);
  {
    const pts = Array.from({ length: 5 }, (_, k) => new THREE.Vector2((1.8 * k) / 4, ((k / 4) ** 2 * 1.8) / 2.4));
    const dm = m.clone().multiply(xf(-3.2, deck + 12, -0.6, 0.8, -0.6));
    batch.geometry(mm.hull, new THREE.LatheGeometry(pts, 10), dm);
    batch.geometry(mm.hull, new THREE.LatheGeometry(pts.map((v) => new THREE.Vector2(v.x, v.y - 0.1)).reverse(), 10), dm, [0.75, 0.75, 0.75]);
  }
  // Warning lamps round the descent stage, which blink faster as the engine gets ready to fire.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const at = local(Math.cos(a) * 7.3, deck + 0.4, Math.sin(a) * 7.3);
    batch.geometry(mm.warn, new THREE.BoxGeometry(0.6, 0.5, 0.6), xf(at.x, at.y, at.z, a));
  }

  const nozzle = local(0, deck - 2.6, 0);
  const ground = p.y + 0.4;
  const length = nozzle.y - ground;
  const plume = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 3.8, length, 12, 1, true), mm.exhaust);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, length, 10, 1, true), mm.exhaust);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, 4.2, 16), mm.exhaust);
  const warm = new THREE.Mesh(new THREE.CircleGeometry(1.9, 12), mm.exhaust);
  for (const mesh of [plume, core]) mesh.position.set(nozzle.x, (nozzle.y + ground) / 2, nozzle.z);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(nozzle.x, ground + 0.15, nozzle.z);
  warm.rotation.x = Math.PI / 2;
  warm.position.set(nozzle.x, nozzle.y + 0.5, nozzle.z);
  group.add(plume, core, ring, warm);
  const flames = Array.from({ length: 4 }, () => new THREE.Vector3(0, AWAY, 0));

  return {
    flames,
    update(clock, time) {
      const at = hazardAt(track, h, clock);
      const firing = at.live;
      // The last fifth of each cycle is the warm-up: the bell glows and the lamps race.
      const warmup = Math.max(0, (at.t - 0.8) / 0.2);
      const flicker = 0.85 + 0.3 * Math.sin(time * 53) * Math.sin(time * 31);
      plume.visible = ring.visible = firing;
      core.visible = firing || warmup > 0;
      warm.visible = firing || warmup > 0;
      warm.scale.setScalar(firing ? 1 : 0.3 + warmup * 0.7);
      if (firing) {
        const spread = Math.min(1, at.t / (h.duty * 0.25));
        plume.scale.set(flicker, spread, flicker);
        core.scale.set(flicker * 0.9, spread, flicker * 0.9);
        plume.position.y = nozzle.y - (length * spread) / 2;
        core.position.y = plume.position.y;
        ring.scale.setScalar(0.6 + (at.t / h.duty) * 1.2);
        dynamicLight(nozzle.x, ground + 2, nozzle.z, BLAST, 3.2 * flicker, 22, -6);
        flames.forEach((f, i) => f.set(nozzle.x + Math.cos(i * 1.6 + time * 5) * 3, ground + 0.6, nozzle.z + Math.sin(i * 1.6 + time * 5) * 3));
      } else {
        if (warmup > 0) {
          // A jet licks out of the bell as a warning. It stops well above the cars, so nothing unseen can hit them.
          const reach = 0.12 + warmup * 0.22;
          core.scale.set(flicker * 0.5, reach, flicker * 0.5);
          core.position.y = nozzle.y - (length * reach) / 2;
          dynamicLight(nozzle.x, nozzle.y - 1, nozzle.z, BLAST, warmup * 2 * flicker, 14, -2);
        }
        for (const f of flames) f.y = AWAY;
      }
      const rate = firing || warmup > 0 ? 9 : 1.6;
      const on = Math.sin(time * Math.PI * 2 * rate) > 0;
      mm.warn.uniforms.uTint.value.setScalar(on ? 1.2 : 0.25);
    },
  };
}
