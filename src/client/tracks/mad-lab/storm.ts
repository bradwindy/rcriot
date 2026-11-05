import * as THREE from 'three';
import type { RGB } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { dynamicLight } from '../../render/ps1';
import type { Sparks } from './fx';
import type { MadMats } from './materials';
import { roofedAt } from './plan';

const BOLT: RGB = [0.9, 0.95, 1.4];
const FLASH = new THREE.Color(0.62, 0.7, 1.0);

/** Brightness of a strike `t` seconds in: a white crack, a flicker, a second crack, then a fade. */
function envelope(t: number): number {
  if (t < 0) return 0;
  if (t < 0.07) return 1;
  if (t < 0.15) return 0.25;
  if (t < 0.24) return 0.85;
  return Math.max(0, 0.85 * (1 - (t - 0.24) / 0.5));
}

export interface Storm {
  /** 0 to 1, how bright the sky is right now, for anything else that should flare with it. */
  flash: number;
  /** True while the strike in progress is hitting the tower's coil. */
  onCoil: boolean;
  update(time: number, camera: THREE.Camera): void;
}

/**
 * The storm round the castle: a ring of heavy cloud, rain round the camera, and lightning every few seconds, now and
 * then striking the great coil on the tower. A strike washes the sky, lights the world for a moment and flares the
 * laboratory's windows.
 */
export function storm(group: THREE.Group, m: MadMats, sparks: Sparks, coilTop: THREE.Vector3): Storm {
  const sky = new THREE.Group();
  const clouds = cloudRing(m);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(870, 16, 8), m.flash);
  const domeColors: number[] = [];
  const dp = dome.geometry.getAttribute('position');
  for (let i = 0; i < dp.count; i++) {
    const up = Math.max(0, dp.getY(i) / 870);
    const v = 0.15 + 0.85 * Math.pow(1 - up, 1.5);
    domeColors.push(v, v, v);
  }
  dome.geometry.setAttribute('color', new THREE.Float32BufferAttribute(domeColors, 3));
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  const rain = rainCurtains(m);
  sky.add(clouds, dome);
  group.add(sky, rain);

  let next = 2.5;
  let strike = -10;
  let target = new THREE.Vector3();
  let from = new THREE.Vector3();
  let k = 0;
  const state: Storm = {
    flash: 0,
    onCoil: false,
    update(time, camera) {
      if (time < strike - 1) {
        next = time + 2;
        strike = -10;
      }
      if (time >= next) {
        k++;
        strike = time;
        next = time + 3.5 + hash2(k, 1, 91) * 6;
        state.onCoil = hash2(k, 2, 91) < 0.4;
        if (state.onCoil) target = coilTop.clone();
        else {
          const a = hash2(k, 3, 91) * Math.PI * 2;
          const r = 260 + hash2(k, 4, 91) * 260;
          target = new THREE.Vector3(Math.cos(a) * r, 10 + hash2(k, 5, 91) * 40, Math.sin(a) * r);
        }
        from = target.clone().add(new THREE.Vector3((hash2(k, 6, 91) - 0.5) * 120, 300, (hash2(k, 7, 91) - 0.5) * 120));
      }
      const t = time - strike;
      const f = envelope(t);
      state.flash = f;
      if (t > 0.8) state.onCoil = false;

      const eye = camera.position;
      sky.position.copy(eye);
      clouds.rotation.y = time * 0.006;
      rain.position.copy(eye);
      rain.visible = !roofedAt(eye.x, eye.y, eye.z);

      m.flash.uniforms.uTint.value.copy(FLASH).multiplyScalar(f * 0.55);
      m.cloud.uniforms.uTint.value.setScalar(1 + f * 2.2);
      m.storm.uniforms.uTint.value.setScalar(1 + f * 2.4);
      m.storm.uniforms.uGlow.value = f * 0.9;

      if (f > 0.2) {
        sparks.fork(from, target, 2.4, 40, 16, [BOLT[0] * f, BOLT[1] * f, BOLT[2] * f], k * 11, Math.floor(t * 12), 5);
      }
      if (f > 0) {
        if (!roofedAt(eye.x, eye.y, eye.z)) dynamicLight(eye.x + 30, eye.y + 60, eye.z - 20, FLASH, 1.3 * f, 200);
        if (state.onCoil) dynamicLight(coilTop.x, coilTop.y, coilTop.z, FLASH, 3 * f, 70);
      }
    },
  };
  return state;
}

/** Two rings of torn black cloud low round the valley, one inside the other, for the lightning to light up. */
function cloudRing(m: MadMats): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (const [r, y, h, rep] of [
    [640, 150, 200, 6],
    [520, 210, 160, 5],
  ]) {
    const g = new THREE.CylinderGeometry(r, r * 1.05, h, 32, 1, true);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * rep + r);
    g.translate(0, y, 0);
    const colors: number[] = [];
    for (let i = 0; i < g.getAttribute('position').count; i++) colors.push(0.7, 0.72, 0.85);
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const merged = mergeGeometries(parts);
  const mesh = new THREE.Mesh(merged, m.cloud);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

/** Two cylinders of falling streaks round the camera. */
function rainCurtains(m: MadMats): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  for (const [r, rep, tone] of [
    [7, 5, 0.8],
    [16, 9, 0.55],
    [30, 14, 0.35],
  ]) {
    const g = new THREE.CylinderGeometry(r, r, 34, 12, 1, true);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i) * 2.4 + r * 0.13);
    const colors: number[] = [];
    for (let i = 0; i < g.getAttribute('position').count; i++) colors.push(tone, tone, tone);
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.translate(0, 6, 0);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), m.rain);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'uv', 'color'];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const arrays = parts.map((g) => g.getAttribute(name).array as Float32Array);
    const size = parts[0].getAttribute(name).itemSize;
    const all = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrays) {
      all.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  for (const g of parts) g.dispose();
  return out;
}
