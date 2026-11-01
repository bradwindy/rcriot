import * as THREE from 'three';
import { toMain } from '../../../shared/course';
import { mulberry32 } from '../../../shared/rng';
import { limitOf, ranges, sampleAt, type Track } from '../../../shared/track';
import { Batch, boulder, xf } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { addPointLight } from '../../render/ps1';
import { atJunction, box, frame, headingAt, loft, routeSpans } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import { SUN } from './ground';
import type { MoonMats } from './materials';

/** The middle of the hab ring, where the greenhouse dome stands. */
export const HAB = new THREE.Vector3(42, 0, 292);

/** Both sides of a lathe, so a dish shows its hollow and its back. */
function dish(batch: Batch, mm: MoonMats, m: THREE.Matrix4, r: number): void {
  const pts = Array.from({ length: 6 }, (_, k) => new THREE.Vector2((r * k) / 5, ((k / 5) ** 2 * r) / 2.6));
  batch.geometry(mm.hull, new THREE.LatheGeometry(pts, 14), m);
  batch.geometry(mm.hull, new THREE.LatheGeometry(pts.map((v) => new THREE.Vector2(v.x, v.y - 0.15)).reverse(), 14), m, [0.75, 0.76, 0.78]);
}

/** A radio dish on a turret, tipped up at the sky. */
function radioDish(batch: Batch, mm: MoonMats, mats: Materials, at: THREE.Vector3, yaw: number, size: number): void {
  box(batch, mm.hull, size * 0.5, size * 0.6, size * 0.5, xf(at.x, at.y + size * 0.3, at.z, yaw), [0.85, 0.86, 0.88]);
  batch.geometry(mats.metal, new THREE.CylinderGeometry(size * 0.12, size * 0.16, size * 0.5, 8), xf(at.x, at.y + size * 0.85, at.z));
  const head = xf(at.x, at.y + size * 1.1, at.z, yaw, -0.75);
  dish(batch, mm, head, size);
  batch.beam(mats.metal, new THREE.Vector3(0, 0, 0).applyMatrix4(head), new THREE.Vector3(0, size * 0.75, 0).applyMatrix4(head), size * 0.05);
  box(batch, mm.beacon, size * 0.08, size * 0.08, size * 0.08, head.clone().multiply(xf(0, size * 0.78, 0)));
}

/** A row of solar panels on posts, all tilted to face the sun. */
function solarRow(batch: Batch, mm: MoonMats, mats: Materials, terrain: Terrain, at: THREE.Vector3, yaw: number, n: number): void {
  const sunYaw = Math.atan2(-SUN.x, -SUN.z) + Math.PI;
  for (let i = 0; i < n; i++) {
    const local = new THREE.Vector3((i - (n - 1) / 2) * 5, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(at);
    const y = terrain.height(local.x, local.z);
    box(batch, mats.metal, 0.25, 2.2, 0.25, xf(local.x, y + 1.1, local.z));
    batch.geometry(mm.solar, new THREE.BoxGeometry(4.6, 0.15, 3), xf(local.x, y + 2.3, local.z, sunYaw, -0.9));
  }
}

function flag(batch: Batch, mm: MoonMats, mats: Materials, base: THREE.Vector3, yaw: number, height: number): void {
  box(batch, mats.metal, 0.14, height, 0.14, xf(base.x, base.y + height / 2, base.z, yaw));
  const top = xf(base.x, base.y + height - 0.1, base.z, yaw + Math.PI / 2);
  box(batch, mats.metal, 2.4, 0.08, 0.08, top.clone().multiply(xf(1.2, 0, 0)));
  batch.geometry(mm.flag, new THREE.PlaneGeometry(2.4, 1.5), top.clone().multiply(xf(1.2, -0.8, 0)));
}

/** A lattice tower: four legs, rings and cross braces, with a red light on top. */
function tower(batch: Batch, mm: MoonMats, at: THREE.Vector3, yaw: number, height: number, w: number): THREE.Vector3 {
  const m = xf(at.x, at.y, at.z, yaw);
  const corner = (i: number, y: number) => new THREE.Vector3((i % 2 ? 1 : -1) * w * (1 - y / height / 3), y, (i < 2 ? 1 : -1) * w * (1 - y / height / 3)).applyMatrix4(m);
  const order = [0, 1, 3, 2, 0];
  for (const i of [0, 1, 2, 3]) batch.beam(mm.frame, corner(i, 0), corner(i, height), 0.28);
  for (let y = 0; y < height; y += 2.6) {
    for (let k = 0; k < 4; k++) {
      batch.beam(mm.frame, corner(order[k], y + 2.6), corner(order[k + 1], y + 2.6), 0.16);
      batch.beam(mm.frame, corner(order[k], y), corner(order[k + 1], Math.min(height, y + 2.6)), 0.12);
    }
  }
  const top = new THREE.Vector3(0, height + 0.5, 0).applyMatrix4(m);
  box(batch, mm.beacon, 0.6, 0.6, 0.6, xf(top.x, top.y, top.z));
  return top;
}

export interface StartLamps {
  red: THREE.Mesh[];
  green: THREE.Mesh;
}

/** The start gantry: two launch towers and a truss over the line, with the banner and countdown lamps. */
function startGantry(track: Track, batch: Batch, mm: MoonMats, mats: Materials, group: THREE.Group): StartLamps {
  const p = sampleAt(track, 0);
  const h = headingAt(p);
  const span = limitOf(p) + 2.6;
  for (const side of [-1, 1]) {
    const base = frame(p, side * span, -0.3);
    tower(batch, mm, base, h, 15, 1.3);
  }
  for (const y of [11.2, 13.4]) {
    for (const z of [-0.7, 0.7]) {
      const a = frame(p, -span, y).add(new THREE.Vector3(p.tx * z, 0, p.tz * z));
      const b = frame(p, span, y).add(new THREE.Vector3(p.tx * z, 0, p.tz * z));
      batch.beam(mm.frame, a, b, 0.3);
    }
  }
  for (let o = -span; o < span; o += 2.2) {
    batch.beam(mm.frame, frame(p, o, 11.2), frame(p, o + 2.2, 13.4), 0.14);
  }
  const ban = frame(p, 0, 9.4);
  for (const turn of [0, Math.PI]) {
    batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 3, 2.8), xf(ban.x, ban.y, ban.z, h + turn).multiply(xf(0, 0, 0.75)));
  }
  box(batch, mats.plastic, span * 2 - 2.6, 3.2, 1.3, xf(ban.x, ban.y, ban.z, h));
  // Countdown lamps hang under the banner, facing the grid.
  const red: THREE.Mesh[] = [];
  const geo = new THREE.BoxGeometry(1.1, 1.1, 0.3);
  for (let i = 0; i < 4; i++) {
    const at = frame(p, (i - 1.5) * 2.2, 7.1);
    box(batch, mats.plastic, 1.7, 1.7, 0.5, xf(at.x, at.y, at.z, h));
    const lamp = new THREE.Mesh(geo, mm.lamp);
    lamp.position.copy(at).add(new THREE.Vector3(p.tx * 0.3, 0, p.tz * 0.3));
    lamp.rotation.y = h;
    group.add(lamp);
    red.push(lamp);
  }
  const green = new THREE.Mesh(new THREE.BoxGeometry(2.2 * 3 + 1.1, 1.1, 0.3), mm.go);
  green.position.copy(frame(p, 0, 7.1)).add(new THREE.Vector3(p.tx * 0.32, 0, p.tz * 0.32));
  green.rotation.y = h;
  group.add(green);
  addPointLight(frame(p, 0, 9), new THREE.Color(0.9, 0.95, 1.1), 22);
  return { red, green };
}

/** A film light on a tripod, aimed at the track: the studio peeking through the set. */
function filmLight(batch: Batch, mats: Materials, at: THREE.Vector3, target: THREE.Vector3): void {
  const yaw = Math.atan2(-(target.x - at.x), -(target.z - at.z));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    batch.beam(mats.metal, at.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4)), at.clone().setY(at.y + 3.6), 0.12);
  }
  box(batch, mats.metal, 0.16, 2.6, 0.16, xf(at.x, at.y + 4.8, at.z, yaw));
  const head = xf(at.x, at.y + 6.2, at.z, yaw, -0.3);
  batch.geometry(mats.plastic, new THREE.BoxGeometry(2, 1.6, 1.4), head);
  batch.geometry(mats.lens, new THREE.PlaneGeometry(1.7, 1.3), head.clone().multiply(xf(0, 0, -0.71, Math.PI)));
  for (const side of [-1, 1]) batch.geometry(mats.plastic, new THREE.PlaneGeometry(1, 1.6), head.clone().multiply(xf(side * 1.4, 0, -0.85, side * 0.6)));
}

/** The greenhouse: a glass dome full of green in the middle of the hab ring. */
function greenhouse(batch: Batch, mm: MoonMats, mats: Materials, terrain: Terrain): void {
  const y = terrain.height(HAB.x, HAB.z);
  const R = 19;
  batch.geometry(mm.glass, new THREE.SphereGeometry(R, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2), xf(HAB.x, y + 1.2, HAB.z), [0.85, 1, 0.9]);
  batch.geometry(mm.hull, new THREE.CylinderGeometry(R + 0.6, R + 1, 1.6, 24, 1, true), xf(HAB.x, y + 0.5, HAB.z), [0.8, 0.82, 0.85]);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const pts = Array.from({ length: 5 }, (_, i) => {
      const t = (i / 4) * (Math.PI / 2);
      return new THREE.Vector3(HAB.x + Math.cos(a) * Math.cos(t) * (R + 0.15), y + 1.2 + Math.sin(t) * (R + 0.15), HAB.z + Math.sin(a) * Math.cos(t) * (R + 0.15));
    });
    for (let i = 0; i < 4; i++) batch.beam(mm.frame, pts[i], pts[i + 1], 0.3);
  }
  batch.geometry(mm.hull, new THREE.CylinderGeometry(1.2, 1.2, 0.8, 10), xf(HAB.x, y + R + 1.4, HAB.z));
  const rng = mulberry32(11);
  for (let ring = 0; ring < 3; ring++) {
    const r = 4 + ring * 5;
    const n = 6 + ring * 5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring;
      const x = HAB.x + Math.cos(a) * r;
      const z = HAB.z + Math.sin(a) * r;
      const s = 4.2 + rng() * 2.6 - ring * 0.5;
      for (const turn of [0, Math.PI / 2]) batch.geometry(mm.plant, new THREE.PlaneGeometry(s * 1.2, s), xf(x, y + 1.4 + s / 2, z, a + turn));
    }
    batch.geometry(mats.dirt, new THREE.TorusGeometry(r, 1.1, 3, 24), xf(HAB.x, y + 1.0, HAB.z, 0, Math.PI / 2), [0.7, 0.55, 0.4]);
  }
  addPointLight(new THREE.Vector3(HAB.x, y + 9, HAB.z), new THREE.Color(0.6, 1.2, 0.5), 30);
}

export interface Rover {
  rig: THREE.Group;
  centre: THREE.Vector3;
  radius: number;
}

/** A six-wheeled rover that potters round a loop in the crater field, beacon turning. */
function rover(mm: MoonMats, mats: Materials, group: THREE.Group, centre: THREE.Vector3, radius: number): Rover {
  const b = new Batch();
  b.geometry(mm.hull, new THREE.BoxGeometry(5, 1.6, 7.5), xf(0, 2.6, 0), [0.95, 0.95, 0.92]);
  b.geometry(mm.gold, new THREE.BoxGeometry(4.6, 0.9, 6.8), xf(0, 1.5, 0));
  b.geometry(mm.hull, new THREE.BoxGeometry(4, 1.4, 2.6), xf(0, 4.0, -1.6), [0.9, 0.9, 0.88]);
  b.geometry(mm.glass, new THREE.PlaneGeometry(3.4, 1), xf(0, 4.1, -2.95, Math.PI, 0.2));
  for (const x of [-2.9, 2.9]) {
    for (const z of [-2.6, 0, 2.6]) {
      b.geometry(mats.plastic, new THREE.CylinderGeometry(1.1, 1.1, 0.8, 10), xf(x, 1.1, z, 0, 0, Math.PI / 2));
      b.geometry(mats.metal, new THREE.CylinderGeometry(0.5, 0.5, 0.84, 6), xf(x, 1.1, z, 0, 0, Math.PI / 2));
    }
  }
  b.beam(mats.metal, new THREE.Vector3(1.6, 3.3, 2.6), new THREE.Vector3(1.6, 7.2, 2.6), 0.12);
  dish(b, mm, xf(1.6, 7.2, 2.6, 0, -0.5), 1.6);
  b.geometry(mm.beacon, new THREE.BoxGeometry(0.5, 0.5, 0.5), xf(-1.2, 5, 0.8));
  b.geometry(mats.lens, new THREE.PlaneGeometry(0.8, 0.5), xf(-1.4, 2.6, -3.77, Math.PI));
  b.geometry(mats.lens, new THREE.PlaneGeometry(0.8, 0.5), xf(1.4, 2.6, -3.77, Math.PI));
  const rig = new THREE.Group();
  for (const m of b.meshes()) rig.add(m);
  rig.scale.setScalar(1.5);
  group.add(rig);
  return { rig, centre, radius };
}

export interface Props {
  lamps: StartLamps;
  rover: Rover;
  beacons: THREE.Vector3[];
}

export function buildProps(track: Track, index: TrackIndex, terrain: Terrain, batch: Batch, mats: Materials, mm: MoonMats, group: THREE.Group): Props {
  const rng = mulberry32(5);
  const ground = (x: number, z: number) => new THREE.Vector3(x, terrain.height(x, z), z);
  const clear = (x: number, z: number, margin: number) => {
    const near = index.nearest(x, z, 40);
    return !near || near.d > limitOf(near.sample) + margin;
  };
  const beacons: THREE.Vector3[] = [];
  const lamps = startGantry(track, batch, mm, mats, group);

  // Marker posts with orange reflectors along the edge of every open stretch.
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    for (let s = s0 + 2; s < s1 - 2; s += 7) {
      const p = sampleAt(t, s);
      if ((p.cover !== 'open' && p.zone !== 'chasm') || atJunction(track, toMain(track, route, s), 4)) continue;
      for (const side of [-1, 1]) {
        const at = frame(p, side * (limitOf(p) + 0.25), 0);
        box(batch, mm.frame, 0.18, 1.3, 0.18, xf(at.x, at.y + 0.65, at.z, headingAt(p)), [0.9, 0.9, 0.9]);
        box(batch, mm.strip, 0.22, 0.3, 0.22, xf(at.x, at.y + 1.35, at.z, headingAt(p)), [1, 0.45, 0.08]);
      }
    }
  }

  // The crevasse is hidden behind its own lip, so a striped band and warning lights mark both edges of it.
  {
    const t = track.routes[0].track;
    for (const [a, b] of ranges(t, (p) => p.surface === 'void')) {
      for (const [s0, s1] of [
        [a - 3.2, a - 0.3],
        [b + 0.3, b + 3.2],
      ]) {
        loft(batch, t, s0, s1, {
          spacing: 1.5,
          vScale: 4,
          outward: true,
          material: () => mm.stripes,
          profile: (p) => [-1, 0, 1].map((f) => [f * limitOf(p), 0.07, f * 2]),
        });
        for (const side of [-1, 1]) {
          const p = sampleAt(t, (s0 + s1) / 2);
          const at = frame(p, side * (limitOf(p) + 0.5), 0);
          box(batch, mm.frame, 0.3, 3.2, 0.3, xf(at.x, at.y + 1.6, at.z, headingAt(p)));
          box(batch, mm.beacon, 0.7, 0.7, 0.7, xf(at.x, at.y + 3.5, at.z, headingAt(p)));
        }
      }
    }
  }

  // Moon rocks: scattered everywhere, heaped on crater rims, kept off the roads.
  for (let z = -380; z < 520; z += 14) {
    for (let x = -360; x < 470; x += 14) {
      const px = x + (rng() - 0.5) * 12;
      const pz = z + (rng() - 0.5) * 12;
      if (rng() > 0.32 || !clear(px, pz, 2.5)) continue;
      const at = ground(px, pz);
      const size = 0.8 + rng() * rng() * 6;
      batch.geometry(mm.rock, boulder(Math.floor(rng() * 1e6), size, 0.6 + rng() * 0.3), xf(at.x, at.y + size * 0.15, at.z, rng() * 6));
    }
  }

  // Dishes on the high ground east of the road, solar farms by the lab and the ring, and a comms mast.
  for (const [x, z, size] of [
    [222, 110, 9],
    [230, 150, 7],
    [215, 196, 11],
    [-60, 190, 8],
    [-120, -20, 10],
  ]) {
    if (!clear(x, z, size)) continue;
    radioDish(batch, mm, mats, ground(x, z), rng() * 6, size);
  }
  for (const [x, z, yaw, n] of [
    [40, -60, 0.1, 7],
    [40, -72, 0.1, 7],
    [40, -84, 0.1, 7],
    [-40, -120, 1.4, 6],
    [-28, -122, 1.4, 6],
    [120, 330, 0.6, 6],
    [128, 318, 0.6, 6],
    [-40, 300, -0.4, 5],
  ]) {
    solarRow(batch, mm, mats, terrain, new THREE.Vector3(x, 0, z), yaw, n);
  }
  for (const [x, z, h] of [
    [60, -232, 30],
    [150, 20, 22],
    [-30, 350, 24],
  ]) {
    const top = tower(batch, mm, ground(x, z), rng(), h, 1.6);
    beacons.push(top);
  }

  // Flags: by the start, by the ring's courtyard and on the crater ridge.
  {
    const p = sampleAt(track, 14);
    flag(batch, mm, mats, frame(p, -(limitOf(p) + 4), 0), headingAt(p) + 0.4, 5);
  }
  flag(batch, mm, mats, ground(HAB.x + 22, HAB.z - 16), 0.8, 5);
  flag(batch, mm, mats, ground(206, 150), 2.2, 5);

  // The studio: film lights watching the start, and the landing pad with fuel tanks beside it.
  filmLight(batch, mats, ground(...xz(frame(sampleAt(track, 18), -16, 0))), frame(sampleAt(track, 6), 0, 1));
  filmLight(batch, mats, ground(...xz(frame(sampleAt(track, -20), 16, 0))), frame(sampleAt(track, -8), 0, 1));
  {
    const pad = ground(...xz(frame(sampleAt(track, -30), 38, 0)));
    batch.geometry(mm.stripes, new THREE.CylinderGeometry(15, 16, 0.6, 16), xf(pad.x, pad.y + 0.1, pad.z), [0.7, 0.7, 0.72]);
    batch.geometry(mm.plates, new THREE.CylinderGeometry(13, 13, 0.7, 16), xf(pad.x, pad.y + 0.15, pad.z));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const at = new THREE.Vector3(pad.x + Math.cos(a) * 15.5, pad.y + 0.7, pad.z + Math.sin(a) * 15.5);
      box(batch, mm.beacon, 0.5, 0.4, 0.5, xf(at.x, at.y, at.z));
    }
    for (const [dx, dz] of [
      [-22, -6],
      [-22, 2],
      [-24, 10],
    ]) {
      const at = ground(pad.x + dx, pad.z + dz);
      batch.geometry(mm.hull, new THREE.SphereGeometry(3, 10, 6), xf(at.x, at.y + 4.2, at.z), [0.9, 0.9, 0.86]);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        batch.beam(mats.metal, at.clone().add(new THREE.Vector3(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6)), at.clone().setY(at.y + 3.4), 0.25);
      }
    }
  }
  greenhouse(batch, mm, mats, terrain);
  const rv = rover(mm, mats, group, ground(142, 148), 24);
  return { lamps, rover: rv, beacons };
}

function xz(v: THREE.Vector3): [number, number] {
  return [v.x, v.z];
}

