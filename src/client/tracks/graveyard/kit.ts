import * as THREE from 'three';
import { limitOf } from '../../../shared/track';
import { ball, Batch, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { addPointLight, type PointLight } from '../../render/ps1';
import { cache } from '../../render/textures';
import type { Terrain } from '../../render/terrain';
import type { TrackIndex } from '../../render/trackindex';
import type { GraveMats } from './textures';

/** A light that wavers: candles and lanterns flicker, ghost light pulses slowly. */
export interface Flicker {
  light: PointLight;
  base: THREE.Color;
  seed: number;
  rate: number;
  depth: number;
}

/** Everything a prop builder needs: where to put triangles, the materials, the ground and the lights so far. */
export class Kit {
  readonly lights: Flicker[] = [];
  readonly flames: THREE.Vector3[] = [];

  constructor(
    readonly batch: Batch,
    readonly mats: Materials,
    readonly g: GraveMats,
    readonly terrain: Terrain,
    readonly index: TrackIndex,
    readonly rng: () => number,
  ) {}

  ground(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x, this.terrain.height(x, z), z);
  }

  /** True when a point is at least `margin` outside every road's barrier. */
  clear(x: number, z: number, margin: number): boolean {
    const near = this.index.nearest(x, z, 40);
    return !near || near.d > limitOf(near.sample) + margin;
  }

  light(at: THREE.Vector3, color: THREE.Color, range: number, rate = 9, depth = 0.3): PointLight {
    const light = addPointLight(at, color, range);
    this.lights.push({ light, base: color.clone(), seed: this.lights.length * 13.7, rate, depth });
    return light;
  }
}

const WARM = new THREE.Color(1.0, 0.62, 0.3);
const PUMPKIN = new THREE.Color(1.0, 0.45, 0.12);

const geo = {
  halfDisc: cache(() => {
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, false, 0, Math.PI);
    g.rotateX(Math.PI / 2);
    g.rotateZ(Math.PI / 2);
    return g;
  }),
  cube: cache(() => new THREE.BoxGeometry(1, 1, 1)),
  spike: cache(() => new THREE.ConeGeometry(1, 1, 4, 1, true)),
  pyramid: cache(() => new THREE.ConeGeometry(0.71, 1, 4)),
  prism: cache(() => {
    // A triangular prism along z, apex up, 1 wide and 1 tall at the base.
    const g = new THREE.CylinderGeometry(0.577, 0.577, 1, 3);
    g.rotateX(Math.PI / 2);
    g.rotateZ(Math.PI);
    g.scale(1, 1 / 0.866, 1);
    g.translate(0, 1 / 3, 0);
    return g;
  }),
  column: cache(() => new THREE.CylinderGeometry(1, 1, 1, 8)),
  log: cache(() => new THREE.CylinderGeometry(1, 1, 1, 5, 1, true)),
  pumpkin: cache(() => ball(1, 1, 0.72, 1, 8)),
  mound: cache(() => new THREE.ConeGeometry(1, 1, 4, 1, true)),
  skull: cache(() => ball(1, 1, 1.05, 1.15, 6)),
};

/** A box whose texture repeats every `unit` metres on every face, for walls and big stonework. */
export function slab(batch: Batch, mat: THREE.Material, m: THREE.Matrix4, w: number, h: number, d: number, unit: number, color?: RGB): void {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * dims[f][0]) / unit, (uv.getY(i) * dims[f][1]) / unit);
  }
  batch.geometry(mat, g, m, color);
  g.dispose();
}

/**
 * A flat panel from corner `a` along `u` and up `v`, cut into cells so point lights catch it. Texture coordinates come
 * from `uv`, given the panel's own metres across and up.
 */
export function panel(batch: Batch, mat: THREE.Material, a: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, cell: number, uv: (x: number, y: number) => [number, number], color?: RGB): void {
  const lu = u.length();
  const lv = v.length();
  const nu = Math.max(1, Math.round(lu / cell));
  const nv = Math.max(1, Math.round(lv / cell));
  const n = new THREE.Vector3().crossVectors(u, v).normalize();
  const at = (i: number, j: number) => a.clone().addScaledVector(u, i / nu).addScaledVector(v, j / nv);
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      for (const [ii, jj] of [[i, j], [i + 1, j], [i, j + 1], [i, j + 1], [i + 1, j], [i + 1, j + 1]]) {
        const [tu, tv] = uv((ii / nu) * lu, (jj / nv) * lv);
        batch.vertex(mat, at(ii, jj), n, tu, tv, color);
      }
    }
  }
}

export function cube(batch: Batch, mat: THREE.Material, m: THREE.Matrix4, w: number, h: number, d: number, color?: RGB): void {
  batch.geometry(mat, geo.cube(), m.clone().multiply(new THREE.Matrix4().makeScale(w, h, d)), color);
}

/** A tapered log from a to b, for branches and roots. */
export function limb(batch: Batch, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, color?: RGB, sides = 5): void {
  const d = b.clone().sub(a);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
  batch.geometry(mat, g, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), color);
  g.dispose();
}

export type StoneKind = 'round' | 'cross' | 'obelisk' | 'gable' | 'tablet';
const KINDS: StoneKind[] = ['round', 'round', 'round', 'cross', 'gable', 'gable', 'tablet', 'obelisk'];

/** A headstone at `at`, its face turned to `yaw`, leaning a little, with a sunken grave in front of some. */
export function headstone(kit: Kit, at: THREE.Vector3, yaw: number, size = 1, kind?: StoneKind): void {
  const { batch, g, rng } = kit;
  const k = kind ?? KINDS[Math.floor(rng() * KINDS.length)];
  const tone = 0.75 + rng() * 0.35;
  const color: RGB = [tone * (0.95 + rng() * 0.08), tone, tone * (1 + rng() * 0.1)];
  const m = xf(at.x, at.y - 0.15, at.z, yaw, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.35).multiply(new THREE.Matrix4().makeScale(size, size, size));
  const part = (geom: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) =>
    batch.geometry(g.stone, geom, m.clone().multiply(xf(x, y, z, ry, 0, 0, sx, sy, sz)), color);
  if (k === 'round') {
    const w = 0.9 + rng() * 0.5;
    const h = 1.1 + rng() * 0.7;
    part(geo.cube(), 0, (h - w / 2) / 2, 0, w, h - w / 2, 0.24);
    part(geo.halfDisc(), 0, h - w / 2, 0, w, w, 0.24);
  } else if (k === 'cross') {
    const h = 1.6 + rng() * 0.8;
    part(geo.cube(), 0, 0.15, 0, 0.7, 0.3, 0.55);
    part(geo.cube(), 0, h / 2, 0, 0.22, h, 0.2);
    part(geo.cube(), 0, h * 0.72, 0, 0.9, 0.2, 0.2);
  } else if (k === 'gable') {
    const w = 1.0 + rng() * 0.4;
    const h = 1.0 + rng() * 0.6;
    part(geo.cube(), 0, h / 2, 0, w, h, 0.3);
    part(geo.prism(), 0, h, 0, w * 1.1, 0.45, 0.34);
  } else if (k === 'tablet') {
    part(geo.cube(), 0, 0.15, 1.2, 1.2, 0.3, 2.3);
    part(geo.cube(), 0, 0.55, 0, 1.1, 1.1, 0.25);
  } else {
    const h = 2.6 + rng() * 1.4;
    part(geo.cube(), 0, 0.3, 0, 1.0, 0.6, 1.0);
    batch.geometry(g.stone, new THREE.CylinderGeometry(0.18, 0.34, h, 4), m.clone().multiply(xf(0, 0.6 + h / 2, 0, Math.PI / 4)), color);
    part(geo.pyramid(), 0, 0.6 + h + 0.15, 0, 0.36, 0.3, 0.36, Math.PI / 4);
  }
  if (k !== 'tablet' && k !== 'obelisk' && rng() < 0.45) {
    const mound = xf(at.x, at.y - 0.05, at.z, yaw).multiply(xf(0, 0, 1.25 * size));
    batch.geometry(g.soil, geo.mound(), mound.multiply(new THREE.Matrix4().makeScale(0.6 * size, 0.3, 1.1 * size)), [0.85, 0.85, 0.9]);
  }
}

/** A bare, twisted dead tree. */
export function deadTree(kit: Kit, base: THREE.Vector3, height: number, depth = 3, seed = kit.rng()): void {
  const rng = mulberry(seed);
  const { batch, g } = kit;
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, level: number) => {
    const bend = dir.clone().add(new THREE.Vector3((rng() - 0.5) * 0.5, (rng() - 0.3) * 0.25, (rng() - 0.5) * 0.5)).normalize();
    const mid = from.clone().addScaledVector(bend, len * 0.5);
    const to = mid.clone().addScaledVector(bend.clone().add(new THREE.Vector3((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6)).normalize(), len * 0.5);
    if (level === 0) {
      limb(batch, g.bark, from, to, r, r * 0.3, undefined, 3);
      return;
    }
    limb(batch, g.bark, from, mid, r, r * 0.85);
    limb(batch, g.bark, mid, to, r * 0.85, r * 0.62);
    const n = level >= 2 ? 3 : 2;
    const spin = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const d = to.clone().sub(mid).normalize().multiplyScalar(0.9).addScaledVector(out, 0.75 + rng() * 0.5);
      d.y = Math.max(d.y, -0.1) + (level === 1 ? (rng() - 0.6) * 0.6 : 0.2);
      grow(to, d.normalize(), len * (0.6 + rng() * 0.15), r * 0.6, level - 1);
    }
  };
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng();
    const foot = base.clone().add(new THREE.Vector3(Math.cos(a) * height * 0.09, -0.2, Math.sin(a) * height * 0.09));
    limb(batch, g.bark, base.clone().setY(base.y + height * 0.06), foot, height * 0.04, height * 0.012);
  }
  grow(base.clone().setY(base.y - 0.3), new THREE.Vector3((rng() - 0.5) * 0.25, 1, (rng() - 0.5) * 0.25).normalize(), height * 0.42, height * 0.05, depth);
}

/** An iron lamp post with a glowing lantern and a warm pool of light. */
export function lampPost(kit: Kit, at: THREE.Vector3, yaw: number, height = 3.6): void {
  const { batch, g, mats } = kit;
  const m = xf(at.x, at.y, at.z, yaw);
  cube(batch, g.stone, m.clone().multiply(xf(0, 0.2, 0)), 0.6, 0.4, 0.6);
  batch.box(g.iron, 0.14, height, 0.14, m.clone().multiply(xf(0, height / 2, 0)));
  batch.box(g.iron, 0.7, 0.1, 0.1, m.clone().multiply(xf(0.3, height - 0.1, 0)));
  const lamp = m.clone().multiply(xf(0.6, height - 0.75, 0));
  cube(batch, mats.lantern, lamp, 0.42, 0.6, 0.42);
  batch.geometry(g.iron, geo.pyramid(), lamp.clone().multiply(xf(0, 0.45, 0, Math.PI / 4, 0, 0, 0.5, 0.3, 0.5)));
  const p = new THREE.Vector3(0.6, height - 0.9, 0).applyMatrix4(m);
  kit.light(p, WARM.clone().multiplyScalar(1.2), 13, 7, 0.18);
}

/** A few candles on a ledge, with a flickering light if asked. */
export function candles(kit: Kit, at: THREE.Vector3, yaw: number, count: number, lit: boolean, color = WARM): void {
  const { batch, g, mats, rng } = kit;
  for (let i = 0; i < count; i++) {
    const ox = (rng() - 0.5) * 0.9;
    const oz = (rng() - 0.5) * 0.5;
    const h = 0.3 + rng() * 0.5;
    const m = xf(at.x, at.y, at.z, yaw).multiply(xf(ox, h / 2, oz));
    batch.geometry(g.wax, geo.column(), m.clone().multiply(new THREE.Matrix4().makeScale(0.07, h, 0.07)));
    const tip = new THREE.Vector3(0, h / 2 + 0.14, 0).applyMatrix4(m);
    for (const turn of [0, Math.PI / 2]) batch.geometry(mats.flame, new THREE.PlaneGeometry(0.18, 0.3), xf(tip.x, tip.y, tip.z, yaw + turn));
  }
  if (lit) kit.light(at.clone().setY(at.y + 0.9), color.clone().multiplyScalar(1.15), 10, 11, 0.35);
}

/** A carved pumpkin facing `yaw`, glowing from inside. */
export function jackOLantern(kit: Kit, at: THREE.Vector3, yaw: number, size: number, lit: boolean): void {
  const { batch, g } = kit;
  const m = xf(at.x, at.y + 0.7 * size * 0.72, at.z, yaw, 0, 0, size);
  batch.geometry(g.pumpkin, geo.pumpkin(), m.clone().multiply(xf(0, 0, 0, 0, 0, 0, 0.7)));
  batch.geometry(g.bark, geo.column(), m.clone().multiply(xf(0, 0.56, 0, 0, 0.3, 0, 0.07, 0.25, 0.07)), [0.6, 0.8, 0.5]);
  batch.geometry(g.face, new THREE.PlaneGeometry(0.95, 0.9), m.clone().multiply(xf(0, -0.02, 0.64, 0, -0.08)));
  if (lit) kit.light(new THREE.Vector3(0, 0.3, 1.2).applyMatrix4(m), PUMPKIN.clone().multiplyScalar(1.3), 9 * size, 10, 0.3);
}

/** A coffin, lid on or off. Lying flat along its local z. */
export function coffin(kit: Kit, m: THREE.Matrix4, open: boolean, mat = kit.g.coffin): void {
  const { batch, g } = kit;
  // Six-sided outline: wide at the shoulders, narrow at head and feet.
  const shape = new THREE.Shape([
    new THREE.Vector2(-0.35, -1.1),
    new THREE.Vector2(0.35, -1.1),
    new THREE.Vector2(0.55, 0.45),
    new THREE.Vector2(0.38, 1.1),
    new THREE.Vector2(-0.38, 1.1),
    new THREE.Vector2(-0.55, 0.45),
  ]);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false });
  body.rotateX(-Math.PI / 2);
  batch.geometry(mat, body, m);
  if (open) {
    const lining = new THREE.ShapeGeometry(shape);
    lining.rotateX(-Math.PI / 2);
    batch.geometry(g.satin, lining, m.clone().multiply(xf(0, 0.5, 0, 0, 0, 0, 0.85, 1, 0.9)));
    const lid = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
    lid.rotateX(-Math.PI / 2);
    batch.geometry(mat, lid, m.clone().multiply(xf(0.75, 0.3, 0.1, 0.25, 0, 1.2)));
    lid.dispose();
    lining.dispose();
  } else {
    const lid = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    lid.rotateX(-Math.PI / 2);
    batch.geometry(mat, lid, m.clone().multiply(xf(0, 0.55, 0, 0, 0, 0, 1.06, 1, 1.04)), [0.85, 0.8, 0.8]);
    lid.dispose();
  }
  body.dispose();
}

export function skull(kit: Pick<Kit, 'batch' | 'g'>, m: THREE.Matrix4, size = 0.3, mat = kit.g.bone): void {
  const { batch, g } = kit;
  batch.geometry(mat, geo.skull(), m.clone().multiply(new THREE.Matrix4().makeScale(size, size, size)));
  for (const side of [-1, 1]) {
    batch.geometry(g.iron, geo.cube(), m.clone().multiply(xf(side * size * 0.42, size * 0.12, size * 0.98, 0, 0, 0, size * 0.42, size * 0.42, size * 0.2)));
  }
  batch.geometry(mat, geo.cube(), m.clone().multiply(xf(0, -size * 0.75, size * 0.45, 0, 0, 0, size * 0.75, size * 0.35, size * 0.6)));
}

/** A stone column with a base and a capital. */
export function column(kit: Kit, mat: THREE.Material, at: THREE.Vector3, height: number, r: number, color?: RGB): void {
  const { batch } = kit;
  batch.geometry(mat, geo.cube(), xf(at.x, at.y + 0.25, at.z, 0, 0, 0, r * 2.6, 0.5, r * 2.6), color);
  batch.geometry(mat, geo.column(), xf(at.x, at.y + height / 2, at.z, 0, 0, 0, r, height, r), color);
  batch.geometry(mat, geo.cube(), xf(at.x, at.y + height - 0.25, at.z, 0, 0, 0, r * 2.6, 0.5, r * 2.6), color);
}

/** An iron spear railing post, with a spike on top. */
export function spearPost(batch: Batch, mat: THREE.Material, base: THREE.Vector3, height: number, yaw: number): void {
  batch.box(mat, 0.09, height, 0.09, xf(base.x, base.y + height / 2, base.z, yaw));
  batch.geometry(mat, geo.spike(), xf(base.x, base.y + height + 0.12, base.z, yaw + Math.PI / 4, 0, 0, 0.1, 0.3, 0.1));
}

export function prism(batch: Batch, mat: THREE.Material, m: THREE.Matrix4, w: number, h: number, d: number, color?: RGB): void {
  batch.geometry(mat, geo.prism(), m.clone().multiply(new THREE.Matrix4().makeScale(w, h, d)), color);
}

export function pyramid(batch: Batch, mat: THREE.Material, m: THREE.Matrix4, w: number, h: number, color?: RGB): void {
  batch.geometry(mat, geo.pyramid(), m.clone().multiply(xf(0, h / 2, 0, Math.PI / 4, 0, 0, w, h, w)), color);
}

/** A stone angel on a plinth, wings half open, head bowed. */
export function angel(kit: Kit, at: THREE.Vector3, yaw: number, size = 1): void {
  const { batch, g } = kit;
  const m = xf(at.x, at.y, at.z, yaw, 0, 0, size);
  const tone: RGB = [0.85, 0.88, 0.95];
  cube(batch, g.stone, m.clone().multiply(xf(0, 0.6, 0)), 1.6, 1.2, 1.6, tone);
  batch.geometry(g.stone, new THREE.CylinderGeometry(0.35, 0.75, 2.4, 6), m.clone().multiply(xf(0, 2.4, 0)), tone);
  batch.geometry(g.stone, geo.skull(), m.clone().multiply(xf(0, 3.85, 0.12, 0, 0.35, 0, 0.32, 0.36, 0.32)), tone);
  for (const side of [-1, 1]) {
    const wing = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.5, 1.0), new THREE.Vector2(1.2, -0.4), new THREE.Vector2(0.9, -1.6), new THREE.Vector2(0.2, -1.0)]);
    const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.1, bevelEnabled: false });
    batch.geometry(g.stone, wg, m.clone().multiply(xf(side * 0.25, 3.4, -0.3, side * 0.5 + (side < 0 ? Math.PI : 0), 0, 0)), tone);
    wg.dispose();
    batch.geometry(g.stone, geo.cube(), m.clone().multiply(xf(side * 0.3, 2.9, 0.35, 0, -0.9, side * 0.4, 0.18, 0.9, 0.18)), tone);
  }
}

/** A small mausoleum: a stone house with columns, a pediment and an iron door, facing `yaw`. */
export function mausoleum(kit: Kit, at: THREE.Vector3, yaw: number, w: number, d: number, h: number, lit: boolean): void {
  const { batch, g } = kit;
  const m = xf(at.x, at.y, at.z, yaw);
  cube(batch, g.flags, m.clone().multiply(xf(0, 0.25, 0.4)), w + 1.2, 0.5, d + 1.8);
  cube(batch, g.blocks, m.clone().multiply(xf(0, 0.5 + h / 2, 0)), w, h, d);
  cube(batch, g.stone, m.clone().multiply(xf(0, 0.5 + h + 0.25, 0.1)), w + 0.5, 0.5, d + 0.8);
  prism(batch, g.stone, m.clone().multiply(xf(0, 0.5 + h + 0.5, 0.1)), w + 0.5, w * 0.35, d + 0.8);
  for (const side of [-1, 1]) {
    const c = new THREE.Vector3(side * (w / 2 - 0.3), 0.5, d / 2 + 0.55).applyMatrix4(m);
    column(kit, g.stone, c, h, 0.22);
  }
  cube(batch, g.iron, m.clone().multiply(xf(0, 0.5 + h * 0.4, d / 2 + 0.02)), w * 0.42, h * 0.8, 0.1);
  for (let k = -2; k <= 2; k++) batch.box(g.iron, 0.06, h * 0.8, 0.08, m.clone().multiply(xf(k * w * 0.08, 0.5 + h * 0.4, d / 2 + 0.1)));
  const cross = m.clone().multiply(xf(0, 0.5 + h + 0.5 + w * 0.35, d / 2 + 0.3));
  cube(batch, g.stone, cross.clone().multiply(xf(0, 0.6, 0)), 0.18, 1.2, 0.18);
  cube(batch, g.stone, cross.clone().multiply(xf(0, 0.8, 0)), 0.6, 0.16, 0.18);
  if (lit) {
    const lamp = new THREE.Vector3(w / 2 - 0.3, 0.5 + h * 0.75, d / 2 + 1.0).applyMatrix4(m);
    cube(batch, kit.mats.lantern, xf(lamp.x, lamp.y, lamp.z, yaw), 0.36, 0.5, 0.36);
    kit.light(lamp, WARM.clone(), 9, 8, 0.25);
  }
}

/** A seeded random stream, so one tree always grows the same way. */
function mulberry(seed: number): () => number {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { WARM, PUMPKIN };
