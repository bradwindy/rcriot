import * as THREE from 'three';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { limitOf, sampleAt, zoneRanges, type Track } from '../../../shared/track';
import { xf, type RGB } from '../../render/geometry';
import { valueNoise } from '../../render/noise';
import { addPointLight, type PointLight } from '../../render/ps1';
import { atJunction, frame, headingAt } from '../../render/road';
import { MAP } from './ground';
import { C, rgb, type Looks } from './look';
import { InkRig, pose, tube, type Toon } from './toon';

/** Ground level of the hall floor, just under the road. */
const FLOOR = 1.45;
/** Hall height from floor to ceiling. */
const HALL = 13;
const DOOR = 9.5;

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A flat sheet, w by h, with `nx` by `ny` cells so lamps can light it, its texture repeating ru by rv times. */
function sheet(w: number, h: number, nx: number, ny: number, ru: number, rv: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h, nx, ny);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
  return g;
}

/** A milk bottle's outline, for turning on a lathe: base at 0, cap at the top, `h` tall. */
export function bottle(h: number): { glass: THREE.BufferGeometry; cap: THREE.BufferGeometry } {
  const r = h * 0.2;
  const line = (pts: [number, number][]) => pts.map(([a, b]) => new THREE.Vector2(a * r, b * h));
  const glass = new THREE.LatheGeometry(
    line([[0.001, 0], [0.9, 0], [1, 0.05], [1, 0.52], [0.94, 0.6], [0.72, 0.72], [0.55, 0.82], [0.52, 0.92], [0.001, 0.92]]),
    8,
  );
  const cap = new THREE.CylinderGeometry(r * 0.6, r * 0.6, h * 0.1, 8);
  cap.translate(0, h * 0.95, 0);
  return { glass, cap };
}

function bigBottle(toon: Toon, L: Looks, at: THREE.Vector3, h: number, yaw: number): void {
  const { glass, cap } = bottle(h);
  const m = xf(at.x, at.y, at.z, yaw);
  toon.shape(L.flat, glass, m, rgb(C.milk), 0.14);
  toon.shape(L.flat, cap, m, rgb(C.red), 0.1);
  const band = new THREE.CylinderGeometry(h * 0.204, h * 0.204, h * 0.24, 8, 1, true);
  toon.batch.geometry(L.label, band, m.clone().multiply(xf(0, h * 0.28, 0)));
}

function churnBody(r: number): THREE.LatheGeometry {
  const pts: [number, number][] = [[0.001, 0], [0.92, 0], [1, 0.08], [1, 1.1], [0.82, 1.42], [0.5, 1.62], [0.46, 2], [0.62, 2.06], [0.62, 2.2], [0.001, 2.3]];
  return new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a * r, b * r)), 8);
}

export function churn(toon: Toon, L: Looks, at: THREE.Vector3, r: number, yaw: number, mat: THREE.Material = L.flat): void {
  const m = xf(at.x, at.y, at.z, yaw);
  toon.shape(mat, churnBody(r), m, rgb(C.steel), 0.06);
  toon.cyl(mat, r * 1.02, r * 1.02, r * 0.16, m.clone().multiply(xf(0, r * 0.55, 0)), rgb(C.red), 0, 8);
}

export interface FactoryArt {
  lights: { light: PointLight; base: THREE.Color; seed: number }[];
  group: THREE.Object3D[];
  update(time: number, clock: number): void;
}

/** The surreal milk factory, its yard, the milk silo pouring the river, and the churn crane. */
export function milkFactory(track: Track, toon: Toon, L: Looks, churnHazard: Hazard): FactoryArt {
  const batch = toon.batch;
  const [a, b] = zoneRanges(track, 'factory')[0];
  const pa = sampleAt(track, a);
  const pb = sampleAt(track, b);
  const E = pa.x + 0.5;
  const W = pb.x - 0.5;
  const N = MAP.factory.z0 + 2;
  const S = MAP.factory.z1 - 2;
  const LEN = E - W;
  const SPAN = S - N;
  const midX = (E + W) / 2;
  const midZ = (N + S) / 2;
  const TOP = FLOOR + HALL;
  const lights: FactoryArt['lights'] = [];
  const steel = rgb(C.steel);
  const darkSteel: RGB = [0.42, 0.46, 0.54];
  const lamp = (at: THREE.Vector3, c: THREE.Color, range: number, seed: number) => lights.push({ light: addPointLight(at, c.clone(), range), base: c, seed });

  // The hall: a dark floor, inner walls and ceiling, with panelled outer walls and a cream-and-red skin.
  batch.geometry(L.hall, sheet(LEN, SPAN, 18, 10, 9, 5), xf(midX, FLOOR, midZ, 0, -Math.PI / 2), [0.62, 0.64, 0.7]);
  batch.geometry(L.hall, sheet(LEN, SPAN, 9, 5, 9, 5), xf(midX, TOP, midZ, 0, Math.PI / 2), [0.5, 0.52, 0.6]);
  const longWall = (z: number, inward: number) => {
    batch.geometry(L.hall, sheet(LEN, HALL, 18, 3, 9, 1.6), xf(midX, FLOOR + HALL / 2, z, inward > 0 ? 0 : Math.PI), [0.8, 0.82, 0.9]);
    batch.geometry(L.panels, sheet(LEN + 1, HALL + 1.6, 1, 1, 9, 1), xf(midX, FLOOR + HALL / 2 + 0.8, z - inward * 0.6, inward > 0 ? Math.PI : 0));
    toon.box(L.flat, LEN + 1.2, 0.4, 1.0, xf(midX, TOP + 1.8, z - inward * 0.3), rgb(C.red), 0.1);
  };
  longWall(N, 1);
  longWall(S, -1);
  // End walls, each with a door the road runs through.
  const endWall = (x: number, cz: number, hw: number, outward: number) => {
    const inner = outward > 0 ? -Math.PI / 2 : Math.PI / 2;
    const outer = outward > 0 ? Math.PI / 2 : -Math.PI / 2;
    for (const [z0, z1] of [
      [N, cz - hw],
      [cz + hw, S],
    ]) {
      const w = z1 - z0;
      const mid = (z0 + z1) / 2;
      batch.geometry(L.hall, sheet(w, HALL, 3, 3, w / 8, 1.6), xf(x, FLOOR + HALL / 2, mid, inner), [0.8, 0.82, 0.9]);
      batch.geometry(L.panels, sheet(w + 0.6, HALL + 1.6, 1, 1, Math.max(1, Math.round(w / 8)), 1), xf(x + outward * 0.6, FLOOR + HALL / 2 + 0.8, mid, outer));
    }
    const w = hw * 2;
    batch.geometry(L.hall, sheet(w, HALL - DOOR, 3, 1, w / 8, 0.6), xf(x, FLOOR + (HALL + DOOR) / 2, cz, inner), [0.8, 0.82, 0.9]);
    batch.geometry(L.panels, sheet(w, HALL + 1.6 - DOOR, 1, 1, Math.round(w / 8), 0.4), xf(x + outward * 0.6, FLOOR + (HALL + 1.6 + DOOR) / 2, cz, outer));
    // A striped frame round the door, closing the wall's thickness.
    for (const side of [-1, 1]) toon.box(L.stripes, 1.0, DOOR, 0.9, xf(x + outward * 0.3, FLOOR + DOOR / 2, cz + side * (hw + 0.4), 0), [1, 1, 1], 0.1);
    toon.box(L.stripes, 1.0, 0.9, w + 1.7, xf(x + outward * 0.3, FLOOR + DOOR + 0.4, cz), [1, 1, 1], 0.1);
    toon.box(L.flat, 0.4, 0.4, SPAN + 1.2, xf(x + outward * 0.3, TOP + 1.8, midZ), rgb(C.red), 0.1);
  };
  const hwE = limitOf(pa) + 1.4;
  const hwW = limitOf(pb) + 1.4;
  endWall(E, pa.z, hwE, 1);
  endWall(W, pb.z, hwW, -1);

  // Roof: a flat deck with a row of sawtooth skylights in tin and glass.
  toon.box(L.tin, LEN + 1, 0.7, SPAN + 1, xf(midX, TOP + 0.9, midZ), [1, 1, 1], 0.12);
  for (let k = 0; k < 6; k++) {
    const x = W + (LEN * (k + 0.5)) / 6;
    const tooth = new THREE.BufferGeometry();
    const r = 5;
    const h = 3.4;
    const hd = SPAN / 2 - 3;
    const pts = [v3(-r, 0, -hd), v3(-r, 0, hd), v3(-r, h, -hd), v3(-r, h, hd), v3(r, 0, -hd), v3(r, 0, hd)];
    const tris = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5];
    const pos: number[] = [];
    for (const i of tris) pos.push(pts[i].x, pts[i].y, pts[i].z);
    tooth.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tooth.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((_, i) => (i % 3 ? [] : [_ / 4, 0])), 2));
    tooth.computeVertexNormals();
    batch.geometry(L.tinBoth, tooth, xf(x, TOP + 1.25, midZ));
    toon.beam(L.flat, v3(x + r, TOP + 1.3, midZ - hd), v3(x + r, TOP + 1.3, midZ + hd), 0.25, 0.25, rgb(C.dark), 0.04);
    toon.beam(L.flat, v3(x - r, TOP + 1.3 + h, midZ - hd), v3(x - r, TOP + 1.3 + h, midZ + hd), 0.3, 0.3, rgb(C.dark), 0.04);
  }

  // The giant milk bottle on the roof, and two striped chimneys.
  bigBottle(toon, L, v3(midX + 6, TOP + 1.2, S - 8), 19, 0.4);
  const stacks = [v3(W + 10, TOP + 1.2, N + 7), v3(W + 22, TOP + 1.2, N + 7)];
  for (const s of stacks) {
    for (let i = 0; i < 5; i++) toon.cyl(L.flat, 2.0 - i * 0.14, 2.14 - i * 0.14, 2.4, xf(s.x, s.y + 1.2 + i * 2.4, s.z), i % 2 ? rgb(C.white) : rgb(C.red), i === 0 ? 0.12 : 0.04, 8);
  }

  // Yard: a concrete apron, kerbs along the road, pallets of bottles and giant bottles for show.
  {
    const r = MAP.yard;
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    batch.geometry(L.slab, sheet(w, d, 1, 1, w / 8, d / 8), xf((r.x0 + r.x1) / 2, 1.38, (r.z0 + r.z1) / 2, 0, -Math.PI / 2));
  }
  const [w0, w1] = zoneRanges(track, 'works')[0];
  for (const side of [-1, 1]) {
    let k = 0;
    for (let s = w0; s < w1 - 1; s += 2.6, k++) {
      if (atJunction(track, s, 3)) continue;
      const p = sampleAt(track, s);
      const at = frame(p, side * (limitOf(p) + 0.45), 0.42);
      toon.box(L.flat, 0.9, 0.84, 2.5, xf(at.x, at.y, at.z, headingAt(p)), k % 2 ? rgb(C.white) : rgb(C.red), 0.05);
    }
  }
  for (const [x, z, h, yaw] of [
    [170, 148, 15, 0.2],
    [160, 136, 22, -0.3],
    [176, 128, 11, 0.8],
    [232, 150, 18, 0.1],
    [240, 126, 13, 0.5],
  ]) {
    bigBottle(toon, L, v3(x, 1.38, z), h, yaw);
  }
  for (const [x, z, r, yaw] of [
    [172, 158, 1.4, 0.3],
    [176, 155, 1.1, 1],
    [231, 170, 1.4, 2],
    [226, 174, 1.1, 0.4],
    [234, 175, 1.2, 1.7],
  ]) {
    churn(toon, L, v3(x, 1.38, z), r, yaw);
  }

  // Inside: safety rails down both sides of the road.
  for (const side of [-1, 1]) {
    let prev: THREE.Vector3 | null = null;
    for (let s = a + 1, k = 0; s <= b - 1; s += 3, k++) {
      const p = sampleAt(track, s);
      const foot = frame(p, side * (limitOf(p) + 0.2), 0);
      toon.box(L.stripesIn, 0.28, 1.2, 0.28, xf(foot.x, foot.y + 0.6, foot.z, headingAt(p)), [1, 1, 1], 0.04);
      const top = foot.clone().setY(foot.y + 1.05);
      if (prev) batch.beam(L.flatIn, prev, top, 0.16, 0.16, rgb(C.yellow));
      prev = top;
    }
  }

  // Hanging lamps over the road: pools of warm light with the dark between them.
  for (let s = a + 8, k = 0; s < b - 4; s += 15, k++) {
    const p = sampleAt(track, s);
    const at = v3(p.x, p.y + 8.2, p.z);
    batch.beam(L.flatIn, at, v3(p.x, TOP, p.z), 0.08, 0.08, [0.5, 0.5, 0.5]);
    toon.shape(L.flatIn, new THREE.ConeGeometry(1.5, 0.9, 8, 1, true), xf(at.x, at.y - 0.3, at.z), [0.3, 0.8, 0.55], 0.05);
    toon.ball(L.glow, 0.42, xf(at.x, at.y - 0.65, at.z), [1, 0.92, 0.65], 0);
    lamp(v3(p.x, p.y + 6.5, p.z), new THREE.Color(1, 0.86, 0.6).multiplyScalar(2.8), 15, k * 3);
  }

  const rig = new InkRig(L, L.flatIn);

  // North bay: the bottling line, a conveyor of milk bottles running the length of the hall.
  const belt = { x0: W + 5, x1: E - 5, y: FLOOR + 2.3, z: N + 5.5 };
  {
    const len = belt.x1 - belt.x0;
    const mid = (belt.x0 + belt.x1) / 2;
    toon.box(L.flatIn, len, 0.5, 2.6, xf(mid, belt.y - 0.3, belt.z), darkSteel, 0.06);
    batch.geometry(L.belt, sheet(len, 2.3, 8, 1, len / 3, 1), xf(mid, belt.y - 0.04, belt.z, 0, -Math.PI / 2));
    for (let x = belt.x0 + 2; x < belt.x1; x += 7) {
      for (const dz of [-1.1, 1.1]) toon.box(L.flatIn, 0.4, belt.y - FLOOR - 0.5, 0.4, xf(x, FLOOR + (belt.y - FLOOR - 0.5) / 2, belt.z + dz), rgb(C.red), 0.04);
    }
    // A filling machine straddling the belt, with blinking lamps.
    for (const x of [W + LEN * 0.32, W + LEN * 0.72]) {
      toon.box(L.flatIn, 5, 2.6, 4.2, xf(x, belt.y + 3.4, belt.z), rgb(C.blue), 0.08);
      for (const dx of [-2.2, 2.2]) toon.box(L.flatIn, 0.7, 3, 4, xf(x + dx, belt.y + 0.9, belt.z), rgb(C.blue), 0.06);
      for (let i = 0; i < 4; i++) toon.box(L.glow, 0.3, 0.3, 0.1, xf(x - 1.5 + i, belt.y + 3.7, belt.z + 2.15), i % 2 ? [1, 0.25, 0.2] : [0.3, 1, 0.45], 0);
      tube(toon, L.flatIn, v3(x, belt.y + 4.7, belt.z), v3(x, TOP, belt.z), 0.7, rgb(C.red), 0.05);
    }
  }
  const { glass, cap } = bottle(1.7);
  const bottles: number[] = [];
  const count = Math.floor((belt.x1 - belt.x0) / 3.2);
  for (let i = 0; i < count; i++) {
    bottles.push(rig.part([
      { g: glass, color: rgb(C.milk) },
      { g: cap, color: rgb(C.red) },
    ]));
  }

  // South bay: three giant vats, a dial as big as a car, and pipes that cross over the road to the bottling line.
  const vats = [W + LEN * 0.8, W + LEN * 0.5, W + LEN * 0.2];
  const vatZ = S - 6;
  vats.forEach((x, i) => {
    const m = xf(x, FLOOR, vatZ);
    toon.cyl(L.flatIn, 5, 5, 8.4, m.clone().multiply(xf(0, 4.2, 0)), rgb(C.steel), 0.1, 10);
    toon.shape(L.flatIn, new THREE.ConeGeometry(5, 2, 10), m.clone().multiply(xf(0, 9.4, 0)), darkSteel, 0.08);
    for (const y of [1.4, 7]) batch.geometry(L.flatIn, new THREE.CylinderGeometry(5.08, 5.08, 0.34, 10), m.clone().multiply(xf(0, y, 0)), [0.3, 0.32, 0.4]);
    const pipeColor = rgb([C.red, C.blue, C.yellow][i]);
    const top = v3(x, FLOOR + 10.2, vatZ);
    const over = v3(x, TOP - 2.2 - i * 0.7, vatZ);
    const across = v3(x, over.y, belt.z + 3);
    tube(toon, L.flatIn, top, over, 0.6, pipeColor, 0.06);
    tube(toon, L.flatIn, over, across, 0.6, pipeColor, 0.06);
    toon.ball(L.flatIn, 0.78, xf(over.x, over.y, over.z), pipeColor, 0.05);
    toon.ball(L.flatIn, 0.78, xf(across.x, across.y, across.z), pipeColor, 0.05);
    for (let k = 1; k < 6; k++) batch.geometry(L.flatIn, new THREE.CylinderGeometry(0.76, 0.76, 0.3, 8), xf(x, over.y, vatZ + ((across.z - vatZ) * k) / 6, 0, Math.PI / 2), [0.3, 0.3, 0.36]);
  });

  // The glowing pressure dial on the first vat, facing the road, with a needle that strains towards the red.
  const dial = { x: vats[0], y: FLOOR + 5, z: vatZ - 5.2 };
  batch.geometry(L.gauge, new THREE.CircleGeometry(2.4, 12), xf(dial.x, dial.y, dial.z, Math.PI));
  toon.cyl(L.flatIn, 2.7, 2.7, 0.3, xf(dial.x, dial.y, dial.z + 0.15, 0, Math.PI / 2), rgb(C.dark), 0.06, 12);
  lamp(v3(dial.x, dial.y, dial.z - 2.5), new THREE.Color(0.45, 1, 0.55).multiplyScalar(2.2), 13, 40);
  const needle = rig.part([{ g: new THREE.BoxGeometry(0.22, 2.1, 0.06), m: xf(0, 0.9, 0), color: rgb(C.red), t: 0.03 }]);

  // A flywheel on the back wall, turning.
  const wheelPart = rig.part([
    ...[0, 1, 2].map((i) => ({ g: new THREE.BoxGeometry(6.4, 0.4, 0.3), m: xf(0, 0, 0, 0, 0, (i * Math.PI) / 3), color: rgb(C.red) })),
    { g: new THREE.CylinderGeometry(0.8, 0.8, 0.6, 8), m: xf(0, 0, 0, 0, Math.PI / 2), color: rgb(C.dark) },
    ...Array.from({ length: 12 }, (_, i) => {
      const t = (i / 12) * Math.PI * 2;
      return { g: new THREE.BoxGeometry(1.75, 0.5, 0.4), m: xf(Math.cos(t) * 3.3, Math.sin(t) * 3.3, 0, 0, 0, t + Math.PI / 2), color: rgb(C.red) };
    }),
  ]);
  const wheelAt = v3((vats[0] + vats[1]) / 2, FLOOR + 5.4, S - 0.6);

  // Pistons pumping beside the road between the vats.
  const pistonAt = [v3((vats[1] + vats[2]) / 2 - 3, FLOOR, vatZ), v3((vats[1] + vats[2]) / 2 + 3, FLOOR, vatZ)];
  const pistons = pistonAt.map((p) => {
    toon.box(L.flatIn, 3.4, 3.2, 3.4, xf(p.x, p.y + 1.6, p.z), rgb(C.blue), 0.08);
    toon.box(L.flatIn, 3.4, 0.5, 3.4, xf(p.x, p.y + 8.2, p.z), rgb(C.blue), 0.08);
    for (const dx of [-1.4, 1.4]) tube(toon, L.flatIn, v3(p.x + dx, p.y + 3.2, p.z), v3(p.x + dx, p.y + 8, p.z), 0.14, steel, 0.03, 6);
    return rig.part([
      { g: new THREE.CylinderGeometry(0.8, 0.8, 3.6, 8), m: xf(0, 1.8, 0), color: steel },
      { g: new THREE.CylinderGeometry(1.2, 1.2, 0.5, 8), m: xf(0, 3.6, 0), color: rgb(C.red) },
    ]);
  });

  // Roof trusses, for depth in the gloom.
  for (let k = 0; k <= 8; k++) {
    const x = W + (LEN * k) / 8;
    toon.box(L.flatIn, 0.5, 0.7, SPAN, xf(x, TOP - 0.5, midZ), [0.34, 0.36, 0.42], 0.04);
  }

  // A chute of milk running overhead across the road into the middle vat, and pouring down into it.
  {
    const x = vats[1];
    const from = v3(x + 6, TOP - 0.8, N + 2);
    const to = v3(x + 1, FLOOR + 11.4, vatZ - 3.5);
    const d = to.clone().sub(from);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, -1), d.clone().normalize());
    const m = new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), q, v3(1, 1, 1));
    toon.box(L.flatIn, 3, 0.3, len, m, [0.55, 0.6, 0.7], 0.06);
    for (const side of [-1, 1]) toon.box(L.flatIn, 0.3, 0.8, len, m.clone().multiply(xf(side * 1.5, 0.3, 0)), [0.55, 0.6, 0.7], 0.05);
    const glow = batch;
    glow.geometry(L.pour, sheet(2.7, len, 1, 8, 1, len / 4), m.clone().multiply(xf(0, 0.2, 0, 0, Math.PI / 2 + Math.PI)));
    const fall = to.y - (FLOOR + 10);
    glow.geometry(L.pour, sheet(2.4, fall + 0.4, 1, 1, 1, 0.6), xf(to.x, FLOOR + 10 + fall / 2, to.z - 0.6));
    lamp(v3(x + 3, FLOOR + 9, midZ), new THREE.Color(0.75, 0.85, 1).multiplyScalar(1.6), 14, 44);
  }

  // A pink neon milk bottle hanging over the road, the brightest thing in the building.
  {
    const p = sampleAt(track, a + (b - a) * 0.46);
    const at = v3(p.x, p.y + 10.4, p.z);
    const m = xf(at.x, at.y, at.z, headingAt(p));
    toon.box(L.flatIn, 0.3, 5.2, 8, m.clone().multiply(xf(0, 0, -0.1, Math.PI / 2)), rgb(C.dark), 0.08);
    const outline: [number, number][] = [[-0.9, -2.1], [0.9, -2.1], [1, -1.9], [1, 0.3], [0.5, 1.1], [0.5, 1.9], [-0.5, 1.9], [-0.5, 1.1], [-1, 0.3], [-1, -1.9]];
    const pts = outline.map(([x, y]) => new THREE.Vector3(x, y, 0.1).applyMatrix4(m));
    pts.forEach((q, i) => batch.beam(L.neon, q, pts[(i + 1) % pts.length], 0.2, 0.2, [1, 0.45, 0.75]));
    for (const [dx, tone] of [[-2.8, [0.35, 0.95, 1]], [2.8, [0.35, 0.95, 1]]] as const) {
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI;
        const c = new THREE.Vector3(dx, 0, 0.1);
        const e = new THREE.Vector3(Math.cos(t) * 1.1, Math.sin(t) * 1.1, 0);
        batch.beam(L.neon, c.clone().add(e).applyMatrix4(m), c.clone().sub(e).applyMatrix4(m), 0.16, 0.16, [tone[0], tone[1], tone[2]]);
      }
    }
    lamp(at.clone().setY(at.y - 3.5), new THREE.Color(1, 0.42, 0.72).multiplyScalar(2.2), 15, 50);
  }

  // Sun through the skylights, in two thin blades across the dark.
  for (const f of [0.26, 0.66]) {
    const x = W + LEN * f;
    batch.geometry(L.shaft, new THREE.PlaneGeometry(9, 14), xf(x, FLOOR + 6.4, midZ - 2, Math.PI / 2, 0, 0.42), [0.7, 0.66, 0.5]);
  }

  // Outside the door, a neon bottle over the way in, so the building calls from across the yard.
  {
    const at = v3(E + 1.2, FLOOR + DOOR + 2.4, pa.z);
    const m = xf(at.x, at.y, at.z, Math.PI / 2);
    toon.box(L.flat, 12, 3.2, 0.3, m, rgb(C.blue), 0.1);
    for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) {
      const b0 = m.clone().multiply(xf(x, -0.9, 0.2));
      const outline: [number, number][] = [[-0.5, 0], [0.5, 0], [0.5, 1], [0.24, 1.45], [0.24, 1.9], [-0.24, 1.9], [-0.24, 1.45], [-0.5, 1]];
      const pts = outline.map(([px, py]) => new THREE.Vector3(px, py, 0).applyMatrix4(b0));
      pts.forEach((q, i) => batch.beam(L.neon, q, pts[(i + 1) % pts.length], 0.13, 0.13, [1, 0.55, 0.8]));
    }
  }

  // The milk silo at the head of the river, cow-spotted, with a spout pouring the river out of its side.
  const silo = v3(MAP.river[0][0], -3, MAP.river[0][1] - 14);
  {
    const R = 10;
    const H = 26;
    const body = new THREE.CylinderGeometry(R, R, H, 12, 1, true);
    const uv = body.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2.4);
    const m = xf(silo.x, silo.y + H / 2, silo.z);
    toon.batch.geometry(L.cow, body, m);
    toon.batch.geometry(L.ink, new THREE.CylinderGeometry(R + 0.16, R + 0.16, H + 0.3, 12, 1, true), m);
    toon.shape(L.flat, new THREE.SphereGeometry(R, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), xf(silo.x, silo.y + H, silo.z, 0, 0, 0, 1, 0.5, 1), rgb(C.red), 0.14);
    const spoutY = 12;
    const lip = v3(silo.x, spoutY, silo.z + R + 3.4);
    tube(toon, L.flat, v3(silo.x, spoutY, silo.z + R - 0.4), lip, 1.7, rgb(C.steel), 0.1, 10);
    toon.cyl(L.flat, 2.1, 2.1, 0.5, new THREE.Matrix4().compose(lip, new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), v3(1, 1, 1)), rgb(C.red), 0.08, 10);
    const drop = spoutY - MAP.milkLevel;
    batch.geometry(L.pour, sheet(3.4, drop, 1, 2, 1, drop / 8), xf(lip.x, MAP.milkLevel + drop / 2, lip.z + 0.2));
    batch.geometry(L.pour, sheet(3.4, drop, 1, 2, 1, drop / 8), xf(lip.x, MAP.milkLevel + drop / 2, lip.z + 1.1, Math.PI / 2));
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * Math.PI * 2;
      const r = 3.2 + (i % 2) * 1.2;
      toon.ball(L.flat, 1.2 + (i % 3) * 0.3, xf(lip.x + Math.cos(t) * r, MAP.milkLevel + 0.1, lip.z + 0.6 + Math.sin(t) * r), rgb(C.white), 0.06);
    }
    // Pipes from the silo along to the factory.
    const joint = (p: THREE.Vector3, c: RGB) => toon.ball(L.flat, 1.25, xf(p.x, p.y, p.z), c, 0.08);
    for (const [y, c, r] of [
      [16, rgb(C.blue), 0.95],
      [20, rgb(C.yellow), 0.8],
    ] as const) {
      const out = v3(silo.x + R - 0.5, y, silo.z);
      const along = v3(W + 8, y, silo.z);
      const down = v3(W + 8, y, N - 0.8);
      tube(toon, L.flat, out, along, r, c, 0.08, 8);
      tube(toon, L.flat, along, down, r, c, 0.08, 8);
      joint(along, c);
      for (let z = silo.z + 8; z < N - 2; z += 13) tube(toon, L.flat, v3(W + 8, 0, z), v3(W + 8, y, z), 0.28, rgb(C.dark), 0.04, 6);
    }
  }

  // The churn crane: a yellow gantry over the yard road, its trolley shuttling a churn side to side.
  const crane = new InkRig(L);
  const cp = sampleAt(track, churnHazard.s);
  const cy = headingAt(cp);
  const reachTop = 11.5;
  {
    const span = limitOf(cp) + 2.4;
    const yellow = rgb(C.yellow);
    const top = (o: number) => frame(cp, o, reachTop);
    const along = (p: THREE.Vector3, d: number) => p.clone().add(v3(cp.tx * d, 0, cp.tz * d));
    for (const side of [-1, 1]) {
      const foot = frame(cp, side * span, -0.1);
      for (const d of [-2.6, 2.6]) toon.beam(L.flat, along(foot, d), along(top(side * span), d * 0.25), 0.6, 0.6, yellow, 0.08);
      for (let h = 2; h < reachTop - 1; h += 2.6) {
        const k = h / reachTop;
        const w = 2.6 * (1 - k * 0.75);
        const y0 = frame(cp, side * span, h);
        toon.beam(L.flat, along(y0, -w), along(y0, w), 0.26, 0.26, yellow, 0.05);
      }
      toon.box(L.flat, 2.4, 0.9, 7, xf(foot.x, foot.y + 0.4, foot.z, cy), rgb(C.dark), 0.08);
    }
    for (const d of [-0.7, 0.7]) toon.beam(L.flat, along(top(-span - 1.4), d), along(top(span + 1.4), d), 0.55, 0.8, yellow, 0.08);
    toon.box(L.flat, 3, 3.2, 3.6, (() => {
      const p = top(span + 2.6);
      return xf(p.x, p.y + 1, p.z, cy);
    })(), rgb(C.red), 0.1);
  }
  const trolley = crane.part([
    { g: new THREE.BoxGeometry(2.4, 1.1, 2.6), m: xf(0, 0, 0), color: rgb(C.red) },
    { g: new THREE.CylinderGeometry(0.5, 0.5, 1.8, 6), m: xf(0, -0.9, 0, 0, 0, Math.PI / 2), color: rgb(C.dark) },
  ]);
  const cable = crane.part([{ g: new THREE.BoxGeometry(0.14, 1, 0.14), m: xf(0, -0.5, 0), color: rgb(C.dark), t: 0.03 }]);
  const churnPart = crane.part([
    { g: churnBody(1.3), color: rgb(C.steel) },
    { g: new THREE.CylinderGeometry(1.34, 1.34, 0.24, 8), m: xf(0, 0.7, 0), color: rgb(C.red), t: 0 },
    { g: new THREE.TorusGeometry(0.4, 0.12, 5, 8), m: xf(0, 3.2, 0), color: rgb(C.dark), t: 0.02 },
  ]);

  // Chimney smoke: fat cartoon puffs, rising and swelling.
  const smoke = stacks.flatMap((s, i) =>
    Array.from({ length: 5 }, (_, k) => ({
      id: crane.part([{ g: new THREE.IcosahedronGeometry(1, 1), color: [0.95, 0.96, 1], t: 0.04 }]),
      x: s.x,
      y: s.y + 12,
      z: s.z,
      t: k / 5 + i * 0.13,
    })),
  );

  const m = new THREE.Matrix4();
  return {
    lights,
    group: [...rig.done(), ...crane.done()],
    update(time, clock) {
      const span = belt.x1 - belt.x0;
      bottles.forEach((id, i) => {
        const f = (((i / bottles.length - time * 0.09) % 1) + 1) % 1;
        const x = belt.x0 + f * span;
        const wobble = Math.sin(time * 9 + i * 2) * 0.05;
        rig.set(id, pose(m, x, belt.y, belt.z, 0, 0, wobble));
      });
      const shake = valueNoise(time * 7, 2, 9);
      rig.set(needle, pose(m, dial.x, dial.y, dial.z - 0.12, Math.PI, 0, -0.9 + 0.5 * Math.sin(time * 0.8) + shake * 0.4));
      rig.set(wheelPart, pose(m, wheelAt.x, wheelAt.y, wheelAt.z, 0, 0, time * 1.4));
      pistons.forEach((id, i) => {
        const up = Math.abs(Math.sin(time * 2.4 + i * 1.6));
        rig.set(id, pose(m, pistonAt[i].x, pistonAt[i].y + 3.2 + up * 1.4, pistonAt[i].z));
      });
      rig.flush();

      // The churn is drawn exactly where it hits. The trolley lags a little inside it, so the cable swings.
      const at = hazardAt(track, churnHazard, clock);
      const lean = at.offset * 0.26;
      const topO = at.offset - lean;
      const head = frame(cp, topO, reachTop - 1);
      const tip = frame(cp, at.offset, 4);
      const drop = head.distanceTo(tip);
      const roll = Math.atan2(lean, drop);
      crane.set(trolley, pose(m, head.x, head.y, head.z, cy));
      crane.set(cable, pose(m, head.x, head.y, head.z, cy, 0, roll, 1, drop, 1));
      crane.set(churnPart, pose(m, at.x, at.y + 0.5 + Math.abs(at.offset) * 0.06, at.z, cy + time, 0, roll * 0.8));
      for (const s of smoke) {
        const f = (s.t + time * 0.12) % 1;
        const size = 1.4 + f * 5;
        crane.set(s.id, pose(m, s.x + f * 16 + Math.sin(f * 7 + s.t) * 2, s.y + f * 30, s.z - f * 7, f * 3, 0, 0, size));
      }
      crane.flush();
    },
  };
}
