import * as THREE from 'three';
import { mulberry32 } from '../../shared/rng';
import { limitOf, sampleAt, type Track } from '../../shared/track';
import { Batch, boulder, xf, type RGB } from './geometry';
import type { Materials } from './materials';
import { fbm } from './noise';
import { addPointLight } from './ps1';
import { frame, headingAt } from './road';
import type { Terrain } from './terrain';
import type { TrackIndex } from './trackindex';

function palm(batch: Batch, mats: Materials, base: THREE.Vector3, rng: () => number): void {
  const height = 9 + rng() * 5;
  const lean = rng() * Math.PI * 2;
  const bend = 1.5 + rng() * 3;
  const dir = new THREE.Vector3(Math.cos(lean), 0, Math.sin(lean));
  const rings = 7;
  const sides = 5;
  const centre = (t: number) => base.clone().addScaledVector(dir, bend * t * t).setY(base.y + height * t);
  const pts: THREE.Vector3[][] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const c = centre(t);
    const r = 0.5 - 0.22 * t;
    pts.push(Array.from({ length: sides + 1 }, (_, k) => {
      const a = (k / sides) * Math.PI * 2;
      return c.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }));
  }
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < sides; k++) {
      const quad = [pts[j][k], pts[j + 1][k], pts[j][k + 1], pts[j][k + 1], pts[j + 1][k], pts[j + 1][k + 1]];
      const uv = [[k, j], [k, j + 1], [k + 1, j], [k + 1, j], [k, j + 1], [k + 1, j + 1]];
      quad.forEach((v, i) => {
        const c = centre(uv[i][1] / rings);
        const n = v.clone().sub(c).normalize();
        batch.vertex(mats.bark, v, n, uv[i][0] / 2.5, uv[i][1] / 1.5);
      });
    }
  }
  const top = centre(1);
  const fronds = 7;
  const spin = rng() * Math.PI;
  for (let f = 0; f < fronds; f++) {
    const a = spin + (f / fronds) * Math.PI * 2;
    const len = 4.5 + rng() * 1.5;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(0.8);
    const mid = top.clone().addScaledVector(out, len * 0.5).setY(top.y + 0.6);
    const tip = top.clone().addScaledVector(out, len).setY(top.y - 1.6 - rng());
    const tint: RGB = [0.9 + rng() * 0.2, 0.9 + rng() * 0.2, 0.9];
    const strip = [
      [top.clone().sub(side), top.clone().add(side), 0],
      [mid.clone().sub(side.clone().multiplyScalar(1.3)), mid.clone().add(side.clone().multiplyScalar(1.3)), 0.5],
      [tip.clone().sub(side.clone().multiplyScalar(0.3)), tip.clone().add(side.clone().multiplyScalar(0.3)), 1],
    ] as const;
    for (let i = 0; i < 2; i++) {
      const [l0, r0, v0] = strip[i];
      const [l1, r1, v1] = strip[i + 1];
      const n = new THREE.Vector3().crossVectors(r0.clone().sub(l0), l1.clone().sub(l0)).normalize();
      if (n.y < 0) n.negate();
      const verts: [THREE.Vector3, number, number][] = [
        [l0, 0, v0], [l1, 0, v1], [r0, 1, v0], [r0, 1, v0], [l1, 0, v1], [r1, 1, v1],
      ];
      for (const [p, u, v] of verts) batch.vertex(mats.frond, p, n, u, v, tint);
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI * 2;
    const at = top.clone().add(new THREE.Vector3(Math.cos(a) * 0.45, -0.35, Math.sin(a) * 0.45));
    batch.geometry(mats.bark, new THREE.OctahedronGeometry(0.32), xf(at.x, at.y, at.z, a), [0.55, 0.42, 0.3]);
  }
}

function tuft(batch: Batch, mats: Materials, at: THREE.Vector3, rng: () => number): void {
  const a = rng() * Math.PI;
  const s = 0.8 + rng() * 0.8;
  for (const turn of [0, Math.PI / 2]) {
    batch.geometry(mats.grass, new THREE.PlaneGeometry(1.4 * s, 1.0 * s), xf(at.x, at.y + 0.45 * s, at.z, a + turn));
  }
}

function stack(batch: Batch, mats: Materials, at: THREE.Vector3, heading: number, rng: () => number): void {
  const n = 1 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const ox = (i % 2) * 1.3 - 0.6 + (rng() - 0.5) * 0.3;
    const oz = Math.floor(i / 2) * 1.3 + (rng() - 0.5) * 0.3;
    const local = xf(at.x, at.y, at.z, heading).multiply(xf(ox, 0, oz, rng() * 0.5));
    if (rng() < 0.55) batch.geometry(mats.barrel, new THREE.CylinderGeometry(0.55, 0.55, 1.3, 8), local.multiply(xf(0, 0.65, 0)));
    else batch.geometry(mats.crate, new THREE.BoxGeometry(1.2, 1.2, 1.2), local.multiply(xf(0, 0.6, 0)));
  }
  if (rng() < 0.4) {
    const top = xf(at.x, at.y, at.z, heading).multiply(xf(0, 1.25, 0.3, rng()));
    batch.geometry(mats.crate, new THREE.BoxGeometry(1.0, 1.0, 1.0), top.multiply(xf(0, 0.5, 0)));
  }
}

/** A film light on a tripod, aimed at a point, with a real light so passing cars catch it. */
function filmLight(batch: Batch, mats: Materials, at: THREE.Vector3, target: THREE.Vector3, withLight: boolean): void {
  const yaw = Math.atan2(-(target.x - at.x), -(target.z - at.z));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = at.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 0, Math.sin(a) * 1.2));
    batch.beam(mats.metal, foot, at.clone().setY(at.y + 3.2), 0.12, 0.12, [0.6, 0.6, 0.65]);
  }
  box(batch, mats.metal, 0.14, 2.2, 0.14, xf(at.x, at.y + 4.2, at.z, yaw));
  const head = xf(at.x, at.y + 5.4, at.z, yaw, -0.25);
  batch.geometry(mats.plastic, new THREE.BoxGeometry(1.8, 1.4, 1.2), head);
  batch.geometry(mats.lens, new THREE.PlaneGeometry(1.5, 1.1), head.clone().multiply(xf(0, 0, -0.61, Math.PI)));
  for (const side of [-1, 1]) {
    batch.geometry(mats.plastic, new THREE.PlaneGeometry(0.9, 1.4), head.clone().multiply(xf(side * 1.25, 0, -0.75, side * 0.6)));
  }
  if (withLight) {
    const glow = at.clone().setY(at.y + 4).lerp(target, 0.35);
    addPointLight(glow, new THREE.Color(1.0, 0.95, 0.85), 26);
  }
}

function box(batch: Batch, mat: THREE.Material, w: number, h: number, d: number, m: THREE.Matrix4, color?: RGB): void {
  batch.box(mat, w, h, d, m, color);
}

function crane(batch: Batch, mats: Materials, at: THREE.Vector3, yaw: number): void {
  const base = xf(at.x, at.y, at.z, yaw);
  batch.geometry(mats.metal, new THREE.BoxGeometry(2.4, 0.6, 3.2), base.clone().multiply(xf(0, 0.3, 0)), [0.45, 0.45, 0.5]);
  for (const [x, z] of [[-1.1, -1.5], [1.1, -1.5], [-1.1, 1.5], [1.1, 1.5]]) {
    batch.geometry(mats.plastic, new THREE.CylinderGeometry(0.35, 0.35, 0.3, 8), base.clone().multiply(xf(x, 0.3, z, 0, 0, Math.PI / 2)));
  }
  batch.geometry(mats.metal, new THREE.BoxGeometry(0.5, 3, 0.5), base.clone().multiply(xf(0, 2, 0)));
  const arm = base.clone().multiply(xf(0, 3.5, 0, 0, 0.45));
  batch.geometry(mats.metal, new THREE.BoxGeometry(0.4, 0.4, 9), arm.clone().multiply(xf(0, 0, -2.5)), [0.85, 0.75, 0.3]);
  batch.geometry(mats.metal, new THREE.BoxGeometry(1, 1, 1), arm.clone().multiply(xf(0, 0, 2.2)), [0.3, 0.3, 0.3]);
  const cam = arm.clone().multiply(xf(0, -0.7, -7));
  batch.geometry(mats.plastic, new THREE.BoxGeometry(0.9, 0.9, 1.4), cam);
  batch.geometry(mats.plastic, new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8), cam.clone().multiply(xf(0, 0, -0.95, 0, Math.PI / 2)));
  for (const z of [-0.2, 0.45]) {
    batch.geometry(mats.plastic, new THREE.CylinderGeometry(0.45, 0.45, 0.2, 10), cam.clone().multiply(xf(0, 0.85, z, 0, 0, Math.PI / 2)));
  }
}

function signBoard(batch: Batch, mats: Materials, mat: THREE.Material, at: THREE.Vector3, yaw: number, w: number, h: number, lift: number): void {
  for (const side of [-1, 1]) {
    box(batch, mats.planks, 0.3, lift + h, 0.3, xf(at.x, at.y, at.z, yaw).multiply(xf((side * w) / 2.3, (lift + h) / 2, -0.18)));
  }
  const board = xf(at.x, at.y + lift + h / 2, at.z, yaw);
  batch.geometry(mat, new THREE.PlaneGeometry(w, h), board);
  batch.geometry(mats.planks, new THREE.PlaneGeometry(w, h), board.clone().multiply(xf(0, 0, -0.02, Math.PI)));
}

export function buildProps(track: Track, index: TrackIndex, terrain: Terrain, batch: Batch, mats: Materials): void {
  const rng = mulberry32(42);
  const ground = (x: number, z: number) => new THREE.Vector3(x, terrain.height(x, z), z);
  const clear = (x: number, z: number, margin: number) => {
    const near = index.nearest(x, z, 40);
    return !near || near.d > limitOf(near.sample) + margin;
  };

  for (let z = -300; z < 220; z += 11) {
    for (let x = -300; x < 300; x += 11) {
      const px = x + (rng() - 0.5) * 9;
      const pz = z + (rng() - 0.5) * 9;
      const h = terrain.height(px, pz);
      const density = fbm(px / 60, pz / 60, 2, 21);
      if (h > 0.7 && h < 7 && density > 0.5 && rng() < (density - 0.5) * 2.4 && clear(px, pz, 3.5)) {
        palm(batch, mats, ground(px, pz), rng);
      } else if (h > 0.9 && h < 9 && rng() < 0.35 && clear(px, pz, 1.5)) {
        for (let i = 0; i < 3; i++) {
          const gx = px + (rng() - 0.5) * 6;
          const gz = pz + (rng() - 0.5) * 6;
          if (clear(gx, gz, 1)) tuft(batch, mats, ground(gx, gz), rng);
        }
      }
      if (rng() < 0.12 && h > -1.2 && h < 0.6 && clear(px, pz, 2)) {
        const at = ground(px, pz);
        batch.geometry(mats.rock, boulder(Math.floor(rng() * 1e6), 1.5 + rng() * 2.5), xf(at.x, at.y + 0.2, at.z, rng() * 6));
      }
      if (rng() < 0.3 && h > 8 && clear(px, pz, 4)) {
        const at = ground(px, pz);
        batch.geometry(mats.rock, boulder(Math.floor(rng() * 1e6), 3 + rng() * 5, 0.8), xf(at.x, at.y, at.z, rng() * 6));
      }
    }
  }

  // Barrels and crates along the barrier, mostly near the wreck, the cave and the start.
  for (let s = 20; s < track.length - 20; s += 23) {
    const p = sampleAt(track, s);
    if (p.cover !== 'open' || rng() < 0.45) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const at = frame(p, side * (limitOf(p) + 2.2 + rng() * 2), 0);
    if (!clear(at.x, at.z, 1.5)) continue;
    at.y = terrain.height(at.x, at.z);
    stack(batch, mats, at, headingAt(p), rng);
  }

  // The film crew round the start: lights either side, a camera crane, the studio billboard and the stage sign.
  const start = sampleAt(track, 4);
  const yaw = headingAt(start);
  const across = (o: number, along: number) => {
    const p = sampleAt(track, along);
    const v = frame(p, o, 0);
    return ground(v.x, v.z);
  };
  filmLight(batch, mats, across(-15, 18), frame(sampleAt(track, 8), 0, 1), true);
  filmLight(batch, mats, across(15.5, -14), frame(sampleAt(track, -6), 0, 1), false);
  filmLight(batch, mats, across(-14.5, -24), frame(sampleAt(track, -16), 0, 1), false);
  crane(batch, mats, across(17, 26), yaw + 0.6);
  {
    const at = across(22, 2);
    signBoard(batch, mats, mats.billboard, at, yaw - Math.PI / 2 + 0.3, 16, 4, 3);
  }
  {
    const at = across(-14, 40);
    signBoard(batch, mats, mats.sign, at, yaw + Math.PI / 2 - 0.4, 5, 2.5, 1.2);
  }
  stack(batch, mats, across(-13, -8), yaw, rng);
  stack(batch, mats, across(13, 12), yaw + 1, rng);

  // A treasure chest spilling gold by the cave exit.
  {
    const p = sampleAt(track, track.marks[19] + 12);
    const at = frame(p, -(limitOf(p) + 3.5), 0);
    at.y = terrain.height(at.x, at.z);
    const m = xf(at.x, at.y, at.z, headingAt(p) + 0.5);
    batch.geometry(mats.chest, new THREE.BoxGeometry(1.6, 0.9, 1.0), m.clone().multiply(xf(0, 0.45, 0)));
    batch.geometry(mats.chest, new THREE.CylinderGeometry(0.5, 0.5, 1.6, 6, 1, false, 0, Math.PI), m.clone().multiply(xf(0, 1.0, -0.3, 0, -0.9, Math.PI / 2)));
    for (let i = 0; i < 9; i++) {
      batch.geometry(mats.gold, new THREE.OctahedronGeometry(0.22 + rng() * 0.12), m.clone().multiply(xf((rng() - 0.5) * 2.4, 0.1, 0.8 + rng(), rng() * 3)));
    }
  }
}
