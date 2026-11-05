import * as THREE from 'three';
import { limitOf, type Sample, type Track } from '../../../shared/track';
import type { Batch } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { frame, headingAt, paveRoad, startLine } from '../../render/road';
import { xf } from '../../render/geometry';
import { along, clearOfJunction, cube, each } from './kit';
import type { MadMats } from './materials';
import { FLOOR } from './plan';

/** Height of the dungeon ceiling, just under the yard floor. */
export const CEILING = FLOOR - 0.5;
/** Deepest a road can be and still have the yard floor over it. */
export const COVERED = CEILING - 5.4;

export function pave(track: Track, batch: Batch, mats: Materials, m: MadMats, grid: { s: number; offset: number }[]): void {
  const road = (p: Sample): THREE.Material | null => {
    switch (p.zone) {
      case 'bank':
        return m.mud;
      case 'bridge':
        return p.y < 0.6 ? null : m.setts;
      case 'moat':
        return null;
      case 'draw':
      case 'leap':
        return m.timber;
      case 'gate':
      case 'dungeon':
      case 'lab':
        return m.settsIn;
      case 'tower':
        return m.settsTower;
      default:
        return m.setts;
    }
  };
  paveRoad(track, batch, {
    road,
    verge: (p) => (p.zone === 'bank' ? m.grass : p.zone === 'lab' ? m.tile : road(p)),
    skirt: (p) => {
      if (p.zone === 'bank') return { mat: m.grass, drop: 1, out: 0.7 };
      if (p.zone === 'bridge' && p.y > 0.6) return { mat: m.stone, drop: 1.6, out: 0 };
      if (p.zone === 'leap' || p.zone === 'draw') return { mat: m.timber, drop: 0.6, out: 0 };
      if (p.zone === 'rampart' || p.zone === 'tower') return { mat: p.zone === 'tower' ? m.stoneTower : m.stone, drop: 1.2, out: 0 };
      return null;
    },
  });
  startLine(track, batch, mats, grid);
}

type Side = -1 | 1;

/** A wall along the barrier on one side: `h` tall, `t` thick, its foot `foot` below the road. */
function barrier(side: Side, h: (p: Sample) => number, t: number, foot = 0.6, gap = 0) {
  return (p: Sample): [number, number][] => {
    const l = limitOf(p) + gap;
    const top = h(p);
    const pts: [number, number][] = [
      [l, -foot],
      [l, top],
      [l + t, top],
      [l + t, -foot],
    ];
    return side > 0 ? pts : pts.map(([o, y]) => [-o, y] as [number, number]).reverse();
  };
}

export function edges(track: Track, batch: Batch, m: MadMats): void {
  const zone = (z: string, extra?: (p: Sample, ms: number) => boolean) => (p: Sample, _r: number, ms: number) =>
    p.zone === z && clearOfJunction(track, ms) && (extra ? extra(p, ms) : true);

  // Outer banks: a low stone wall on the moat side, iron railings with spikes on the other.
  along(batch, track, zone('bank'), () => m.stone, barrier(1, () => 0.9, 0.9, 1.2), { uScale: 3, vScale: 3 });
  along(batch, track, zone('bank'), () => m.stone, barrier(-1, () => 0.3, 0.5, 1), { uScale: 3, vScale: 3 });
  let last: THREE.Vector3[] | null = null;
  each(track, 2.5, zone('bank'), (p, _t, _s, k) => {
    const h = headingAt(p);
    const base = frame(p, -(limitOf(p) + 0.25), 0.3);
    if (k % 8 === 0) {
      cube(batch, m.stone, 0.8, 2.2, 0.8, xf(base.x, base.y + 0.8, base.z, h), 2);
      cube(batch, m.stone, 1.0, 0.25, 1.0, xf(base.x, base.y + 1.95, base.z, h), 2);
    } else {
      cube(batch, m.iron, 0.09, 1.7, 0.09, xf(base.x, base.y + 0.85, base.z, h), 2);
      batch.geometry(m.iron, new THREE.ConeGeometry(0.12, 0.35, 4), xf(base.x, base.y + 1.85, base.z, h));
    }
    const rails = [base.clone().setY(base.y + 0.5), base.clone().setY(base.y + 1.45)];
    if (last && k > 0) for (let i = 0; i < 2; i++) batch.beam(m.iron, last[i], rails[i], 0.07);
    last = rails;
  });

  // Bridges: stone parapets with a coping, stopping where the south bridge breaks off.
  const bridgeTest = zone('bridge', (p) => p.y > 1.25);
  for (const side of [-1, 1] as Side[]) {
    along(batch, track, bridgeTest, () => m.stone, barrier(side, () => 1.1, 0.7, 1.6), { uScale: 3, vScale: 3 });
    along(batch, track, bridgeTest, () => m.stone, barrier(side, () => 1.35, 1.0, -1.1, -0.15), { uScale: 3, vScale: 3 });
  }

  // The yard ramps and the rampart walk: crenellated parapets, and the stone wall the walk stands on.
  const high = zone('rampart');
  for (const side of [-1, 1] as Side[]) {
    along(batch, track, high, () => m.stone, barrier(side, () => 1.0, 0.8, 1.2), { uScale: 4, vScale: 4 });
    along(batch, track, high, () => m.stone, (p) => {
      const l = limitOf(p);
      const drop = FLOOR - p.y - 0.2;
      const pts: [number, number][] = [
        [l + 0.8, -1.2],
        [l + 0.8, drop],
      ];
      return side > 0 ? pts : pts.map(([o, y]) => [-o, y] as [number, number]).reverse();
    }, { uScale: 8, vScale: 8 });
  }
  each(track, 3, high, (p) => {
    const h = headingAt(p);
    for (const side of [-1, 1]) {
      const at = frame(p, side * (limitOf(p) + 0.4), 1.0);
      cube(batch, m.stone, 0.8, 1.1, 1.5, xf(at.x, at.y + 0.55, at.z, h), 4);
    }
  });
  along(batch, track, zone('yard'), () => m.stone, barrier(1, () => 0.45, 0.6, 0.3), { uScale: 3, vScale: 3 });
  along(batch, track, zone('yard'), () => m.stone, barrier(-1, () => 0.45, 0.6, 0.3), { uScale: 3, vScale: 3 });

  // The gatehouse passage: high walls and a barrel vault.
  for (const side of [-1, 1] as Side[]) along(batch, track, zone('gate'), () => m.stoneIn, barrier(side, () => 7, 2.5, 0.6), { uScale: 6, vScale: 6 });
  along(batch, track, zone('gate'), () => m.stoneIn, (p) => {
    const l = limitOf(p) + 0.05;
    return Array.from({ length: 9 }, (_, k) => {
      const a = (k / 8) * Math.PI;
      return [Math.cos(a) * l, 7 + Math.sin(a) * 3] as [number, number];
    });
  }, { uScale: 6, vScale: 6 });

  // The dungeon: rough walls up to a low ceiling, or up to a lip round the yard floor where the ramps break through.
  const deep = zone('dungeon');
  const wallTop = (p: Sample) => (p.y <= COVERED ? CEILING - p.y + 0.3 : FLOOR + 0.9 - p.y);
  for (const side of [-1, 1] as Side[]) {
    along(batch, track, deep, () => m.dungeon, barrier(side, wallTop, 1.6, 0.6), { uScale: 5, vScale: 5 });
    along(batch, track, (p, r, ms) => deep(p, r, ms) && p.y > COVERED - 0.4, () => m.stone, (p) => {
      const l = limitOf(p);
      const top = FLOOR + 0.9 - p.y;
      const pts: [number, number][] = [
        [l + 1.6, top],
        [l + 3.2, top],
        [l + 3.2, top - 0.4],
      ];
      return side > 0 ? pts : pts.map(([o, y]) => [-o, y] as [number, number]).reverse();
    }, { uScale: 3, vScale: 3 });
  }
  along(batch, track, (p, r, ms) => deep(p, r, ms) && p.y <= COVERED, () => m.dungeon, (p) => {
    const l = limitOf(p) + 0.1;
    const h = CEILING - p.y;
    return [
      [l, h],
      [0, h + 0.4],
      [-l, h],
    ];
  }, { uScale: 5, vScale: 5 });
  each(track, 7, (p, r, ms) => deep(p, r, ms) && p.y <= COVERED, (p) => {
    const h = headingAt(p);
    const l = limitOf(p);
    for (let k = 0; k < 7; k++) {
      const a0 = (k / 7) * Math.PI;
      const a1 = ((k + 1) / 7) * Math.PI;
      const top = CEILING - p.y - 0.2;
      const pa = frame(p, Math.cos(a0) * l, top - 2.2 + Math.sin(a0) * 2.2);
      const pb = frame(p, Math.cos(a1) * l, top - 2.2 + Math.sin(a1) * 2.2);
      batch.beam(m.dungeon, pa, pb, 0.9, 0.7);
    }
    for (const side of [-1, 1]) {
      const at = frame(p, side * (l + 0.2), 0);
      cube(batch, m.dungeon, 1.2, CEILING - p.y - 1.6, 1.0, xf(at.x, at.y + (CEILING - p.y - 1.6) / 2, at.z, h), 3);
    }
  });

  // The laboratory: iron rails on short posts along both sides.
  const lab = zone('lab');
  for (const side of [-1, 1] as Side[]) along(batch, track, lab, () => m.ironIn, barrier(side, () => 0.25, 0.3, 0.1), { uScale: 2, vScale: 2 });
  const rails: (THREE.Vector3[] | null)[] = [null, null];
  each(track, 3, lab, (p, _t, _s, k) => {
    const h = headingAt(p);
    [-1, 1].forEach((side, i) => {
      const at = frame(p, side * (limitOf(p) + 0.15), 0.25);
      cube(batch, m.ironIn, 0.12, 1.0, 0.12, xf(at.x, at.y + 0.5, at.z, h), 2);
      const top = at.clone().setY(at.y + 1.0);
      const prev = rails[i];
      if (prev && k > 0) batch.beam(m.ironIn, prev[0], top, 0.08);
      rails[i] = [top];
    });
  });
}
