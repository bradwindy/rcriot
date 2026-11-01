import * as THREE from 'three';
import { Batch, ball, boulder, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { addPointLight, type PointLight } from '../../render/ps1';
import { box } from '../../render/road';
import { lamp, type Looks } from './look';

/** Shipping container colours, faded by the salt air. */
export const PAINT: RGB[] = [
  [0.78, 0.22, 0.16],
  [0.2, 0.36, 0.62],
  [0.24, 0.52, 0.34],
  [0.86, 0.5, 0.16],
  [0.2, 0.55, 0.6],
  [0.85, 0.75, 0.25],
  [0.55, 0.55, 0.58],
  [0.5, 0.24, 0.42],
];

export const SODIUM = new THREE.Color(1.0, 0.62, 0.3);

/** A box whose uvs repeat every `unit` along its long faces, so a texture keeps its scale whatever the box size. */
export function slab(w: number, h: number, d: number, unit: number, wrapV = false): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  const sizes: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [a, b] = sizes[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * a) / unit, wrapV ? (uv.getY(i) * b) / unit : uv.getY(i));
    }
  }
  return g;
}

export function container(batch: Batch, looks: Looks, m: THREE.Matrix4, color: RGB, long = true): void {
  const w = long ? 12.2 : 6.1;
  batch.geometry(looks.container, slab(w, 2.6, 2.45, 2.4), m.clone().multiply(xf(0, 1.3, 0, Math.PI / 2)), color);
}

/** Containers stacked `high` deep at a spot, slightly askew, the way the monster left them. */
export function stack(batch: Batch, looks: Looks, at: THREE.Vector3, yaw: number, high: number, seed: number, rng: () => number): void {
  for (let k = 0; k < high; k++) {
    const color = PAINT[(seed + k * 3) % PAINT.length];
    const tilt = (rng() - 0.5) * 0.1;
    container(batch, looks, xf(at.x, at.y + k * 2.6, at.z, yaw + tilt), color, rng() < 0.7);
  }
}

/** A sodium street lamp leaning over the road. */
export function lampPost(batch: Batch, mats: Materials, looks: Looks, base: THREE.Vector3, toward: THREE.Vector3, height = 8, light = true): PointLight | null {
  const yaw = Math.atan2(-(toward.x - base.x), -(toward.z - base.z));
  box(batch, mats.metal, 0.22, height, 0.22, xf(base.x, base.y + height / 2, base.z, yaw), [0.5, 0.5, 0.55]);
  const arm = xf(base.x, base.y + height, base.z, yaw);
  box(batch, mats.metal, 0.16, 0.16, 2.4, arm.clone().multiply(xf(0, 0, -1.1)), [0.5, 0.5, 0.55]);
  batch.geometry(mats.metal, new THREE.BoxGeometry(0.7, 0.25, 1.1), arm.clone().multiply(xf(0, -0.05, -2.3)), [0.35, 0.35, 0.38]);
  batch.geometry(looks.glow, lamp(new THREE.PlaneGeometry(0.6, 0.9), 'sodium'), arm.clone().multiply(xf(0, -0.19, -2.3, 0, -Math.PI / 2)));
  if (!light) return null;
  const glow = new THREE.Vector3(0, -1.5, -2.3).applyMatrix4(arm);
  return addPointLight(glow, SODIUM.clone().multiplyScalar(1.3), 20);
}

/** A rotating amber beacon's housing, lit by the glow atlas. */
export function beacon(batch: Batch, mats: Materials, looks: Looks, at: THREE.Vector3, tile: 'amber' | 'red' = 'amber'): void {
  batch.geometry(mats.plastic, new THREE.CylinderGeometry(0.3, 0.3, 0.15, 8), xf(at.x, at.y, at.z));
  batch.geometry(looks.glow, lamp(new THREE.CylinderGeometry(0.22, 0.26, 0.45, 8), tile), xf(at.x, at.y + 0.3, at.z));
}

/** A studio film light on a stand, aimed at a point: the movie set showing through. */
export function filmLight(batch: Batch, mats: Materials, looks: Looks, at: THREE.Vector3, target: THREE.Vector3, light = true): void {
  const yaw = Math.atan2(-(target.x - at.x), -(target.z - at.z));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = at.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4));
    batch.beam(mats.metal, foot, at.clone().setY(at.y + 3.6), 0.12, 0.12, [0.6, 0.6, 0.65]);
  }
  box(batch, mats.metal, 0.14, 3, 0.14, xf(at.x, at.y + 5, at.z, yaw));
  const pitch = Math.atan2(target.y - at.y - 6.4, Math.hypot(target.x - at.x, target.z - at.z));
  const head = xf(at.x, at.y + 6.4, at.z, yaw, pitch);
  batch.geometry(mats.plastic, new THREE.BoxGeometry(2, 1.6, 1.4), head);
  batch.geometry(mats.lens, new THREE.PlaneGeometry(1.7, 1.3), head.clone().multiply(xf(0, 0, -0.71, Math.PI)));
  for (const side of [-1, 1]) {
    batch.geometry(mats.plastic, new THREE.PlaneGeometry(1, 1.6), head.clone().multiply(xf(side * 1.4, 0, -0.85, side * 0.6)));
  }
  batch.geometry(looks.glow, lamp(new THREE.PlaneGeometry(1.4, 1.0), 'white'), head.clone().multiply(xf(0, 0, -0.72, Math.PI)));
  if (light) addPointLight(at.clone().setY(at.y + 5).lerp(target, 0.4), new THREE.Color(1.0, 0.92, 0.82).multiplyScalar(1.2), 30);
}

/** A column of smoke: rounded puffs growing as they rise and lean on the wind, catching the sunset on one side. */
export function plume(batch: Batch, looks: Looks, at: THREE.Vector3, size: number, puffs = 7): void {
  for (let k = 0; k < puffs; k++) {
    const f = k / (puffs - 1);
    const r = size * (0.75 + f * 1.7);
    const heat = Math.max(0, 1 - k / 2);
    const tone: RGB = [0.5 + heat * 0.6, 0.46 + heat * 0.16, 0.54 - heat * 0.14];
    const g = puffs < 7 ? boulder(Math.round(at.x) + k * 7, r * 2, 0.85) : ball(r, 1, 0.82, 1, 7);
    batch.geometry(looks.smoke, g, xf(at.x + size * 5 * f * f, at.y + size * (1 + k * 1.9), at.z - size * 2.5 * f * f, k * 1.3), tone);
  }
}

/** A big fire: crossed flame sprites and a smoke column, with an orange light. */
export function fire(batch: Batch, mats: Materials, looks: Looks, at: THREE.Vector3, size: number, smoke = true, light = true, puffs = 7): PointLight | null {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const off = new THREE.Vector3(Math.cos(a * 2.3) * size * 0.3, 0, Math.sin(a * 2.3) * size * 0.3);
    const h = size * (1.4 + (k % 2) * 0.5);
    batch.geometry(mats.flame, new THREE.PlaneGeometry(size, h), xf(at.x + off.x, at.y + h / 2 - 0.2, at.z + off.z, a));
  }
  if (smoke) plume(batch, looks, at, size, puffs);
  if (!light) return null;
  return addPointLight(at.clone().setY(at.y + size), new THREE.Color(1.0, 0.45, 0.15).multiplyScalar(1.6), size * 7);
}
