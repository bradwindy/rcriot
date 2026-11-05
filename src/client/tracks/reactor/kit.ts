import * as THREE from 'three';
import { toMain } from '../../../shared/course';
import { limitOf, sampleAt, type Sample, type Track } from '../../../shared/track';
import { Batch, xf, type RGB } from '../../render/geometry';
import { addPointLight, type PointLight } from '../../render/ps1';
import { atJunction, frame, headingAt, loft, routeSpans } from '../../render/road';
import type { ReactorMats } from './materials';

/** Every drawn stretch of every route, with the main-track distance of each of its samples. */
export function spans(track: Track): { route: number; t: Track; s0: number; s1: number; main: (s: number) => number }[] {
  return routeSpans(track).map((r) => ({ ...r, main: (s: number) => toMain(track, r.route, s) }));
}

/**
 * A strip along the barrier on both sides of every route: kerbs, walls and rail bases. `right` is the cross-section on
 * the right-hand side, as offsets beyond the barrier, drawn outward-facing; the left side is its mirror image.
 */
export function edgeLoft(
  track: Track,
  batch: Batch,
  right: [o: number, h: number][],
  material: (p: Sample, ms: number) => THREE.Material | null,
  spacing = 2,
  color?: RGB,
): void {
  for (const { t, s0, s1, main } of spans(track)) {
    for (const side of [-1, 1]) {
      const prof = side > 0 ? right : [...right].reverse().map(([o, h]) => [o, h] as [number, number]);
      loft(batch, t, s0, s1, {
        spacing,
        vScale: 4,
        uScale: 2,
        outward: true,
        color,
        material: (p) => (atJunction(track, main(p.s), 3) ? null : material(p, main(p.s))),
        profile: (p) => prof.map(([o, h]) => [side * (limitOf(p) + o), h]),
      });
    }
  }
}

/** An upright box from y0 to y1. */
export function column(batch: Batch, mat: THREE.Material, x: number, z: number, y0: number, y1: number, w: number, yaw = 0, color?: RGB): void {
  batch.box(mat, w, y1 - y0, w, xf(x, (y0 + y1) / 2, z, yaw), color);
}

/** A square lattice mast: four legs, rungs and cross braces. */
export function lattice(batch: Batch, mat: THREE.Material, base: THREE.Vector3, height: number, width: number, yaw: number, color: RGB = [1, 1, 1]): void {
  const h = width / 2;
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z).applyAxisAngle(UP, yaw).add(base));
  for (const c of corners) batch.beam(mat, c, c.clone().setY(base.y + height), 0.22, 0.22, color);
  const step = width * 1.4;
  for (let y = 0; y + step <= height + 0.01; y += step) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      const a0 = a.clone().setY(base.y + y);
      const b1 = b.clone().setY(base.y + y + step);
      batch.beam(mat, a0, b1, 0.12, 0.12, color);
      batch.beam(mat, a0, b.clone().setY(base.y + y), 0.14, 0.14, color);
    }
  }
}

export const UP = new THREE.Vector3(0, 1, 0);

/** A rotating warning light: its housing is static, its beams and its light are moved each frame. */
export interface Beacon {
  at: THREE.Vector3;
  light: PointLight;
  base: THREE.Color;
  speed: number;
  phase: number;
}

export function beacon(batch: Batch, m: ReactorMats, at: THREE.Vector3, seed: number, red = false): Beacon {
  batch.geometry(m.paintOut, new THREE.CylinderGeometry(0.32, 0.38, 0.25, 8), xf(at.x, at.y - 0.12, at.z), [0.2, 0.2, 0.22]);
  batch.geometry(m.neon, new THREE.CylinderGeometry(0.24, 0.28, 0.5, 8), xf(at.x, at.y + 0.25, at.z), red ? [1, 0.2, 0.1] : [1, 0.6, 0.1]);
  const base = red ? new THREE.Color(1.6, 0.25, 0.1) : new THREE.Color(1.6, 0.8, 0.15);
  return { at: at.clone().setY(at.y + 0.25), light: addPointLight(at.clone().setY(at.y + 0.3), base.clone(), 14), base, speed: 4 + (seed % 3), phase: seed * 1.7 };
}

/** Railing posts with a top and a middle rail along one side of a stretch of track. */
export function railing(batch: Batch, mat: THREE.Material, t: Track, s0: number, s1: number, side: number, color: RGB, skip: (s: number) => boolean, step = 2.5): void {
  let last: THREE.Vector3[] | null = null;
  for (let s = s0; s <= s1; s += step) {
    if (skip(s)) {
      last = null;
      continue;
    }
    const p = sampleAt(t, s);
    const foot = frame(p, side * (limitOf(p) + 0.1), 0);
    batch.box(mat, 0.12, 1.15, 0.12, xf(foot.x, foot.y + 0.57, foot.z, headingAt(p)), color);
    const rails = [foot.clone().setY(foot.y + 1.1), foot.clone().setY(foot.y + 0.6)];
    if (last) for (let i = 0; i < 2; i++) batch.beam(mat, last[i], rails[i], 0.08, 0.08, color);
    last = rails;
  }
}

/** True where the point lies over the drivable part of any route at a height below `y`, so a column there would hit it. */
export function overRoad(track: Track, x: number, z: number, y: number, margin = 1): boolean {
  for (const { t, s0, s1 } of spans(track)) {
    for (let s = s0; s < s1; s += 2) {
      const p = sampleAt(t, s);
      if (p.y < y - 1 && Math.hypot(p.x - x, p.z - z) < limitOf(p) + margin) return true;
    }
  }
  return false;
}

const AB = new THREE.Vector3();
const AC = new THREE.Vector3();

/** One flat quad through four corners in order round its edge, facing `n` whichever way round they were given. */
export function quad(batch: Batch, mat: THREE.Material, c: THREE.Vector3[], uv: [number, number][], n: THREE.Vector3, color?: RGB): void {
  AB.subVectors(c[1], c[0]);
  AC.subVectors(c[2], c[0]);
  const order = AB.cross(AC).dot(n) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
  for (const k of order) batch.vertex(mat, c[k], n, uv[k][0], uv[k][1], color);
}

/**
 * An upright wall face from (ax, az) to (bx, bz) between heights y0 and y1, facing `n`, cut into cells about `cell`
 * across so point lights catch it. Texture repeats every `tile` units.
 */
export function wallFace(batch: Batch, mat: THREE.Material, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, n: THREE.Vector3, tile = 8, cell = 4, color?: RGB): void {
  const len = Math.hypot(bx - ax, bz - az);
  const nu = Math.max(1, Math.round(len / cell));
  const nv = Math.max(1, Math.round((y1 - y0) / cell));
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u0 = i / nu;
      const u1 = (i + 1) / nu;
      const h0 = y0 + ((y1 - y0) * j) / nv;
      const h1 = y0 + ((y1 - y0) * (j + 1)) / nv;
      const at = (u: number, h: number) => new THREE.Vector3(ax + (bx - ax) * u, h, az + (bz - az) * u);
      quad(
        batch,
        mat,
        [at(u0, h0), at(u1, h0), at(u1, h1), at(u0, h1)],
        [
          [(u0 * len) / tile, h0 / tile],
          [(u1 * len) / tile, h0 / tile],
          [(u1 * len) / tile, h1 / tile],
          [(u0 * len) / tile, h1 / tile],
        ],
        n,
        color,
      );
    }
  }
}

/** A flat horizontal sheet over a rectangle at height y, facing up or down, cut into cells. */
export function sheet(batch: Batch, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, up: boolean, tile = 8, cell = 4, color?: RGB): void {
  const nx = Math.max(1, Math.round((x1 - x0) / cell));
  const nz = Math.max(1, Math.round((z1 - z0) / cell));
  const n = new THREE.Vector3(0, up ? 1 : -1, 0);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const xa = x0 + ((x1 - x0) * i) / nx;
      const xb = x0 + ((x1 - x0) * (i + 1)) / nx;
      const za = z0 + ((z1 - z0) * j) / nz;
      const zb = z0 + ((z1 - z0) * (j + 1)) / nz;
      quad(
        batch,
        mat,
        [new THREE.Vector3(xa, y, za), new THREE.Vector3(xb, y, za), new THREE.Vector3(xb, y, zb), new THREE.Vector3(xa, y, zb)],
        [
          [xa / tile, za / tile],
          [xb / tile, za / tile],
          [xb / tile, zb / tile],
          [xa / tile, zb / tile],
        ],
        n,
        color,
      );
    }
  }
}

/** A cylinder from a to b, its texture's v running along it once every `tile` units. */
export function pipe(batch: Batch, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 8, tile = 6, color?: RGB): void {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, sides, 1, true);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / tile);
  const dir = b.clone().sub(a).normalize();
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, dir), new THREE.Vector3(1, 1, 1));
  batch.geometry(mat, g, m, color);
  g.dispose();
}
