import * as THREE from 'three';
import { BALL_S, PYRAMID } from '../../../shared/tracks/inca-temple';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { Batch, ball, taper, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2, smoothstep } from '../../render/noise';
import { addPointLight } from '../../render/ps1';
import { box, frame, headingAt, loft, type Profile } from '../../render/road';
import { flame, quad, v3, type Fire } from './kit';
import type { IncaMats } from './palette';

/** Half-size of each tier of the pyramid, base to top, and the height of each. */
const TIERS = [34, 30, 26, 22, 18, 14];
const TIER_H = 3.3;
const TALUD = 0.6;
/** The hall's outer walls, to the right (north, against the pyramid) and left of the road, and its roof. */
const HALL_RIGHT = 10.5;
const HALL_LEFT = 12.8;
const HALL_ROOF = 14;

function span(track: Track, zone: string): [number, number] {
  const r = zoneRanges(track, zone);
  return [r[0][0], r[r.length - 1][1]];
}

/** Six tiers with sloping walls carved with a frieze, and a flat top. */
function pyramid(batch: Batch, inca: IncaMats): void {
  const { x: cx, z: cz } = PYRAMID;
  const vine: RGB = [0.82, 0.92, 0.74];
  TIERS.forEach((r, k) => {
    const y0 = k === 0 ? -1 : k * TIER_H;
    const y1 = (k + 1) * TIER_H;
    const t = r - TALUD;
    const corners = (h: number) => [v3(cx - h, 0, cz - h), v3(cx + h, 0, cz - h), v3(cx + h, 0, cz + h), v3(cx - h, 0, cz + h)];
    const lo = corners(r).map((p) => p.setY(y0));
    const hi = corners(t).map((p) => p.setY(y1));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      // Walls face outwards: walk the base corners clockwise seen from above, so the front is outside.
      quad(batch, inca.carved, lo[j], lo[i], hi[i], hi[j], TIER_H, k % 2 ? vine : [1, 1, 1]);
    }
    const inner = k + 1 < TIERS.length ? TIERS[k + 1] : 0;
    const top = corners(t).map((p) => p.setY(y1));
    const next = corners(inner).map((p) => p.setY(y1));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if (inner > 0) quad(batch, inca.stone, top[i], next[i], next[j], top[j], 4);
    }
    if (inner === 0) quad(batch, inca.stone, top[3], top[2], top[1], top[0], 4);
  });
}

/** The balustrades and solid flanks of a stair, from the road down to the ground. */
function stairFlanks(batch: Batch, track: Track, inca: IncaMats, s0: number, s1: number): void {
  const flank = (side: number): Profile => (p) => {
    const l = limitOf(p);
    const pts: [number, number][] = [
      [l, 0],
      [l, 1.1],
      [l, 1.1],
      [l + 1.8, 1.1],
      [l + 1.8, 1.1],
      [l + 1.8, -p.y - 0.5],
    ];
    return side > 0 ? pts : pts.map(([o, h]) => [-o, h] as [number, number]).reverse();
  };
  for (const side of [-1, 1]) loft(batch, track, s0, s1, { spacing: 2, vScale: 4, uScale: 4, outward: true, material: () => inca.stone, profile: flank(side) });
}

/** A feathered serpent's head at the foot of a balustrade, jaws open. */
function serpent(batch: Batch, inca: IncaMats, p: Sample, side: number, back: boolean): void {
  const h = headingAt(p) + (back ? 0 : Math.PI);
  const at = frame(p, side * (limitOf(p) + 0.9), 0);
  const m = xf(at.x, at.y, at.z, h);
  batch.geometry(inca.stone, taper(2.2, 3.2, 1.8, 2.4, 2.2), m.clone().multiply(xf(0, 0, 0.6)));
  batch.geometry(inca.stone, taper(2.0, 1.4, 1.6, 1.0, 0.7), m.clone().multiply(xf(0, 2.2, 0.4, 0, -0.25)));
  batch.geometry(inca.carved, new THREE.BoxGeometry(2.4, 0.5, 1.6), m.clone().multiply(xf(0, 0.9, 2.3, 0, 0.35)));
  for (const e of [-1, 1]) batch.geometry(inca.gold, ball(0.28, 1, 1, 1, 6), m.clone().multiply(xf(e * 0.75, 1.9, 1.8)));
  for (let f = -2; f <= 2; f++) {
    batch.geometry(inca.stone, new THREE.BoxGeometry(0.35, 1.6, 0.5), m.clone().multiply(xf(f * 0.45, 2.6, -0.4, 0, -0.5, f * 0.25)), [0.9, 1, 0.85]);
  }
}

/** The gate across the top, with Inti's gold disc over it and fire bowls at its feet. */
function summit(batch: Batch, track: Track, mats: Materials, inca: IncaMats, fires: Fire[], a: number, b: number): void {
  const mid = sampleAt(track, (a + b) / 2 - 2);
  const h = headingAt(mid);
  const span = limitOf(mid) + 1.3;
  for (const side of [-1, 1]) {
    const post = frame(mid, side * span, 0);
    batch.geometry(inca.carved, taper(2.4, 2.4, 1.8, 1.8, 9), xf(post.x, post.y - 0.2, post.z, h));
    box(batch, inca.stone, 2.8, 0.6, 2.8, xf(post.x, post.y + 9.1, post.z, h));
  }
  const top = frame(mid, 0, 9.8);
  box(batch, inca.carved, span * 2 + 3.2, 1.6, 2.2, xf(top.x, top.y, top.z, h));
  const disc = frame(mid, 0, 13.2);
  for (const turn of [0, Math.PI]) batch.geometry(inca.sun, new THREE.PlaneGeometry(6.4, 6.4), xf(disc.x, disc.y, disc.z, h + turn).multiply(xf(0, 0, 0.3)));
  // Fire bowls at the four corners of the top.
  const { x: cx, z: cz } = PYRAMID;
  const r = TIERS[TIERS.length - 1] - TALUD - 1.2;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const at = v3(cx + dx * r, (TIERS.length) * TIER_H, cz + dz * r);
    batch.geometry(inca.stone, new THREE.CylinderGeometry(0.5, 0.7, 1.4, 6), xf(at.x, at.y + 0.7, at.z));
    batch.geometry(inca.gold, new THREE.CylinderGeometry(1.0, 0.5, 0.6, 8), xf(at.x, at.y + 1.6, at.z));
    flame(batch, mats, at.clone().setY(at.y + 1.8), 2.2, fires, 18);
  }
  // Low stone posts along both edges of the road over the top.
  for (let s = a + 2; s < b - 2; s += 3.2) {
    const p = sampleAt(track, s);
    for (const side of [-1, 1]) {
      const at = frame(p, side * (limitOf(p) + 0.4), 0);
      box(batch, inca.stone, 0.8, 0.9, 0.8, xf(at.x, at.y + 0.45, at.z, headingAt(p)));
    }
  }
}

/** One end of the hall: a wall with a tall Inca doorway, narrower at the top, and a carved lintel. */
function facade(batch: Batch, inca: IncaMats, p: Sample, out: number): void {
  const floor = p.y - 0.4;
  const roof = HALL_ROOF;
  const d0 = limitOf(p) + 1.2;
  const d1 = d0 - 2.4;
  const doorTop = floor + 9.2;
  const at = (o: number, y: number) => frame(p, o, 0).setY(y);
  const pieces: [number, number, number, number, number, number, number, number][] = [
    // [o0 bottom, o1 bottom, o1 top, o0 top, y bottom, y top] as left/right jambs and the wall over the door.
    [-HALL_LEFT, -d0, -d1, -HALL_LEFT, -1, doorTop, 0, 0],
    [d0, HALL_RIGHT, HALL_RIGHT, d1, -1, doorTop, 0, 0],
    [-HALL_LEFT, HALL_RIGHT, HALL_RIGHT, -HALL_LEFT, doorTop, roof, 0, 0],
  ];
  for (const [o0, o1, o2, o3, ya, yb] of pieces) {
    const ylo = ya < 0 ? -1 : ya;
    const corners = [at(o0, ylo), at(o1, ylo), at(o2, yb), at(o3, yb)];
    // `out` is +1 at the far end, where the wall faces along the road, and -1 at the near end.
    const [a, b, c, d] = out > 0 ? corners : [corners[1], corners[0], corners[3], corners[2]];
    quad(batch, inca.stone, a, b, c, d, 4);
    quad(batch, inca.stoneIndoor, b, a, d, c, 4);
  }
  const h = headingAt(p);
  const lintel = frame(p, 0, 0).setY(doorTop + 0.6);
  box(batch, inca.carved, d1 * 2 + 3, 1.6, 2.2, xf(lintel.x, lintel.y, lintel.z, h));
  for (const side of [-1, 1]) {
    const j = frame(p, side * (d0 - 1.2), 0).setY(floor + 4.6);
    batch.geometry(inca.stone, new THREE.BoxGeometry(0.9, 9.4, 1.8), xf(j.x, j.y, j.z, h, 0, -side * Math.atan2(2.4, 9.2)));
  }
  const disc = frame(p, 0, 0).setY(doorTop + 2.8);
  batch.geometry(inca.sun, new THREE.PlaneGeometry(3.4, 3.4), xf(disc.x, disc.y, disc.z, h + (out > 0 ? 0 : Math.PI)).multiply(xf(0, 0, 1.2)));
}

/** The temple hall along the pyramid's south side: carved walls, a corbelled vault, torches, the idol and its gold. */
function hall(batch: Batch, track: Track, mats: Materials, inca: IncaMats, fires: Fire[]): void {
  const [a] = span(track, 'hall');
  const [, b] = span(track, 'trap');
  const [ia, ib] = span(track, 'idol');
  // The idol's chamber bulges out to the left, where the idol sits on its altar.
  const bulge = (s: number) => 2.8 * smoothstep(ia - 5, ia + 1, s) * smoothstep(ib + 5, ib - 1, s);
  const left = (p: Sample) => limitOf(p) + 0.2 + bulge(p.s);
  const right = (p: Sample) => limitOf(p) + 0.2;
  const opts = { spacing: 2, vScale: 4, uScale: 5.7 };
  loft(batch, track, a, b, { ...opts, material: () => inca.carvedSide, profile: (p) => [[-left(p), -0.5], [-left(p), 5.2]] });
  loft(batch, track, a, b, { ...opts, material: () => inca.carvedSide, profile: (p) => [[right(p), 5.2], [right(p), -0.5]] });
  loft(batch, track, a, b, {
    spacing: 2,
    vScale: 4,
    uScale: 4,
    material: () => inca.stoneIndoor,
    profile: (p) => {
      const l = -left(p);
      const r = right(p);
      return [[l, 5.2], [l + 1.2, 5.2], [l + 1.2, 6.5], [l + 2.4, 6.5], [l + 2.4, 7.8], [-3, 7.8], [-3, 8.8], [3, 8.8], [3, 7.8], [r - 2.4, 7.8], [r - 2.4, 6.5], [r - 1.2, 6.5], [r - 1.2, 5.2], [r, 5.2]];
    },
  });
  loft(batch, track, ia - 6, ib + 6, { spacing: 2, vScale: 6, uScale: 4, outward: true, material: () => inca.stoneIndoor, profile: (p) => [[-left(p), 0.02], [-limitOf(p), 0.02]] });

  // Outside: plain walls under a flat roof with a stepped crest, in absolute heights over the sloping floor.
  const shell: Profile = (p) => [
    [-HALL_LEFT, -p.y - 1],
    [-HALL_LEFT, HALL_ROOF - p.y],
    [-HALL_LEFT, HALL_ROOF - p.y],
    [HALL_RIGHT, HALL_ROOF - p.y],
    [HALL_RIGHT, HALL_ROOF - p.y],
    [HALL_RIGHT, -p.y - 1],
  ];
  loft(batch, track, a, b, { spacing: 4, vScale: 4, uScale: 4, outward: true, material: () => inca.stone, profile: shell });
  for (let s = a + 2; s < b; s += 4) {
    const p = sampleAt(track, s);
    for (const side of [-1, 1]) {
      const at = frame(p, side > 0 ? HALL_RIGHT - 0.6 : -HALL_LEFT + 0.6, 0).setY(HALL_ROOF);
      const tall = Math.round(s / 4) % 2 ? 1.2 : 2.0;
      box(batch, inca.stone, 1.2, tall, 2.2, xf(at.x, at.y + tall / 2, at.z, headingAt(p)));
    }
  }
  facade(batch, inca, sampleAt(track, a), -1);
  facade(batch, inca, sampleAt(track, b), 1);

  // Torches down both walls.
  for (let s = a + 6, k = 0; s < b - 4; s += 11, k++) {
    if (s > ia - 2 && s < ib + 2) continue;
    const p = sampleAt(track, s);
    const side = k % 2 ? 1 : -1;
    const o = side > 0 ? right(p) : -left(p);
    const base = frame(p, o - side * 0.3, 3.2);
    box(batch, mats.planksIndoor, 0.18, 1.0, 0.18, xf(base.x, base.y, base.z, headingAt(p), 0, side * 0.35));
    box(batch, inca.stoneIndoor, 0.7, 0.3, 0.7, xf(base.x, base.y - 0.6, base.z, headingAt(p)));
    flame(batch, mats, frame(p, o - side * 0.55, 3.75), 0.9, fires, 15, 1.5);
  }

  // The idol on its altar, ringed with gold, under shafts of light from the roof.
  const ps = (ia + ib) / 2;
  const p = sampleAt(track, ps);
  const h = headingAt(p);
  const altar = frame(p, -left(p) + 1.6, 0);
  const m = xf(altar.x, altar.y, altar.z, h + Math.PI / 2);
  batch.geometry(inca.carvedIndoor, new THREE.BoxGeometry(3.6, 1.6, 2.6), m.clone().multiply(xf(0, 0.8, 0)));
  batch.geometry(inca.stoneIndoor, new THREE.BoxGeometry(2.4, 0.5, 1.8), m.clone().multiply(xf(0, 1.85, 0)));
  const idol = m.clone().multiply(xf(0, 2.1, 0));
  batch.geometry(inca.gold, taper(1.4, 1.0, 1.0, 0.8, 1.3), idol);
  batch.geometry(inca.gold, new THREE.BoxGeometry(1.1, 1.0, 0.9), idol.clone().multiply(xf(0, 1.8, 0)));
  for (let f = -3; f <= 3; f++) {
    batch.geometry(inca.gold, new THREE.BoxGeometry(0.28, 1.4, 0.18), idol.clone().multiply(xf(f * 0.24, 2.6, -0.2, 0, 0, f * 0.22)));
  }
  for (const e of [-1, 1]) batch.geometry(mats.plastic, new THREE.BoxGeometry(0.22, 0.14, 0.1), idol.clone().multiply(xf(e * 0.25, 1.95, 0.46)));
  batch.geometry(mats.plastic, new THREE.BoxGeometry(0.5, 0.1, 0.1), idol.clone().multiply(xf(0, 1.55, 0.46)));
  for (let i = 0; i < 26; i++) {
    const r = 1.4 + hash2(i, 3, 5) * 2.6;
    const ang = hash2(i, 4, 5) * Math.PI - Math.PI / 2;
    const at = frame(p, -left(p) + 1.6 + Math.cos(ang) * r * 0.5, 0);
    const along = Math.sin(ang) * r;
    const g = hash2(i, 6, 5) < 0.3 ? new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8) : new THREE.OctahedronGeometry(0.22 + hash2(i, 7, 5) * 0.2);
    batch.geometry(inca.gold, g, xf(at.x - p.tx * along, at.y + 0.15, at.z - p.tz * along, i));
  }
  addPointLight(frame(p, -left(p) + 3.5, 3.8), new THREE.Color(1.0, 0.78, 0.3).multiplyScalar(1.8), 16);
  for (const [ds, o] of [[-4, -left(p) + 2.5], [3, -2], [-1, 3]] as const) {
    const q = sampleAt(track, ps + ds);
    const foot = frame(q, o, 0);
    const g = new THREE.PlaneGeometry(2.6, 8.6);
    for (const turn of [0, Math.PI / 2]) batch.geometry(inca.shaft, g, xf(foot.x, foot.y + 4.3, foot.z, h + turn + 0.4));
  }

  // The hole the stone ball drops from, and the slot it sinks into at the bottom of the ramp.
  const top = sampleAt(track, BALL_S);
  for (const [s, hgt] of [[BALL_S, 8.75], [BALL_S - 42, 0.04]] as const) {
    const q = s === BALL_S ? top : sampleAt(track, s);
    const c = frame(q, 3.4, hgt);
    const g = new THREE.PlaneGeometry(5.2, 5.2);
    g.rotateX(hgt > 1 ? Math.PI / 2 : -Math.PI / 2);
    batch.geometry(mats.plastic, g, xf(c.x, c.y, c.z, headingAt(q)), [0.15, 0.12, 0.1]);
  }
}

/** The raised terrace outside the hall's far door, which the road leaps off. */
function terrace(batch: Batch, track: Track, inca: IncaMats): void {
  const [a, b] = span(track, 'terrace');
  for (const side of [-1, 1]) {
    loft(batch, track, a, b, {
      spacing: 2,
      vScale: 4,
      uScale: 4,
      outward: true,
      material: () => inca.stone,
      profile: (p) => {
        const l = limitOf(p);
        const pts: [number, number][] = [[l, 0], [l, 0.6], [l, 0.6], [l + 1, 0.6], [l + 1, 0.6], [l + 1, -p.y - 0.5]];
        return side > 0 ? pts : pts.map(([o, h]) => [-o, h] as [number, number]).reverse();
      },
    });
  }
}

export function buildTemple(track: Track, batch: Batch, mats: Materials, inca: IncaMats): Fire[] {
  const fires: Fire[] = [];
  pyramid(batch, inca);
  for (const [s0, s1] of zoneRanges(track, 'stair')) {
    stairFlanks(batch, track, inca, s0 - 1, s1 + 0.5);
    const foot = sampleAt(track, s0 < 650 ? s0 : s1);
    for (const side of [-1, 1]) serpent(batch, inca, foot, side, s0 > 650);
  }
  const [a, b] = span(track, 'summit');
  stairFlanks(batch, track, inca, a, b);
  summit(batch, track, mats, inca, fires, a, b);
  hall(batch, track, mats, inca, fires);
  terrace(batch, track, inca);
  return fires;
}
