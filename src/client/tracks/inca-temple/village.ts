import * as THREE from 'three';
import { PYRAMID } from '../../../shared/tracks/inca-temple';
import { limitOf, ranges, sampleAt, type Sample, type Track } from '../../../shared/track';
import { Batch, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import { addPointLight } from '../../render/ps1';
import { box, frame, headingAt, rope } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import { flame, v3, type Fire } from './kit';
import type { IncaMats } from './palette';

/** Where Indy's hat lies: this far before the line, this far to the right. */
const HAT = [46, 13] as const;

/** Spots the forest keeps clear for the props: the hat and the far crane. */
export function propSpots(track: Track): { x: number; z: number; r: number }[] {
  const hat = frame(sampleAt(track, track.length - HAT[0]), HAT[1], 0);
  return [
    { x: hat.x, z: hat.z, r: 11 },
    { x: -118, z: -60, r: 9 },
  ];
}

/** A point beside the road, `o` to the right, standing on the ground. */
function ground(terrain: Terrain, p: Sample, o: number): THREE.Vector3 {
  const at = frame(p, o, 0);
  at.y = Math.min(at.y, terrain.height(at.x, at.z));
  return at;
}

/** A round hut: wattle walls, a dark doorway and a tall cone of thatch. */
function hut(batch: Batch, inca: IncaMats, mats: Materials, at: THREE.Vector3, face: number, r: number): void {
  batch.geometry(inca.wattle, new THREE.CylinderGeometry(r, r, 3.2, 8, 1, true), xf(at.x, at.y + 1.4, at.z, face));
  batch.geometry(inca.thatch, new THREE.ConeGeometry(r + 1.3, r * 1.3, 8, 1, true), xf(at.x, at.y + 3 + (r * 1.3) / 2, at.z, face + 0.2));
  const door = new THREE.Vector3(Math.sin(face), 0, Math.cos(face)).multiplyScalar(r + 0.05).add(at);
  batch.geometry(mats.plastic, new THREE.PlaneGeometry(1.4, 2.2), xf(door.x, at.y + 1.1, door.z, face), [0.12, 0.08, 0.06]);
  batch.geometry(mats.planks, new THREE.CylinderGeometry(0.12, 0.12, 1.4, 4), xf(at.x, at.y + 3.2 + r * 1.3, at.z));
}

/** A totem pole: stacked painted faces, a beak and spread wings at the top. */
function totem(batch: Batch, inca: IncaMats, at: THREE.Vector3, face: number, h: number): void {
  const m = xf(at.x, at.y, at.z, face);
  batch.geometry(inca.totem, new THREE.BoxGeometry(1.3, h, 1.3), m.clone().multiply(xf(0, h / 2, 0)));
  batch.geometry(inca.totem, new THREE.BoxGeometry(4.4, 0.7, 0.5), m.clone().multiply(xf(0, h - 1.4, 0, 0, 0, 0)), [0.9, 0.7, 0.5]);
  batch.geometry(inca.gold, new THREE.ConeGeometry(0.35, 1.2, 4), m.clone().multiply(xf(0, h - 0.6, 0.9, 0, Math.PI / 2)));
}

/** Woven pennants strung on a rope between two poles over the road. */
function bunting(batch: Batch, mats: Materials, inca: IncaMats, p: Sample, terrain: Terrain): void {
  const span = limitOf(p) + 1;
  const ends = [-1, 1].map((side) => {
    const foot = ground(terrain, p, side * span);
    box(batch, mats.planks, 0.3, 8, 0.3, xf(foot.x, foot.y + 3.6, foot.z, headingAt(p)));
    return foot.setY(foot.y + 7.2);
  });
  const n = 9;
  let prev = ends[0];
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    const at = ends[0].clone().lerp(ends[1], f);
    at.y -= Math.sin(f * Math.PI) * 1.4;
    rope(batch, mats.rope, prev, at, 0.05);
    prev = at;
    if (k < n) batch.geometry(inca.cloth, new THREE.PlaneGeometry(0.9, 1.2), xf(at.x, at.y - 0.6, at.z, headingAt(p)), k % 2 ? [1, 1, 1] : [0.8, 0.9, 1.1]);
  }
}

/** The jungle village round the log ramp: huts, totems, a campfire and bunting over the road. */
function village(track: Track, batch: Batch, mats: Materials, inca: IncaMats, terrain: Terrain, fires: Fire[]): void {
  const spots: [number, number, number][] = [
    [52, -1, 18], [66, 1, 21], [84, -1, 25], [104, 1, 17], [118, -1, 19], [140, 1, 24], [150, -1, 28], [76, 1, 33],
  ];
  for (const [s, side, o] of spots) {
    const p = sampleAt(track, s);
    const at = ground(terrain, p, side * o);
    hut(batch, inca, mats, at, headingAt(p) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 3 + hash2(s, o, 1) * 1.2);
  }
  for (const [s, side] of [[46, 1], [96, -1], [132, 1], [158, -1]] as const) {
    const p = sampleAt(track, s);
    totem(batch, inca, ground(terrain, p, side * (limitOf(p) + 2.2)), headingAt(p) + Math.PI, 7 + hash2(s, 1, 2) * 2);
  }
  for (const s of [60, 128]) bunting(batch, mats, inca, sampleAt(track, s), terrain);

  // The campfire in the clearing, ringed with stones and logs to sit on.
  const fire = ground(terrain, sampleAt(track, 92), 16);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    batch.geometry(mats.rock, new THREE.DodecahedronGeometry(0.45), xf(fire.x + Math.cos(a) * 1.6, fire.y + 0.2, fire.z + Math.sin(a) * 1.6, a));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    batch.beam(mats.bark, v3(fire.x + Math.cos(a) * 0.9, fire.y + 0.1, fire.z + Math.sin(a) * 0.9), v3(fire.x - Math.cos(a) * 0.3, fire.y + 0.7, fire.z - Math.sin(a) * 0.3), 0.3);
    const seat = v3(fire.x + Math.cos(a + 1) * 4.2, fire.y + 0.35, fire.z + Math.sin(a + 1) * 4.2);
    batch.beam(mats.bark, seat.clone().add(v3(Math.sin(a + 1) * 1.6, 0, -Math.cos(a + 1) * 1.6)), seat.clone().add(v3(-Math.sin(a + 1) * 1.6, 0, Math.cos(a + 1) * 1.6)), 0.6);
  }
  flame(batch, mats, fire.clone().setY(fire.y + 0.3), 2.2, fires, 18, 1.8);

  // Flags on poles at both edges of the log ramp's lip, and logs stacked under it.
  for (const [a, b] of ranges(track, (p) => p.zone === 'village' && p.surface === 'wood')) {
    const lip = sampleAt(track, b);
    for (const side of [-1, 1]) {
      const at = frame(lip, side * (limitOf(lip) + 0.6), 0);
      box(batch, mats.planks, 0.18, 4.6, 0.18, xf(at.x, at.y + 1.8, at.z, headingAt(lip)));
      batch.geometry(inca.cloth, new THREE.PlaneGeometry(2.2, 1.4), xf(at.x, at.y + 3.4, at.z, headingAt(lip) + Math.PI / 2).multiply(xf(side * -1.1, 0, 0)));
    }
    for (let s = a; s < b; s += 1.2) {
      const p = sampleAt(track, s);
      const at = frame(p, 0, -0.45);
      batch.geometry(mats.bark, new THREE.CylinderGeometry(0.45, 0.45, limitOf(p) * 2 + 1.2, 6), xf(at.x, at.y, at.z, headingAt(p), 0, Math.PI / 2), [0.85, 0.7, 0.55]);
    }
  }
}

/** The start gate: two carved stone pillars topped with fire bowls, a log beam with the race banner and Inti's face. */
function startGate(track: Track, batch: Batch, mats: Materials, inca: IncaMats, fires: Fire[]): void {
  const p = sampleAt(track, 0);
  const h = headingAt(p);
  const span = limitOf(p) + 1.6;
  for (const side of [-1, 1]) {
    const at = frame(p, side * span, 0);
    box(batch, inca.stone, 3.2, 1.2, 3.2, xf(at.x, at.y + 0.2, at.z, h));
    box(batch, inca.carved, 2.4, 9, 2.4, xf(at.x, at.y + 5.2, at.z, h));
    box(batch, inca.stone, 3, 0.8, 3, xf(at.x, at.y + 10, at.z, h));
    batch.geometry(inca.gold, new THREE.CylinderGeometry(1.2, 0.6, 0.8, 8), xf(at.x, at.y + 10.8, at.z));
    flame(batch, mats, at.clone().setY(at.y + 11.1), 2.2, fires, 18, 1.6);
  }
  const beam = frame(p, 0, 8.2);
  batch.geometry(mats.bark, new THREE.CylinderGeometry(0.6, 0.6, span * 2 + 2, 7), xf(beam.x, beam.y, beam.z, h, 0, Math.PI / 2), [0.8, 0.65, 0.5]);
  for (const turn of [0, Math.PI]) {
    batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 3.2, 2.2), xf(beam.x, beam.y - 1.9, beam.z, h + turn).multiply(xf(0, 0, 0.1)));
    batch.geometry(inca.sun, new THREE.PlaneGeometry(4.6, 4.6), xf(beam.x, beam.y + 2.3, beam.z, h + turn).multiply(xf(0, 0, 0.1)));
  }
  for (const side of [-1, 1]) {
    rope(batch, mats.rope, frame(p, side * (span - 2.6), 8.2), frame(p, side * (span - 2.6), 7.2), 0.06);
  }
}

/** A film light on a tripod, aimed at `look`, its lens glowing. */
function spotlight(batch: Batch, mats: Materials, at: THREE.Vector3, look: THREE.Vector3, tall: number): void {
  const head = at.clone().setY(at.y + tall);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    batch.beam(mats.metal, head.clone().setY(head.y - 0.6), at.clone().add(v3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4)), 0.1);
  }
  const yaw = Math.atan2(look.x - head.x, look.z - head.z);
  const pitch = -Math.atan2(look.y - head.y, Math.hypot(look.x - head.x, look.z - head.z));
  const m = xf(head.x, head.y, head.z, yaw, pitch);
  batch.geometry(mats.metal, new THREE.BoxGeometry(1.6, 1.4, 1.8), m, [0.35, 0.35, 0.38]);
  batch.geometry(mats.lens, new THREE.CircleGeometry(0.62, 10), m.clone().multiply(xf(0, 0, 0.92)));
  for (const side of [-1, 1]) batch.geometry(mats.metal, new THREE.BoxGeometry(0.05, 1.5, 0.8), m.clone().multiply(xf(side * 0.85, 0, 1.2, side * 0.5)), [0.3, 0.3, 0.32]);
}

/** A camera crane: a dolly, a counterweighted boom and a camera with its lens on the action. */
function crane(batch: Batch, mats: Materials, at: THREE.Vector3, look: THREE.Vector3, reach: number): void {
  const yaw = Math.atan2(look.x - at.x, look.z - at.z);
  const m = xf(at.x, at.y, at.z, yaw);
  const local = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(m);
  batch.geometry(mats.metal, new THREE.BoxGeometry(3, 1, 4.4), m.clone().multiply(xf(0, 0.8, 0)), [0.3, 0.3, 0.32]);
  for (const [x, z] of [[-1.4, -1.8], [1.4, -1.8], [-1.4, 1.8], [1.4, 1.8]]) {
    batch.geometry(mats.plastic, new THREE.CylinderGeometry(0.45, 0.45, 0.4, 8), m.clone().multiply(xf(x, 0.45, z, 0, 0, Math.PI / 2)), [0.15, 0.15, 0.15]);
  }
  batch.beam(mats.metal, local(0, 1.2, 0), local(0, 4.6, 0), 0.6);
  const pivot = local(0, 4.8, 0);
  const tip = local(0, 4.8 + reach * 0.45, reach);
  const tail = local(0, 4.8 - 1.4, -reach * 0.35);
  batch.beam(mats.metal, tail, tip, 0.4);
  batch.geometry(mats.metal, new THREE.BoxGeometry(1.4, 1.4, 1.4), xf(tail.x, tail.y, tail.z, yaw), [0.4, 0.4, 0.42]);
  rope(batch, mats.rope, pivot.clone().setY(pivot.y + 2), tip, 0.04);
  rope(batch, mats.rope, pivot.clone().setY(pivot.y + 2), tail, 0.04);
  batch.beam(mats.metal, pivot, pivot.clone().setY(pivot.y + 2), 0.15);
  const cam = tip.clone().setY(tip.y - 0.8);
  const cm = xf(cam.x, cam.y, cam.z, Math.atan2(look.x - cam.x, look.z - cam.z), -Math.atan2(look.y - cam.y, Math.hypot(look.x - cam.x, look.z - cam.z)));
  batch.geometry(mats.plastic, new THREE.BoxGeometry(1.1, 1.2, 1.8), cm, [0.2, 0.2, 0.22]);
  batch.geometry(mats.plastic, new THREE.CylinderGeometry(0.35, 0.45, 0.8, 8), cm.clone().multiply(xf(0, 0, 1.2, 0, Math.PI / 2)), [0.1, 0.1, 0.1]);
  batch.geometry(mats.lens, new THREE.CircleGeometry(0.3, 8), cm.clone().multiply(xf(0, 0, 1.62)));
  for (const z of [-0.4, 0.5]) batch.geometry(mats.plastic, new THREE.CylinderGeometry(0.55, 0.55, 0.2, 10), cm.clone().multiply(xf(0, 1.1, z, 0, 0, Math.PI / 2)), [0.15, 0.15, 0.15]);
}

/** Indy's hat, dropped by the start at RC-car scale, with a coiled bullwhip beside it. */
function fedora(batch: Batch, mats: Materials, inca: IncaMats, at: THREE.Vector3, yaw: number): void {
  const felt: RGB = [0.62, 0.42, 0.26];
  const m = xf(at.x, at.y, at.z, yaw, 0.08, -0.06, 1.35);
  batch.geometry(inca.felt, new THREE.CylinderGeometry(3.6, 3.8, 0.35, 14), m.clone().multiply(xf(0, 0.3, 0)), felt);
  batch.geometry(inca.felt, new THREE.CylinderGeometry(1.9, 2.3, 2.4, 12), m.clone().multiply(xf(0, 1.6, 0)), felt);
  batch.geometry(inca.felt, new THREE.CylinderGeometry(2.33, 2.33, 0.6, 12, 1, true), m.clone().multiply(xf(0, 0.8, 0)), [0.2, 0.13, 0.08]);
  batch.geometry(inca.felt, new THREE.BoxGeometry(1.2, 0.5, 3.6), m.clone().multiply(xf(0, 2.75, 0)), [0.5, 0.33, 0.2]);
  const whip = at.clone().add(v3(Math.cos(yaw) * 7.5, 0, -Math.sin(yaw) * 7.5));
  for (let k = 0; k < 3; k++) {
    batch.geometry(mats.bark, new THREE.TorusGeometry(1.6 - k * 0.15, 0.16, 4, 14), xf(whip.x, whip.y + 0.15 + k * 0.3, whip.z, k, Math.PI / 2), [0.5, 0.32, 0.2]);
  }
  batch.beam(mats.bark, whip.clone().add(v3(1.5, 0.2, 0)), whip.clone().add(v3(4.5, 0.15, 2.5)), 0.22, 0.22, [0.5, 0.32, 0.2]);
}

/** The film crew's kit: lights round the start and the pyramid, and a crane filming the summit jump. */
function studio(track: Track, batch: Batch, mats: Materials, inca: IncaMats, terrain: Terrain): void {
  const lights: [number, number, number][] = [
    [12, -1, 12], [-24, 1, 12], [-60, -1, 11],
  ];
  for (const [s, side, o] of lights) {
    const p = sampleAt(track, s);
    const at = ground(terrain, p, side * o);
    spotlight(batch, mats, at, frame(p, 0, 0), 5.5);
  }
  const plaza: [number, number][] = [
    [PYRAMID.x - 60, PYRAMID.z - 30],
    [PYRAMID.x + 64, PYRAMID.z - 36],
    [PYRAMID.x - 56, PYRAMID.z + 24],
  ];
  for (const [x, z] of plaza) spotlight(batch, mats, v3(x, terrain.height(x, z), z), v3(PYRAMID.x, 14, PYRAMID.z), 7);
  crane(batch, mats, v3(PYRAMID.x + 52, terrain.height(PYRAMID.x + 52, PYRAMID.z - 34), PYRAMID.z - 34), v3(PYRAMID.x + 30, 12, PYRAMID.z), 12);
  crane(batch, mats, v3(-118, terrain.height(-118, -60), -60), v3(-150, 4, -100), 9);
  const hat = sampleAt(track, track.length - HAT[0]);
  const at = ground(terrain, hat, HAT[1]);
  fedora(batch, mats, inca, at, headingAt(hat) + 0.6);
  addPointLight(frame(sampleAt(track, 0), 0, 6), new THREE.Color(1, 0.9, 0.7).multiplyScalar(0.8), 24);
}

export function buildVillage(track: Track, batch: Batch, mats: Materials, inca: IncaMats, terrain: Terrain, fires: Fire[]): void {
  startGate(track, batch, mats, inca, fires);
  village(track, batch, mats, inca, terrain, fires);
  studio(track, batch, mats, inca, terrain);
}
