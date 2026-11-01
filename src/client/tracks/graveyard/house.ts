import * as THREE from 'three';
import { coverRanges, limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { xf } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { box, frame, headingAt, loft, rope } from '../../render/road';
import { candles, column, cube, jackOLantern, type Kit, panel, pyramid, slab, WARM } from './kit';

/** Half-widths of the hall and of the walls' outer faces, and the heights of the ceiling, eaves and roof ridge. */
const HALL = 9;
const OUTER = 10.5;
const CEILING = 15.5;
const EAVES = 18;
const RIDGE = 28;
/** Half-width and height of the great doors. */
const DOOR = 7.6;
const DOOR_TALL = 6.8;

/** The haunted house's own axes, for the ghosts that drift about it. */
export interface House {
  /** A world point: `along` from the front door, `across` to the right of the road, at height `y`. */
  at(along: number, across: number, y: number): THREE.Vector3;
  length: number;
  floor: number;
  ceiling: number;
}

const GHOST_LIGHT = new THREE.Color(0.45, 0.8, 1.0);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The haunted house: a tall dark mansion the road runs straight through, in at the front door, up the grand stairs,
 * off the landing and out of the back door.
 */
export function buildHouse(track: Track, kit: Kit): House {
  const { batch, g, mats } = kit;
  const halls = coverRanges(track, 'indoor');
  const s0 = halls[0][0];
  const s1 = halls[halls.length - 1][1];
  const p0 = sampleAt(track, s0);
  const p1 = sampleAt(track, s1);
  // The house's axis runs door to door along the road, so its floors line up with the road's edges all the way.
  const F = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();
  const R = new THREE.Vector3(-F.z, 0, F.x);
  const yaw = Math.atan2(-F.x, -F.z);
  const O = new THREE.Vector3(p0.x, 0, p0.z);
  const at = (al: number, ac: number, y: number) => O.clone().addScaledVector(F, al).addScaledVector(R, ac).setY(y);
  const L = s1 - s0;
  const floorF = p0.y;
  const floorB = sampleAt(track, s1).y;
  const ground = Math.min(kit.terrain.height(O.x, O.z), 1) - 1.5;
  const limit = limitOf(p0);
  // The back hall starts where the road comes down off the landing.
  let backHall = L;
  for (let al = L; al > 0; al -= 0.5) {
    if (sampleAt(track, s0 + al).y > floorB + 0.25) {
      backHall = al;
      break;
    }
  }
  const floorAt = (al: number) => (al < backHall ? floorF : floorB);

  /** A block spanning ranges of along, across and height, its texture repeating every `unit` metres. */
  const block = (mat: THREE.Material, al0: number, al1: number, ac0: number, ac1: number, y0: number, y1: number, unit: number, color?: [number, number, number]) => {
    const c = at((al0 + al1) / 2, (ac0 + ac1) / 2, (y0 + y1) / 2);
    slab(batch, mat, xf(c.x, c.y, c.z, yaw), ac1 - ac0, y1 - y0, al1 - al0, unit, color);
  };

  // The shell.
  for (const side of [-1, 1]) {
    const [a, b] = side < 0 ? [-OUTER, -HALL - 0.2] : [HALL + 0.2, OUTER];
    block(g.siding, -1.5, L + 1.5, a, b, ground, EAVES, 6);
    block(g.blocks, -1.8, L + 1.8, side < 0 ? -OUTER - 0.3 : HALL + 0.2, side < 0 ? -HALL - 0.2 : OUTER + 0.3, ground, floorF + 0.6, 6, [0.75, 0.75, 0.8]);
    block(g.iron, -2, L + 2, side < 0 ? -OUTER - 0.5 : OUTER - 0.1, side < 0 ? -OUTER + 0.1 : OUTER + 0.5, EAVES - 0.5, EAVES, 4);
    for (const [al0, al1] of [
      [-1.5, -0.15],
      [L + 0.15, L + 1.5],
    ]) {
      block(g.siding, al0, al1, side < 0 ? -HALL : DOOR, side < 0 ? -DOOR : HALL, ground, EAVES, 6);
    }
  }
  block(g.siding, -1.5, -0.15, -DOOR, DOOR, floorF + DOOR_TALL, EAVES, 6);
  block(g.siding, L + 0.15, L + 1.5, -DOOR, DOOR, floorB + DOOR_TALL, EAVES, 6);

  // Door frames, and each door swung open inside the hall.
  for (const [al, floor] of [
    [-1.7, floorF],
    [L + 1.7, floorB],
  ]) {
    block(g.stone, al - 0.2, al + 0.2, -DOOR - 0.7, DOOR + 0.7, floor + DOOR_TALL, floor + DOOR_TALL + 0.9, 3, [0.7, 0.7, 0.78]);
    for (const side of [-1, 1]) block(g.stone, al - 0.2, al + 0.2, side * (DOOR + 0.35) - 0.35, side * (DOOR + 0.35) + 0.35, floor - 1, floor + DOOR_TALL, 3, [0.7, 0.7, 0.78]);
  }

  // Inside walls, cut small so the candles light them in pools. The lower share of the paper is dark panelling.
  const paper = (x: number, y: number): [number, number] => [y / (CEILING - floorF), x / 8];
  for (const side of [-1, 1]) {
    const a = side > 0 ? at(L, HALL, floorF) : at(0, -HALL, floorF);
    const u = F.clone().multiplyScalar(side > 0 ? -L : L);
    panel(batch, g.wallpaper, a, u, UP.clone().multiplyScalar(CEILING - floorF), 3, paper);
    // Either side of each door.
    panel(batch, g.wallpaper, at(0, side > 0 ? DOOR : -HALL, floorF), R.clone().multiplyScalar(HALL - DOOR), UP.clone().multiplyScalar(CEILING - floorF), 3, paper);
    panel(batch, g.wallpaper, at(L, side > 0 ? HALL : -DOOR, floorF), R.clone().multiplyScalar(DOOR - HALL), UP.clone().multiplyScalar(CEILING - floorF), 3, paper);
  }
  panel(batch, g.wallpaper, at(0, -DOOR, floorF + DOOR_TALL), R.clone().multiplyScalar(2 * DOOR), UP.clone().multiplyScalar(CEILING - floorF - DOOR_TALL), 3, (x, y) => paper(x, y + DOOR_TALL));
  panel(batch, g.wallpaper, at(L, DOOR, floorB + DOOR_TALL), R.clone().multiplyScalar(-2 * DOOR), UP.clone().multiplyScalar(CEILING - floorB - DOOR_TALL), 3, (x, y) => paper(x, y + DOOR_TALL));

  // Ceiling and its beams.
  const boards = (x: number, y: number): [number, number] => [x / 8, y / 8];
  panel(batch, mats.planksIndoor, at(0, -HALL, CEILING), F.clone().multiplyScalar(L), R.clone().multiplyScalar(2 * HALL), 4, boards, [0.6, 0.55, 0.6]);
  for (let al = 3; al < L; al += 7) block(mats.planksIndoor, al - 0.45, al + 0.45, -HALL, HALL, CEILING - 1, CEILING, 4, [0.55, 0.5, 0.5]);

  // Boards either side of the road, down at hall level under the stairs.
  for (const side of [-1, 1]) {
    // They run a little under the road's own edge, so no crack shows between them.
    const a0 = side > 0 ? limit - 0.6 : -HALL;
    const w = HALL - limit + 0.6;
    panel(batch, mats.planksIndoor, at(0, a0, floorF - 0.03), R.clone().multiplyScalar(w), F.clone().multiplyScalar(backHall), 3, boards, [0.7, 0.62, 0.6]);
    panel(batch, mats.planksIndoor, at(backHall, a0, floorB - 0.03), R.clone().multiplyScalar(w), F.clone().multiplyScalar(L - backHall), 3, boards, [0.7, 0.62, 0.6]);
    block(mats.planksIndoor, backHall - 0.2, backHall + 0.2, side > 0 ? limit : -HALL, side > 0 ? HALL : -limit, floorF, floorB, 4, [0.6, 0.55, 0.55]);
  }

  // The grand staircase: panelled sides under the road, banisters up both edges, a broken end at the landing.
  const [stairs] = zoneRanges(track, 'stairs');
  let lip = stairs[0];
  for (let s = stairs[0], top = -Infinity; s < s1; s += 0.5) {
    const y = sampleAt(track, s).y;
    if (y > top) {
      top = y;
      lip = s;
    }
  }
  for (const side of [-1, 1]) {
    loft(batch, track, stairs[0] - 2, s0 + backHall + 1, {
      spacing: 1.5,
      vScale: 6,
      uScale: 6,
      material: () => mats.planksIndoor,
      color: [0.6, 0.5, 0.48],
      outward: side > 0,
      profile: (p: Sample) => [
        [side * limitOf(p), -p.y + floorF - 0.1],
        [side * limitOf(p), 0],
      ],
    });
    let last: THREE.Vector3 | null = null;
    for (let s = stairs[0] - 1, k = 0; s < lip - 1; s += 0.9, k++) {
      const p = sampleAt(track, s);
      const foot = frame(p, side * (limitOf(p) + 0.18), 0);
      box(batch, mats.planksIndoor, 0.14, 1.1, 0.14, xf(foot.x, foot.y + 0.55, foot.z, yaw), [0.75, 0.6, 0.5]);
      const rail = foot.clone().setY(foot.y + 1.15);
      if (last) rope(batch, mats.planksIndoor, last, rail, 0.22);
      last = rail;
    }
    // The newel post at the foot of the stairs, with a skull for a finial.
    const q = sampleAt(track, stairs[0] - 2);
    const foot = frame(q, side * (limitOf(q) + 0.2), 0);
    cube(batch, mats.planksIndoor, xf(foot.x, foot.y + 1.1, foot.z, yaw), 0.55, 2.2, 0.55, [0.7, 0.55, 0.45]);
    batch.geometry(g.bone, new THREE.IcosahedronGeometry(0.32, 1), xf(foot.x, foot.y + 2.5, foot.z));
    // A splintered stump of banister at the edge of the landing.
    const end = sampleAt(track, lip);
    const stump = frame(end, side * (limitOf(end) + 0.18), 1.15);
    rope(batch, mats.planksIndoor, stump, stump.clone().add(new THREE.Vector3(F.x * 1.6, -1.5, F.z * 1.6)), 0.2);
  }

  // Chandeliers, candle tables, portraits, a clock and cobwebs.
  chandelier(kit, at(9, 0, CEILING - 1), 5.4, 2.7);
  chandelier(kit, at(backHall + 6.5, 0, CEILING - 1), 4.6, 2.4);
  chandelier(kit, at(backHall - 15, 0, CEILING - 1), 3, 2.2);
  for (const side of [-1, 1]) {
    for (const al of [backHall - 22, backHall - 8]) {
      const v = at(al, side * (HALL - 0.35), 9.5);
      box(batch, g.iron, 0.6, 0.1, 0.1, xf(v.x, v.y, v.z, yaw));
      candles(kit, v.clone().setY(v.y + 0.05), yaw, 3, al < backHall - 15);
    }
  }
  for (const [al, side] of [
    [4, -1],
    [15, 1],
    [L - 5, -1],
    [L - 4, 1],
  ]) {
    const v = at(al, side * (HALL - 0.8), floorAt(al));
    cube(batch, mats.planksIndoor, xf(v.x, v.y + 0.75, v.z, yaw), 1.3, 1.5, 2.6, [0.6, 0.48, 0.42]);
    candles(kit, v.clone().setY(v.y + 1.5), yaw, 5, true);
  }
  const art = (al: number, side: number, y: number, size: number) => {
    const v = at(al, side * (HALL - 0.06), y);
    batch.geometry(g.portrait, new THREE.PlaneGeometry(size, size * 1.2), xf(v.x, v.y, v.z, Math.atan2(-R.x * side, -R.z * side)));
  };
  for (const [al, side, y] of [
    [6, 1, 8.6],
    [12.5, -1, 8.6],
    [20, 1, 9.2],
    [27, -1, 10.2],
    [34, 1, 11.2],
    [41, -1, 11],
    [L - 12, 1, 9.4],
    [L - 9, -1, 9.4],
  ]) {
    art(al, side, y, al < 30 ? 3.4 : 4.2);
  }
  const clock = at(21, -(HALL - 0.8), floorF);
  cube(batch, mats.planksIndoor, xf(clock.x, clock.y + 2.4, clock.z, yaw), 1.2, 4.8, 1.3, [0.5, 0.36, 0.3]);
  batch.geometry(g.bone, new THREE.CircleGeometry(0.46, 10), xf(clock.x + R.x * 0.61, clock.y + 3.9, clock.z + R.z * 0.61, Math.atan2(R.x, R.z)));
  for (const [al, side] of [
    [0.6, -1],
    [0.6, 1],
    [L - 0.6, -1],
    [L - 0.6, 1],
    [backHall - 4, 1],
  ]) {
    const v = at(al, side * (HALL - 2.2), CEILING - 2.6);
    batch.geometry(g.web, new THREE.PlaneGeometry(5, 5), xf(v.x, v.y, v.z, yaw + Math.PI / 2 + side * 0.5, 0, side * 0.7));
  }
  // Ghost light, pale and slow, up the stairs and in the back hall.
  kit.light(at(24, 4, 8), GHOST_LIGHT.clone().multiplyScalar(1.1), 18, 0.8, 0.6);
  kit.light(at(backHall + 2, -3, 8), GHOST_LIGHT.clone().multiplyScalar(0.9), 18, 0.6, 0.6);

  // Stained glass over the back door, the thing to aim for going up the stairs.
  const glass = at(L - 0.05, 0, floorB + DOOR_TALL + 2.7);
  batch.geometry(g.glass, new THREE.PlaneGeometry(8.4, 4.8), xf(glass.x, glass.y, glass.z, Math.atan2(-F.x, -F.z)));
  kit.light(glass.clone().addScaledVector(F, -3), new THREE.Color(0.85, 0.3, 0.85).multiplyScalar(1.2), 18, 1.2, 0.2);

  roof(kit, at, L);
  outside(kit, at, F, R, L, floorF);
  frontPorch(kit, at, yaw, floorF);
  backPorch(track, kit, s1);
  return { at, length: L, floor: floorF, ceiling: CEILING };
}

function chandelier(kit: Kit, top: THREE.Vector3, drop: number, r: number): void {
  const { batch, g, mats } = kit;
  const hub = top.clone().setY(top.y - drop);
  box(batch, g.iron, 0.14, drop, 0.14, xf(top.x, top.y - drop / 2, top.z));
  const n = 8;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 1) / n) * Math.PI * 2;
    const v0 = hub.clone().add(new THREE.Vector3(Math.cos(a0) * r, 0, Math.sin(a0) * r));
    const v1 = hub.clone().add(new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r));
    rope(batch, g.iron, v0, v1, 0.16);
    rope(batch, g.iron, hub.clone().setY(hub.y + 1.1), v0, 0.08);
    box(batch, g.bone, 0.13, 0.5, 0.13, xf(v0.x, v0.y + 0.3, v0.z), [1.2, 1.15, 1]);
    for (const turn of [0, Math.PI / 2]) batch.geometry(mats.flame, new THREE.PlaneGeometry(0.34, 0.55), xf(v0.x, v0.y + 0.8, v0.z, turn));
  }
  kit.light(hub.clone().setY(hub.y - 0.4), WARM.clone().multiplyScalar(1.7), 24, 9, 0.16);
}

type At = (al: number, ac: number, y: number) => THREE.Vector3;

function tri(kit: Kit, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, unit: number): void {
  const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
  const side = b.clone().sub(a).normalize();
  for (const v of [a, b, c]) kit.batch.vertex(mat, v, n, v.clone().sub(a).dot(side) / unit, (v.y - a.y) / unit);
}

/** The steep slate roof, with gable ends, a round attic window front and back, and two chimneys. */
function roof(kit: Kit, at: At, L: number): void {
  const { batch, g } = kit;
  const X = OUTER + 1.4;
  const shingles = (x: number, y: number): [number, number] => [x / 6, y / 6];
  const f = at(1, 0, 0).sub(at(0, 0, 0));
  const r = at(0, 1, 0).sub(at(0, 0, 0));
  const slope = (side: number) => r.clone().multiplyScalar(-side * X).setY(RIDGE - EAVES);
  panel(batch, g.shingle, at(-3, X, EAVES - 0.2), f.clone().multiplyScalar(L + 6), slope(1), 9, shingles);
  panel(batch, g.shingle, at(L + 3, -X, EAVES - 0.2), f.clone().multiplyScalar(-(L + 6)), slope(-1), 9, shingles);
  tri(kit, g.siding, at(-1.5, -X, EAVES - 0.2), at(-1.5, X, EAVES - 0.2), at(-1.5, 0, RIDGE), 6);
  tri(kit, g.siding, at(L + 1.5, X, EAVES - 0.2), at(L + 1.5, -X, EAVES - 0.2), at(L + 1.5, 0, RIDGE), 6);
  // Dark bargeboards along each gable.
  for (const al of [-3.2, L + 3.2]) {
    for (const side of [-1, 1]) rope(batch, g.iron, at(al, side * X, EAVES - 0.2), at(al, 0, RIDGE + 0.2), 0.4);
  }
  for (const [al, ac] of [
    [16, -4],
    [L - 10, 4.5],
  ]) {
    const c = at(al, ac, 0);
    slab(batch, g.blocks, xf(c.x, 27, c.z), 2.6, 12, 2.6, 6, [0.8, 0.75, 0.75]);
    slab(batch, g.stone, xf(c.x, 33.2, c.z), 3.1, 0.5, 3.1, 3);
  }
  // A ridge of iron spikes.
  for (let al = -2; al < L + 3; al += 4) {
    const v = at(al, 0, RIDGE);
    box(batch, g.iron, 0.12, 2.2, 0.12, xf(v.x, v.y + 1, v.z));
    pyramid(batch, g.iron, xf(v.x, v.y + 2.1, v.z), 0.25, 0.5);
  }
  for (const al of [-1.7, L + 1.7]) {
    const v = at(al, 0, EAVES + 3.4);
    const face = Math.atan2(f.x * (al < 0 ? -1 : 1), f.z * (al < 0 ? -1 : 1));
    batch.geometry(g.window, roundWindow(), xf(v.x, v.y, v.z, face, 0, 0, 3.6));
  }
}

function roundWindow(): THREE.BufferGeometry {
  const c = new THREE.CircleGeometry(0.5, 10);
  const uv = c.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.04 + uv.getX(i) * 0.42, 0.04 + uv.getY(i) * 0.75);
  return c;
}

/** One glowing window, with a stone sill and head, and sometimes a crooked pair of shutters. */
function windowAt(kit: Kit, at: THREE.Vector3, out: THREE.Vector3, w: number, h: number, seed: number): void {
  const { batch, g } = kit;
  const face = Math.atan2(out.x, out.z);
  const plane = new THREE.PlaneGeometry(w, h);
  const uv = plane.getAttribute('uv');
  const someone = hash2(seed, 2, 51) < 0.25 ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) uv.setX(i, someone + uv.getX(i) * 0.5);
  batch.geometry(g.window, plane, xf(at.x + out.x * 0.04, at.y, at.z + out.z * 0.04, face), hash2(seed, 3, 51) < 0.3 ? [0.55, 0.6, 0.9] : [1, 1, 1]);
  plane.dispose();
  cube(batch, g.stone, xf(at.x, at.y - h / 2 - 0.1, at.z, face), w + 0.7, 0.24, 0.6, [0.7, 0.7, 0.78]);
  cube(batch, g.iron, xf(at.x, at.y + h / 2 + 0.2, at.z, face), w + 0.4, 0.3, 0.4);
  if (hash2(seed, 4, 51) < 0.5) {
    const across = new THREE.Vector3(out.z, 0, -out.x);
    for (const side of [-1, 1]) {
      const c = at.clone().addScaledVector(across, side * (w / 2 + 0.6)).addScaledVector(out, 0.2);
      cube(batch, g.iron, xf(c.x, c.y, c.z, face, 0, (hash2(seed, side + 5, 51) - 0.5) * 0.3), 1.0, h, 0.14);
    }
  }
}

/** Windows down both flanks and on the front, and the tower with its witch's-hat roof. */
function outside(kit: Kit, at: At, F: THREE.Vector3, R: THREE.Vector3, L: number, floorF: number): void {
  const { batch, g } = kit;
  let seed = 0;
  for (const side of [-1, 1]) {
    for (let al = 5; al < L - 3; al += 8.6) {
      for (const y of [floorF + 3.4, floorF + 10.2]) {
        windowAt(kit, at(al, side * (OUTER + 0.02), y), R.clone().multiplyScalar(side), 2.8, 4, seed++);
      }
    }
    for (const ac of [10, 13.4]) {
      if (ac > OUTER) continue;
      windowAt(kit, at(-1.72, side * ac, floorF + 12.4), F.clone().negate(), 2.2, 3.6, seed++);
    }
    windowAt(kit, at(-1.72, side * 3.6, floorF + 12.6), F.clone().negate(), 2.8, 3.8, seed++);
  }
  // The tower on the front corner nearest the approach.
  const c = at(-3, OUTER + 3, 0);
  const r = 4.8;
  const shaft = new THREE.CylinderGeometry(r, r + 0.3, 30, 8, 3, true);
  const uv = shaft.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5, uv.getY(i) * 5);
  batch.geometry(g.siding, shaft, xf(c.x, 14, c.z, 0));
  shaft.dispose();
  slab(batch, g.blocks, xf(c.x, 0.8, c.z, Math.PI / 8), r * 2.3, 4, r * 2.3, 6, [0.75, 0.75, 0.8]);
  batch.geometry(g.iron, new THREE.CylinderGeometry(r + 0.7, r + 0.7, 0.5, 8), xf(c.x, 29.2, c.z));
  const hat = new THREE.ConeGeometry(r + 1.2, 13, 8, 1, true);
  const huv = hat.getAttribute('uv');
  for (let i = 0; i < huv.count; i++) huv.setXY(i, huv.getX(i) * 6, huv.getY(i) * 3);
  batch.geometry(g.shingle, hat, xf(c.x, 35.9, c.z));
  hat.dispose();
  box(batch, g.iron, 0.14, 3.5, 0.14, xf(c.x, 43.4, c.z));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 8 + k * (Math.PI / 2);
    const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    for (const y of [8, 15, 23]) {
      const v = new THREE.Vector3(c.x, y + k * 0.8, c.z).addScaledVector(out, r * 0.93);
      windowAt(kit, v, out, 2, 3.2, seed++);
    }
  }
  kit.light(new THREE.Vector3(c.x, 24, c.z).add(F.clone().multiplyScalar(-8)), WARM.clone(), 16, 5, 0.3);
}

/** The columned front porch, with pumpkins up the steps. */
function frontPorch(kit: Kit, at: At, yaw: number, floorF: number): void {
  const { batch, g } = kit;
  const top = floorF + 7.6;
  const c = at(-7, 0.4, top);
  slab(batch, g.iron, xf(c.x, top, c.z, yaw), 22, 0.6, 12, 4);
  const pitch = at(-7, 0.4, top + 0.3);
  batch.geometry(g.shingle, new THREE.BoxGeometry(23, 0.5, 13), xf(pitch.x, pitch.y + 1.1, pitch.z, yaw, 0.28));
  for (const ac of [-9.4, 10.2]) {
    const v = at(-12, ac, 0);
    v.y = kit.terrain.height(v.x, v.z) - 0.2;
    column(kit, g.stone, v, top - v.y, 0.5, [0.75, 0.75, 0.82]);
    jackOLantern(kit, at(-13.6, ac - Math.sign(ac) * 0.1, Math.max(kit.terrain.height(v.x, v.z), 1)), yaw - Math.sign(ac) * 0.4, 1.3, ac > 0);
    const lamp = at(-6, ac * 0.84, top - 1.6);
    cube(batch, kit.mats.lantern, xf(lamp.x, lamp.y, lamp.z, yaw), 0.6, 0.85, 0.6);
    kit.light(lamp.clone().setY(lamp.y - 0.4), WARM.clone().multiplyScalar(1.4), 16, 7, 0.2);
  }
}

/** Railings round the back porch and a little roof over the back door. */
function backPorch(track: Track, kit: Kit, s1: number): void {
  const { batch, mats } = kit;
  for (const side of [-1, 1]) {
    let last: THREE.Vector3 | null = null;
    for (let s = s1 + 0.5, k = 0; s < s1 + 9; s += 1.6, k++) {
      const p = sampleAt(track, s);
      const foot = frame(p, side * (limitOf(p) + 0.2), 0);
      box(batch, mats.planks, 0.16, 1.2, 0.16, xf(foot.x, foot.y + 0.6, foot.z, headingAt(p)));
      const rail = foot.clone().setY(foot.y + 1.2);
      if (last && k < 5) rope(batch, mats.planks, last, rail, 0.14);
      last = rail;
    }
  }
}
