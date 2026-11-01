import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { limitOf, sampleAt, type Track } from '../../../shared/track';
import { xf, type RGB } from '../../render/geometry';
import { fbm } from '../../render/noise';
import { addPointLight } from '../../render/ps1';
import { frame, headingAt } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import { fieldTint, MAP, riverDist } from './ground';
import { C, rgb, type Looks } from './look';
import { InkRig, pose, tube, type Toon } from './toon';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function lollipop(toon: Toon, L: Looks, at: THREE.Vector3, rng: () => number): void {
  const h = 5 + rng() * 5;
  const r = 2.8 + rng() * 2.4;
  const lean = (rng() - 0.5) * 0.14;
  toon.cyl(L.flat, 0.34, 0.6, h, xf(at.x, at.y + h / 2, at.z, 0, lean, lean), rgb(C.trunk), 0.07, 5);
  const crown: RGB = rng() < 0.5 ? rgb(C.leaf) : rng() < 0.5 ? rgb(C.leafDark) : [0.48, 0.82, 0.26];
  const y = at.y + h + r * 0.7;
  toon.ball(L.flat, r, xf(at.x + lean * h, y, at.z - lean * h, rng() * 3), crown, 0.11, 1, 0.92, 1, 7);
  const kind = rng();
  if (kind < 0.35) {
    for (let i = 0; i < 2; i++) {
      const a = rng() * 6.3;
      toon.ball(L.flat, r * 0.6, xf(at.x + Math.cos(a) * r * 0.8, y + r * 0.3, at.z + Math.sin(a) * r * 0.8), crown, 0.09, 1, 1, 1, 6);
    }
  } else if (kind < 0.6) {
    for (let i = 0; i < 6; i++) {
      const a = rng() * 6.3;
      const b = rng() * 1.2;
      toon.ball(L.flat, 0.3, xf(at.x + Math.cos(a) * Math.cos(b) * r, y + Math.sin(b) * r * 0.9, at.z + Math.sin(a) * Math.cos(b) * r), rgb(C.red), 0.04, 1, 1, 1, 5);
    }
  }
}

function roundBale(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number, r = 1.5): void {
  toon.cyl(L.hay, r, r, r * 1.5, xf(at.x, at.y + r, at.z, yaw, 0, Math.PI / 2), [1, 1, 1], 0.08, 10);
}

function farmhouse(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const part = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => m.clone().multiply(xf(x, y, z, ry, rx, rz));
  const [W, H, D] = [17, 8, 11];
  const wall = rgb(C.white);
  toon.box(L.flat, W, H, D, part(0, H / 2, 0), wall, 0.12);
  for (const side of [-1, 1]) {
    const run = W / 2 + 1.2;
    const rise = 5.2;
    toon.box(L.shingles, Math.hypot(run, rise) + 0.4, 0.4, D + 2.2, part((side * run) / 2, H + rise / 2 + 0.2, 0, 0, 0, -side * Math.atan2(rise, run)), [1, 1, 1], 0.12);
  }
  for (const side of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, 0, 0, W / 2, 0, 0, 0, 5.2, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    toon.batch.geometry(L.flat, tri, part(0, H, (side * D) / 2 + side * 0.02, side > 0 ? 0 : Math.PI), wall);
  }
  toon.box(L.flat, 1.6, 6, 1.6, part(4.4, H + 5, -1.6), rgb(C.barnRed), 0.1);
  toon.box(L.flat, 2, 0.4, 2, part(4.4, H + 8, -1.6), rgb(C.dark), 0.06);
  // Windows with shutters, a blue door and a porch.
  for (const x of [-5.4, 5.4]) {
    for (const y of [2.4, 6]) {
      toon.box(L.flat, 2, 2, 0.2, part(x, y, D / 2 + 0.06), rgb(C.sky), 0.08);
      for (const dx of [-1.4, 1.4]) toon.box(L.flat, 0.7, 2.2, 0.16, part(x + dx, y, D / 2 + 0.1), rgb(C.green), 0.05);
    }
  }
  toon.box(L.flat, 2, 2, 0.2, part(0, 6, D / 2 + 0.06), rgb(C.sky), 0.08);
  toon.box(L.flat, 2.2, 3.6, 0.22, part(0, 1.8, D / 2 + 0.08), rgb(C.blue), 0.08);
  toon.box(L.boards, W - 3, 0.3, 3.6, part(0, 0.3, D / 2 + 1.8), [1, 1, 1], 0.07);
  toon.box(L.shingles, W - 2.4, 0.3, 4.2, part(0, 4.4, D / 2 + 1.9, 0, 0.14), [1, 1, 1], 0.08);
  for (const x of [-6.5, -2, 2, 6.5]) toon.box(L.flat, 0.3, 4, 0.3, part(x, 2.3, D / 2 + 3.4), wall, 0.05);
}

function tractor(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const part = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => m.clone().multiply(xf(x, y, z, ry, rx, rz));
  const red = rgb(C.red);
  toon.box(L.flat, 2.4, 2, 5.6, part(0, 2.6, -1.2), red, 0.1);
  toon.box(L.flat, 2.6, 2.6, 2.6, part(0, 4.6, 1.2), rgb(C.sky), 0.1);
  toon.box(L.flat, 3.2, 0.3, 3.4, part(0, 6.1, 1.2), red, 0.08);
  tube(toon, L.flat, v3(0.6, 3.5, -3).applyMatrix4(m), v3(0.6, 6.4, -3).applyMatrix4(m), 0.2, rgb(C.dark), 0.05, 6);
  for (const side of [-1, 1]) {
    toon.cyl(L.flat, 2.2, 2.2, 1.1, part(side * 1.8, 2.2, 1.3, 0, 0, Math.PI / 2), rgb(C.dark), 0.1, 10);
    toon.cyl(L.flat, 1.1, 1.1, 1.2, part(side * 1.8, 2.2, 1.3, 0, 0, Math.PI / 2), rgb(C.yellow), 0.04, 8);
    toon.cyl(L.flat, 1.1, 1.1, 0.7, part(side * 1.5, 1.1, -3.4, 0, 0, Math.PI / 2), rgb(C.dark), 0.08, 8);
    toon.cyl(L.flat, 0.5, 0.5, 0.8, part(side * 1.5, 1.1, -3.4, 0, 0, Math.PI / 2), rgb(C.yellow), 0.03, 6);
  }
}

function scarecrow(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const part = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => m.clone().multiply(xf(x, y, z, ry, rx, rz));
  toon.box(L.wood, 0.28, 6, 0.28, part(0, 3, 0), [1, 1, 1], 0.05);
  toon.box(L.wood, 5, 0.26, 0.26, part(0, 4.5, 0, 0, 0, 0.08), [1, 1, 1], 0.05);
  toon.box(L.flat, 1.7, 2.2, 0.8, part(0, 3.9, 0), rgb(C.blue), 0.07);
  toon.ball(L.flat, 0.7, part(0, 5.6, 0), rgb(C.cream), 0.06);
  toon.cyl(L.flat, 0.5, 0.6, 0.7, part(0, 6.4, 0, 0, 0, 0.12), rgb(C.trunk), 0.05, 7);
  toon.cyl(L.flat, 1.1, 1.1, 0.1, part(0, 6.05, 0, 0, 0, 0.12), rgb(C.trunk), 0.05, 8);
  for (const s of [-1, 1]) toon.ball(L.flat, 0.09, part(s * 0.24, 5.7, -0.62), rgb(C.ink), 0);
}

/** A film light on a tripod, its lens glowing, aimed at the road: the studio showing through the farm. */
function filmLight(toon: Toon, L: Looks, at: THREE.Vector3, target: THREE.Vector3): void {
  const yaw = Math.atan2(-(target.x - at.x), -(target.z - at.z));
  const steel = rgb(C.dark);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    toon.beam(L.flat, at.clone().add(v3(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6)), at.clone().setY(at.y + 4.2), 0.14, 0.14, steel, 0.04);
  }
  toon.box(L.flat, 0.16, 3, 0.16, xf(at.x, at.y + 5.4, at.z, yaw), steel, 0.04);
  const head = xf(at.x, at.y + 7, at.z, yaw, -0.3);
  toon.box(L.flat, 2.4, 1.9, 1.6, head, steel, 0.08);
  toon.batch.geometry(L.glow, new THREE.CircleGeometry(0.85, 8), head.clone().multiply(xf(0, 0, -0.82, Math.PI)), [1, 0.96, 0.8]);
  for (const side of [-1, 1]) toon.box(L.flat, 0.08, 1.8, 1.2, head.clone().multiply(xf(side * 1.5, 0, -0.9, side * 0.5)), steel, 0.03);
}

function cameraCrane(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number): void {
  const base = xf(at.x, at.y, at.z, yaw);
  const part = (x: number, y: number, z: number) => base.clone().multiply(xf(x, y, z));
  const dark = rgb(C.dark);
  toon.box(L.flat, 3, 0.8, 4, part(0, 0.8, 0), rgb(C.steel), 0.08);
  for (const [x, z] of [[-1.5, -1.8], [1.5, -1.8], [-1.5, 1.8], [1.5, 1.8]]) toon.cyl(L.flat, 0.45, 0.45, 0.4, part(x, 0.45, z).multiply(xf(0, 0, 0, 0, 0, Math.PI / 2)), dark, 0.05, 8);
  toon.box(L.flat, 0.7, 4, 0.7, part(0, 3, 0), rgb(C.steel), 0.06);
  const arm = base.clone().multiply(xf(0, 5, 0, 0, 0.42));
  toon.box(L.flat, 0.5, 0.5, 13, arm.clone().multiply(xf(0, 0, -3)), rgb(C.yellow), 0.07);
  toon.box(L.flat, 1.4, 1.4, 1.4, arm.clone().multiply(xf(0, 0, 3.6)), dark, 0.07);
  const cam = arm.clone().multiply(xf(0, -0.9, -9.2));
  toon.box(L.flat, 1.1, 1.2, 2, cam, dark, 0.07);
  toon.cyl(L.flat, 0.4, 0.5, 0.9, cam.clone().multiply(xf(0, 0, -1.4, 0, Math.PI / 2)), dark, 0.05, 8);
  for (const z of [-0.4, 0.5]) toon.cyl(L.flat, 0.6, 0.6, 0.24, cam.clone().multiply(xf(0, 1.15, z, 0, 0, Math.PI / 2)), dark, 0.05, 10);
}

/** The striped clapperboard from the top of every take, at RC-car scale. */
function clapper(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const part = (x: number, y: number, z: number, rz = 0) => m.clone().multiply(xf(x, y, z, 0, 0, rz));
  toon.box(L.flat, 6, 4, 0.3, part(0, 2.6, 0), rgb(C.dark), 0.1);
  for (const [rz, y] of [
    [0, 4.9],
    [0.22, 5.7],
  ] as const) {
    const bar = part(0, y, 0, rz);
    toon.box(L.flat, 6.1, 0.65, 0.34, bar, rgb(C.ink), 0.08);
    for (let i = 0; i < 4; i++) toon.batch.box(L.flat, 0.7, 0.67, 0.36, bar.clone().multiply(xf(-2.2 + i * 1.5, 0, 0, 0, 0, 0.5)), [1, 1, 1]);
  }
  for (const side of [-1, 1]) toon.beam(L.wood, v3(side * 2, 0.7, 0).applyMatrix4(m), v3(side * 3, -0.2, -1.6).applyMatrix4(m), 0.3, 0.3);
}

/** Pointing the way at the fork: one arrow for the barns, one for the pond. */
function signpost(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const part = (x: number, y: number, z: number, rz = 0) => m.clone().multiply(xf(x, y, z, 0, 0, rz));
  toon.box(L.wood, 0.5, 8, 0.5, part(0, 4, 0, 0.04), [1, 1, 1], 0.07);
  const arrow = (y: number, dir: number, color: RGB, tilt: number) => {
    const s = new THREE.Shape();
    s.moveTo(-3, -0.8);
    s.lineTo(1.6, -0.8);
    s.lineTo(1.6, -1.5);
    s.lineTo(3.6, 0);
    s.lineTo(1.6, 1.5);
    s.lineTo(1.6, 0.8);
    s.lineTo(-3, 0.8);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.24, bevelEnabled: false });
    g.scale(dir, 1, 1);
    toon.shape(L.flat, g, part(dir * 1.2, y, 0.3, dir * tilt), color, 0.09);
  };
  arrow(6.2, 1, rgb(C.barnRed), -0.08);
  arrow(4.2, -1, rgb(C.yellow), 0.1);
}

export function buildProps(track: Track, toon: Toon, L: Looks, terrain: Terrain, index: TrackIndex): { group: THREE.Object3D[]; update(time: number): void } {
  const rng = mulberry32(77);
  const batch = toon.batch;
  const ground = (x: number, z: number) => v3(x, terrain.height(x, z), z);
  const clear = (x: number, z: number, margin: number) => {
    const near = index.nearest(x, z, 40);
    return !near || near.d > limitOf(near.sample) + margin;
  };
  const inPond = (x: number, z: number) => ((x - MAP.pond.x) / MAP.pond.rx) ** 2 + ((z - MAP.pond.z) / MAP.pond.rz) ** 2 < 1.5;
  const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, pad: number) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
  const blocked = (x: number, z: number) =>
    inPond(x, z) || riverDist(x, z) < 15 || inRect(x, z, MAP.yard, 3) || inRect(x, z, MAP.factory, 6) || inRect(x, z, MAP.barns, -2) || inRect(x, z, { x0: 28, x1: 72, z0: 112, z1: 165 }, 2);
  const inCorn = (x: number, z: number) => x > 26 && x < 96 && z > -52 && z < 64;

  // The corn, in rows, on the right of the start straight.
  for (let z = -48; z < 62; z += 3.4) {
    for (let x = 28; x < 94; x += 3.6) {
      const px = x + (rng() - 0.5) * 0.8;
      const pz = z + (rng() - 0.5) * 0.8;
      if (Math.abs(px - 62) < 2.4 || !clear(px, pz, 2)) continue;
      const at = ground(px, pz);
      const s = 0.9 + rng() * 0.3;
      for (const turn of [0, Math.PI / 2]) batch.geometry(L.corn, new THREE.PlaneGeometry(3 * s, 6 * s), xf(at.x, at.y + 3 * s, at.z, 0.6 + turn));
    }
  }
  scarecrow(toon, L, ground(62, 4), 2.2);

  // Trees, hedges, bales and flowers scattered over the fields.
  for (let z = -320; z < 320; z += 17) {
    for (let x = -140; x < 510; x += 17) {
      const px = x + (rng() - 0.5) * 14;
      const pz = z + (rng() - 0.5) * 14;
      const roll = rng();
      if (blocked(px, pz) || inCorn(px, pz)) continue;
      const at = ground(px, pz);
      const density = fbm(px / 70, pz / 70, 2, 23);
      const hill = Math.hypot(px - MAP.hill.x, pz - MAP.hill.z) < 18;
      if (!hill && density > 0.48 && roll < (density - 0.44) * 2.6 && clear(px, pz, 6)) lollipop(toon, L, at, rng);
      else if (roll > 0.8 && clear(px, pz, 3)) {
        const tone = fieldTint(px, pz, at.y);
        if (tone[0] > 0.7) {
          roundBale(toon, L, at, rng() * 6.3);
          if (rng() < 0.4) roundBale(toon, L, ground(px + 3.4, pz + 1), rng() * 6.3);
        } else if (rng() < 0.45) {
          toon.ball(L.flat, 1.5 + rng() * 1.2, xf(at.x, at.y + 0.8, at.z), rgb(C.leafDark), 0.08, 1.2, 0.8, 1, 6);
        }
      }
    }
  }
  // Flowers along the road side.
  for (let s = 8; s < track.length - 8; s += 5.5) {
    const p = sampleAt(track, s);
    if (p.cover !== 'open' || rng() < 0.3) continue;
    const side = rng() < 0.5 ? -1 : 1;
    const v = frame(p, side * (limitOf(p) + 1.2 + rng() * 5), 0);
    if (!clear(v.x, v.z, 0.6) || blocked(v.x, v.z)) continue;
    const at = ground(v.x, v.z);
    batch.geometry(L.flowers, new THREE.PlaneGeometry(2.6, 1.3), xf(at.x, at.y + 0.6, at.z, rng() * 3));
  }

  // The farmhouse and its kit, left of the start straight.
  farmhouse(toon, L, ground(-44, 26), Math.PI / 2 + 0.1);
  for (const [x, z] of [
    [-34, -8],
    [-36, 52],
  ]) {
    lollipop(toon, L, ground(x, z), rng);
  }
  tractor(toon, L, ground(-30, 66), 2.5);
  tractor(toon, L, ground(150, -92), 1.3);
  toon.cyl(L.cow, 5, 5, 16, xf(-66, ground(-66, 50).y + 8, 50), [1, 1, 1], 0.12, 10);
  toon.shape(L.flat, new THREE.SphereGeometry(5, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), xf(-66, ground(-66, 50).y + 16, 50), rgb(C.barnRed), 0.12);

  // The film crew round the start, a reminder that this is all a set.
  const p0 = sampleAt(track, 4);
  const across = (o: number, along: number) => {
    const v = frame(sampleAt(track, along), o, 0);
    return ground(v.x, v.z);
  };
  filmLight(toon, L, across(-16, 22), frame(sampleAt(track, 10), 0, 1));
  filmLight(toon, L, across(16, -18), frame(sampleAt(track, -8), 0, 1));
  filmLight(toon, L, across(-15.5, -30), frame(sampleAt(track, -20), 0, 1));
  addPointLight(frame(sampleAt(track, 16), -9, 5), new THREE.Color(1, 0.95, 0.8).multiplyScalar(0.5), 22);
  cameraCrane(toon, L, across(17, 26), headingAt(p0) + 0.7);
  clapper(toon, L, across(-19, 44), headingAt(p0) + Math.PI / 2 - 0.3);

  // The arrows at the fork.
  signpost(toon, L, ground(106, -135), -1.3);

  // A Dutch windmill on top of Big Hill, its sails turning, the landmark of the whole farm.
  const mill = new InkRig(L);
  const top = ground(MAP.hill.x, MAP.hill.z);
  const millH = 15;
  toon.cyl(L.flat, 3.6, 5.2, millH, xf(top.x, top.y + millH / 2 - 0.5, top.z), rgb(C.white), 0.14, 8);
  toon.batch.geometry(L.flat, new THREE.CylinderGeometry(4.35, 4.8, 1.3, 8), xf(top.x, top.y + 6.2, top.z), rgb(C.red));
  toon.shape(L.flat, new THREE.ConeGeometry(4.3, 4.2, 8), xf(top.x, top.y + millH + 1.5, top.z), rgb(C.barnRed), 0.14);
  const yaw = -1.75;
  const hub = v3(top.x + Math.sin(yaw + Math.PI) * 4.6, top.y + millH - 0.6, top.z + Math.cos(yaw + Math.PI) * 4.6);
  toon.box(L.flat, 2.2, 3.4, 0.2, xf(top.x + Math.sin(yaw + Math.PI) * 4.1, top.y + 2, top.z + Math.cos(yaw + Math.PI) * 4.1, yaw), rgb(C.blue), 0.08);
  const blades = mill.part([
    { g: new THREE.CylinderGeometry(0.7, 0.7, 2, 8), m: xf(0, 0, 0, 0, Math.PI / 2), color: rgb(C.dark) },
    ...[0, 1, 2, 3].flatMap((i) => {
      const a = (i * Math.PI) / 2;
      const r = xf(0, 0, -1, 0, 0, a);
      return [
        { g: new THREE.BoxGeometry(0.4, 13, 0.3), m: r.clone().multiply(xf(0, 6.8, 0)), color: rgb(C.trunk) },
        { g: new THREE.BoxGeometry(3, 10, 0.12), m: r.clone().multiply(xf(1.55, 8, 0)), color: rgb(C.cream), t: 0.1 },
      ];
    }),
  ]);

  // Set pieces in the ground that don't need their own zone: a tumbledown bridge either side of the milk river.
  {
    const p = sampleAt(track, track.marks[47] ?? 1294);
    for (const side of [-1, 1]) {
      for (const d of [-1, 2]) {
        const a = frame(p, side * (limitOf(p) + 0.2), 0);
        toon.beam(L.wood, a.clone().setY(1.5).add(v3(-d * 1.6, 0, 0)), a.clone().setY(5).add(v3(-d * 1.6, 0, 0)), 0.4, 0.4, [1, 1, 1], 0.06);
      }
      const pole = frame(p, side * (limitOf(p) + 0.3), 2.8);
      toon.cyl(L.flat, 0.16, 0.16, 5.4, xf(pole.x, pole.y, pole.z), rgb(C.white), 0.05, 6);
      toon.ball(L.flat, 0.44, xf(pole.x, pole.y + 2.9, pole.z), rgb(C.red), 0.06);
    }
  }

  const m = new THREE.Matrix4();
  return {
    group: mill.done(),
    update(time) {
      mill.set(blades, pose(m, hub.x, hub.y, hub.z, yaw, 0, time * 0.9));
      mill.flush();
    },
  };
}
