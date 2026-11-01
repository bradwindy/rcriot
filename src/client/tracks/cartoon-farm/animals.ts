import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { limitOf, sampleAt, type Track } from '../../../shared/track';
import { ball, xf, type RGB } from '../../render/geometry';
import { frame, headingAt } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import { MAP } from './ground';
import { C, rgb, type Looks } from './look';
import { InkRig, pose, type Toon } from './toon';

type Shape = { g: THREE.BufferGeometry; m?: THREE.Matrix4; color?: RGB; t?: number };

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** A woolly cartoon sheep facing -z, about 2.5 long, standing on y = 0. */
function sheepShapes(): Shape[] {
  const wool = rgb(C.wool);
  const face = rgb(C.face);
  const out: Shape[] = [{ g: ball(0.95, 1.1, 0.86, 1.2, 6), m: xf(0, 1.15, 0), color: wool, t: 0.08 }];
  for (const [x, y, z, r] of [
    [0, 1.55, -0.55, 0.55],
    [0, 1.6, 0.45, 0.6],
    [0.72, 1.2, 0.1, 0.5],
    [-0.72, 1.2, 0.1, 0.5],
  ]) {
    out.push({ g: ball(r, 1, 1, 1, 5), m: xf(x, y, z), color: wool, t: 0.06 });
  }
  out.push({ g: ball(0.42, 0.9, 1, 1.15, 5), m: xf(0, 1.32, -1.3), color: face, t: 0.04 });
  out.push({ g: ball(0.33, 1.1, 0.8, 1, 4), m: xf(0, 1.78, -1.15), color: wool, t: 0 });
  for (const side of [-1, 1]) {
    out.push({ g: new THREE.BoxGeometry(0.5, 0.14, 0.22), m: xf(side * 0.48, 1.5, -1.22, 0, 0, side * -0.3), color: face, t: 0 });
    out.push({ g: ball(0.14, 1, 1, 0.7, 4), m: xf(side * 0.2, 1.42, -1.66), color: [1, 1, 1], t: 0 });
    out.push({ g: new THREE.BoxGeometry(0.11, 0.11, 0.06), m: xf(side * 0.2, 1.42, -1.77), color: rgb(C.ink), t: 0 });
    for (const z of [-0.6, 0.65]) out.push({ g: new THREE.BoxGeometry(0.24, 0.8, 0.24), m: xf(side * 0.42, 0.4, z), color: face, t: 0.03 });
  }
  return out;
}

/** A plump white hen facing -z, about 1.2 tall. Her wings are separate parts. */
function henShapes(): Shape[] {
  const white = rgb(C.white);
  const red = rgb(C.red);
  const out: Shape[] = [
    { g: ball(0.5, 1, 0.92, 1.25, 6), m: xf(0, 0.72, 0), color: white, t: 0.05 },
    { g: ball(0.3, 1, 1.1, 1, 5), m: xf(0, 1.16, -0.46), color: white, t: 0.04 },
    { g: new THREE.ConeGeometry(0.32, 0.8, 4), m: xf(0, 1.0, 0.68, 0, -0.6), color: white, t: 0.04 },
    { g: new THREE.ConeGeometry(0.1, 0.3, 4), m: xf(0, 1.14, -0.8, 0, -Math.PI / 2), color: rgb(C.orange), t: 0.02 },
    { g: ball(0.09, 1, 1.5, 0.7, 4), m: xf(0, 0.94, -0.72), color: red, t: 0 },
  ];
  for (const [y, z, r] of [
    [1.5, -0.56, 0.1],
    [1.52, -0.42, 0.12],
    [1.46, -0.28, 0.09],
  ]) {
    out.push({ g: ball(r, 0.7, 1.2, 1, 4), m: xf(0, y, z), color: red, t: 0.02 });
  }
  for (const side of [-1, 1]) {
    out.push({ g: ball(0.07, 1, 1, 1, 4), m: xf(side * 0.2, 1.24, -0.68), color: rgb(C.ink), t: 0 });
    out.push({ g: new THREE.BoxGeometry(0.08, 0.34, 0.08), m: xf(side * 0.2, 0.17, 0), color: rgb(C.orange), t: 0.02 });
    out.push({ g: new THREE.BoxGeometry(0.2, 0.05, 0.3), m: xf(side * 0.2, 0.03, -0.08), color: rgb(C.orange), t: 0 });
  }
  return out;
}

function duckShapes(body: RGB): Shape[] {
  return [
    { g: ball(0.72, 1, 0.72, 1.3, 6), m: xf(0, 0.42, 0), color: body, t: 0.05 },
    { g: ball(0.42, 1, 1, 1, 6), m: xf(0, 1.12, -0.72), color: body, t: 0.05 },
    { g: new THREE.ConeGeometry(0.3, 0.9, 4), m: xf(0, 0.76, 0.98, 0, -0.75), color: body, t: 0.03 },
    { g: ball(0.26, 1.1, 0.34, 1.2, 5), m: xf(0, 1.06, -1.18), color: rgb(C.orange), t: 0.03 },
    { g: ball(0.09, 1, 1, 1, 4), m: xf(0.26, 1.26, -1.0), color: rgb(C.ink), t: 0 },
    { g: ball(0.09, 1, 1, 1, 4), m: xf(-0.26, 1.26, -1.0), color: rgb(C.ink), t: 0 },
  ];
}

function cow(toon: Toon, L: Looks, at: THREE.Vector3, yaw: number): void {
  const m = xf(at.x, at.y, at.z, yaw);
  const part = (x: number, y: number, z: number, ry = 0, rx = 0) => m.clone().multiply(xf(x, y, z, ry, rx));
  toon.shape(L.cow, new THREE.BoxGeometry(1.6, 1.5, 3.1), part(0, 2.0, 0), [1, 1, 1], 0.09);
  toon.shape(L.cow, new THREE.BoxGeometry(1.0, 1.1, 1.2), part(0, 2.7, -2.0, 0, -0.2), [1, 1, 1], 0.08);
  toon.box(L.flat, 1.04, 0.6, 0.6, part(0, 2.4, -2.72, 0, -0.2), rgb(C.pink), 0.06);
  for (const side of [-1, 1]) {
    toon.ball(L.flat, 0.09, part(side * 0.24, 2.42, -3.04), rgb(C.ink), 0, 1, 1, 1, 4);
    toon.ball(L.flat, 0.15, part(side * 0.34, 2.96, -2.56), [1, 1, 1], 0, 1, 1, 1, 4);
    toon.ball(L.flat, 0.08, part(side * 0.34, 2.96, -2.68), rgb(C.ink), 0, 1, 1, 1, 4);
    toon.box(L.flat, 0.5, 0.2, 0.3, part(side * 0.72, 3.1, -1.76, 0, 0), rgb(C.face), 0.04);
    toon.shape(L.flat, new THREE.ConeGeometry(0.12, 0.5, 5), part(side * 0.38, 3.45, -1.92), rgb(C.cream), 0.03);
    for (const z of [-1.2, 1.2]) toon.box(L.flat, 0.42, 1.3, 0.42, part(side * 0.52, 0.65, z), z < 0 ? rgb(C.white) : rgb(C.face), 0.06);
  }
  toon.ball(L.flat, 0.48, part(0, 1.15, 0.9), rgb(C.pink), 0.05, 1, 0.65, 1, 6);
  toon.beam(L.flat, new THREE.Vector3(0, 2.6, 1.58).applyMatrix4(m), new THREE.Vector3(0.1, 1.2, 1.8).applyMatrix4(m), 0.1, 0.1, rgb(C.face), 0.03);
}

export interface Menagerie {
  group: THREE.Object3D[];
  update(time: number, clock: number, camera: THREE.Camera): void;
}

/** The farm's animals: bouncing sheep, the giant sheep on the road, hens flapping in the coop, ducks and cows. */
export function menagerie(track: Track, toon: Toon, L: Looks, terrain: Terrain, index: TrackIndex, sheepHazard: Hazard): Menagerie {
  const rng = mulberry32(2024);
  const clear = (x: number, z: number, margin: number) => {
    const near = index.nearest(x, z, 40);
    return !near || near.d > limitOf(near.sample) + margin;
  };
  // One rig for each corner of the farm, so only the ones near the camera are moved and sent to the GPU each frame.
  const rig = new InkRig(L);
  const coopRig = new InkRig(L);
  const pondRig = new InkRig(L);
  const fluffy = sheepShapes();

  // Field sheep, scattered in flocks beside the road and up Big Hill.
  const flock: { id: number; x: number; y: number; z: number; yaw: number; hop: number; rate: number; high: number; size: number; flip: boolean }[] = [];
  const herds: [number, number, number, number][] = [
    [290, -24, 24, 4],
    [240, 8, 22, 3],
    [238, 62, 20, 3],
    [300, 44, 26, 4],
    [150, 40, 40, 3],
    [296, 118, 26, 2],
  ];
  for (const [cx, cz, spread, n] of herds) {
    for (let k = 0; k < n * 2 && flock.filter((f) => Math.hypot(f.x - cx, f.z - cz) < spread * 1.6).length < n; k++) {
      const x = cx + (rng() - 0.5) * spread * 2;
      const z = cz + (rng() - 0.5) * spread * 2;
      if (!clear(x, z, 3.5)) continue;
      const size = 1.25 + rng() * 0.6;
      flock.push({
        id: rig.part(fluffy),
        x,
        y: terrain.height(x, z),
        z,
        yaw: rng() * Math.PI * 2,
        hop: rng(),
        rate: 0.8 + rng() * 0.5,
        high: 2.2 + rng() * 3.4,
        size,
        flip: rng() < 0.35,
      });
    }
  }

  // The giant sheep, drawn on its own so it can be seen from far up the road.
  const giant = rig.part(fluffy);
  const road = sampleAt(track, sheepHazard.s);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), L.shadow);
  shadow.renderOrder = 1;

  // Hens in and round the coop.
  const coop = new THREE.Vector3(45, 0, 143);
  coop.y = terrain.height(coop.x, coop.z);
  {
    const m = xf(coop.x, coop.y, coop.z, 0.5);
    const part = (x: number, y: number, z: number, ry = 0, rz = 0) => m.clone().multiply(xf(x, y, z, ry, 0, rz));
    const [W, D] = [9, 7];
    for (const [x, z] of [
      [-W / 2, -D / 2],
      [W / 2, -D / 2],
      [-W / 2, D / 2],
      [W / 2, D / 2],
    ]) {
      toon.box(L.wood, 0.5, 3, 0.5, part(x, 1.5, z), [1, 1, 1], 0.06);
    }
    toon.box(L.barn, W + 0.5, 4.6, D + 0.5, part(0, 5.2, 0), [1, 1, 1], 0.12);
    toon.box(L.boards, W + 1.8, 0.35, D + 1.8, part(0, 2.9, 0), [1, 1, 1], 0.08);
    for (const side of [-1, 1]) {
      toon.box(L.shingles, Math.hypot(W / 2 + 1.4, 3.2) + 0.2, 0.34, D + 2.4, part((side * (W / 2 + 1.4)) / 2, 9.2, 0, 0, -side * Math.atan2(3.2, W / 2 + 1.4)), [1, 1, 1], 0.1);
    }
    for (const side of [-1, 1]) {
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2 - 0.2, 0, 0, W / 2 + 0.2, 0, 0, 0, 3.1, 0], 3));
      tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 1, 1], 2));
      tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      toon.batch.geometry(L.barn, tri, part(0, 7.5, (side * (D + 0.5)) / 2 + side * 0.02, side > 0 ? 0 : Math.PI));
    }
    // Pop-hole doors with a hen peering out, and a gangplank.
    for (const x of [-2.6, 2.6]) {
      toon.box(L.flat, 1.5, 1.8, 0.12, part(x, 4.3, D / 2 + 0.3), rgb(C.ink), 0.05);
      toon.box(L.flat, 2, 0.26, 0.2, part(x, 5.3, D / 2 + 0.32), rgb(C.white), 0.03);
    }
    toon.box(L.boards, 2, 0.2, 6.4, m.clone().multiply(xf(0, 1.55, D / 2 + 2.7, 0, 0.5)), [1, 1, 1], 0.05);
    // A chicken-wire run.
    const run = { w: 20, d: 18 };
    const posts: [number, number][] = [
      [-run.w / 2, -run.d / 2],
      [run.w / 2, -run.d / 2],
      [run.w / 2, run.d / 2],
      [-run.w / 2, run.d / 2],
    ];
    posts.forEach(([x, z], i) => {
      const [nx, nz] = posts[(i + 1) % 4];
      const len = Math.hypot(nx - x, nz - z);
      const g = new THREE.PlaneGeometry(len, 2.6);
      const uv = g.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) * len) / 1.2, (uv.getY(k) * 2.6) / 1.2);
      toon.batch.geometry(L.mesh, g, part((x + nx) / 2, 1.3, (z + nz) / 2, Math.atan2(-(nz - z), nx - x)));
      for (let k = 0; k <= Math.round(len / 4); k++) {
        const f = k / Math.round(len / 4);
        toon.box(L.wood, 0.28, 3, 0.28, part(x + (nx - x) * f, 1.5, z + (nz - z) * f), [1, 1, 1], 0.05);
      }
      toon.beam(L.wood, new THREE.Vector3(x, 2.9, z).applyMatrix4(m), new THREE.Vector3(nx, 2.9, nz).applyMatrix4(m), 0.18, 0.18, [1, 1, 1], 0.04);
    });
    // Giant eggs for the comic relief, and a feed trough.
    toon.ball(L.flat, 1.4, part(6.6, 1.6, -5), rgb(C.cream), 0.08, 1, 1.25, 1, 8);
    toon.ball(L.flat, 1.1, part(8.2, 1.25, -2.6), rgb(C.white), 0.07, 1, 1.25, 1, 8);
    toon.box(L.wood, 5, 0.7, 1.1, part(-5, 0.5, 6.4, 0.3), [1, 1, 1], 0.06);
    toon.box(L.hay, 4.6, 0.3, 0.8, part(-5, 0.8, 6.4, 0.3), [1, 1, 1], 0);
  }
  const henBody = henShapes();
  const wing: Shape[] = [{ g: ball(0.34, 0.26, 0.7, 1.1, 5), color: [0.9, 0.9, 0.92], t: 0.03 }];
  const hens: { body: number; left: number; right: number; x: number; y: number; z: number; yaw: number; hop: number; rate: number }[] = [];
  const henSpots: [number, number][] = [
    [-7, -5],
    [-8, 3],
    [-2, 7],
    [2, 6],
    [7, 3],
    [8, -7],
    [-1, 4],
  ];
  const place = xf(coop.x, coop.y, coop.z, 0.5);
  for (const [lx, lz] of henSpots) {
    const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(place);
    v.y = terrain.height(v.x, v.z);
    hens.push({ body: coopRig.part(henBody), left: coopRig.part(wing), right: coopRig.part(wing), x: v.x, y: v.y, z: v.z, yaw: rng() * 6.28, hop: rng(), rate: 1.2 + rng() });
  }
  // A rooster crowing on the ridge.
  const crow = (() => {
    const v = new THREE.Vector3(0, 10.7, 0).applyMatrix4(place);
    return { body: coopRig.part(henBody), left: coopRig.part(wing), right: coopRig.part(wing), x: v.x, y: v.y, z: v.z, yaw: 1.2, hop: 0, rate: 0.5 };
  })();
  hens.push(crow);

  // Ducks paddling round the pond, and one enormous rubber duck.
  const ducks: { id: number; r: number; a: number; speed: number; cx: number; cz: number; size: number }[] = [];
  const yellow = duckShapes(rgb(C.yellow));
  const white = duckShapes(rgb(C.white));
  for (let i = 0; i < 8; i++) {
    const a = rng() * 6.28;
    ducks.push({
      id: pondRig.part(i % 3 === 0 ? white : yellow),
      r: 0.35 + rng() * 0.4,
      a,
      speed: (rng() < 0.5 ? -1 : 1) * (0.06 + rng() * 0.08),
      cx: MAP.pond.x + (rng() - 0.5) * 18,
      cz: MAP.pond.z + (rng() - 0.5) * 8,
      size: 1,
    });
  }
  const bigDuck = pondRig.part(duckShapes(rgb(C.yellow)));
  for (let i = 0; i < 16; i++) {
    const a = rng() * 6.28;
    const r = 0.25 + rng() * 0.6;
    const x = MAP.pond.x + Math.cos(a) * MAP.pond.rx * r;
    const z = MAP.pond.z + Math.sin(a) * MAP.pond.rz * r;
    const s = 1 + rng() * 1.3;
    toon.batch.geometry(L.flat, new THREE.CylinderGeometry(s, s, 0.06, 8), xf(x, 0.1, z, rng() * 3), rgb(C.leaf));
    if (rng() < 0.45) toon.ball(L.flat, 0.3, xf(x, 0.4, z), rgb(C.pink), 0.04, 1, 0.8, 1, 5);
  }
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2;
    const x = MAP.pond.x + Math.cos(a) * MAP.pond.rx * (0.97 + rng() * 0.14);
    const z = MAP.pond.z + Math.sin(a) * MAP.pond.rz * (0.97 + rng() * 0.14);
    if (!clear(x, z, 1)) continue;
    const y = Math.max(terrain.height(x, z), 0);
    for (const turn of [0, Math.PI / 2]) toon.batch.geometry(L.reeds, new THREE.PlaneGeometry(3.4, 2.6), xf(x, y + 1.2, z, a + turn));
  }

  // Cows watching the cars go by from the field beside the factory.
  for (const [x, z, yaw] of [
    [252, 118, 0.4],
    [262, 132, 1.9],
    [247, 140, -0.5],
    [120, 118, 2.6],
    [132, 132, 3.6],
    [108, 136, 2.2],
  ]) {
    if (clear(x, z, 3)) cow(toon, L, new THREE.Vector3(x, terrain.height(x, z), z), yaw);
  }

  const m = new THREE.Matrix4();
  const hen = new THREE.Matrix4();
  const wingM = new THREE.Matrix4();
  const P = sheepHazard.period;
  let ready = false;
  return {
    group: [...rig.done(), ...coopRig.done(), ...pondRig.done(), shadow],
    update(time, clock, camera) {
      const eye = camera.position;
      const near = (x: number, z: number, r: number) => !ready || Math.hypot(x - eye.x, z - eye.z) < r;
      for (const s of flock) {
        if (!near(s.x, s.z, 200)) continue;
        const beat = (time * s.rate + s.hop) % 1;
        const n = Math.floor(time * s.rate + s.hop);
        const air = 4 * beat * (1 - beat);
        const y = air * s.high;
        const squash = 1 - 0.32 * clamp01(1 - air * 5);
        const stretch = 1 + 0.16 * air;
        const flip = s.flip && n % 4 === 0 ? smooth(beat) * Math.PI * 2 : 0;
        rig.set(s.id, pose(m, s.x, s.y + y, s.z, s.yaw + n * 0.7, flip, 0, s.size / Math.sqrt(squash * stretch), s.size * squash * stretch, s.size / Math.sqrt(squash * stretch)));
      }

      // The giant sheep sits in the road for the live part of the hazard's cycle, then bounds over the fence and back.
      const at = hazardAt(track, sheepHazard, clock);
      const duty = sheepHazard.duty;
      const lap = Math.floor(clock / P + sheepHazard.phase);
      const side = lap % 2 === 0 ? 1 : -1;
      const out = limitOf(road) + 6;
      let offset = 0;
      let lift = 0;
      let squash: number;
      const t = at.t;
      if (t < duty) {
        const f = t / duty;
        squash = 1 - 0.34 * Math.sin(f * Math.PI);
      } else if (t < 0.62) {
        const f = (t - duty) / (0.62 - duty);
        offset = side * out * f;
        lift = 4 * f * (1 - f) * 9;
        squash = 1 + 0.2 * Math.sin(f * Math.PI);
      } else if (t < 0.74) {
        offset = side * out;
        squash = 1 - 0.3 * Math.sin(((t - 0.62) / 0.12) * Math.PI);
      } else {
        const f = (t - 0.74) / 0.26;
        offset = side * out * (1 - f);
        lift = 4 * f * (1 - f) * 9;
        squash = 1 + 0.2 * Math.sin(f * Math.PI);
      }
      const base = frame(road, offset, 0);
      const ground = Math.abs(offset) > limitOf(road) + 1 ? terrain.height(base.x, base.z) : base.y;
      const SIZE = 2.1;
      const face = headingAt(road) + Math.PI + (side > 0 ? -Math.PI / 2 : Math.PI / 2) * clamp01(Math.abs(lift));
      rig.set(giant, pose(m, base.x, ground + lift + 0.05, base.z, face, 0, 0, SIZE / Math.sqrt(squash), SIZE * squash, SIZE / Math.sqrt(squash)));
      const size = 3.6 * (1 - clamp01(lift / 14) * 0.5);
      shadow.position.set(base.x, ground + 0.12, base.z);
      shadow.scale.set(size, 1, size * 1.3);
      shadow.rotation.y = face;

      rig.flush();

      for (const h of near(coop.x, coop.z, 180) ? hens : []) {
        const beat = (time * h.rate + h.hop) % 1;
        const rush = Math.sin(time * 0.7 + h.hop * 9) > 0.1;
        const air = rush ? 4 * beat * (1 - beat) : 0;
        const peck = rush ? 0 : Math.max(0, Math.sin(time * 5 + h.hop * 20)) * 0.45;
        pose(hen, h.x, h.y + air * 0.9, h.z, h.yaw + (rush ? Math.floor(time * h.rate + h.hop) * 0.9 : 0), peck);
        coopRig.set(h.body, hen);
        const flap = rush ? Math.sin(time * 26 + h.hop * 9) * 0.7 + 0.5 : 0.08;
        coopRig.set(h.left, wingM.copy(hen).multiply(pose(m, 0.52, 0.86, 0, 0, 0, -flap)));
        coopRig.set(h.right, wingM.copy(hen).multiply(pose(m, -0.52, 0.86, 0, 0, 0, flap)));
      }
      if (near(coop.x, coop.z, 180)) coopRig.flush();

      if (!near(MAP.pond.x, MAP.pond.z, 240)) return;
      for (const d of ducks) {
        const a = d.a + time * d.speed;
        const x = d.cx + Math.cos(a) * MAP.pond.rx * d.r * 0.6;
        const z = d.cz + Math.sin(a) * MAP.pond.rz * d.r * 0.6;
        const yaw = Math.atan2(-(-Math.sin(a) * d.speed), -(Math.cos(a) * d.speed));
        pondRig.set(d.id, pose(m, x, 0.02 + Math.sin(time * 2 + d.a) * 0.05, z, yaw, 0, Math.sin(time * 1.6 + d.a) * 0.06));
      }
      pondRig.set(bigDuck, pose(m, MAP.pond.x + 4, 0 + Math.sin(time * 1.1) * 0.25, MAP.pond.z + 2, 0.5 + Math.sin(time * 0.3) * 0.5, Math.sin(time * 0.9) * 0.05, Math.sin(time * 0.7) * 0.05, 5));
      pondRig.flush();
      ready = true;
    },
  };
}
