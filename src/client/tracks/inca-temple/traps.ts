import * as THREE from 'three';
import { routeTrack } from '../../../shared/course';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { limitOf, sampleAt, type Track } from '../../../shared/track';
import { Batch, faceted, xf } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { dynamicLight } from '../../render/ps1';
import { box, frame, headingAt } from '../../render/road';
import { flame, v3, type Fire } from './kit';
import type { IncaMats } from './palette';

export interface Trap {
  update(clock: number): void;
}

/** How high over the road the ball waits in the roof. */
export const BALL_DROP = 8.75;
/** The end of each cycle: the ball shows in the roof hole, then falls, landing as the roll goes live. */
const PEEK = 0.8;
const FALL = 0.92;
/** After the roll, it sinks into the slot at the foot of the ramp. */
const SINK = 0.06;
const DUST = new THREE.Color(1.0, 0.7, 0.35);

/** Merges a little batch of parts into one moving group. */
function rig(build: (b: Batch) => void): THREE.Group {
  const b = new Batch();
  build(b);
  const g = new THREE.Group();
  for (const m of b.meshes()) g.add(m);
  return g;
}

/** The stone ball: it peeks out of the roof, drops on to the ramp, rolls down it at the oncoming cars and sinks away. */
export function boulderTrap(track: Track, h: Hazard, inca: IncaMats, group: THREE.Group): Trap {
  const t = routeTrack(track, h.route);
  const r = h.radius;
  const ball = rig((b) => {
    b.geometry(inca.carvedIndoor, faceted(new THREE.IcosahedronGeometry(r, 1)), undefined, [1.9, 1.7, 1.4]);
    // A band of gold round its middle, so the roll shows.
    b.geometry(inca.gold, new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.5, 12, 1, true), xf(0, 0, 0, 0, 0, Math.PI / 2));
  });
  const spin = new THREE.Group();
  spin.add(ball);
  group.add(spin);
  const axis = new THREE.Vector3();
  const roll = Math.abs(h.reach);
  return {
    update(clock) {
      const at = hazardAt(track, h, clock);
      const p = sampleAt(t, at.s);
      const k = at.t;
      spin.visible = true;
      let lift = r;
      let turned = 0;
      if (at.live) {
        turned = (roll * (k / h.duty)) / r;
        dynamicLight(at.x, at.y + 1, at.z, DUST, 1.2, 9, -3);
      } else if (k < h.duty + SINK) {
        turned = roll / r;
        lift = r - ((k - h.duty) / SINK) * r * 2.2;
      } else if (k > PEEK) {
        const fall = k < FALL ? 0 : ((k - FALL) / (1 - FALL)) ** 2;
        const top = BALL_DROP + r * 0.8 - (k < FALL ? ((k - PEEK) / (FALL - PEEK)) * r * 0.9 : 0);
        lift = top + (r - top) * fall;
      } else {
        spin.visible = false;
      }
      const c = frame(p, at.offset, lift);
      spin.position.copy(c);
      // Rolling back down the road: it turns about the road's sideways axis.
      axis.set(-p.tz, 0, p.tx);
      spin.quaternion.setFromAxisAngle(axis, Math.sign(h.reach) * turned);
    },
  };
}

/**
 * A spiked log on two ropes, slung from the lintel of a stone gateway, swinging side to side across the trail. Drawn as a
 * pendulum whose sideways reach is the hazard's own offset, so what you see is what hits.
 */
export function logTrap(track: Track, h: Hazard, mats: Materials, inca: IncaMats, batch: Batch, group: THREE.Group, fires: Fire[]): Trap {
  const t = routeTrack(track, h.route);
  const p = sampleAt(t, h.s);
  const yaw = headingAt(p);
  const pivotH = 11;
  const hang = 1.1;
  const L = pivotH - hang;
  // The gateway: two carved posts with stepped tops, a heavy lintel and torches.
  const span = limitOf(p) + 1.4;
  for (const side of [-1, 1]) {
    const post = frame(p, side * span, 0);
    box(batch, inca.carved, 2.4, 13, 2.4, xf(post.x, post.y + 6, post.z, yaw));
    box(batch, inca.stone, 3, 0.8, 3, xf(post.x, post.y + 12.6, post.z, yaw));
    box(batch, inca.stone, 3.2, 1.2, 3.2, xf(post.x, post.y - 0.2, post.z, yaw));
    const torch = frame(p, side * (span - 1.5), 4.2);
    box(batch, mats.planks, 0.2, 1.1, 0.2, xf(torch.x, torch.y, torch.z, yaw, 0, side * 0.35));
    flame(batch, mats, frame(p, side * (span - 1.75), 4.75), 1, fires, 14, 1.3);
  }
  const top = frame(p, 0, pivotH + 0.9);
  box(batch, inca.carved, span * 2 + 3.2, 1.8, 2.6, xf(top.x, top.y, top.z, yaw));
  box(batch, inca.stone, span * 2 + 4, 0.7, 3, xf(top.x, top.y + 1.2, top.z, yaw));

  const arm = rig((b) => {
    const log = new THREE.CylinderGeometry(0.75, 0.75, 3.2, 7);
    log.rotateX(Math.PI / 2);
    b.geometry(mats.bark, log, xf(0, -L, 0), [0.8, 0.65, 0.5]);
    for (const end of [-1, 1]) b.geometry(mats.bark, new THREE.CircleGeometry(0.75, 7), xf(0, -L, end * 1.6, end > 0 ? 0 : Math.PI), [1.1, 0.95, 0.7]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 6) * Math.PI * 2;
      const z = k < 6 ? -0.8 : 0.8;
      const spike = new THREE.ConeGeometry(0.16, 0.9, 4);
      spike.translate(0, 0.75 + 0.4, 0);
      b.geometry(mats.metal, spike, xf(0, -L, z, 0, 0, a + (k < 6 ? 0 : 0.5)), [0.9, 0.85, 0.8]);
    }
    for (const z of [-1.2, 1.2]) b.beam(mats.rope, v3(0, 0, z), v3(0, -L + 0.6, z), 0.1);
  });
  const pivot = new THREE.Group();
  pivot.position.copy(frame(p, 0, pivotH));
  pivot.rotation.y = yaw;
  pivot.add(arm);
  group.add(pivot);
  return {
    update(clock) {
      const at = hazardAt(track, h, clock);
      arm.rotation.z = Math.asin(Math.max(-1, Math.min(1, at.offset / L)));
    },
  };
}
