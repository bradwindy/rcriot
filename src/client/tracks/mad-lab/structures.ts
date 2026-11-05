import * as THREE from 'three';
import { limitOf, sampleAt, type Sample, type Track } from '../../../shared/track';
import { allSamples } from '../../render/trackindex';
import { Batch, xf, type RGB } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { frame, headingAt, loft } from '../../render/road';
import { COVERED } from './edges';
import { crown, cube, drum, each, runs, spire, wall } from './kit';
import type { MadMats } from './materials';
import { CASTLE, FLOOR, GATE, KEEP, LAB, MOAT, TOWER, YARD } from './plan';

const BASE = -10;
const UP = new THREE.Vector3(0, 1, 0);

/** A flat floor of square cells at height `y`, skipping cells `keep` refuses. Cells catch the lamps one corner at a time. */
function floor(batch: Batch, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, cell: number, keep: (x: number, z: number) => boolean, tile = 4, tint?: (x: number, z: number) => RGB): void {
  for (let z = z0; z < z1 - 1e-6; z += cell) {
    for (let x = x0; x < x1 - 1e-6; x += cell) {
      const cx = Math.min(x + cell, x1);
      const cz = Math.min(z + cell, z1);
      if (!keep((x + cx) / 2, (z + cz) / 2)) continue;
      for (const [a, b] of [
        [x, z],
        [x, cz],
        [cx, z],
        [cx, z],
        [x, cz],
        [cx, cz],
      ]) {
        batch.vertex(mat, new THREE.Vector3(a, y, b), UP, a / tile, b / tile, tint ? tint(a, b) : [1, 1, 1]);
      }
    }
  }
}

/** One quad from four corners in order round its face, with its own normal. */
function quad(batch: Batch, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uv: [number, number][], n: THREE.Vector3, color: RGB = [1, 1, 1]): void {
  const pts = [a, b, c, a, c, d];
  const uvs = [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]];
  pts.forEach((p, i) => batch.vertex(mat, p, n, uvs[i][0], uvs[i][1], color));
}

export interface Built {
  /** Fixed lights with their own flicker. */
  coil: THREE.Vector3;
}

export function castle(track: Track, batch: Batch, m: MadMats): Built {
  const all = allSamples(track);
  const tower = (x: number, z: number) => Math.hypot(x - TOWER.x, z - TOWER.z);

  // Holes in the yard floor where the dungeon ramps break through it.
  const open = all.filter((p) => p.zone === 'dungeon' && p.y > COVERED - 0.4 && p.y < FLOOR + 0.2);
  const overTrench = (x: number, z: number) => open.some((p) => Math.hypot(p.x - x, p.z - z) < limitOf(p) + 1.6);
  floor(batch, m.flags, YARD.x0, YARD.x1, YARD.z0, YARD.z1, FLOOR, 2, (x, z) => {
    if (tower(x, z) < KEEP.outer) return false;
    if (x > GATE.x - 16 && x < GATE.x + 16 && z > GATE.z0) return false;
    return !overTrench(x, z);
  }, 6, (x, z) => {
    const v = 0.85 + 0.15 * hash2(Math.floor(x / 6), Math.floor(z / 6), 3);
    return [v, v, v * 1.02];
  });
  floor(batch, m.tile, LAB.x0, LAB.x1, LAB.z0, LAB.z1, FLOOR, 4, (x, z) => tower(x, z) > KEEP.inner, 8);

  curtains(batch, m);
  gatehouse(batch, m);
  lab(batch, m);
  const coil = keep(track, batch, m);
  bridges(track, batch, m);
  return { coil };
}

function curtains(batch: Batch, m: MadMats): void {
  const top = 13;
  const merlons = (ax: number, az: number, bx: number, bz: number, y: number, outX: number, outZ: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.floor(len / 3.2);
    const yaw = Math.atan2(-(bx - ax), -(bz - az));
    for (let i = 0; i <= n; i++) {
      const t = (i + 0.5) / (n + 1);
      cube(batch, m.stone, 1.4, 1.8, 1.8, xf(ax + (bx - ax) * t + outX, y + 0.9, az + (bz - az) * t + outZ, yaw), 4);
    }
  };
  // South wall either side of the gatehouse, and the west wall up to the tower.
  wall(batch, m.stone, CASTLE.x0, CASTLE.z1 - 4, GATE.x - 16, CASTLE.z1 - 4, BASE, top, 8);
  wall(batch, m.stone, GATE.x + 16, CASTLE.z1 - 4, CASTLE.x1, CASTLE.z1 - 4, BASE, top, 8);
  merlons(CASTLE.x0, CASTLE.z1 - 0.7, GATE.x - 16, CASTLE.z1 - 0.7, top, 0, 0);
  merlons(GATE.x + 16, CASTLE.z1 - 0.7, CASTLE.x1, CASTLE.z1 - 0.7, top, 0, 0);
  wall(batch, m.stone, CASTLE.x0 + 4, CASTLE.z1, CASTLE.x0 + 4, TOWER.z + 20, BASE, top, 8);
  merlons(CASTLE.x0 + 0.7, CASTLE.z1, CASTLE.x0 + 0.7, TOWER.z + 24, top, 0, 0);
  // East wall: low along the yard, where the rampart walk runs on top of it, and tall where it closes the laboratory.
  wall(batch, m.stone, CASTLE.x1 - 4, CASTLE.z1, CASTLE.x1 - 4, LAB.z1, BASE, 8.6, 8);
  merlons(CASTLE.x1 - 0.7, CASTLE.z1, CASTLE.x1 - 0.7, LAB.z1, 8.6, 0, 0);
  wall(batch, m.stone, CASTLE.x1 - 4, LAB.z1, CASTLE.x1 - 4, CASTLE.z0, BASE, 18, 8);

  // Corner towers with slate spires, and a lit window or two.
  const towers: [number, number, number, number][] = [
    [CASTLE.x0 + 2, CASTLE.z1 - 2, 9, 22],
    [CASTLE.x1 - 2, CASTLE.z1 - 2, 9, 22],
    [CASTLE.x1 - 2, CASTLE.z0 + 2, 9, 26],
    [CASTLE.x1 + 1, 18, 7, 17],
  ];
  for (const [x, z, r, h] of towers) {
    drum(batch, m.stone, x, BASE, z, r, r, h - BASE, 12, 8);
    cube(batch, m.stone, r * 2.1, 0.8, r * 2.1, xf(x, h + 0.2, z, Math.PI / 4), 6);
    crown(batch, m.stone, x, h, z, r - 0.6, 10);
    spire(batch, m.slate, x, h + 0.6, z, r - 1.2, r * 1.5, 10);
    for (let k = 0; k < 3; k++) {
      const a = hash2(Math.round(x), k, 7) * Math.PI * 2;
      batch.geometry(m.window, new THREE.PlaneGeometry(1.4, 2.8), xf(x + Math.cos(a) * (r + 0.05), h - 5 - k * 4, z + Math.sin(a) * (r + 0.05), Math.PI / 2 - a));
    }
  }
}

function gatehouse(batch: Batch, m: MadMats): void {
  const { x, z0, z1 } = GATE;
  const half = 7.1;
  for (const side of [-1, 1]) {
    const inner = x + side * (half + 2.5);
    const outer = x + side * 16;
    wall(batch, m.stone, (inner + outer) / 2, z0, (inner + outer) / 2, z1, FLOOR - 1, 18, Math.abs(outer - inner), 8);
    drum(batch, m.stone, outer, BASE, z1 - 1, 7, 7, 23 - BASE, 12, 8);
    crown(batch, m.stone, outer, 23, z1 - 1, 6.4, 9);
    spire(batch, m.slate, outer, 23.6, z1 - 1, 5.8, 11, 10);
    for (const k of [0, 1]) {
      batch.geometry(m.window, new THREE.PlaneGeometry(1.4, 2.8), xf(outer, 9 + k * 6, z1 - 1 + 7.05, 0));
    }
  }
  wall(batch, m.stone, x - 16, (z0 + z1) / 2, x + 16, (z0 + z1) / 2, 10.2, 18, z1 - z0, 8);
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    cube(batch, m.stone, 1.8, 1.8, 1.4, xf(x - 16 + 32 * t, 18.9, z1 - 0.7), 4);
  }
  // The portcullis, raised, its teeth hanging over the way in.
  for (let i = 0; i <= 8; i++) {
    const px = x - half + (i / 8) * half * 2;
    cube(batch, m.iron, 0.3, 4, 0.3, xf(px, 9.2, z1 - 1.5), 2);
    batch.geometry(m.iron, new THREE.ConeGeometry(0.22, 0.8, 4), xf(px, 6.8, z1 - 1.5, 0, Math.PI));
  }
  for (const y of [8, 10]) cube(batch, m.iron, half * 2, 0.3, 0.3, xf(x, y, z1 - 1.5), 2);
  // The drawbridge's chains, from its tip up into the gatehouse.
  for (const side of [-1, 1]) {
    batch.beam(m.iron, new THREE.Vector3(x + side * 6, 1.6, z1 + 6.5), new THREE.Vector3(x + side * 6.5, 11, z1 + 0.2), 0.18);
  }
}

function lab(batch: Batch, m: MadMats): void {
  const eave = 18;
  const ridge = 28;
  const midZ = (LAB.z0 + LAB.z1) / 2;
  // North and south walls, each a stone shell with a dark inner skin. The south wall has a wide door from the yard.
  const door = { x0: 48, x1: 84, top: 11 };
  for (const [z, inward] of [
    [LAB.z0 - 1, 1],
    [LAB.z1 + 1, -1],
  ] as const) {
    const spans = inward < 0 ? [[LAB.x0 - 4, door.x0], [door.x1, LAB.x1]] : [[LAB.x0 - 4, LAB.x1]];
    for (const [a, b] of spans) {
      wall(batch, m.stone, a, z, b, z, inward > 0 ? BASE : FLOOR - 1, eave, 2, 8);
      wall(batch, m.stoneIn, a, z + inward * 1.05, b, z + inward * 1.05, FLOOR - 0.5, eave, 0.1, 8);
    }
    if (inward < 0) {
      wall(batch, m.stone, door.x0, z, door.x1, z, door.top, eave, 2, 8);
      wall(batch, m.stoneIn, door.x0, z - 1.05, door.x1, z - 1.05, door.top, eave, 0.1, 8);
    }
    // Tall windows: the storm seen from inside, lamplight seen from out.
    for (let x = LAB.x0 + 12; x < LAB.x1 - 6; x += 13) {
      if (inward < 0 && x > door.x0 - 3 && x < door.x1 + 3) continue;
      const yaw = inward > 0 ? 0 : Math.PI;
      batch.geometry(m.storm, new THREE.PlaneGeometry(4, 9), xf(x, 10, z + inward * 1.12, yaw));
      batch.geometry(m.window, new THREE.PlaneGeometry(4, 9), xf(x, 10, z - inward * 1.05, yaw + Math.PI));
      cube(batch, m.stone, 5.2, 0.6, 1, xf(x, 5.3, z - inward * 1.1), 4);
    }
  }
  // Pitched slate roof on timber trusses, and a smoking chimney or two.
  const len = LAB.x1 - LAB.x0 + 10;
  const cx = (LAB.x0 + LAB.x1) / 2 - 3;
  for (const side of [-1, 1]) {
    const run = (LAB.z1 - LAB.z0) / 2 + 3;
    const pitch = Math.atan2(ridge - eave, run);
    const slope = Math.hypot(run, ridge - eave);
    const m4 = xf(cx, (eave + ridge) / 2, midZ + (side * run) / 2, 0, side * pitch);
    cube(batch, m.slate, len, 0.5, slope, m4, 4);
    cube(batch, m.timberIn, len, 0.3, slope, m4.clone().multiply(xf(0, -0.4, 0)), 4);
  }
  for (let x = LAB.x0 + 4; x < LAB.x1; x += 10) {
    for (const side of [-1, 1]) {
      batch.beam(m.timberIn, new THREE.Vector3(x, eave - 0.5, midZ + side * 27), new THREE.Vector3(x, ridge - 1, midZ), 0.5, 0.7);
    }
    batch.beam(m.timberIn, new THREE.Vector3(x, eave - 0.5, LAB.z0), new THREE.Vector3(x, eave - 0.5, LAB.z1), 0.5, 0.6);
  }
  for (const x of [LAB.x0 + 30, LAB.x1 - 24]) {
    cube(batch, m.stone, 3, 9, 3, xf(x, ridge, midZ + 8), 4);
    cube(batch, m.stone, 3.6, 0.6, 3.6, xf(x, ridge + 4.6, midZ + 8), 4);
  }
  // The east gable closing the roof.
  for (let k = 0; k < 6; k++) {
    const h0 = eave + ((ridge - eave) * k) / 6;
    const w = (LAB.z1 - LAB.z0 + 4) * (1 - k / 6);
    cube(batch, m.stone, 2, (ridge - eave) / 6, w, xf(LAB.x1 + 1, h0 + (ridge - eave) / 12, midZ), 8);
  }
}

/** The tower: a stone drum holed where the road goes in and out, the climb's underside, and the giant coil. */
function keep(track: Track, batch: Batch, m: MadMats): THREE.Vector3 {
  const { x: cx, z: cz } = TOWER;
  const SEG = 36;
  const ROW = 3;
  const crossing = all(track).filter((p) => p.zone === 'tower' || p.zone === 'leap' || p.zone === 'lab');
  const holed = (i: number, y0: number) => {
    const a0 = (i / SEG) * Math.PI * 2;
    const a1 = ((i + 1) / SEG) * Math.PI * 2;
    return crossing.some((p) => {
      const r = Math.hypot(p.x - cx, p.z - cz);
      if (r < KEEP.inner - 3 || r > KEEP.outer + 3) return false;
      const a = Math.atan2(p.z - cz, p.x - cx);
      const span = (limitOf(p) + 0.5) / r;
      const d0 = Math.atan2(Math.sin(a - a0), Math.cos(a - a0));
      const d1 = Math.atan2(Math.sin(a - a1), Math.cos(a - a1));
      const inside = d0 > -span && d1 < span;
      return inside && y0 + ROW > p.y - 0.4 && y0 < p.y + 8.5;
    });
  };
  const at = (a: number, r: number, y: number) => new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2;
    const a1 = ((i + 1) / SEG) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const nOut = new THREE.Vector3(Math.cos(am), 0, Math.sin(am));
    const nIn = nOut.clone().negate();
    const u0 = (a0 * KEEP.outer) / 8;
    const u1 = (a1 * KEEP.outer) / 8;
    for (let y = BASE; y < KEEP.top; y += ROW) {
      const y1 = Math.min(KEEP.top, y + ROW);
      if (holed(i, y)) {
        // Jambs, sill and lintel round the hole.
        for (const [a, n] of [
          [a0, new THREE.Vector3(-Math.sin(a0), 0, Math.cos(a0))],
          [a1, new THREE.Vector3(Math.sin(a1), 0, -Math.cos(a1))],
        ] as const) {
          const neighbour = a === a0 ? (i + SEG - 1) % SEG : (i + 1) % SEG;
          if (holed(neighbour, y)) continue;
          quad(batch, m.stoneTower, at(a, KEEP.inner, y), at(a, KEEP.outer, y), at(a, KEEP.outer, y1), at(a, KEEP.inner, y1), [[0, y / 8], [0.4, y / 8], [0.4, y1 / 8], [0, y1 / 8]], n);
        }
        continue;
      }
      quad(batch, m.stone, at(a0, KEEP.outer, y), at(a0, KEEP.outer, y1), at(a1, KEEP.outer, y1), at(a1, KEEP.outer, y), [[u0, y / 8], [u0, y1 / 8], [u1, y1 / 8], [u1, y / 8]], nOut);
      if (y1 > FLOOR) {
        const yb = Math.max(y, FLOOR - 0.5);
        quad(batch, m.stoneTower, at(a1, KEEP.inner, yb), at(a1, KEEP.inner, y1), at(a0, KEEP.inner, y1), at(a0, KEEP.inner, yb), [[u1, yb / 8], [u1, y1 / 8], [u0, y1 / 8], [u0, yb / 8]], nIn);
      }
      if (!holed(i, y + ROW) && y1 < KEEP.top) continue;
      if (y1 >= KEEP.top) {
        quad(batch, m.stone, at(a0, KEEP.inner, y1), at(a0, KEEP.outer, y1), at(a1, KEEP.outer, y1), at(a1, KEEP.inner, y1), [[u0, 0], [u0, 0.4], [u1, 0.4], [u1, 0]], UP);
      } else {
        quad(batch, m.stoneTower, at(a0, KEEP.inner, y1), at(a1, KEEP.inner, y1), at(a1, KEEP.outer, y1), at(a0, KEEP.outer, y1), [[u0, 0], [u1, 0], [u1, 0.4], [u0, 0.4]], UP.clone().negate());
      }
    }
    // Sills under holes.
    for (let y = BASE + ROW; y < KEEP.top; y += ROW) {
      if (holed(i, y) && !holed(i, y - ROW)) {
        quad(batch, m.stoneTower, at(a0, KEEP.inner, y), at(a0, KEEP.outer, y), at(a1, KEEP.outer, y), at(a1, KEEP.inner, y), [[u0, 0], [u0, 0.4], [u1, 0.4], [u1, 0]], UP);
      }
    }
    if (i % 2 === 0) {
      const mm = at(am, KEEP.outer - 0.6, KEEP.top);
      cube(batch, m.stone, 1.6, 2, 2.6, xf(mm.x, mm.y + 1, mm.z, Math.PI / 2 - am), 4);
    }
    if (i % 5 === 2) {
      const w = at(am, KEEP.outer + 0.06, 24 + (i % 3) * 3);
      if (!holed(i, w.y - 2)) batch.geometry(m.window, new THREE.PlaneGeometry(1.6, 3.2), xf(w.x, w.y, w.z, Math.PI / 2 - am));
    }
  }
  // Floor inside, in rings so the coil's light falls across it.
  for (let r = 0; r < KEEP.inner; r += 4) {
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2;
      const a1 = ((i + 1) / 24) * Math.PI * 2;
      const r1 = Math.min(KEEP.inner, r + 4);
      quad(batch, m.settsTower, at(a0, r, FLOOR), at(a0, r1, FLOOR), at(a1, r1, FLOOR), at(a1, r, FLOOR), [[a0 * 4, r / 4], [a0 * 4, r1 / 4], [a1 * 4, r1 / 4], [a1 * 4, r / 4]], UP);
    }
  }

  // Under the climb: a flat soffit, corbels from the wall, a ledge to the wall and a railed parapet round the well.
  const climb = (p: Sample) => p.zone === 'tower';
  for (const { t, a, b } of runs(track, (p, route) => route === 0 && climb(p))) {
    loft(batch, t, a, b, { spacing: 2, vScale: 6, uScale: 6, outward: true, material: () => m.stoneTower, profile: (p) => [[limitOf(p), -1.2], [-limitOf(p), -1.2]] });
    loft(batch, t, a, b, { spacing: 2, vScale: 4, uScale: 4, outward: true, material: () => m.settsTower, profile: (p) => [[-limitOf(p) - 1.3, -0.04], [-limitOf(p), -0.04]] });
    loft(batch, t, a, b, { spacing: 2, vScale: 4, uScale: 2, outward: true, material: () => m.stoneTower, profile: (p) => [[limitOf(p), -0.3], [limitOf(p), 0.7], [limitOf(p) + 0.6, 0.7], [limitOf(p) + 0.6, -1.2]] });
  }
  let rail: THREE.Vector3 | null = null;
  each(track, 3, (p, route) => route === 0 && climb(p), (p, _t, _s, k) => {
    const h = headingAt(p);
    const post = frame(p, limitOf(p) + 0.3, 0.7);
    cube(batch, m.iron, 0.14, 1.1, 0.14, xf(post.x, post.y + 0.55, post.z, h), 2);
    const top = post.clone().setY(post.y + 1.1);
    if (rail && k > 0) batch.beam(m.iron, rail, top, 0.09);
    rail = top;
    if (k % 3 === 0) {
      const c = frame(p, -limitOf(p) - 1.2, -1.2);
      batch.beam(m.stoneTower, c, frame(p, -limitOf(p) - 1.3, -3.2), 1.4, 1.2);
    }
    // Columns under the first turn, where nothing runs beneath the climb.
    const r = Math.hypot(p.x - cx, p.z - cz);
    if (k % 3 === 1 && p.y > 4 && p.y < 11 && r < KEEP.inner) {
      const foot = frame(p, limitOf(p) - 0.6, 0);
      cube(batch, m.stoneTower, 1.4, p.y - 1.2 - FLOOR, 1.4, xf(foot.x, (p.y - 1.2 + FLOOR) / 2, foot.z, h), 4);
    }
  });

  // The giant coil in the middle, rising out of the top of the tower to meet the storm.
  drum(batch, m.stoneTower, cx, FLOOR - 0.5, cz, 9.5, 8.5, 3, 16, 6);
  drum(batch, m.copper, cx, FLOOR + 2.5, cz, 6, 6, 32, 14, 3);
  for (let y = FLOOR + 6; y < 34; y += 6) drum(batch, m.iron, cx, y, cz, 6.5, 6.5, 0.8, 14, 2);
  const torus = new THREE.TorusGeometry(8, 1.8, 6, 18);
  torus.rotateX(Math.PI / 2);
  batch.geometry(m.iron, torus, xf(cx, 36, cz));
  torus.dispose();
  batch.geometry(m.brass, new THREE.IcosahedronGeometry(3.2, 1), xf(cx, 40, cz));
  cube(batch, m.iron, 0.4, 10, 0.4, xf(cx, 46, cz), 2);
  return new THREE.Vector3(cx, 40, cz);
}

function all(track: Track): Sample[] {
  return allSamples(track);
}

/** Stone piers under the bridges, timber trestles under the leap's landing ramp, and the drawbridge's tip. */
function bridges(track: Track, batch: Batch, m: MadMats): void {
  each(track, 9, (p) => p.zone === 'bridge' && p.y > 1, (p) => {
    const h = headingAt(p);
    const at = frame(p, 0, -1.6);
    cube(batch, m.stone, limitOf(p) * 2 - 2, at.y - MOAT.bed, 3, xf(at.x, (at.y + MOAT.bed) / 2, at.z, h), 6);
    for (const side of [-1, 1]) {
      const c = frame(p, side * (limitOf(p) - 0.2), 0);
      batch.geometry(m.stone, new THREE.CylinderGeometry(1.4, 1.4, c.y - MOAT.bed - 1.6, 6), xf(c.x, (c.y - 1.6 + MOAT.bed) / 2, c.z, h));
      batch.geometry(m.iron, new THREE.CylinderGeometry(0.12, 0.12, 3.2, 4), xf(c.x, c.y + 2.6, c.z));
    }
  });
  each(track, 6, (p) => p.zone === 'leap', (p, _t, _s, k) => {
    for (const side of [-1, 1]) {
      const top = frame(p, side * (limitOf(p) - 0.5), -0.6);
      const foot = top.clone().setY(MOAT.bed);
      batch.beam(m.timber, foot, top, 0.6);
      if (k > 0) {
        const back = frame(sampleAt(track, p.s - 6), side * (limitOf(p) - 0.5), -0.6);
        batch.beam(m.timber, back.clone().setY((back.y + MOAT.bed) / 2), top, 0.35);
      }
    }
    const a = frame(p, -(limitOf(p) - 0.5), (MOAT.bed - p.y) / 2);
    const b = frame(p, limitOf(p) - 0.5, (MOAT.bed - p.y) / 2);
    batch.beam(m.timber, a, b, 0.35);
    // Rails along the ramp.
    for (const side of [-1, 1]) {
      const post = frame(p, side * (limitOf(p) + 0.2), 0);
      batch.beam(m.timber, post, post.clone().setY(post.y + 1.2), 0.25);
    }
  });
  // The drawbridge's raised lip, iron-shod.
  const draw = all(track).filter((p) => p.zone === 'draw');
  if (draw.length) {
    const p = draw[0];
    const lip = frame(p, 0, -0.3);
    cube(batch, m.iron, limitOf(p) * 2, 0.6, 0.6, xf(lip.x, lip.y, lip.z, headingAt(p)), 2);
  }
}
