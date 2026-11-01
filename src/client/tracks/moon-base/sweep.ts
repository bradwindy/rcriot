import * as THREE from 'three';
import { sampleAt, type Sample, type Track } from '../../../shared/track';
import type { Batch, RGB } from '../../render/geometry';
import { frame } from '../../render/road';

/** One corner of a cross-section: `o` right of the centre line, `h` up, its texture u, and the material of the face to the next corner. */
export interface Corner {
  o: number;
  h: number;
  u?: number;
  m?: THREE.Material | null;
  c?: RGB;
}

export interface SweepOptions {
  spacing: number;
  /** Track distance per texture repeat along the sweep. */
  vScale: number;
  /** Profile length per texture repeat across, where a corner gives no u of its own. */
  uScale?: number;
  section(p: Sample, s: number): Corner[];
  /** Faces point away from the centre line, like the outside of a building. */
  outward?: boolean;
}

/**
 * A cross-section swept along the track, like road.ts's loft, but each face of the section has its own material, or
 * none for a gap, so one sweep makes a wall with windows, a strip light and a skirting board.
 */
export function sweep(batch: Batch, track: Track, s0: number, s1: number, opt: SweepOptions): void {
  const count = Math.max(2, Math.ceil((s1 - s0) / opt.spacing) + 1);
  const rings: { s: number; sec: Corner[]; pts: THREE.Vector3[]; us: number[] }[] = [];
  for (let j = 0; j < count; j++) {
    const s = s0 + ((s1 - s0) * j) / (count - 1);
    const p = sampleAt(track, s);
    const sec = opt.section(p, s);
    const pts = sec.map((c) => frame(p, c.o, c.h));
    let run = 0;
    const us = sec.map((c, k) => {
      if (k > 0) run += pts[k].distanceTo(pts[k - 1]);
      return c.u ?? run / (opt.uScale ?? 1);
    });
    rings.push({ s, sec, pts, us });
  }
  const n = rings[0].pts.length;
  const normals = rings.map((ring, j) =>
    ring.pts.map((_, k) => {
      const ds = rings[Math.min(count - 1, j + 1)].pts[k].clone().sub(rings[Math.max(0, j - 1)].pts[k]);
      const dk = ring.pts[Math.min(n - 1, k + 1)].clone().sub(ring.pts[Math.max(0, k - 1)]);
      const nv = new THREE.Vector3().crossVectors(ds, dk).normalize();
      return opt.outward ? nv.negate() : nv;
    }),
  );
  for (let j = 0; j < count - 1; j++) {
    for (let k = 0; k < n - 1; k++) {
      const mat = rings[j].sec[k].m;
      if (!mat) continue;
      const a: [number, number] = [j, k];
      const b: [number, number] = [j + 1, k];
      const c: [number, number] = [j, k + 1];
      const d: [number, number] = [j + 1, k + 1];
      const tris = opt.outward ? [a, c, b, c, d, b] : [a, b, c, c, b, d];
      for (const [jj, kk] of tris) {
        const ring = rings[jj];
        batch.vertex(mat, ring.pts[kk], normals[jj][kk], ring.us[kk], ring.s / opt.vScale, ring.sec[kk].c ?? rings[j].sec[k].c ?? [1, 1, 1]);
      }
    }
  }
}

/** Closes the end of a shell between its inner and outer sections, facing along the track or back. */
export function cap(batch: Batch, mat: THREE.Material, p: Sample, inner: Corner[], outer: Corner[], forward: boolean, color: RGB = [1, 1, 1]): void {
  const n = new THREE.Vector3(p.tx, 0, p.tz).multiplyScalar(forward ? 1 : -1);
  const a = inner.map((c) => frame(p, c.o, c.h));
  const b = outer.map((c) => frame(p, c.o, c.h));
  for (let k = 0; k < Math.min(a.length, b.length) - 1; k++) {
    const quad = forward ? [a[k], b[k], a[k + 1], a[k + 1], b[k], b[k + 1]] : [a[k], a[k + 1], b[k], a[k + 1], b[k + 1], b[k]];
    quad.forEach((v, i) => batch.vertex(mat, v, n, (i % 2) * 0.5, k * 0.25, color));
  }
}

/** A smooth blend of a per-zone value along the track, so walls and ceilings ease between rooms instead of stepping. */
export function eased(track: Track, s: number, value: (p: Sample) => number, reach = 6): number {
  let sum = 0;
  let n = 0;
  for (let k = -3; k <= 3; k++) {
    const w = 4 - Math.abs(k);
    sum += value(sampleAt(track, s + (k * reach) / 3)) * w;
    n += w;
  }
  return sum / n;
}
