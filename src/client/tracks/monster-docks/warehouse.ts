import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { limitOf, sampleAt, zoneRanges, type Track } from '../../../shared/track';
import { Batch, ball, xf } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { addPointLight, type PointLight } from '../../render/ps1';
import { box, headingAt } from '../../render/road';
import { LAND } from './ground';
import { slab, SODIUM } from './kit';
import { lamp, skin, type Looks } from './look';

/** A rigid moving part: whatever `build` adds, merged into meshes under one group. */
export function part(build: (b: Batch) => void): THREE.Group {
  const b = new Batch();
  build(b);
  const g = new THREE.Group();
  for (const m of b.meshes()) g.add(m);
  return g;
}

interface Ape {
  root: THREE.Group;
  head: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
}

/** A gorilla `H` tall, facing -z: a hunched body, a head that turns and two long arms that swing from the shoulder. */
function ape(looks: Looks, H: number): Ape {
  const m = looks.creature;
  const body = part((b) => {
    for (const side of [-1, 1]) {
      b.geometry(m, skin(ball(0.1 * H, 1, 1.7, 1.15, 7), 'fur'), xf(side * 0.13 * H, 0.2 * H, 0.02 * H));
      b.geometry(m, skin(new THREE.BoxGeometry(0.13 * H, 0.05 * H, 0.17 * H), 'skin'), xf(side * 0.14 * H, 0.025 * H, -0.03 * H));
      b.geometry(m, skin(ball(0.12 * H, 1.1, 1, 1, 7), 'fur'), xf(side * 0.17 * H, 0.71 * H, 0.02 * H));
    }
    b.geometry(m, skin(ball(0.21 * H, 1, 1.15, 0.85, 9), 'fur'), xf(0, 0.53 * H, 0.03 * H, 0, 0.25));
    b.geometry(m, skin(ball(0.15 * H, 1.05, 1.1, 0.45, 8), 'skin'), xf(0, 0.53 * H, -0.12 * H, 0, 0.25));
  });
  const head = part((b) => {
    b.geometry(m, skin(ball(0.11 * H, 1, 1.05, 1, 8), 'fur'), xf(0, 0.07 * H, 0));
    b.geometry(m, skin(new THREE.BoxGeometry(0.19 * H, 0.04 * H, 0.07 * H), 'skin'), xf(0, 0.09 * H, -0.085 * H), [0.7, 0.7, 0.7]);
    b.geometry(m, skin(ball(0.085 * H, 1.15, 0.85, 0.6, 7), 'skin'), xf(0, 0.04 * H, -0.075 * H));
    b.geometry(m, skin(ball(0.07 * H, 1.2, 0.75, 0.9, 7), 'skin'), xf(0, -0.015 * H, -0.1 * H));
    b.geometry(m, skin(new THREE.BoxGeometry(0.08 * H, 0.015 * H, 0.03 * H), 'gum'), xf(0, -0.04 * H, -0.165 * H));
    for (const side of [-1, 1]) {
      b.geometry(m, skin(ball(0.03 * H, 1, 1.2, 0.8, 6), 'skin'), xf(side * 0.105 * H, 0.06 * H, 0));
      b.geometry(looks.glow, lamp(new THREE.BoxGeometry(0.035 * H, 0.025 * H, 0.02 * H), 'apeEye'), xf(side * 0.038 * H, 0.06 * H, -0.12 * H));
    }
  });
  head.position.set(0, 0.8 * H, -0.06 * H);
  const arm = () =>
    part((b) => {
      b.geometry(m, skin(ball(0.065 * H, 1, 2.6, 1, 7), 'fur'), xf(0, -0.16 * H, 0));
      b.geometry(m, skin(ball(0.06 * H, 1, 2.7, 1, 7), 'fur'), xf(0, -0.42 * H, -0.01 * H));
      b.geometry(m, skin(ball(0.065 * H, 1.15, 0.85, 1.25, 7), 'skin'), xf(0, -0.6 * H, -0.02 * H));
    });
  const left = arm();
  const right = arm();
  left.position.set(-0.21 * H, 0.74 * H, 0.02 * H);
  right.position.set(0.21 * H, 0.74 * H, 0.02 * H);
  const root = new THREE.Group();
  root.add(body, head, left, right);
  return { root, head, left, right };
}

export interface Warehouse {
  group: THREE.Group;
  lights: PointLight[];
  update(time: number): void;
}

/**
 * The banana warehouse the road runs through: corrugated walls, racking down both sides, lamps hung from the roof,
 * and a hole the big ape has torn in it. He reaches in and pounds; his son pounds on the ridge above the way in.
 */
export function warehouse(track: Track, batch: Batch, mats: Materials, looks: Looks): Warehouse {
  const [a, b] = zoneRanges(track, 'warehouse')[0];
  const exit = b;
  const mid = sampleAt(track, (a + b) / 2);
  const h = headingAt(mid);
  const len = exit - a + 2;
  const W = 18;
  const wall = 13;
  const ridge = 17;
  const M = xf(mid.x, LAND, mid.z, h);
  const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M);
  const local = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => M.clone().multiply(xf(x, y, z, ry, rx, rz));
  const outer: [number, number, number] = [0.68, 0.34, 0.24];
  const inside: [number, number, number] = [0.7, 0.7, 0.72];
  const roofTone: [number, number, number] = [0.34, 0.38, 0.46];

  // Side walls: corrugated outside, a dim lining inside.
  for (const side of [-1, 1]) {
    batch.geometry(looks.corrugated, slab(0.4, wall, len, 2.5, true), local(side * W, wall / 2, 0), outer);
    batch.geometry(looks.corrugatedIndoor, new THREE.PlaneGeometry(len, wall).scale(1, 1, 1), local(side * (W - 0.3), wall / 2, 0, -side * Math.PI / 2), inside);
    box(batch, looks.stripes, 0.5, 1, len, local(side * (W + 0.05), 0.5, 0));
  }
  // End walls, each with a big door for the road, and gables up to the ridge.
  const doorHalf = limitOf(mid) + 1.2;
  for (const [z, top] of [
    [len / 2, 8.5],
    [-len / 2, 11],
  ] as const) {
    const pieces: [number, number, number, number][] = [
      [-(W + doorHalf) / 2, wall / 2, W - doorHalf, wall],
      [(W + doorHalf) / 2, wall / 2, W - doorHalf, wall],
      [0, (top + wall) / 2, doorHalf * 2, wall - top],
    ];
    for (const [x, y, w, hh] of pieces) {
      batch.geometry(looks.corrugated, slab(w, hh, 0.4, 2.5, true), local(x, y, z), outer);
      batch.geometry(looks.corrugatedIndoor, new THREE.PlaneGeometry(w, hh), local(x, y, z - Math.sign(z) * 0.3, z > 0 ? Math.PI : 0), inside);
    }
    const gable = new THREE.BufferGeometry();
    gable.setAttribute('position', new THREE.Float32BufferAttribute([-W, wall, 0, W, wall, 0, 0, ridge, 0], 3));
    gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 14, 0, 7, 2], 2));
    gable.computeVertexNormals();
    for (const turn of [0, Math.PI]) batch.geometry(looks.corrugated, gable, local(0, 0, z, turn), outer);
    for (const side of [-1, 1]) {
      box(batch, looks.stripes, 0.6, top, 0.6, local(side * doorHalf, top / 2, z));
    }
    box(batch, looks.stripes, doorHalf * 2 + 0.6, 0.6, 0.6, local(0, top, z));
  }

  // A strip of lit clerestory windows down both walls, and extractor vents along the ridge.
  for (const side of [-1, 1]) {
    for (let z = -len / 2 + 5; z < len / 2 - 3; z += 6) {
      batch.geometry(looks.glow, lamp(new THREE.PlaneGeometry(4.4, 2), 'window'), local(side * (W + 0.25), wall - 2.2, z, side * Math.PI / 2), [0.9, 0.75, 0.6]);
    }
  }
  for (let z = -len / 2 + 8; z < len / 2 - 4; z += 14) {
    batch.geometry(mats.metal, new THREE.CylinderGeometry(1, 1.2, 1.6, 8), local(-5, ridge - 0.2, z), [0.5, 0.5, 0.54]);
    batch.geometry(mats.metal, new THREE.ConeGeometry(1.5, 0.8, 8), local(-5, ridge + 1, z), [0.4, 0.4, 0.44]);
  }

  // The roof, in panels, with a hole torn in the right-hand slope where the big ape reaches in.
  const panels = 8;
  const plen = len / panels;
  const slope = Math.atan2(ridge - wall, W);
  const run = Math.hypot(W, ridge - wall);
  const holeAt = 3;
  for (const side of [-1, 1]) {
    for (let k = 0; k < panels; k++) {
      const z = -len / 2 + (k + 0.5) * plen;
      const hole = side > 0 && (k === holeAt || k === holeAt + 1);
      const m = local((side * W) / 2, (wall + ridge) / 2, z, 0, 0, -side * slope);
      if (hole) {
        // Only the upper strip survives, buckled inwards.
        batch.geometry(looks.corrugated, slab(run * 0.3, 0.25, plen, 2.5), m.clone().multiply(xf((-side * run) * 0.35, -0.6, 0, 0, 0, side * 0.35)), roofTone);
        continue;
      }
      batch.geometry(looks.corrugated, slab(run + 0.4, 0.25, plen + 0.05, 2.5), m, roofTone);
      batch.geometry(looks.corrugatedIndoor, new THREE.PlaneGeometry(run, plen), m.clone().multiply(xf(0, -0.25, 0, 0, Math.PI / 2)), [0.45, 0.45, 0.5]);
    }
  }
  const holeZ = -len / 2 + (holeAt + 1) * plen;
  // Bent sheets hanging into the hole, and a shaft of dusk light falling through it.
  for (let k = 0; k < 5; k++) {
    const z = holeZ - plen + (k + 0.5) * ((plen * 2) / 5);
    batch.geometry(looks.corrugated, slab(3, 0.2, 1.8, 2.5), local(W * 0.55 + (k % 2), wall - 0.5 - (k % 3), z, 0.3 * k, 0.5, 1.1 + k * 0.2), roofTone);
  }
  for (const turn of [0.3, 0.3 + Math.PI / 2]) {
    batch.geometry(looks.beam, new THREE.PlaneGeometry(10, 15), local(W * 0.45, wall - 6, holeZ, turn, 0, -0.35).multiply(xf(0, 0, 0, 0, 0, Math.PI)), [0.7, 0.42, 0.25]);
  }

  // Pallet racking down both sides of the road: the barrier, stacked with banana crates.
  const rng = mulberry32(77);
  const racks = Math.floor((len - 8) / 3);
  for (const side of [-1, 1]) {
    for (let k = 0; k <= racks; k++) {
      const z = -len / 2 + 4 + k * 3;
      const s = a + (len / 2 - z);
      const p = sampleAt(track, Math.min(exit - 1, Math.max(a, s)));
      const x = side * (limitOf(p) + 0.6);
      box(batch, mats.metalIndoor, 0.15, 9, 0.15, local(x, 4.5, z), [0.9, 0.45, 0.12]);
      box(batch, mats.metalIndoor, 0.15, 9, 0.15, local(x + side * 1.6, 4.5, z), [0.9, 0.45, 0.12]);
      if (k === racks) continue;
      for (const y of [0.3, 3.2, 6.2]) {
        box(batch, mats.metalIndoor, 0.12, 0.18, 3, local(x, y, z + 1.5), [0.2, 0.35, 0.7]);
        box(batch, mats.metalIndoor, 0.12, 0.18, 3, local(x + side * 1.6, y, z + 1.5), [0.2, 0.35, 0.7]);
        if (rng() < 0.75) {
          const tint: [number, number, number] = rng() < 0.6 ? [1.15, 1.0, 0.45] : [1, 1, 1];
          batch.geometry(looks.crateIndoor, new THREE.BoxGeometry(1.4, 1.3, 2.4), local(x + side * 0.8, y + 0.75, z + 1.5, rng() * 0.2), tint);
        }
      }
    }
  }
  // Lamps hung down the middle.
  const lights: PointLight[] = [];
  for (let k = 0; k < 4; k++) {
    const z = -len / 2 + 10 + k * ((len - 20) / 3);
    const p = at(0, 10.5, z);
    box(batch, mats.metal, 0.05, 2.5, 0.05, local(0, 11.75, z));
    batch.geometry(mats.metal, new THREE.ConeGeometry(0.9, 0.6, 8, 1, true), local(0, 10.6, z), [0.3, 0.35, 0.3]);
    batch.geometry(looks.glow, lamp(new THREE.CircleGeometry(0.6, 8), 'sodium'), local(0, 10.35, z, 0, Math.PI / 2));
    lights.push(addPointLight(p.setY(p.y - 1), SODIUM.clone().multiplyScalar(1.4), 19));
  }
  lights.push(addPointLight(at(W * 0.3, 5, holeZ), new THREE.Color(1.0, 0.55, 0.3), 16));

  // The loading ramp out of the far door: pallets stacked under its edges.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const s = exit - 13 + k * 3.4;
      const p = sampleAt(track, s);
      const lift = p.y - LAND;
      if (lift < 0.4) continue;
      const v = new THREE.Vector3(p.x - p.tz * side * (limitOf(p) - 0.2), LAND + lift / 2 - 0.15, p.z + p.tx * side * (limitOf(p) - 0.2));
      batch.geometry(mats.planksIndoor, new THREE.BoxGeometry(0.5, lift - 0.3, 3.2), xf(v.x, v.y, v.z, headingAt(p)));
    }
  }

  // The apes.
  const group = new THREE.Group();
  const big = ape(looks, 34);
  const holeWorld = at(W * 0.45, wall, holeZ);
  const bigAt = at(W + 12, 0, holeZ - 1);
  big.root.position.copy(bigAt);
  big.root.rotation.y = Math.atan2(-(holeWorld.x - bigAt.x), -(holeWorld.z - bigAt.z));
  const son = ape(looks, 12);
  const sonAt = at(-1.5, ridge - 0.5, len / 2 - 9);
  son.root.position.copy(sonAt);
  son.root.rotation.y = h + Math.PI + 0.3;
  son.root.rotation.x = 0.15;
  group.add(big.root, son.root);

  return {
    group,
    lights,
    update(time) {
      // The big ape lifts his fist high and drives it down through the roof, then beats his chest.
      const cycle = (time / 3.2) % 1;
      const lift = cycle < 0.6 ? Math.sin((cycle / 0.6) * Math.PI * 0.5) : 1 - ((cycle - 0.6) / 0.12) ** 2;
      big.right.rotation.set(0.95 + 0.95 * Math.max(0, lift), 0, 0.15);
      big.left.rotation.set(1.3 + 0.25 * Math.sin(time * 14) * (cycle > 0.75 ? 1 : 0.15), 0, -0.9);
      big.head.rotation.set(-0.15 + 0.1 * Math.sin(time * 0.7), 0.3 * Math.sin(time * 0.45), 0);
      big.root.position.y = bigAt.y - (cycle > 0.72 && cycle < 0.8 ? 0.4 : 0);
      // His son drums on the roof, fist after fist.
      const beat = time * 7;
      son.left.rotation.set(0.6 + 0.6 * Math.max(0, Math.sin(beat)), 0, 0.2);
      son.right.rotation.set(0.6 + 0.6 * Math.max(0, -Math.sin(beat)), 0, -0.2);
      son.head.rotation.set(0.2 * Math.sin(time * 2.1), 0.4 * Math.sin(time * 0.9), 0);
    },
  };
}
