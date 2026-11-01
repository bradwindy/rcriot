import * as THREE from 'three';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { mulberry32 } from '../../../shared/rng';
import { limitOf, ranges, sampleAt, type Track } from '../../../shared/track';
import { Batch, ball, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import { addPointLight, dynamicLight, type PointLight } from '../../render/ps1';
import { box, frame, headingAt, loft } from '../../render/road';
import type { TrackIndex } from '../../render/trackindex';
import { LAND, landDepth, QUAY_EDGE } from './ground';
import { beacon, container, fire, PAINT, stack } from './kit';
import { lamp, skin, type Looks } from './look';
import { part } from './warehouse';

const ORANGE: RGB = [0.95, 0.5, 0.12];
const BLUE: RGB = [0.2, 0.42, 0.72];

/** A lattice box from a to b, in the crane's paint. */
function strut(batch: Batch, looks: Looks, a: THREE.Vector3, b: THREE.Vector3, w: number, tone: RGB): void {
  batch.beam(looks.truss, a, b, w, w, tone);
}

/** A ship-to-shore container crane: four legs on the quay, a tower, and a boom reaching out over the water. */
function shoreCrane(batch: Batch, mats: Materials, looks: Looks, at: THREE.Vector3, yaw: number, tone: RGB, lift: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const legs: [number, number][] = [
    [-9, -5],
    [9, -5],
    [-9, 5],
    [9, 5],
  ];
  for (const [x, z] of legs) strut(batch, looks, v(x, 0, z), v(x, 24, z), 1.6, tone);
  for (const z of [-5, 5]) {
    strut(batch, looks, v(-9, 24, z), v(9, 24, z), 1.6, tone);
    strut(batch, looks, v(-9, 9, z), v(9, 9, z), 1.1, tone);
    strut(batch, looks, v(-9, 9, z), v(9, 24, z), 0.8, tone);
  }
  for (const x of [-9, 9]) strut(batch, looks, v(x, 24, -5), v(x, 24, 5), 1.6, tone);
  for (const x of [-7, 7]) {
    strut(batch, looks, v(x, 24, 0), v(x * 0.25, 40, 0), 1.2, tone);
    box(batch, mats.plastic, 0.8, 0.5, 0.8, m.clone().multiply(xf(x, 0.25, 5)));
  }
  // The boom pivots at the tower and reaches out over the harbour, its tail balanced behind.
  const pivot = v(0, 26, 0);
  const dir = new THREE.Vector3(0, Math.sin(lift), -Math.cos(lift)).applyMatrix4(new THREE.Matrix4().extractRotation(m));
  const tip = pivot.clone().addScaledVector(dir, 52);
  const tail = pivot.clone().addScaledVector(dir, -20);
  strut(batch, looks, tail, tip, 2.2, tone);
  const top = v(0, 40, 0);
  for (const f of [0.4, 1]) batch.beam(mats.metal, top, pivot.clone().lerp(tip, f), 0.14, 0.14, [0.3, 0.3, 0.32]);
  batch.beam(mats.metal, top, tail, 0.14, 0.14, [0.3, 0.3, 0.32]);
  batch.geometry(mats.metal, new THREE.BoxGeometry(5, 3.4, 7), xf(tail.x, tail.y - 1, tail.z, yaw), [0.8, 0.8, 0.78]);
  beacon(batch, mats, looks, top.clone().setY(top.y + 0.6), 'red');
  beacon(batch, mats, looks, tip.clone().setY(tip.y + 1.2), 'red');
}

/** A tall floodlight mast with a bank of white lamps, a landmark across the yard. */
function floodMast(batch: Batch, mats: Materials, looks: Looks, at: THREE.Vector3, facing: number): PointLight {
  box(batch, mats.metal, 0.5, 26, 0.5, xf(at.x, at.y + 13, at.z), [0.55, 0.55, 0.6]);
  const head = xf(at.x, at.y + 26, at.z, facing, -0.45);
  batch.geometry(mats.metal, new THREE.BoxGeometry(4.6, 2.2, 0.5), head, [0.3, 0.3, 0.34]);
  for (let x = -1; x <= 1; x++) {
    for (let y = 0; y < 2; y++) {
      batch.geometry(looks.glow, lamp(new THREE.PlaneGeometry(1.2, 0.8), 'blue'), head.clone().multiply(xf(x * 1.45, (y - 0.5) * 1, -0.3, Math.PI)));
    }
  }
  const out = new THREE.Vector3(0, -15, -14).applyMatrix4(head);
  return addPointLight(out, new THREE.Color(0.8, 0.86, 1).multiplyScalar(1.1), 34);
}

/** Stacks of containers across the dock land, block by block, keeping clear of the roads and the set pieces. */
export function containerYard(track: Track, index: TrackIndex, batch: Batch, mats: Materials, looks: Looks): PointLight[] {
  const rng = mulberry32(2001);
  const clear = (x: number, z: number, margin: number) => {
    const near = index.nearest(x, z, 40);
    return !near || near.d > limitOf(near.sample) + margin;
  };
  const keepOut: [number, number, number][] = [
    [-198, 6, 15], // under the UFO
    [-52, -16, 56], // the raptor paddock
    [152, -138, 30], // the big ape
    [80, -116, 36], // keeps him in view from the start road
  ];
  const free = (x: number, z: number) => keepOut.every(([cx, cz, r]) => Math.hypot(x - cx, z - cz) > r);
  const inShed = (x: number, z: number) => x > 96 && x < 144 && z > -180 && z < -86;
  for (let bz = -190; bz < 176; bz += 34) {
    for (let bx = -336; bx < 236; bx += 44) {
      const yaw = hash2(bx, bz, 5) < 0.75 ? Math.PI / 2 : 0;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const x = bx + (yaw ? col * 13 : row * 3) + (hash2(bx, bz, 6) - 0.5) * 3;
          const z = bz + (yaw ? row * 3 : col * 13) + (hash2(bx, bz, 7) - 0.5) * 3;
          if (landDepth(x, z) < 9 || !free(x, z) || inShed(x, z) || !clear(x, z, 7.5)) continue;
          const high = 1 + Math.floor(hash2(bx + col, bz + row, 8) ** 1.6 * 5);
          stack(batch, looks, new THREE.Vector3(x, LAND, z), yaw, high, Math.floor(hash2(bx + col, bz + row, 9) * 40), rng);
        }
      }
    }
  }
  // A canyon of stacks right behind the barriers through the yard.
  for (let s = 0; s < track.length; s += 15) {
    const p = sampleAt(track, s);
    if (p.zone !== 'yard' || p.surface === 'metal') continue;
    for (const side of [-1, 1]) {
      const at = frame(p, side * (limitOf(p) + 4.2), 0);
      if (!clear(at.x, at.z, 3) || !free(at.x, at.z)) continue;
      at.y = LAND;
      stack(batch, looks, at, headingAt(p), 1 + Math.floor(hash2(Math.round(s), side, 12) * 4), Math.floor(s) + side, rng);
    }
  }
  shoreCrane(batch, mats, looks, new THREE.Vector3(128, LAND, QUAY_EDGE + 10), 0, ORANGE, 0.06);
  shoreCrane(batch, mats, looks, new THREE.Vector3(174, LAND, QUAY_EDGE + 10), 0, BLUE, 0.05);
  shoreCrane(batch, mats, looks, new THREE.Vector3(-118, LAND, QUAY_EDGE + 10), 0, ORANGE, 1.05);
  const masts: [number, number, number][] = [
    [-132, 40, Math.PI / 2],
    [-262, 62, -Math.PI / 2],
    [-262, -58, -Math.PI / 2],
    [-50, -100, 0],
  ];
  return masts.map(([x, z, yaw]) => floodMast(batch, mats, looks, new THREE.Vector3(x, LAND, z), yaw));
}

/** The kicker in the yard: two containers tipped up into a hump, one rising and one falling, with the road over them. */
export function containerRamp(track: Track, batch: Batch, looks: Looks): void {
  const metal = ranges(track, (p) => p.surface === 'metal');
  for (const [a, b] of metal) {
    let top = a;
    for (let s = a; s < b; s += 0.5) if (sampleAt(track, s).y > sampleAt(track, top).y) top = s;
    for (const [s0, s1, tone] of [
      [a, top, PAINT[0]],
      [top, b, PAINT[1]],
    ] as [number, number, RGB][]) {
      loft(batch, track, s0, s1, {
        spacing: 2,
        vScale: 2.4,
        outward: true,
        color: tone,
        material: () => looks.container,
        profile: (p) => {
          const l = limitOf(p);
          return [
            [-l - 0.3, LAND - p.y - 0.2, 0],
            [-l - 0.3, 0.06, 0.3],
            [-l * 0.33, 0.06, 1],
            [l * 0.33, 0.06, 2],
            [l + 0.3, 0.06, 2.7],
            [l + 0.3, LAND - p.y - 0.2, 3],
          ];
        },
      });
    }
  }
}

/**
 * The wrecking ball: a gantry straddling the yard road, and a ball on a cable swinging across it. The ball hangs where
 * hazardAt says it is, so what you see is what hits.
 */
export function wreckingBall(track: Track, batch: Batch, mats: Materials, looks: Looks, hazard: Hazard): { group: THREE.Group; update(clock: number): void } {
  const p = sampleAt(track, hazard.s);
  const h = headingAt(p);
  const span = limitOf(p) + 3.4;
  const height = 24;
  const M = xf(p.x, LAND, p.z, h);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M);
  for (const side of [-1, 1]) {
    for (const z of [-3.5, 3.5]) strut(batch, looks, v(side * span, 0, z), v(side * span, height, 0), 1.4, ORANGE);
    box(batch, mats.plastic, 1.8, 1, 9, M.clone().multiply(xf(side * span, 0.5, 0)));
    box(batch, looks.stripes, 2, 0.5, 9.2, M.clone().multiply(xf(side * span, 1.15, 0)));
    beacon(batch, mats, looks, v(side * span, height + 1.4, 0));
  }
  strut(batch, looks, v(-span - 1, height, 0), v(span + 1, height, 0), 2.2, ORANGE);
  box(batch, mats.metal, 3, 1.6, 3, M.clone().multiply(xf(0, height - 1.6, 0)), [0.85, 0.75, 0.2]);

  const pivotY = height - 2.4;
  const rest = p.y + 1.5;
  const length = LAND + pivotY - rest;
  const swing = part((b) => {
    b.geometry(looks.creature, skin(new THREE.BoxGeometry(0.22, length, 0.22), 'iron'), xf(0, -length / 2, 0));
    b.geometry(looks.creature, skin(new THREE.BoxGeometry(0.9, 1.1, 0.9), 'white'), xf(0, -length + 2.2, 0), [0.95, 0.72, 0.1]);
    b.geometry(looks.creature, skin(ball(1.75, 1, 1, 1, 10), 'iron'), xf(0, -length, 0));
    b.geometry(looks.creature, skin(new THREE.CylinderGeometry(1.79, 1.79, 0.6, 10, 1, true), 'white'), xf(0, -length, 0), [0.95, 0.72, 0.1]);
  });
  const seat = new THREE.Group();
  seat.position.copy(v(0, pivotY, 0));
  seat.quaternion.setFromRotationMatrix(M);
  seat.add(swing);
  const group = new THREE.Group();
  group.add(seat);
  const amber = new THREE.Color(1, 0.6, 0.15);
  return {
    group,
    update(clock) {
      const at = hazardAt(track, hazard, clock);
      swing.rotation.z = Math.asin(Math.max(-1, Math.min(1, (at.offset - hazard.offset) / length)));
      dynamicLight(at.x, at.y + 2, at.z, amber, 1.1, 13, 4);
    },
  };
}

/** A few wrecks and fires about the docks, so the disaster reads along the whole lap. */
export function wreckage(track: Track, batch: Batch, mats: Materials, looks: Looks): { lights: PointLight[]; flames: THREE.Vector3[] } {
  const lights: PointLight[] = [];
  const flames: THREE.Vector3[] = [];
  const spots: [number, number, number][] = [
    [1000 / 1554, 24, 3.2],
    [62 / 1554, -20, 2],
    [262 / 1554, -22, 2.4],
    [800 / 1554, 16, 2.6],
    [1160 / 1554, 18, 2.2],
    [1300 / 1554, -20, 2.6],
  ];
  for (const [share, o, size] of spots) {
    const p = sampleAt(track, share * track.length);
    const at = frame(p, o, 0);
    if (landDepth(at.x, at.z) > 2) at.y = LAND;
    else at.y = 0.2;
    const light = fire(batch, mats, looks, at, size, true, true);
    if (light) lights.push(light);
    flames.push(at.clone().setY(at.y + size));
    // A toppled container burning beside it.
    if (landDepth(at.x, at.z) > 2) container(batch, looks, xf(at.x + 3, at.y + 0.1, at.z + 3, share * 40, 0, 0.25), PAINT[Math.floor(share * 80) % PAINT.length]);
  }
  return { lights, flames };
}
