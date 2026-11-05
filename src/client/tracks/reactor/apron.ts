import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Track } from '../../../shared/track';
import { HAIRPIN } from '../../../shared/tracks/reactor';
import { ball, Batch, xf, type RGB } from '../../render/geometry';
import { mulberry32 } from '../../../shared/rng';
import { addPointLight } from '../../render/ps1';
import { frame, headingAt } from '../../render/road';
import type { TrackIndex } from '../../render/trackindex';
import type { Pulse } from './hall';
import { beacon, column, edgeLoft, lattice, pipe, type Beacon } from './kit';
import type { ReactorMats } from './materials';

const DARK: RGB = [0.3, 0.32, 0.36];
const YELLOW: RGB = [1, 0.8, 0.2];
const CYAN: RGB = [0.35, 1, 0.95];

export interface Apron {
  beacons: Beacon[];
  vents: THREE.Vector3[];
}

/** Barriers for every stretch: concrete outside, a steel kerb with a neon top inside, rails on the decks. */
export function buildBarriers(track: Track, batch: Batch, m: ReactorMats): void {
  edgeLoft(track, batch, [
    [0, 0],
    [0, 0.45],
    [0.2, 1],
    [0.5, 1],
    [0.7, 0.45],
    [0.7, -0.6],
  ], (p) => (p.cover === 'open' ? m.concrete : null), 2, [0.95, 0.9, 0.85]);
  edgeLoft(track, batch, [
    [0, 0],
    [0, 1],
    [0.5, 1],
    [0.5, 0],
  ], (p) => (p.cover === 'indoor' ? m.plateIn : null), 2, [0.55, 0.58, 0.62]);
  edgeLoft(track, batch, [
    [0.1, 1],
    [0.1, 1.18],
    [0.4, 1.18],
    [0.4, 1],
  ], (p) => (p.cover === 'indoor' ? m.neon : null), 2, CYAN);
}

/** The launch apron: the start gantry, floodlight masts, the fuel farm, the kickers' dressing and the skyline. */
export function buildApron(track: Track, index: TrackIndex, batch: Batch, m: ReactorMats, pulses: Pulse[]): Apron {
  const beacons: Beacon[] = [];
  const vents: THREE.Vector3[] = [];

  // The start gantry: two lattice towers, a truss, the start lights and screens.
  {
    const p = sampleAt(track, 0);
    const h = headingAt(p);
    const span = limitOf(p) + 1.6;
    for (const side of [-1, 1]) {
      const b = frame(p, side * span, 0);
      lattice(batch, m.paintOut, b, 12, 1.6, h, DARK);
      batch.box(m.stripesOut, 2.2, 1, 2.2, xf(b.x, 0.5, b.z, h));
      beacons.push(beacon(batch, m, b.clone().setY(12.4), side > 0 ? 1 : 2, true));
    }
    for (const y of [9.6, 11.2]) {
      const a = frame(p, -span, y);
      const b = frame(p, span, y);
      batch.beam(m.paintOut, a, b, 0.5, 0.5, DARK);
    }
    for (let k = -4; k <= 4; k++) {
      const a = frame(p, (k * span) / 4.5, 9.6);
      const b = frame(p, ((k + 0.5) * span) / 4.5, 11.2);
      if (k < 4) batch.beam(m.paintOut, a, b, 0.25, 0.25, DARK);
    }
    for (let k = -2; k <= 2; k++) {
      const at = frame(p, k * 1.6, 8.6);
      batch.box(m.paintOut, 1.2, 1.6, 0.6, xf(at.x, at.y + 0.4, at.z, h), DARK);
      batch.box(m.neon, 0.7, 0.7, 0.7, xf(at.x, at.y + 0.45, at.z, h), k === 0 ? [0.3, 1, 0.3] : [1, 0.2, 0.15]);
    }
    for (const dir of [0, Math.PI]) {
      for (const side of [-1, 1]) {
        const at = frame(p, side * (span - 3.2), 10.4);
        batch.geometry(m.screen, new THREE.PlaneGeometry(3.6, 1.8), xf(at.x, at.y, at.z, h + dir).multiply(xf(0, 0, 0.4)));
      }
    }
    const c = new THREE.Color(1.1, 1.15, 1.2);
    pulses.push({ light: addPointLight(frame(p, 0, 7), c, 26), base: c, speed: 0, phase: 0, depth: 0 });
  }

  // Floodlight masts round the apron.
  for (const [a, b] of zoneRanges(track, 'apron')) {
    for (let s = a + 30, k = 0; s < b - 10; s += 64, k++) {
      const p = sampleAt(track, s);
      const side = k % 2 ? 1 : -1;
      const base = frame(p, side * (limitOf(p) + 5), 0);
      base.y = 0;
      if (index.nearest(base.x, base.z, 40) && index.nearest(base.x, base.z, 40)!.d < limitOf(p) + 3) continue;
      lattice(batch, m.paintOut, base, 18, 1.4, headingAt(p), DARK);
      const head = base.clone().setY(18.4);
      batch.box(m.paintOut, 4, 1.4, 1, xf(head.x, head.y, head.z, headingAt(p)), DARK);
      for (const o of [-1.2, 0, 1.2]) {
        const lens = new THREE.Vector3(o, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), headingAt(p)).add(head);
        batch.box(m.neon, 0.9, 0.9, 1.1, xf(lens.x, lens.y, lens.z, headingAt(p)), [1, 0.95, 0.8]);
      }
      const c = new THREE.Color(1.15, 1.05, 0.85);
      pulses.push({ light: addPointLight(frame(p, side * 2, 10), c, 34), base: c, speed: 0, phase: 0, depth: 0 });
      if (k % 2 === 0) beacons.push(beacon(batch, m, head.clone().setY(19.3), k));
    }
  }

  // The blast deflector kicker: striped fins either side of its hump.
  for (const [a] of zoneRanges(track, 'apron').slice(0, 1)) {
    const p = sampleAt(track, a + 57);
    const h = headingAt(p);
    for (const side of [-1, 1]) {
      const at = frame(p, side * (limitOf(p) + 1.6), 0);
      batch.geometry(m.stripesOut, new THREE.BoxGeometry(1, 3.2, 10), xf(at.x, 1.4, at.z, h, 0.28, side * 0.2));
      vents.push(frame(p, side * (limitOf(p) + 4), 0));
    }
  }

  // The fuel farm in the hairpin, the fuel line that runs under the kicker, and tanks along the south side.
  {
    const { x, z } = HAIRPIN;
    batch.geometry(m.tank, ball(6.5, 1, 1, 1, 12), xf(x, 8.5, z));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      column(batch, m.paintOut, x + Math.cos(a) * 5, z + Math.sin(a) * 5, 0, 7, 0.5, -a, DARK);
    }
    batch.geometry(m.paintOut, new THREE.CylinderGeometry(6.6, 6.6, 0.4, 12, 1, true), xf(x, 8.5, z), YELLOW);
    beacons.push(beacon(batch, m, new THREE.Vector3(x, 15.2, z), 5));
    for (const tx of [-130, -60, -20]) {
      const tz = 214;
      batch.geometry(m.tank, new THREE.CylinderGeometry(4.5, 4.5, 16, 12), xf(tx, 5.5, tz, 0, 0, Math.PI / 2));
      for (const o of [-5, 5]) batch.box(m.paintOut, 1, 3, 7, xf(tx + o, 1.5, tz), DARK);
    }
    pipe(batch, m.paintOut, new THREE.Vector3(-89, 1, 150), new THREE.Vector3(-89, 1, 214), 0.9, 8, 4, [0.85, 0.2, 0.15]);
    pipe(batch, m.paintOut, new THREE.Vector3(-130, 1.5, 214), new THREE.Vector3(-20, 1.5, 214), 0.6, 8, 4, [0.85, 0.2, 0.15]);
    for (const vz of [160, 204]) vents.push(new THREE.Vector3(-89, 0.2, vz));
  }

  // Skyline: station blocks with lit windows, red aircraft lights, dishes and masts, well clear of the track.
  const rng = mulberry32(77);
  for (let k = 0; k < 34; k++) {
    const a = (k / 34) * Math.PI * 2 + rng() * 0.1;
    const r = 300 + rng() * 120;
    const x = -80 + Math.cos(a) * r;
    const z = -10 + Math.sin(a) * r;
    if (index.nearest(x, z, 60)) continue;
    const w = 24 + rng() * 30;
    const d = 18 + rng() * 24;
    const tall = 18 + rng() * 50;
    const yaw = -a;
    batch.box(m.windows, w, tall, d, xf(x, tall / 2, z, yaw));
    batch.box(m.cladding, w + 1, 1, d + 1, xf(x, tall + 0.5, z, yaw), DARK);
    batch.box(m.neon, 1, 1, 1, xf(x, tall + 1.5, z), [1, 0.15, 0.1]);
    if (k % 3 === 0) {
      batch.box(m.paintOut, 0.6, 22, 0.6, xf(x, tall + 11, z), DARK);
      batch.box(m.neon, 1.2, 1.2, 1.2, xf(x, tall + 22, z), [1, 0.15, 0.1]);
    } else if (k % 3 === 1) {
      const dish = new THREE.SphereGeometry(7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.4);
      batch.geometry(m.paintOut, dish, xf(x, tall + 6, z, yaw, Math.PI * 0.7), [0.75, 0.78, 0.8]);
      batch.box(m.paintOut, 1.2, 6, 1.2, xf(x, tall + 3, z), DARK);
    }
  }

  // Film lights on stands either side of the start straight, and a camera crane at the hairpin: it's a set.
  for (const [x, z, yaw] of [
    [-16, 60, -1.2],
    [16, 100, 1.4],
    [20, 200, 2.6],
  ] as const) {
    filmLight(batch, m, new THREE.Vector3(x, 0, z), yaw, pulses);
  }
  crane(batch, m, new THREE.Vector3(72, 0, 160), -2.2);
  return { beacons, vents };
}

function filmLight(batch: Batch, m: ReactorMats, at: THREE.Vector3, yaw: number, pulses: Pulse[]): void {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    batch.beam(m.paintOut, at.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4)), at.clone().setY(4), 0.15, 0.15, DARK);
  }
  batch.box(m.paintOut, 0.2, 2, 0.2, xf(at.x, 5, at.z), DARK);
  const head = xf(at.x, 6.2, at.z, yaw, -0.35);
  batch.geometry(m.paintOut, new THREE.BoxGeometry(1.8, 1.4, 1.6), head, [0.15, 0.15, 0.16]);
  batch.geometry(m.neon, new THREE.PlaneGeometry(1.5, 1.1), head.clone().multiply(xf(0, 0, -0.82, Math.PI)), [1, 0.95, 0.85]);
  for (const s of [-1, 1]) batch.geometry(m.paintOut, new THREE.BoxGeometry(0.1, 1.2, 0.8), head.clone().multiply(xf(s * 1, 0, -1.1, s * 0.5)), [0.15, 0.15, 0.16]);
  const c = new THREE.Color(1, 0.95, 0.8);
  pulses.push({ light: addPointLight(at.clone().add(new THREE.Vector3(-Math.sin(yaw) * 7, 1.5, -Math.cos(yaw) * 7)), c, 22), base: c, speed: 0, phase: 0, depth: 0 });
}

function crane(batch: Batch, m: ReactorMats, at: THREE.Vector3, yaw: number): void {
  batch.box(m.paintOut, 3, 1, 4, xf(at.x, 0.5, at.z, yaw), DARK);
  batch.box(m.paintOut, 0.6, 6, 0.6, xf(at.x, 4, at.z, yaw), DARK);
  const pivot = at.clone().setY(7);
  const dir = new THREE.Vector3(-Math.sin(yaw), 0.35, -Math.cos(yaw)).normalize();
  const tip = pivot.clone().addScaledVector(dir, 14);
  const tail = pivot.clone().addScaledVector(dir, -5);
  batch.beam(m.paintOut, tail, tip, 0.5, 0.5, DARK);
  batch.box(m.paintOut, 1.6, 1.6, 1.6, xf(tail.x, tail.y - 0.6, tail.z, yaw), [0.5, 0.5, 0.52]);
  batch.box(m.paintOut, 1, 1, 1.8, xf(tip.x, tip.y - 1, tip.z, yaw), [0.12, 0.12, 0.13]);
  batch.geometry(m.paintOut, new THREE.CylinderGeometry(0.4, 0.5, 0.8, 8), xf(tip.x, tip.y - 1, tip.z, yaw, Math.PI / 2).multiply(xf(0, 1.2, 0)), [0.12, 0.12, 0.13]);
}
