import * as THREE from 'three';
import { limitOf, sampleAt, type Sample, type Track } from '../../../shared/track';
import { xf } from '../../render/geometry';
import { fbm, hash2 } from '../../render/noise';
import { atJunction, box, frame, headingAt, rope, routeSpans } from '../../render/road';
import { AREA, pondDepth } from './ground';
import { angel, coffin, cube, deadTree, headstone, jackOLantern, type Kit, lampPost, mausoleum, skull, slab, spearPost } from './kit';

const CEMETERY = new Set(['gate', 'avenue', 'yard', 'lawn']);
const RAIL_STEP = 1.8;

/** Keep-out boxes round the big buildings, in world x and z. */
const BUILDINGS: [number, number, number, number][] = [
  [-172, 150, -62, 200], // the house and its porches
  [62, -160, 126, -96], // the lair
];

const inBuilding = (x: number, z: number) => BUILDINGS.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

/** Everything set along the road and across the open ground: railings, graves, trees, lamps and pumpkins. */
export function scatter(track: Track, kit: Kit): void {
  for (const span of routeSpans(track)) {
    railings(track, kit, span);
  }
  lamps(track, kit);
  rows(track, kit);
  field(kit);
  openGraves(track, kit);
}

const main = (track: Track, route: number, s: number) => {
  if (route === 0) return s;
  const r = track.routes[0];
  return r.from + ((s - r.rfrom) * (r.to - r.from)) / (r.rto - r.rfrom);
};

/** Spear railings round the cemetery, rickety rails up the hill, each broken at the fork and join. */
function railings(track: Track, kit: Kit, { route, t, s0, s1 }: ReturnType<typeof routeSpans>[number]): void {
  const { batch, g, mats } = kit;
  for (const side of [-1, 1]) {
    let top: THREE.Vector3 | null = null;
    let low: THREE.Vector3 | null = null;
    let run = 0;
    for (let s = s0 + 1, k = 0; s < s1 - 1; s += RAIL_STEP, k++) {
      const p = sampleAt(t, s);
      const open = p.cover === 'open' && p.surface !== 'wood' && p.surface !== 'stone';
      if (!open || atJunction(track, main(track, route, s), 1) || (route === 0 && s < 20) || (route === 0 && s > t.length - 1 && side === 0)) {
        top = low = null;
        continue;
      }
      const foot = frame(p, side * (limitOf(p) + 0.25), 0);
      foot.y = Math.max(foot.y - 0.3, Math.min(foot.y, kit.terrain.height(foot.x, foot.z)));
      const h = headingAt(p);
      if (p.zone === 'hill' || p.zone === 'secret') {
        if (k % 2 === 0) {
          box(batch, mats.planks, 0.2, 1.6, 0.2, xf(foot.x, foot.y + 0.7, foot.z, h, (hash2(k, side, 1) - 0.5) * 0.25, (hash2(k, side, 2) - 0.5) * 0.25), [0.6, 0.55, 0.55]);
          const rail: THREE.Vector3 = foot.clone().setY(foot.y + 1.15 + (hash2(k, side, 3) - 0.5) * 0.2);
          if (top && hash2(k, side, 4) > 0.1) rope(batch, mats.planks, top, rail, 0.12);
          top = rail;
          if (hash2(k, side, 5) < 0.07) skull(kit, xf(foot.x, foot.y + 1.75, foot.z, h - side * 1.3), 0.3);
        }
        continue;
      }
      spearPost(batch, g.iron, foot, 1.5, h);
      if (k % 2 === 0) {
        const a = foot.clone().setY(foot.y + 1.3);
        const b = foot.clone().setY(foot.y + 0.3);
        if (top && low) {
          rope(batch, g.iron, top, a, 0.08);
          rope(batch, g.iron, low, b, 0.08);
        }
        top = a;
        low = b;
      }
      if (++run % 9 === 0) {
        const m = xf(foot.x, foot.y, foot.z, h);
        slab(batch, g.blocks, m.clone().multiply(xf(0, 1.0, 0)), 0.8, 2.2, 0.8, 3);
        cube(batch, g.stone, m.clone().multiply(xf(0, 2.2, 0)), 1.0, 0.22, 1.0);
        batch.geometry(g.stone, new THREE.OctahedronGeometry(0.3), m.clone().multiply(xf(0, 2.6, 0)));
      }
    }
  }
}

function lamps(track: Track, kit: Kit): void {
  let side = -1;
  for (let s = 34; s < track.length - 16; s += 52) {
    const p = sampleAt(track, s);
    if (p.cover !== 'open' || p.surface === 'wood' || atJunction(track, s, 8)) continue;
    side = -side;
    const at = frame(p, side * (limitOf(p) + 1.3), 0);
    at.y = Math.min(at.y, kit.terrain.height(at.x, at.z));
    lampPost(kit, at, headingAt(p) + (side > 0 ? Math.PI : 0), 4);
  }
  // Pumpkins down the road, each looking at the traffic, between the lamps.
  for (let s = 60, k = 0; s < track.length - 10; s += 52, k++) {
    const p = sampleAt(track, s);
    if (p.cover !== 'open' || p.surface === 'wood' || atJunction(track, s, 4)) continue;
    const sd = k % 2 ? 1 : -1;
    const at = frame(p, sd * (limitOf(p) + 1.1), 0);
    at.y = kit.terrain.height(at.x, at.z);
    jackOLantern(kit, at, headingAt(p) + Math.PI + sd * 0.5, 0.9 + kit.rng() * 0.5, true);
    if (kit.rng() < 0.6) jackOLantern(kit, at.clone().addScaledVector(new THREE.Vector3(p.tx, 0, p.tz), -1.6), headingAt(p) + Math.PI, 0.65, false);
  }
}

/** Rows of graves behind the railings all along the cemetery stretches, looking at the road. */
function rows(track: Track, kit: Kit): void {
  const { rng } = kit;
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    for (let s = s0 + 8; s < s1 - 8; s += 2.9) {
      const p = sampleAt(t, s);
      if (!CEMETERY.has(p.zone) || atJunction(track, main(track, route, s), 6)) continue;
      for (const side of [-1, 1]) {
        for (const o of [2.4, 5.6, 8.8, 12]) {
          if (rng() < 0.32) continue;
          const v = frame(p, side * (limitOf(p) + o + (rng() - 0.5) * 0.9), 0);
          const g = place(kit, v.x, v.z, 2);
          if (g) headstone(kit, g, headingAt(p) + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (rng() - 0.5) * 0.3, 0.9 + rng() * 0.4);
        }
      }
    }
  }
}

/** A flat, dry spot to build on, or null. */
function place(kit: Kit, x: number, z: number, margin: number): THREE.Vector3 | null {
  if (!kit.clear(x, z, margin) || inBuilding(x, z) || pondDepth(x, z) > 0) return null;
  const h = kit.terrain.height(x, z);
  const slope = Math.abs(kit.terrain.height(x + 1.5, z) - h) + Math.abs(kit.terrain.height(x, z + 1.5) - h);
  return slope > 0.8 ? null : new THREE.Vector3(x, h, z);
}

/** Across the open ground: dead trees, clumps of graves, tombs, angels and weeds. */
function field(kit: Kit): void {
  const { rng, batch, g } = kit;
  for (let z = AREA.z0 + 12; z < AREA.z1 - 8; z += 13) {
    for (let x = AREA.x0 + 12; x < AREA.x1 - 8; x += 13) {
      const px = x + (rng() - 0.5) * 11;
      const pz = z + (rng() - 0.5) * 11;
      const at = place(kit, px, pz, 5);
      const dense = fbm(px / 70, pz / 70, 2, 77);
      const roll = rng();
      if (at && roll < 0.1 + (dense - 0.5) * 0.35) {
        deadTree(kit, at, 11 + rng() * 9);
      } else if (at && dense > 0.46) {
        const yaw = Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.3;
        const n = 2 + Math.floor(rng() * 5);
        for (let i = 0; i < n; i++) {
          const v = place(kit, px + (i - n / 2) * 2.2 * Math.cos(yaw), pz - (i - n / 2) * 2.2 * Math.sin(yaw), 2.5);
          if (v) headstone(kit, v, yaw + (rng() - 0.5) * 0.25, 0.9 + rng() * 0.5);
        }
      }
      if (roll > 0.72) {
        const v = place(kit, px + 4, pz - 3, 1.5);
        if (v) for (const turn of [0, Math.PI / 2]) batch.geometry(g.weeds, new THREE.PlaneGeometry(1.8, 1.5), xf(v.x, v.y + 0.7, v.z, turn + roll * 9));
      }
    }
  }
  const bigs: [number, number, number, number, number, number][] = [
    [175, -55, -Math.PI / 2, 7, 8, 6],
    [180, -150, -Math.PI / 2 - 0.3, 8, 9, 7],
    [115, -228, Math.PI, 7, 8, 6],
    [-165, -130, 0.3, 7, 8, 6],
    [-240, 40, Math.PI / 2, 8, 9, 7],
    [-120, 40, -Math.PI / 2, 7, 8, 6],
    [-100, 100, Math.PI, 8, 9, 7],
    [-150, 70, 0.5, 7, 8, 6],
  ];
  bigs.forEach(([x, z, yaw, w, d, h], i) => {
    const v = place(kit, x, z, 6);
    if (v) mausoleum(kit, v.setY(v.y - 0.1), yaw, w, d, h, i % 2 === 0);
  });
  for (const [x, z, yaw] of [
    [150, -20, 1],
    [168, -95, -1.6],
    [90, -222, 3.1],
    [-222, -70, 2],
    [-168, -118, 0.4],
    [-232, 110, 1.6],
    [-130, 130, 2.6],
  ]) {
    const v = place(kit, x, z, 3);
    if (v) angel(kit, v, yaw, 1.1 + rng() * 0.3);
  }
}

/** The two kickers are heaps of grave earth: an open grave, its coffin lid, spade and lamp beside the ramp. */
function openGraves(track: Track, kit: Kit): void {
  const { batch, g } = kit;
  const lips = kickers(track);
  for (const lip of lips) {
    const p = sampleAt(track, lip);
    const h = headingAt(p);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const q = sampleAt(track, lip - 12 + k * 6);
        const v = frame(q, side * (limitOf(q) + 1.8), 0);
        v.y = kit.terrain.height(v.x, v.z);
        batch.geometry(g.soil, new THREE.IcosahedronGeometry(1, 1), xf(v.x, v.y, v.z, k, 0, 0, 2 + (k % 2), 1.3 + q.y - v.y, 3));
      }
    }
    const lid = frame(p, -(limitOf(p) + 1.4), 0.9);
    lid.y = Math.max(lid.y - 0.6, kit.terrain.height(lid.x, lid.z) + 1.1);
    coffin(kit, xf(lid.x, lid.y, lid.z, h + 0.6, -1.1, 0.1), false);
    const spade = frame(p, limitOf(p) + 1.5, 0);
    spade.y = kit.terrain.height(spade.x, spade.z) + 0.8;
    batch.geometry(g.bark, new THREE.CylinderGeometry(0.07, 0.07, 2.8, 5), xf(spade.x, spade.y + 1, spade.z, h, 0.25, 0.1));
    lampPost(kit, frame(p, limitOf(p) + 3.2, 0).setY(kit.terrain.height(...xz(frame(p, limitOf(p) + 3.2, 0)))), h, 4.4);
  }
}

const xz = (v: THREE.Vector3): [number, number] => [v.x, v.z];

/** Distances of the two grave kickers' lips: the first high points of the avenue and the yard. */
function kickers(track: Track): number[] {
  const out: number[] = [];
  const { samples } = track;
  for (const zone of ['avenue', 'yard']) {
    let best: Sample | null = null;
    for (const p of samples) if (p.zone === zone && p.cover === 'open' && (!best || p.y > best.y)) best = p;
    if (best) out.push(best.s);
  }
  return out;
}
