import * as THREE from 'three';
import { PYRAMID } from '../../../shared/tracks/inca-temple';
import { limitOf } from '../../../shared/track';
import { Batch, boulder, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { fbm, hash2 } from '../../render/noise';
import type { Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import { v3 } from './kit';
import type { IncaMats } from './palette';

/** The paved court round the pyramid, in world x and z. */
const COURT = { x0: PYRAMID.x - 80, x1: PYRAMID.x + 70, z0: PYRAMID.z - 52, z1: PYRAMID.z + 62 };
const CELL = 4;

/** Flagstones laid over the ground round the pyramid, broken up by moss and grass at the edges. */
function paving(batch: Batch, inca: IncaMats, index: TrackIndex, terrain: Terrain): void {
  const h = (x: number, z: number) => terrain.height(x, z) + 0.06;
  for (let z = COURT.z0; z < COURT.z1; z += CELL) {
    for (let x = COURT.x0; x < COURT.x1; x += CELL) {
      const cx = x + CELL / 2;
      const cz = z + CELL / 2;
      const edge = Math.min(cx - COURT.x0, COURT.x1 - cx, cz - COURT.z0, COURT.z1 - cz);
      const wild = fbm(cx / 14, cz / 14, 2, 41);
      if (edge < 14 && wild > 0.3 + edge / 30) continue;
      const near = index.nearest(cx, cz, 16);
      if (near && near.d < limitOf(near.sample) + 3.5) continue;
      if (Math.abs(cx - PYRAMID.x) < 33 && Math.abs(cz - PYRAMID.z) < 33) continue;
      const moss = smoothMoss(wild);
      const tint: RGB = [0.95 - moss * 0.3, 0.95 + moss * 0.05, 0.9 - moss * 0.35];
      const a = v3(x, h(x, z), z);
      const b = v3(x, h(x, z + CELL), z + CELL);
      const c = v3(x + CELL, h(x + CELL, z + CELL), z + CELL);
      const d = v3(x + CELL, h(x + CELL, z), z);
      const n = new THREE.Vector3(0, 1, 0);
      for (const p of [a, b, c, a, c, d]) batch.vertex(inca.stone, p, n, p.x / 8, p.z / 8, tint);
    }
  }
}

const smoothMoss = (w: number) => Math.max(0, Math.min(1, (w - 0.35) * 3));

/** A broken column: a few drums, the top one knocked askew, another lying in the grass. */
function column(batch: Batch, inca: IncaMats, at: THREE.Vector3, seed: number): void {
  const drums = 1 + Math.floor(hash2(seed, 1, 1) * 4);
  for (let k = 0; k < drums; k++) {
    const tilt = k === drums - 1 ? (hash2(seed, k, 2) - 0.5) * 0.3 : 0;
    batch.geometry(inca.carved, new THREE.CylinderGeometry(1.1, 1.15, 2, 8), xf(at.x, at.y + 1 + k * 2, at.z, seed + k, tilt, tilt));
  }
  const a = hash2(seed, 3, 3) * Math.PI * 2;
  batch.geometry(inca.carved, new THREE.CylinderGeometry(1.1, 1.1, 2, 8), xf(at.x + Math.cos(a) * 3, at.y + 1, at.z + Math.sin(a) * 3, a, 0, Math.PI / 2));
}

/** A colossal stone head half sunk in the ground, gold eyes catching the light. */
function head(batch: Batch, mats: Materials, inca: IncaMats, at: THREE.Vector3, yaw: number, size: number): void {
  const m = xf(at.x, at.y - size * 0.6, at.z, yaw, 0.12, 0.05, size);
  batch.geometry(inca.stone, new THREE.BoxGeometry(3, 3.6, 2.8), m.clone().multiply(xf(0, 1.8, 0)), [0.85, 0.9, 0.8]);
  batch.geometry(inca.stone, new THREE.BoxGeometry(3.4, 0.9, 3), m.clone().multiply(xf(0, 3.5, 0)), [0.8, 0.85, 0.75]);
  batch.geometry(inca.stone, new THREE.BoxGeometry(0.8, 1.4, 0.8), m.clone().multiply(xf(0, 1.9, 1.6)));
  for (const e of [-1, 1]) {
    batch.geometry(inca.gold, new THREE.BoxGeometry(0.8, 0.35, 0.2), m.clone().multiply(xf(e * 0.8, 2.6, 1.42)));
    batch.geometry(inca.stone, new THREE.BoxGeometry(0.5, 1.6, 1.2), m.clone().multiply(xf(e * 1.7, 2, 0)));
  }
  batch.geometry(mats.plastic, new THREE.BoxGeometry(1.6, 0.3, 0.2), m.clone().multiply(xf(0, 0.9, 1.42)), [0.15, 0.12, 0.1]);
}

/** Vines hanging down the pyramid's tier walls. */
function drapes(batch: Batch, inca: IncaMats): void {
  const tiers = [34, 30, 26, 22, 18, 14];
  tiers.forEach((r, k) => {
    for (let i = 0; i < 14; i++) {
      if (hash2(i, k, 9) < 0.45) continue;
      const side = i % 4;
      const along = (hash2(i, k, 10) - 0.5) * 2 * (r - 4);
      const out = r - 0.1;
      const [x, z, yaw] = side === 0 ? [along, -out, 0] : side === 1 ? [out, along, Math.PI / 2] : side === 2 ? [along, out, Math.PI] : [-out, along, -Math.PI / 2];
      const len = 2 + hash2(i, k, 11) * 3;
      const top = (k + 1) * 3.3;
      batch.geometry(inca.vine, new THREE.PlaneGeometry(1.1, len), xf(PYRAMID.x + x, top - len / 2, PYRAMID.z + z, yaw));
    }
  });
}

export function buildPlaza(batch: Batch, mats: Materials, inca: IncaMats, index: TrackIndex, terrain: Terrain): void {
  paving(batch, inca, index, terrain);
  drapes(batch, inca);
  const columns: [number, number][] = [
    [-52, -40], [-52, 40], [-40, 52], [46, -46], [52, 40], [-62, 6], [60, 4], [10, 54],
  ];
  columns.forEach(([dx, dz], k) => {
    const x = PYRAMID.x + dx;
    const z = PYRAMID.z + dz;
    const near = index.nearest(x, z, 12);
    if (near && near.d < limitOf(near.sample) + 3) return;
    column(batch, inca, v3(x, terrain.height(x, z), z), k + 3);
  });
  for (const [dx, dz, yaw, size] of [[-46, -30, 0.9, 1.4], [44, -18, -1.2, 1.2], [-40, 16, 1.8, 1]] as const) {
    const x = PYRAMID.x + dx;
    const z = PYRAMID.z + dz;
    const near = index.nearest(x, z, 14);
    if (near && near.d < limitOf(near.sample) + 4) continue;
    head(batch, mats, inca, v3(x, terrain.height(x, z), z), yaw, size);
  }
  for (let k = 0; k < 10; k++) {
    const a = hash2(k, 1, 12) * Math.PI * 2;
    const r = 40 + hash2(k, 2, 12) * 20;
    const x = PYRAMID.x + Math.cos(a) * r;
    const z = PYRAMID.z + Math.sin(a) * r;
    const near = index.nearest(x, z, 12);
    if (near && near.d < limitOf(near.sample) + 3) continue;
    batch.geometry(inca.stone, boulder(k + 60, 2 + hash2(k, 3, 12) * 2, 0.6), xf(x, terrain.height(x, z) + 0.4, z, a));
  }
}
