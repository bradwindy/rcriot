import * as THREE from 'three';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { sampleAt, type Track } from '../../../shared/track';
import { Batch, ball, taper, xf } from '../../render/geometry';
import { addPointLight } from '../../render/ps1';
import { headingAt } from '../../render/road';
import { lamp, skin, type Looks } from './look';
import { part } from './warehouse';

/** How far the head swings down on its neck to bite, and up to rear back before it does. */
const BITE = -0.235;
const REAR = 0.09;

const ease = (t: number) => t * t * (3 - 2 * t);

/** Head angle through one bite cycle. The jaws are shut, and the bite live, for the first `duty` of it. */
function angle(t: number, duty: number, time: number): number {
  if (t < duty) return BITE + 0.012 * Math.sin(time * 30);
  if (t < duty + 0.12) return BITE * (1 - ease((t - duty) / 0.12));
  if (t < 0.78) return 0.015 * Math.sin(time * 1.7);
  if (t < 0.94) return REAR * ease((t - 0.78) / 0.16);
  return REAR + (BITE - REAR) * ((t - 0.94) / 0.06) ** 2;
}

function fang(b: Batch, looks: Looks, at: THREE.Vector3, length: number, down: boolean, r = 0.45): void {
  const g = skin(new THREE.ConeGeometry(r, length, 5), 'bone');
  b.geometry(looks.creature, g, xf(at.x, at.y + (down ? -length / 2 : length / 2), at.z, 0, down ? Math.PI : 0));
}

/**
 * The sea monster: rearing out of the water between the piers with its lower jaw sunk through the deck, so the road
 * runs between its teeth. Its head swings down on its neck to bite, rearing back first to warn you.
 */
export function seaMonster(track: Track, batch: Batch, looks: Looks, hazard: Hazard): { group: THREE.Group; update(time: number, clock: number): void } {
  const p = sampleAt(track, hazard.s);
  const M = xf(p.x, p.y, p.z, headingAt(p));
  const water = -p.y;
  const m = looks.creature;
  const local = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => M.clone().multiply(xf(x, y, z, ry, rx, rz));
  const green: [number, number, number] = [1, 1, 1];

  // The lower jaw, sunk through the pier: gums along both barriers and a row of fangs either side of the road.
  for (const side of [-1, 1]) {
    batch.geometry(m, skin(new THREE.BoxGeometry(1.6, 1.8, 18), 'gum'), local(side * 8, -0.3, 0));
    batch.geometry(m, skin(new THREE.BoxGeometry(2.6, 3, 19), 'scales'), local(side * 8.6, -2.6, 0, 0, 0, side * 0.2), green);
    for (let k = 0; k < 8; k++) {
      const z = -7.5 + k * 2.1;
      const v = new THREE.Vector3(side * 7.8, 0.4, z).applyMatrix4(M);
      fang(batch, looks, v, 2.2 + (k % 2) * 0.9 + (k === 7 ? 1.4 : 0), false, 0.42);
    }
  }
  // The chin under the deck, out to the side, and the jaw hinge.
  batch.geometry(m, skin(taper(20, 22, 14, 18, 3.5), 'belly'), local(0, -5.5, 0));
  for (const side of [-1, 1]) batch.geometry(m, skin(ball(3.2, 1, 1.4, 1.2, 7), 'scales'), local(side * 9.5, -1.5, -9));

  // The body: the lower neck rising from the water to the shoulder, and humps and a tail further back.
  const pivot = new THREE.Vector3(-30, 10, -4);
  const lowerNeck = [
    [-36, water - 1, 2, 6],
    [-35, water + 3, 0.5, 5.4],
    [-33.5, 4, -1.5, 5],
    [-31.8, 7.2, -3, 4.7],
    [pivot.x, pivot.y, pivot.z, 4.6],
  ] as const;
  for (const [x, y, z, r] of lowerNeck) {
    batch.geometry(m, skin(ball(r, 1, 1, 1, 8), 'scales'), local(x, y, z), green);
    batch.geometry(m, skin(new THREE.ConeGeometry(1.1, 3.6, 4), 'fin'), local(x - r * 0.75, y + r * 0.5, z, 0, 0, 0.9));
  }
  batch.geometry(m, skin(ball(4.6, 1.3, 0.6, 1, 8), 'belly'), local(-33, 3, 1.6, 0, -0.3));
  const humps = [
    [-38, 18, 5.5],
    [-41, 33, 4.8],
    [-38, 47, 3.6],
    [-33, 58, 2.4],
  ] as const;
  for (const [x, z, r] of humps) {
    batch.geometry(m, skin(ball(r, 1.6, 1, 1, 8), 'scales'), local(x, water - r * 0.35, z, 0.4), green);
    for (let k = -1; k <= 1; k++) {
      batch.geometry(m, skin(new THREE.ConeGeometry(r * 0.22, r * 0.9, 4), 'fin'), local(x + k * r * 0.5, water + r * 0.6, z + k * r * 0.2, 0, 0, 0));
    }
  }

  // The head and upper neck: one rigid piece swinging from the shoulder. The head counter-turns to stay level.
  const neck = part((b) => {
    const pts = [
      [3, 5, -1.5, 4.4],
      [7, 9.5, -3, 4.2],
      [12, 12, -4.5, 4],
      [17.5, 12.5, -5.5, 3.8],
      [22.5, 10.5, -5.5, 3.7],
      [26.5, 7, -4.5, 3.6],
    ] as const;
    for (const [x, y, z, r] of pts) {
      b.geometry(m, skin(ball(r, 1, 1, 1, 8), 'scales'), xf(x, y, z), green);
      b.geometry(m, skin(new THREE.ConeGeometry(1, 3.4, 4), 'fin'), xf(x, y + r + 0.8, z - 0.5, 0, -0.5));
      b.geometry(m, skin(ball(r * 0.75, 1, 0.6, 1.2, 6), 'belly'), xf(x + 1, y - r * 0.55, z + 1.4));
    }
  });
  const head = part((b) => {
    // Skull and snout, the snout towards the oncoming cars.
    b.geometry(m, skin(taper(9.5, 18, 6.5, 13, 5.5, 1.5), 'scales'), xf(0, -2.5, 0), green);
    b.geometry(m, skin(new THREE.BoxGeometry(9, 0.5, 17), 'gum'), xf(0, -2.6, 0.4));
    b.geometry(m, skin(ball(4.8, 1, 0.8, 1, 8), 'scales'), xf(0, 1.5, -5.5), green);
    for (const side of [-1, 1]) {
      b.geometry(m, skin(new THREE.BoxGeometry(2.4, 1.4, 5), 'scales'), xf(side * 3.3, 3.4, -1.5, side * 0.15), [0.8, 0.85, 0.8]);
      b.geometry(m, skin(new THREE.ConeGeometry(0.8, 5, 5), 'bone'), xf(side * 3.6, 4.8, -6.5, 0, -1.1, side * 0.35));
      b.geometry(m, skin(new THREE.ConeGeometry(0.5, 3, 5), 'bone'), xf(side * 4.4, 3.2, -8, side * 0.4, -1.3));
      b.geometry(looks.glow, lamp(new THREE.BoxGeometry(0.4, 1.3, 2.2), 'eye'), xf(side * 4.15, 2.6, -1.2, side * 0.25));
      b.geometry(m, skin(new THREE.BoxGeometry(0.8, 0.4, 0.9), 'gum'), xf(side * 1.6, 3.15, 7.4));
      // Fangs down both sides of the upper jaw, longest at the front.
      for (let k = 0; k < 7; k++) {
        const z = -7 + k * 2.3;
        const v = new THREE.Vector3(side * (4.4 - k * 0.22), -2.8, z);
        fang(b, looks, v, 2.4 + (k % 2) * 0.8 + (k === 6 ? 1.6 : 0), true, 0.45);
      }
    }
    for (const x of [-1.4, 1.4]) fang(b, looks, new THREE.Vector3(x, -2.8, 8.4), 3.4, true, 0.5);
    // A frill of fins down the back of the skull.
    for (let k = 0; k < 3; k++) {
      b.geometry(m, skin(new THREE.ConeGeometry(1.2, 4, 4), 'fin'), xf(0, 5.8 - k * 0.6, -4 - k * 2.4, 0, -0.6));
    }
  });
  const swing = new THREE.Group();
  const seat = new THREE.Group();
  seat.position.copy(pivot).applyMatrix4(M);
  seat.quaternion.setFromRotationMatrix(M);
  seat.add(swing);
  const headAt = new THREE.Vector3(30, 0.5, 4);
  head.position.copy(headAt);
  swing.add(neck, head);
  const group = new THREE.Group();
  group.add(seat);

  const glow = new THREE.Vector3(0, 5, 0).applyMatrix4(M);
  const light = addPointLight(glow, new THREE.Color(0.6, 1.0, 0.3), 22);
  const base = light.color.clone();
  return {
    group,
    update(time, clock) {
      const at = hazardAt(track, hazard, clock);
      const a = angle(at.t, hazard.duty, time);
      swing.rotation.z = a;
      head.rotation.z = -a;
      light.color.copy(base).multiplyScalar(at.live ? 1.6 : 0.6 + 0.2 * Math.sin(time * 3));
    },
  };
}
