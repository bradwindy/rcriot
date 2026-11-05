import * as THREE from 'three';
import type { Batch, RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { addPointLight, type PointLight } from '../../render/ps1';

/** A flickering fire or torch: its light and how it flickers. */
export interface Fire {
  light: PointLight;
  base: THREE.Color;
  seed: number;
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A flat quad a-b-c-d (counter-clockwise seen from the front), textured in world units: u along a-b, v along a-d,
 * one repeat every `tile` units.
 */
export function quad(batch: Batch, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, tile = 4, color: RGB = [1, 1, 1], u0 = 0, v0 = 0): void {
  const n = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)).normalize();
  const ab = b.clone().sub(a);
  const ad = d.clone().sub(a);
  const au = ab.clone().normalize();
  const av = ad.clone().sub(au.clone().multiplyScalar(ad.dot(au))).normalize();
  const uv = (p: THREE.Vector3): [number, number] => {
    const r = p.clone().sub(a);
    return [u0 + r.dot(au) / tile, v0 + r.dot(av) / tile];
  };
  for (const p of [a, b, c, a, c, d]) batch.vertex(mat, p, n, ...uv(p), color);
}

/** A wall from a to b along the ground, from y0 up to y1, facing to the left of a->b. */
export function wall(batch: Batch, mat: THREE.Material, ax: number, az: number, bx: number, bz: number, y0: number, y1: number, tile = 4, color?: RGB): void {
  quad(batch, mat, v3(bx, y0, bz), v3(ax, y0, az), v3(ax, y1, az), v3(bx, y1, bz), tile, color);
}

/** A flame: two crossed cut-out planes, with a warm light that flickers. */
export function flame(batch: Batch, mats: Materials, at: THREE.Vector3, size: number, fires: Fire[] | null, range = 16, power = 1.4): void {
  for (const turn of [0, Math.PI / 2, Math.PI / 4]) {
    const g = new THREE.PlaneGeometry(size * 0.65, size);
    g.rotateY(turn);
    g.translate(at.x, at.y + size * 0.4, at.z);
    batch.geometry(mats.flame, g);
  }
  if (fires) {
    const base = new THREE.Color(1.0, 0.56, 0.22).multiplyScalar(power);
    fires.push({ light: addPointLight(at.clone().setY(at.y + size * 0.6), base, range), base, seed: fires.length * 13.7 });
  }
}

/** Crossed cut-out cards standing on the ground, for ferns, bushes and grass. */
export function cards(batch: Batch, mat: THREE.Material, at: THREE.Vector3, w: number, h: number, turn: number, count = 2, color?: RGB): void {
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateY(turn + (i * Math.PI) / count);
    g.translate(at.x, at.y, at.z);
    batch.geometry(mat, g, undefined, color);
  }
}
