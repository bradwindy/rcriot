import * as THREE from 'three';
import { routeTrack } from '../../shared/course';
import { limitOf, sampleAt, type Sample, type Track } from '../../shared/track';
import { Batch, xf, type RGB } from './geometry';
import type { Materials } from './materials';

export type Profile = (p: Sample, ring: number) => [o: number, h: number, u?: number][];

interface LoftOptions {
  material: (p: Sample) => THREE.Material | null;
  profile: Profile;
  spacing: number;
  vScale: number;
  /** Units of profile length per texture repeat, when the profile gives no u of its own. */
  uScale?: number;
  /** Faces point away from the centre line: road tops, hull outsides. Otherwise they face in: cave and hull insides. */
  outward?: boolean;
  color?: RGB;
}

/** A point in the track's frame: `o` to the right of the centre line, `h` above the banked surface. */
export function frame(p: Sample, o: number, h: number): THREE.Vector3 {
  return new THREE.Vector3(p.x - p.tz * o, p.y + o * Math.tan(p.bank) + h, p.z + p.tx * o);
}

export function headingAt(p: Sample): number {
  return Math.atan2(-p.tx, -p.tz);
}

/** Sweeps a cross-section along the track from s0 to s1. */
export function loft(batch: Batch, track: Track, s0: number, s1: number, opt: LoftOptions): void {
  const count = Math.max(2, Math.ceil((s1 - s0) / opt.spacing) + 1);
  const rings: { p: Sample; s: number; pts: THREE.Vector3[]; us: number[] }[] = [];
  for (let j = 0; j < count; j++) {
    const s = s0 + ((s1 - s0) * j) / (count - 1);
    const p = sampleAt(track, s);
    const prof = opt.profile(p, j);
    const pts = prof.map(([o, h]) => frame(p, o, h));
    let run = 0;
    const us = prof.map(([, , u], k) => {
      if (k > 0) run += pts[k].distanceTo(pts[k - 1]);
      return u ?? run / (opt.uScale ?? 1);
    });
    rings.push({ p, s, pts, us });
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
  const color = opt.color ?? [1, 1, 1];
  for (let j = 0; j < count - 1; j++) {
    const mat = opt.material(rings[j].p);
    if (!mat) continue;
    for (let k = 0; k < n - 1; k++) {
      const a: [number, number] = [j, k];
      const b: [number, number] = [j + 1, k];
      const c: [number, number] = [j, k + 1];
      const d: [number, number] = [j + 1, k + 1];
      const tris = opt.outward ? [a, c, b, c, d, b] : [a, b, c, c, b, d];
      for (const [jj, kk] of tris) {
        batch.vertex(mat, rings[jj].pts[kk], normals[jj][kk], rings[jj].us[kk], rings[jj].s / opt.vScale, color);
      }
    }
  }
}

/** Closes the gap between an inner and an outer cross-section at one end of a shell. */
export function rim(batch: Batch, mat: THREE.Material, p: Sample, inner: THREE.Vector3[], outer: THREE.Vector3[], forward: boolean): void {
  const n = new THREE.Vector3(p.tx, 0, p.tz).multiplyScalar(forward ? 1 : -1);
  for (let k = 0; k < inner.length - 1; k++) {
    const quad = forward
      ? [inner[k], outer[k], inner[k + 1], inner[k + 1], outer[k], outer[k + 1]]
      : [inner[k], inner[k + 1], outer[k], inner[k + 1], outer[k + 1], outer[k]];
    quad.forEach((v, i) => batch.vertex(mat, v, n, (i % 2) * 0.3, k * 0.3));
  }
}

export function box(batch: Batch, mat: THREE.Material, w: number, h: number, d: number, m: THREE.Matrix4, color?: RGB): void {
  batch.box(mat, w, h, d, m, color);
}

export function rope(batch: Batch, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, w = 0.07): void {
  batch.beam(mat, a, b, w);
}

export function flagOnPole(batch: Batch, mats: Materials, base: THREE.Vector3, heading: number, height: number, size = 1): void {
  box(batch, mats.planks, 0.12, height, 0.12, xf(base.x, base.y + height / 2, base.z, heading));
  batch.geometry(
    mats.flag,
    new THREE.PlaneGeometry(1.6 * size, 1.0 * size),
    xf(base.x, base.y + height - 0.5 * size, base.z, heading + Math.PI / 2).multiply(xf(0.8 * size, 0, 0)),
  );
}

/** The stretch of each route to draw: all of the main track, and the fork's own part of the other route. */
export function routeSpans(track: Track): { route: number; t: Track; s0: number; s1: number }[] {
  return [
    { route: 0, t: track, s0: 0, s1: track.length },
    ...track.routes.map((r, i) => ({ route: i + 1, t: r.track, s0: r.rfrom, s1: r.rto })),
  ];
}

/** True where a fork or join's two roads overlap, so barriers and props there would block the way. */
export function atJunction(track: Track, ms: number, margin = 0): boolean {
  return track.routes.some((r) => r.zones.some(([a, b]) => ms > a - margin && ms < b + margin));
}

export interface PaveOptions {
  road(p: Sample): THREE.Material | null;
  /** The drivable shoulder from the road edge out to the barrier. */
  verge(p: Sample): THREE.Material | null;
  /** A skirt hanging off the barrier edge, `drop` down and `out` sideways: a bank down to the ground or a deck's edge. */
  skirt?(p: Sample): { mat: THREE.Material; drop: number; out: number } | null;
}

/** Road, shoulders and skirts along every route. The fork's road sits a hair higher, so it wins where they overlap. */
export function paveRoad(track: Track, batch: Batch, opts: PaveOptions): void {
  for (const { route, t, s0, s1 } of routeSpans(track)) {
    const lift = route ? 0.05 : 0;
    loft(batch, t, s0, s1, {
      spacing: 2,
      vScale: 6,
      outward: true,
      material: opts.road,
      profile: (p) => [-0.5, -0.25, 0, 0.25, 0.5].map((f) => [f * p.width, lift, f + 0.5]),
    });
    for (const side of [-1, 1]) {
      loft(batch, t, s0, s1, {
        spacing: 2,
        vScale: 10,
        outward: true,
        material: opts.verge,
        profile: (p) => {
          const edge: [number, number, number][] = [
            [(side * p.width) / 2, lift, (side * p.width) / 20],
            [side * limitOf(p), lift, (side * limitOf(p)) / 10],
          ];
          return side < 0 ? edge.reverse() : edge;
        },
      });
      const skirt = opts.skirt;
      if (!skirt) continue;
      loft(batch, t, s0, s1, {
        spacing: 2,
        vScale: 6,
        outward: true,
        material: (p) => skirt(p)?.mat ?? null,
        profile: (p) => {
          const k = skirt(p) ?? { drop: 1, out: 0.7 };
          const limit = limitOf(p);
          const drop: [number, number][] = [
            [side * limit, lift],
            [side * (limit + k.out), lift - k.drop],
          ];
          return side < 0 ? drop.reverse() : drop;
        },
      });
    }
  }
}

/** The chequered start line and the white boxes of the grid behind it. */
export function startLine(track: Track, batch: Batch, mats: Materials, grid: { s: number; offset: number }[]): void {
  loft(batch, track, -0.9, 0.9, {
    spacing: 1.8,
    vScale: 1.6,
    outward: true,
    material: () => mats.checker,
    profile: (p) => [-0.5, 0, 0.5].map((f) => [f * p.width, 0.04, (f * p.width) / 1.6]),
  });
  for (const slot of grid) {
    loft(batch, track, slot.s + 1.1, slot.s + 1.35, {
      spacing: 1,
      vScale: 1,
      outward: true,
      material: () => mats.white,
      profile: () => [
        [slot.offset - 0.9, 0.04, 0],
        [slot.offset + 0.9, 0.04, 1],
      ],
    });
  }
}

/** The sample where a car on `route` at route distance `s` is, for scenery placed along a route. */
export function routeSample(track: Track, route: number, s: number): Sample {
  return sampleAt(routeTrack(track, route), s);
}
