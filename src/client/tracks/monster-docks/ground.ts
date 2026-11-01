import * as THREE from 'three';
import { Batch, type RGB } from '../../render/geometry';
import { hash2, smoothstep, valueNoise } from '../../render/noise';
import type { GroundSpec, Terrain } from '../../render/terrain';
import type { Looks } from './look';

/** The quay edge along the harbour, and the flooded dry dock cut into it where the liner lies. */
export const QUAY_EDGE = -252;
export const DOCK = { x0: -40, x1: 50, z0: QUAY_EDGE, z1: -212 };
export const LAND = 2;
const FLOOR = -7;

/** How far into the land a point is, in metres: negative over water. */
export function landDepth(x: number, z: number): number {
  const harbour = z - QUAY_EDGE;
  const dock = Math.max(DOCK.x0 - x, x - DOCK.x1, z - DOCK.z1);
  return Math.min(harbour, Math.max(dock, -harbour));
}

export function naturalHeight(x: number, z: number): number {
  const d = landDepth(x, z);
  return d > 0 ? LAND : FLOOR + smoothstep(-30, 0, d) * 2;
}

export function docksGround(looks: Looks): GroundSpec {
  return {
    x0: -340,
    x1: 240,
    z0: -480,
    z1: 180,
    cell: 5,
    height: naturalHeight,
    paint: () => looks.concrete,
    cliffs: [looks.concrete],
    headwall: looks.concrete,
    blend: 6,
    tint: (x, z, h): RGB => {
      if (h < LAND - 0.6) {
        const wet = smoothstep(LAND - 0.6, 0, h);
        return [0.62 - wet * 0.3, 0.6 - wet * 0.28, 0.58 - wet * 0.22];
      }
      const v = 0.9 + valueNoise(x / 23, z / 23, 3) * 0.16;
      return [v * 0.98, v * 0.95, v * 0.92];
    },
  };
}

/** The harbour: dark water that brightens towards the far, sunset-lit sea, with a glow off the burning city. */
export function harbourWater(looks: Looks, terrain: Terrain): THREE.Mesh {
  const size = 1900;
  const g = new THREE.PlaneGeometry(size, size, 110, 110);
  g.rotateX(-Math.PI / 2);
  g.translate(-60, 0, -150);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  const near = new THREE.Color(0.1, 0.12, 0.22);
  const far = new THREE.Color(0.62, 0.36, 0.34);
  const shallow = new THREE.Color(0.18, 0.24, 0.26);
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, uv.getX(i) * (size / 18), uv.getY(i) * (size / 18));
    const d = Math.hypot(x + 50, z + 120);
    const c = near.clone().lerp(far, smoothstep(180, 700, d) * 0.85);
    const depth = -terrain.height(x, z);
    if (depth < 3) c.lerp(shallow, 0.5 * (1 - Math.max(0, depth) / 3));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(g, looks.water);
  mesh.renderOrder = 1;
  return mesh;
}

/** One building: four walls and a roof, with windows the right size whatever the box. */
function building(batch: Batch, looks: Looks, x: number, z: number, w: number, d: number, h: number, yaw: number, tone: RGB): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const at = (lx: number, y: number, lz: number) => new THREE.Vector3(x + lx * c + lz * s, y, z - lx * s + lz * c);
  const corners: [number, number][] = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  let run = 0;
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = new THREE.Vector3(bz - az, 0, -(bx - ax)).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const quad: [number, number, number, number, number][] = [
      [ax, -4, az, run, -4],
      [bx, -4, bz, run + len, -4],
      [ax, h, az, run, h],
      [bx, -4, bz, run + len, -4],
      [bx, h, bz, run + len, h],
      [ax, h, az, run, h],
    ];
    for (const [lx, y, lz, u, v] of quad) batch.vertex(looks.skyline, at(lx, y, lz), n, u / 44, v / 44, tone);
    run += len;
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const [lx, lz] of [corners[0], corners[2], corners[1], corners[0], corners[3], corners[2]]) {
    batch.vertex(looks.skyline, at(lx, h, lz), up, 0, 0, [tone[0] * 0.3, tone[1] * 0.3, tone[2] * 0.3]);
  }
}

export interface Skyline {
  /** Tops of burning buildings, for flames and smoke. */
  fires: THREE.Vector3[];
  /** Where the searchlights stand. */
  lights: THREE.Vector3[];
  /** Blinking red lights on the masts. */
  beacons: THREE.Vector3[];
}

/** The city round the harbour: towers across the water to the north, lower blocks all round, some of them burning. */
export function skyline(batch: Batch, looks: Looks): Skyline {
  const fires: THREE.Vector3[] = [];
  const lights: THREE.Vector3[] = [];
  const beacons: THREE.Vector3[] = [];
  const n = 92;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash2(i, 1, 61) * 0.03;
    const north = Math.max(0, -Math.sin(a));
    const r = 600 + hash2(i, 2, 61) * 170;
    const x = -50 + Math.cos(a) * r;
    const z = -150 + Math.sin(a) * r * 1.05;
    const tall = 16 + hash2(i, 3, 61) ** 2 * 46 + north * north * (22 + hash2(i, 4, 61) * 60);
    const w = 24 + hash2(i, 5, 61) * 22;
    const d = 22 + hash2(i, 6, 61) * 18;
    const tone: RGB = [0.85 + hash2(i, 7, 61) * 0.3, 0.8 + hash2(i, 8, 61) * 0.25, 0.9 + hash2(i, 9, 61) * 0.3];
    const yaw = a + Math.PI / 2;
    building(batch, looks, x, z, w, d, tall, yaw, tone);
    if (tall > 50 && hash2(i, 10, 61) < 0.6) {
      building(batch, looks, x, z, w * 0.6, d * 0.6, tall + 14 + hash2(i, 11, 61) * 18, yaw, tone);
      if (hash2(i, 12, 61) < 0.5) {
        const top = tall + 32 + hash2(i, 11, 61) * 18;
        batch.beam(looks.plate, new THREE.Vector3(x, top - 18, z), new THREE.Vector3(x, top + 16, z), 1.2, 1.2, [0.2, 0.2, 0.24]);
        beacons.push(new THREE.Vector3(x, top + 17, z));
      }
    }
    if (hash2(i, 13, 61) < 0.2) fires.push(new THREE.Vector3(x, tall, z));
    if (i % 13 === 4) lights.push(new THREE.Vector3(x, tall + 2, z));
  }
  return { fires, lights, beacons };
}

/** Searchlight beams sweeping the dusk sky: thin crossed quads in one mesh, re-aimed each frame. */
export function searchlights(looks: Looks, bases: THREE.Vector3[]): { mesh: THREE.Mesh; update(time: number): void } {
  const count = bases.length;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 12 * 3);
  const uv: number[] = [];
  const col: number[] = [];
  for (let i = 0; i < count; i++) {
    for (let q = 0; q < 2; q++) {
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 0], [1, 1], [0, 1]]) {
        uv.push(u, v);
        const warm = i % 3 === 0;
        col.push(warm ? 0.55 : 0.4, warm ? 0.48 : 0.45, warm ? 0.38 : 0.55);
      }
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(count * 12 * 3).fill(0).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  const mesh = new THREE.Mesh(g, looks.beam);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const length = 520;
  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  return {
    mesh,
    update(time) {
      for (let i = 0; i < count; i++) {
        const b = bases[i];
        const yaw = Math.sin(time * (0.13 + (i % 4) * 0.035) + i * 1.7) * 0.9 + i * 0.8;
        const tilt = 0.55 + 0.3 * Math.sin(time * 0.21 + i * 2.3);
        dir.set(Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt));
        side.set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(1);
        up.crossVectors(dir, side).normalize();
        for (let q = 0; q < 2; q++) {
          const across = q ? up : side;
          const corners = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 0],
            [1, 1],
            [0, 1],
          ];
          corners.forEach(([u, v], k) => {
            const w = (u - 0.5) * (2 + v * 34);
            const o = ((i * 2 + q) * 6 + k) * 3;
            pos[o] = b.x + dir.x * v * length + across.x * w;
            pos[o + 1] = b.y + dir.y * v * length + across.y * w;
            pos[o + 2] = b.z + dir.z * v * length + across.z * w;
          });
        }
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}
