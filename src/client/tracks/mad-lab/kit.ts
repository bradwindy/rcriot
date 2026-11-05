import * as THREE from 'three';
import { toMain } from '../../../shared/course';
import { sampleAt, type Sample, type Track } from '../../../shared/track';
import type { Batch, RGB } from '../../render/geometry';
import { atJunction, loft, routeSpans, type Profile } from '../../render/road';

/**
 * A box whose texture repeats every `tile` units on every face, so long walls and tall towers keep their blocks the
 * right size. `m` places its centre and turns it.
 */
export function cube(batch: Batch, mat: THREE.Material, w: number, h: number, d: number, m: THREE.Matrix4, tile = 8, color: RGB = [1, 1, 1]): void {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  const nor = g.getAttribute('normal');
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const [su, sv] = nx > 0.5 ? [d, h] : ny > 0.5 ? [w, d] : [w, h];
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  batch.geometry(mat, g, m, color);
  g.dispose();
}

/** A box between two points on the ground plane, from y0 up to y1, `thick` across. */
export function wall(batch: Batch, mat: THREE.Material, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, thick: number, tile = 8, color?: RGB): void {
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(-(bx - ax), -(bz - az));
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  cube(batch, mat, thick, y1 - y0, len, m, tile, color);
}

/** An open-ended cylinder or cone with its texture wrapped to world size, `sides` facets. */
export function drum(batch: Batch, mat: THREE.Material, x: number, y0: number, z: number, r0: number, r1: number, h: number, sides: number, tile = 8, color: RGB = [1, 1, 1], inside = false): void {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, Math.max(1, Math.round(h / 6)), true);
  if (inside) g.scale(-1, 1, 1);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * Math.max(r0, r1)) / tile, (uv.getY(i) * h) / tile);
  batch.geometry(mat, g, new THREE.Matrix4().makeTranslation(x, y0 + h / 2, z), color);
  g.dispose();
}

/** Battlements round the top of a drum: `count` merlons standing on its rim. */
export function crown(batch: Batch, mat: THREE.Material, x: number, y: number, z: number, r: number, count: number, size = 1.6): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x + Math.cos(a) * r, y + size * 0.6, z + Math.sin(a) * r),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    cube(batch, mat, size * 0.9, size * 1.2, ((Math.PI * 2 * r) / count) * 0.55, m, 4);
  }
}

/** A cone roof. */
export function spire(batch: Batch, mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, sides = 8): void {
  const g = new THREE.ConeGeometry(r, h, sides, 1, true);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / 6, (uv.getY(i) * h) / 6);
  batch.geometry(mat, g, new THREE.Matrix4().makeTranslation(x, y + h / 2, z));
  g.dispose();
}

/** Where along each drawn route a test holds, in runs: [route track, main-or-route s0, s1]. */
export function runs(track: Track, test: (p: Sample, route: number, ms: number) => boolean, step = 1): { t: Track; route: number; a: number; b: number }[] {
  const out: { t: Track; route: number; a: number; b: number }[] = [];
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    let start = -1;
    for (let s = s0; s <= s1; s += step) {
      const ok = test(sampleAt(t, s), route, toMain(track, route, s));
      if (ok && start < 0) start = s;
      if ((!ok || s + step > s1) && start >= 0) {
        if (s - start > step) out.push({ t, route, a: start, b: ok ? s : s - step });
        start = -1;
      }
    }
  }
  return out;
}

/** True where scenery may stand: away from the fork's mouths. */
export function clearOfJunction(track: Track, ms: number, margin = 2): boolean {
  return !atJunction(track, ms, margin);
}

/** Lofts a profile along every run where `test` holds. */
export function along(batch: Batch, track: Track, test: (p: Sample, route: number, ms: number) => boolean, mat: (p: Sample) => THREE.Material | null, profile: Profile, opts: { spacing?: number; uScale?: number; vScale?: number; color?: RGB } = {}): void {
  for (const { t, a, b } of runs(track, test)) {
    loft(batch, t, a, b, { spacing: opts.spacing ?? 2, vScale: opts.vScale ?? 4, uScale: opts.uScale ?? 4, outward: true, material: mat, profile, color: opts.color });
  }
}

/** Every `every` units along each run where `test` holds, with the sample, route track and main distance. */
export function each(track: Track, every: number, test: (p: Sample, route: number, ms: number) => boolean, f: (p: Sample, t: Track, s: number, k: number) => void, phase = 0): void {
  for (const { t, a, b } of runs(track, test)) {
    let k = 0;
    for (let s = a + phase; s <= b; s += every, k++) f(sampleAt(t, s), t, s, k);
  }
}
