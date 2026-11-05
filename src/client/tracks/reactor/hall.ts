import * as THREE from 'three';
import { toMain } from '../../../shared/course';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { BASE, CORE, POOL } from '../../../shared/tracks/reactor';
import { ball, Batch, xf, type RGB } from '../../render/geometry';
import { addPointLight, type PointLight } from '../../render/ps1';
import { atJunction, frame, headingAt } from '../../render/road';
import { allSamples } from '../../render/trackindex';
import type { Rig } from './fx';
import { HALLS, inHalls } from './ground';
import { column, pipe, railing, sheet, wallFace } from './kit';
import type { ReactorMats } from './materials';

/** A light whose colour pulses round `base`. */
export interface Pulse {
  light: PointLight;
  base: THREE.Color;
  speed: number;
  phase: number;
  depth: number;
}

export const REACTOR_ROOF = 22;
export const GOO_ROOF = 12;
/** The hole in the reactor hall roof the core rises through. */
const HOLE = 17;

type Wall = [ax: number, az: number, bx: number, bz: number, top: number];
const WALLS: Wall[] = [
  [-112, -248, 20, -248, REACTOR_ROOF],
  [20, -248, 20, -84, REACTOR_ROOF],
  [20, -84, -76, -84, REACTOR_ROOF],
  [-112, -132, -112, -248, REACTOR_ROOF],
  [-76, -84, -76, 24, GOO_ROOF],
  [-76, 24, -236, 24, GOO_ROOF],
  [-236, 24, -236, -132, GOO_ROOF],
  [-236, -132, -112, -132, GOO_ROOF],
];

const CYAN: RGB = [0.35, 1, 0.95];
const GREEN: RGB = [0.5, 1, 0.35];
const DARK: RGB = [0.3, 0.32, 0.36];
const ORANGE: RGB = [1, 0.5, 0.12];

export interface Hall {
  pulses: Pulse[];
  /** The core's containment rings, which ride up and down it. */
  rings: number[];
}

export function buildHall(track: Track, batch: Batch, m: ReactorMats, neonRig: Rig): Hall {
  const pulses: Pulse[] = [];
  const low = allSamples(track).filter((p) => p.y < 10);
  const doorAt = (x: number, z: number): Sample | null => {
    for (const p of low) if (Math.hypot(p.x - x, p.z - z) < limitOf(p) + 1.5) return p;
    return null;
  };

  // Walls, inside and out, with doorways where the road goes through.
  for (const [ax, az, bx, bz, top] of WALLS) {
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    let n = new THREE.Vector3(-dz, 0, dx);
    if (!inHalls((ax + bx) / 2 + n.x * 1.5, (az + bz) / 2 + n.z * 1.5)) n = n.negate();
    const out = n.clone().negate();
    const panels = Math.round(len / 4);
    const door: (Sample | null)[] = [];
    for (let i = 0; i < panels; i++) door.push(doorAt(ax + dx * (i + 0.5) * (len / panels), az + dz * (i + 0.5) * (len / panels)));
    for (let i = 0; i < panels; i++) {
      const u0 = (i * len) / panels;
      const u1 = ((i + 1) * len) / panels;
      const x0 = ax + dx * u0;
      const z0 = az + dz * u0;
      const x1 = ax + dx * u1;
      const z1 = az + dz * u1;
      const d = door[i];
      const y0 = d ? d.y + 8.5 : 0;
      wallFace(batch, m.wall, x0 + n.x * 0.3, z0 + n.z * 0.3, x1 + n.x * 0.3, z1 + n.z * 0.3, y0, top, n, 8, 4);
      wallFace(batch, m.windows, x0 - n.x * 0.3, z0 - n.z * 0.3, x1 - n.x * 0.3, z1 - n.z * 0.3, y0, top, out, 14, 7);
      if (d) {
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        batch.box(m.stripesOut, len / panels, 0.8, 1, xf(mx, y0 + 0.4, mz, Math.atan2(-dx, -dz) + Math.PI / 2));
      }
      // Jambs and slid-back blast doors at each side of a doorway.
      const edge = (k: number) => i + k >= 0 && i + k < panels && !door[i + k];
      if (d && (edge(-1) || edge(1))) {
        const k = edge(-1) ? 0 : 1;
        const jx = ax + dx * (i + k) * (len / panels);
        const jz = az + dz * (i + k) * (len / panels);
        const yaw = Math.atan2(-dx, -dz) + Math.PI / 2;
        column(batch, m.stripesOut, jx, jz, 0, d.y + 8.5, 1.4, yaw);
        const back = k === 0 ? -1 : 1;
        batch.box(m.plateOut, 4, d.y + 8, 0.8, xf(jx + dx * back * 2 + n.x * 1.2, (d.y + 8) / 2, jz + dz * back * 2 + n.z * 1.2, yaw), [0.75, 0.6, 0.35]);
        const lampAt = new THREE.Vector3(jx - n.x * 1.2, d.y + 9.6, jz - n.z * 1.2);
        batch.box(m.neon, 0.6, 0.6, 0.6, xf(lampAt.x, lampAt.y, lampAt.z), [1, 0.35, 0.1]);
        pulses.push({ light: addPointLight(lampAt, new THREE.Color(1.4, 0.4, 0.1), 16), base: new THREE.Color(1.4, 0.4, 0.1), speed: 5, phase: k * 3, depth: 0.8 });
      }
    }
    // Top cap.
    batch.box(m.paintOut, len, 0.5, 0.9, xf((ax + bx) / 2, top + 0.25, (az + bz) / 2, Math.atan2(-dx, -dz) + Math.PI / 2), DARK);
  }

  // The step up from the goo hall's roof to the reactor hall's, outside.
  for (const [ax, az, bx, bz, n] of [
    [-112, -132, -112, -84, new THREE.Vector3(-1, 0, 0)],
    [-112, -84, -76, -84, new THREE.Vector3(0, 0, 1)],
  ] as const) {
    wallFace(batch, m.windows, ax + n.x * 0.3, az + n.z * 0.3, bx + n.x * 0.3, bz + n.z * 0.3, GOO_ROOF, REACTOR_ROOF, n, 8, 8);
  }

  // Roofs: ceiling panels inside, cladding on top, and roof trusses.
  const [rx0, rx1, rz0, rz1] = HALLS[0];
  for (let x = rx0; x < rx1; x += 8) {
    for (let z = rz0; z < rz1; z += 8) {
      const cx = Math.min(x + 8, rx1);
      const cz = Math.min(z + 8, rz1);
      if (Math.hypot((x + cx) / 2 - CORE.x, (z + cz) / 2 - CORE.z) < HOLE) continue;
      sheet(batch, m.tube, x, cx, z, cz, REACTOR_ROOF, false, 8, 8);
      sheet(batch, m.cladding, x, cx, z, cz, REACTOR_ROOF + 0.5, true, 8, 8);
    }
  }
  const [gx0, gx1, gz0, gz1] = HALLS[1];
  for (let x = gx0; x < gx1; x += 8) {
    for (let z = gz0; z < gz1; z += 8) {
      const cx = Math.min(x + 8, gx1);
      const cz = Math.min(z + 8, gz1);
      if ((x + cx) / 2 > rx0 && (z + cz) / 2 < rz1) continue;
      sheet(batch, m.tube, x, cx, z, cz, GOO_ROOF, false, 8, 8);
      sheet(batch, m.cladding, x, cx, z, cz, GOO_ROOF + 0.5, true, 8, 8);
    }
  }
  for (let x = rx0 + 12; x < rx1; x += 16) {
    batch.box(m.paintIn, 0.8, 1.6, rz1 - rz0, xf(x, REACTOR_ROOF - 0.8, (rz0 + rz1) / 2), DARK);
  }
  for (let z = gz0 + 12; z < gz1; z += 16) {
    const x1 = z < rz1 ? rx0 : gx1;
    batch.box(m.paintIn, x1 - gx0, 1.2, 0.8, xf((gx0 + x1) / 2, GOO_ROOF - 0.6, z), DARK);
  }

  buildCore(batch, m, pulses);
  const rings = coreRings(neonRig);
  buildRing(track, batch, m, pulses);
  buildConduits(batch, m);
  buildPool(track, batch, m, pulses);
  return { pulses, rings };
}

/** The reactor: a glowing vessel in a cage on a plinth, through the roof and on up as a beam into the sky. */
function buildCore(batch: Batch, m: ReactorMats, pulses: Pulse[]): void {
  const { x, z } = CORE;
  batch.geometry(m.concreteIn, new THREE.CylinderGeometry(17, 18.5, 1.6, 16), xf(x, 0.8, z));
  batch.geometry(m.stripesIn, new THREE.CylinderGeometry(15.5, 15.5, 0.25, 16, 1, true), xf(x, 1.7, z));
  batch.geometry(m.paintIn, new THREE.CylinderGeometry(11.5, 13, 2.4, 16), xf(x, 2.8, z), DARK);
  const vessel = new THREE.CylinderGeometry(8, 8, 34, 16, 6, true);
  const uv = vessel.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 4);
  batch.geometry(m.core, vessel, xf(x, 4 + 17, z));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    column(batch, m.paintIn, x + Math.cos(a) * 9.4, z + Math.sin(a) * 9.4, 4, 36, 0.9, -a, DARK);
  }
  for (const y of [4.5, 13, 21, 29, 36.5]) {
    batch.geometry(m.paintOut, new THREE.TorusGeometry(9.6, 0.6, 4, 16), xf(x, y, z, 0, Math.PI / 2), DARK);
  }
  // The crown, with spikes, above the roof.
  batch.geometry(m.paintOut, new THREE.CylinderGeometry(6, 10.5, 3, 16), xf(x, 38.5, z), DARK);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    batch.beam(m.paintOut, new THREE.Vector3(x + Math.cos(a) * 7, 39, z + Math.sin(a) * 7), new THREE.Vector3(x + Math.cos(a) * 4, 47, z + Math.sin(a) * 4), 0.7, 0.7, DARK);
    batch.geometry(m.neon, ball(0.7, 1, 1, 1, 6), xf(x + Math.cos(a) * 4, 47.3, z + Math.sin(a) * 4), CYAN);
  }
  batch.geometry(m.core, ball(4, 1, 1, 1, 10), xf(x, 42, z));
  batch.geometry(m.shine, new THREE.CylinderGeometry(3, 5, 260, 8, 1, true), xf(x, 42 + 130, z), [0.15, 0.5, 0.4]);
  // A collar round the hole in the roof.
  batch.geometry(m.paintOut, new THREE.CylinderGeometry(HOLE + 1, HOLE + 1, 1.2, 16, 1, true), xf(x, REACTOR_ROOF + 0.4, z), DARK);
  batch.geometry(m.neon, new THREE.CylinderGeometry(HOLE + 1.05, HOLE + 1.05, 0.3, 16, 1, true), xf(x, REACTOR_ROOF + 0.9, z), CYAN);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const at = new THREE.Vector3(x + Math.cos(a) * 15, 8, z + Math.sin(a) * 15);
    const base = new THREE.Color(0.5, 1.6, 1.2);
    pulses.push({ light: addPointLight(at, base, 34), base, speed: 2.2, phase: k * 0.6, depth: 0.35 });
  }
}

function coreRings(neonRig: Rig): number[] {
  return [0, 1, 2].map(() => neonRig.add(new THREE.TorusGeometry(11.2, 0.5, 4, 20), new THREE.Matrix4().makeRotationX(Math.PI / 2), CYAN));
}

/** Where the core rings are at `time`. */
export function placeRings(neonRig: Rig, rings: number[], time: number): void {
  rings.forEach((part, i) => {
    const t = (time * 0.12 + i / 3) % 1;
    const y = 5 + 30 * t;
    const squeeze = 1 - 0.08 * Math.sin(t * Math.PI);
    neonRig.set(part, new THREE.Matrix4().compose(new THREE.Vector3(CORE.x, y, CORE.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 0.5 + i), new THREE.Vector3(squeeze, 1, squeeze)));
  });
}

/** The gantry ring round the core: columns, cross beams, rails, lamp posts and a neon edge. */
function buildRing(track: Track, batch: Batch, m: ReactorMats, pulses: Pulse[]): void {
  for (const [a, b] of zoneRanges(track, 'ring')) {
    for (let s = a, k = 0; s < b; s += 6, k++) {
      const p = sampleAt(track, s);
      if (p.y < 2.2) continue;
      const h = headingAt(p);
      const limit = limitOf(p);
      for (const side of [-1, 1]) {
        const foot = frame(p, side * (limit - 0.3), -0.3);
        column(batch, m.paintIn, foot.x, foot.z, 0, foot.y, 0.7, h, DARK);
      }
      const mid = frame(p, 0, -0.55);
      batch.box(m.paintIn, limit * 2, 0.5, 0.6, xf(mid.x, mid.y, mid.z, h, 0, p.bank), ORANGE);
      if (k % 5 === 2) {
        const pole = frame(p, limit + 0.4, 0);
        batch.box(m.paintIn, 0.3, 6, 0.3, xf(pole.x, pole.y + 3, pole.z, h), DARK);
        const head = frame(p, limit - 1.4, 6);
        batch.beam(m.paintIn, pole.clone().setY(pole.y + 6), head, 0.3, 0.3, DARK);
        batch.box(m.neon, 1.6, 0.25, 0.6, xf(head.x, head.y - 0.2, head.z, h), [0.8, 1, 1]);
        const base = new THREE.Color(0.9, 1.2, 1.25);
        pulses.push({ light: addPointLight(head.clone().setY(head.y - 1.5), base, 20), base, speed: 0, phase: 0, depth: 0 });
      }
    }
    for (const side of [-1, 1]) {
      railing(batch, m.paintIn, track, a + 2, b - 2, side, [0.9, 0.75, 0.2], (s) => sampleAt(track, s).y < 2.4);
    }
  }
}

/** Glowing conduits from the core out to the walls, over the ring, and along the goo hall walls. */
function buildConduits(batch: Batch, m: ReactorMats): void {
  const [x0, x1, z0, z1] = HALLS[0];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let r = 11;
    while (r < 200) {
      const x = CORE.x + dx * (r + 1);
      const z = CORE.z + dz * (r + 1);
      if (x < x0 + 1 || x > x1 - 1 || z < z0 + 1 || z > z1 - 1) break;
      r += 1;
    }
    const y = 17 + (k % 2) * 1.6;
    const from = new THREE.Vector3(CORE.x + dx * 9.6, y, CORE.z + dz * 9.6);
    const to = new THREE.Vector3(CORE.x + dx * r, y, CORE.z + dz * r);
    pipe(batch, m.pulse, from, to, 0.7, 8, 10, k % 2 ? CYAN : GREEN);
    for (let t = 14; t < r; t += 7) {
      batch.geometry(m.paintIn, new THREE.CylinderGeometry(0.95, 0.95, 0.5, 8), new THREE.Matrix4().compose(new THREE.Vector3(CORE.x + dx * t, y, CORE.z + dz * t), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, 0, dz)), new THREE.Vector3(1, 1, 1)), DARK);
    }
    batch.box(m.paintIn, 2.4, 2.4, 2.4, xf(to.x, y, to.z, -a), DARK);
  }
  // Along the goo hall's long walls, at head height for an RC car, lighting the floor.
  const runs: [number, number, number, number][] = [
    [-74.6, -82, -74.6, 22],
    [-234.6, 22, -234.6, -130],
    [-110, -130.6, -234, -130.6],
  ];
  for (const [ax, az, bx, bz] of runs) {
    for (const y of [3, 4.4]) pipe(batch, m.pulse, new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz), 0.45, 6, 8, y < 4 ? GREEN : CYAN);
  }
}

/** The coolant pool: glowing goo, a striped kerb, lights in it, and the catwalk across it. */
function buildPool(track: Track, batch: Batch, m: ReactorMats, pulses: Pulse[]): void {
  sheet(batch, m.goo, POOL.x0, POOL.x1, POOL.z0, POOL.z1, POOL.level, true, 10, 4);
  const fork = track.routes[0];
  const nearFork = (x: number, z: number) =>
    fork.track.samples.some((p) => p.s > fork.rfrom && p.s < fork.rto && Math.hypot(p.x - x, p.z - z) < limitOf(p) + 1.5);
  const kerb = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 4);
    for (let i = 0; i < n; i++) {
      const x = ax + ((bx - ax) * (i + 0.5)) / n;
      const z = az + ((bz - az) * (i + 0.5)) / n;
      if (nearFork(x, z)) continue;
      const yaw = Math.atan2(-(bx - ax), -(bz - az));
      batch.box(m.stripesIn, 0.6, 0.6, len / n, xf(x, 0.3, z, yaw));
      if (i % 3 === 1) batch.box(m.paintIn, 0.12, 1.1, 0.12, xf(x, 0.85, z, yaw), [0.9, 0.75, 0.2]);
    }
  };
  kerb(POOL.x0, POOL.z0, POOL.x1, POOL.z0);
  kerb(POOL.x1, POOL.z0, POOL.x1, POOL.z1);
  kerb(POOL.x1, POOL.z1, POOL.x0, POOL.z1);
  kerb(POOL.x0, POOL.z1, POOL.x0, POOL.z0);
  for (const [x, z] of [
    [-190, -100],
    [-140, -100],
    [-190, -40],
    [-135, -35],
  ]) {
    const base = new THREE.Color(0.55, 1.5, 0.35);
    pulses.push({ light: addPointLight(new THREE.Vector3(x, 1, z), base, 30), base, speed: 1.3, phase: x * 0.1, depth: 0.3 });
  }

  // The catwalk: legs down into the goo, rails, and the torn ends of its broken span.
  const t = fork.track;
  for (const [a, b] of zoneRanges(t, 'catwalk')) {
    const s0 = Math.max(a, fork.rfrom);
    const s1 = Math.min(b, fork.rto);
    let wasGap = false;
    for (let s = s0; s < s1; s += 1) {
      const p = sampleAt(t, s);
      const gap = p.y < BASE - 0.4;
      if (gap !== wasGap) {
        // A torn end: plates bent down into the goo and a snapped girder.
        const q = sampleAt(t, gap ? s - 1.5 : s + 0.5);
        const h = headingAt(q);
        const dir = gap ? 1 : -1;
        for (const o of [-2.5, 0, 2.5]) {
          const top = frame(q, o, -0.1);
          batch.beam(m.gratingIn, top, top.clone().add(new THREE.Vector3(q.tx * dir * 1.6, -2.2 - Math.abs(o) * 0.3, q.tz * dir * 1.6)), 1.6, 0.2);
        }
        const g = frame(q, -limitOf(q) + 0.4, -0.3);
        batch.beam(m.paintIn, g, g.clone().add(new THREE.Vector3(q.tx * dir * 2.4, 1.6, q.tz * dir * 2.4)), 0.4, 0.4, ORANGE);
        batch.box(m.stripesIn, limitOf(q) * 2, 0.5, 0.3, xf(q.x, q.y + 0.25, q.z, h));
      }
      wasGap = gap;
      if (gap || Math.round(s) % 6 !== 0 || atJunction(track, toMain(track, 1, s), 4)) continue;
      const h = headingAt(p);
      for (const side of [-1, 1]) {
        const foot = frame(p, side * (limitOf(p) - 0.2), -0.3);
        column(batch, m.paintIn, foot.x, foot.z, POOL.floor, foot.y, 0.45, h, DARK);
      }
      const mid = frame(p, 0, -0.45);
      batch.box(m.paintIn, limitOf(p) * 2, 0.4, 0.4, xf(mid.x, mid.y, mid.z, h), ORANGE);
    }
    for (const side of [-1, 1]) {
      railing(batch, m.paintIn, t, s0 + 4, s1 - 4, side, [0.9, 0.75, 0.2], (s) => sampleAt(t, s).y < BASE - 0.1 || atJunction(track, toMain(track, 1, s), 4), 2);
    }
  }
}
