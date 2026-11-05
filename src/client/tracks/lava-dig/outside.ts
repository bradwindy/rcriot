import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { limitOf, sampleAt, zoneRanges, type Track } from '../../../shared/track';
import { CALDERA, SPOTS } from '../../../shared/tracks/lava-dig';
import { boulder, xf, type Batch, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import { ps1Material } from '../../render/ps1';
import { frame, headingAt } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import { cache, tex } from '../../render/textures';
import { lavafall } from './caves';
import { workLamp } from './chamber';
import { FLOW, fromCrater, onFlow } from './ground';
import { block, put } from './kit';
import type { LavaMats } from './materials';
import { along, Lights, LAMP_LIGHT, LAVA_LIGHT } from './util';

const lampMats = cache(() => ({
  red: ps1Material({ map: tex.white(), tint: 0xff3020, lit: false, glow: 1.2 }),
  green: ps1Material({ map: tex.white(), tint: 0x40ff60, lit: false, glow: 1.2 }),
  off: ps1Material({ map: tex.white(), tint: 0x301010, lit: false }),
}));

/** A palm, scorched on the side facing the volcano: the jungle at the edge of the ash. */
function palm(batch: Batch, mats: Materials, base: THREE.Vector3, rng: () => number, burnt: boolean): void {
  const height = 9 + rng() * 5;
  const lean = rng() * Math.PI * 2;
  const bend = 1.5 + rng() * 3;
  const dir = new THREE.Vector3(Math.cos(lean), 0, Math.sin(lean));
  const rings = 6;
  const sides = 5;
  const centre = (t: number) => base.clone().addScaledVector(dir, bend * t * t).setY(base.y + height * t);
  const bark: RGB = burnt ? [0.35, 0.3, 0.28] : [1, 1, 1];
  for (let j = 0; j < rings; j++) {
    for (let k = 0; k < sides; k++) {
      const at = (jj: number, kk: number) => {
        const t = jj / rings;
        const a = (kk / sides) * Math.PI * 2;
        const r = 0.5 - 0.22 * t;
        return centre(t).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      };
      const quad: [number, number][] = [[j, k], [j + 1, k], [j, k + 1], [j, k + 1], [j + 1, k], [j + 1, k + 1]];
      for (const [jj, kk] of quad) {
        const v = at(jj, kk);
        batch.vertex(mats.bark, v, v.clone().sub(centre(jj / rings)).normalize(), kk / 2.5, jj / 1.5, bark);
      }
    }
  }
  if (burnt) return;
  const top = centre(1);
  const fronds = 7;
  const spin = rng() * Math.PI;
  for (let f = 0; f < fronds; f++) {
    const a = spin + (f / fronds) * Math.PI * 2;
    const len = 4.5 + rng() * 1.5;
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(0.8);
    const mid = top.clone().addScaledVector(out, len * 0.5).setY(top.y + 0.6);
    const tip = top.clone().addScaledVector(out, len).setY(top.y - 1.6 - rng());
    const tint: RGB = [0.8 + rng() * 0.2, 0.75 + rng() * 0.15, 0.55];
    const strip = [
      [top.clone().sub(side), top.clone().add(side), 0],
      [mid.clone().sub(side.clone().multiplyScalar(1.3)), mid.clone().add(side.clone().multiplyScalar(1.3)), 0.5],
      [tip.clone().sub(side.clone().multiplyScalar(0.3)), tip.clone().add(side.clone().multiplyScalar(0.3)), 1],
    ] as const;
    for (let i = 0; i < 2; i++) {
      const [l0, r0, v0] = strip[i];
      const [l1, r1, v1] = strip[i + 1];
      const n = new THREE.Vector3().crossVectors(r0.clone().sub(l0), l1.clone().sub(l0)).normalize();
      if (n.y < 0) n.negate();
      const verts: [THREE.Vector3, number, number][] = [
        [l0, 0, v0], [l1, 0, v1], [r0, 1, v0], [r0, 1, v0], [l1, 0, v1], [r1, 1, v1],
      ];
      for (const [p, u, v] of verts) batch.vertex(mats.frond, p, n, u, v, tint);
    }
  }
}

export interface StartLamps {
  red: THREE.Mesh[];
  green: THREE.Mesh;
}

/** The start gantry: two scaffold towers and a truss over the road, hung with the banner, lamps and start lights. */
function gantry(track: Track, batch: Batch, m: LavaMats, group: THREE.Group, lights: Lights): StartLamps {
  const p = sampleAt(track, 2);
  const yaw = headingAt(p);
  const L = limitOf(p) + 1.4;
  const top = 8.5;
  const fwd = new THREE.Vector3(p.tx, 0, p.tz);
  for (const side of [-1, 1]) {
    const c = frame(p, side * (L + 1), 0);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = c.clone().addScaledVector(fwd, a).add(new THREE.Vector3(-p.tz, 0, p.tx).multiplyScalar(b));
      batch.beam(m.steel, leg, leg.clone().setY(leg.y + top + 1), 0.16);
    }
    for (let h = 2; h <= top; h += 2.2) {
      block(batch, m.kit, 2.4, 0.2, 2.4, xf(c.x, c.y + h, c.z, yaw), 'crate');
      const a = c.clone().addScaledVector(fwd, -1).setY(c.y + h - 2.2);
      const b = c.clone().addScaledVector(fwd, 1).setY(c.y + h);
      batch.beam(m.steel, a.add(new THREE.Vector3(-p.tz, 0, p.tx).multiplyScalar(side)), b.add(new THREE.Vector3(-p.tz, 0, p.tx).multiplyScalar(side)), 0.1);
    }
    block(batch, m.kit, 2.6, 1.2, 2.6, xf(c.x, c.y + 0.6, c.z, yaw), 'stripes');
    // A work lamp on each tower, aimed down at the grid.
    const head = workLamp(batch, m, c.clone().setY(c.y + top + 1), yaw + Math.PI, 0.6, false);
    lights.add(head.clone().addScaledVector(fwd, -6).setY(c.y + 3), LAMP_LIGHT.clone().multiplyScalar(1.2), 26, 0.04, 6);
  }
  // The truss and the banner.
  for (const [dy, df] of [[0, -0.6], [0, 0.6], [1.4, -0.6], [1.4, 0.6]]) {
    const l = frame(p, -(L + 1), top + dy).addScaledVector(fwd, df);
    const r = frame(p, L + 1, top + dy).addScaledVector(fwd, df);
    batch.beam(m.steel, l, r, 0.18);
  }
  for (let o = -L; o <= L; o += 2) {
    const a = frame(p, o, top).addScaledVector(fwd, -0.6);
    const b = frame(p, o + 2, top + 1.4).addScaledVector(fwd, -0.6);
    batch.beam(m.steel, a, b, 0.1);
  }
  const mid = frame(p, 0, top - 1.6).addScaledVector(fwd, -0.7);
  batch.geometry(m.banner, new THREE.PlaneGeometry(12, 3), xf(mid.x, mid.y, mid.z, yaw));
  // Start lights: four reds in a row, then green.
  const lm = lampMats();
  const red: THREE.Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const at = frame(p, -4.5 + k * 2, top - 3.7).addScaledVector(fwd, -0.7);
    block(batch, m.kit, 1.2, 1.2, 0.5, xf(at.x, at.y, at.z, yaw), 'black');
    const off = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), lm.off);
    const on = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), lm.red);
    for (const d of [off, on]) {
      d.position.copy(at).addScaledVector(fwd, -0.27);
      d.rotation.y = yaw;
    }
    on.position.addScaledVector(fwd, -0.01);
    group.add(off, on);
    red.push(on);
  }
  const gAt = frame(p, 3.5, top - 3.7).addScaledVector(fwd, -0.7);
  block(batch, m.kit, 1.2, 1.2, 0.5, xf(gAt.x, gAt.y, gAt.z, yaw), 'black');
  const green = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), lm.green);
  green.position.copy(gAt).addScaledVector(fwd, -0.28);
  green.rotation.y = yaw;
  group.add(green);
  return { red, green };
}

/** Rocks along the barriers of the open road, with striped marker poles and rope between them. */
function verges(track: Track, batch: Batch, m: LavaMats, mats: Materials): void {
  for (const [a, b] of zoneRanges(track, 'ash')) {
    along(track, a + 1, b - 1, 3.4, (p, s, k) => {
      if (Math.abs(s - track.length) < 6 || s < 6) return;
      if (p.surface === 'lava') return;
      const L = limitOf(p);
      for (const side of [-1, 1]) {
        const seed = k * 2 + (side > 0 ? 1 : 0);
        const at = frame(p, side * (L + 0.6), 0);
        if (k % 3 === 0) {
          block(batch, m.kit, 0.3, 1.6, 0.3, xf(at.x, at.y + 0.5, at.z), 'stripes');
          const q = sampleAt(track, s + 10.2);
          if (q.surface !== 'lava') {
            const far = frame(q, side * (limitOf(q) + 0.6), 0);
            batch.beam(mats.rope, at.clone().setY(at.y + 1.1), far.setY(far.y + 1.1), 0.06);
          }
        } else if (hash2(seed, 1, 70) < 0.75) {
          const size = 1 + hash2(seed, 2, 71) * 1.4;
          batch.geometry(m.rubbleOut, boulder(seed + 100, size, 0.6), xf(at.x + side * 0.4, at.y, at.z, seed));
        }
      }
    });
  }
}

/** The camp on the ash flats: tents, crates, a generator, film lights on stands and a camera crane. */
function camp(track: Track, batch: Batch, mats: Materials, m: LavaMats, terrain: Terrain, lights: Lights): void {
  const ground = (x: number, z: number) => new THREE.Vector3(x, terrain.height(x, z), z);
  const spot = (s: number, o: number) => {
    const p = sampleAt(track, s);
    const at = frame(p, o, 0);
    return { p, at: ground(at.x, at.z), yaw: headingAt(p) };
  };
  // Tents: a ridge pole and two sloping canvas sides.
  for (const [s, o] of [[22, -20], [36, -24], [1452, -22], [1430, 21], [60, 22]] as const) {
    const { at, yaw } = spot(s, o);
    const pitch = new THREE.Matrix4().makeRotationY(yaw + 0.3).setPosition(at);
    for (const side of [-1, 1]) {
      put(batch, m.kit, new THREE.PlaneGeometry(6, 4.2), pitch.clone().multiply(xf(side * 1.6, 1.6, 0, Math.PI / 2, 0, side * -0.88)), 'canvas');
    }
    batch.beam(mats.planks, at.clone().setY(at.y), at.clone().setY(at.y + 3.4), 0.15);
  }
  // Crate stacks and barrels.
  const rng = mulberry32(77);
  for (const [s, o] of [[14, -14], [30, 15], [46, -15], [1466, 14], [1440, -14], [96, 16], [1400, 16]] as const) {
    const { at, yaw } = spot(s, o);
    for (let k = 0; k < 4; k++) {
      const x = (k % 2) * 1.7;
      const y = k === 3 ? 1.6 : 0;
      block(batch, m.kit, 1.6, 1.6, 1.6, xf(at.x + x, at.y + 0.8 + y, at.z + (k === 2 ? 1.7 : 0), yaw + rng() * 0.4), k === 2 ? 'tarp' : 'crate');
    }
  }
  // Film lights on tall stands, turned on the start straight: this is a movie set.
  for (const [s, o] of [[-30, -16], [40, 17], [1380, -17]] as const) {
    const { p, at } = spot(s, o);
    const face = Math.atan2(at.x - p.x, at.z - p.z);
    for (const a of [0, 2.1, 4.2]) {
      const leg = at.clone().add(new THREE.Vector3(Math.sin(a) * 2, 0, Math.cos(a) * 2));
      batch.beam(m.steel, leg, at.clone().setY(at.y + 3), 0.14);
    }
    batch.beam(m.steel, at.clone().setY(at.y + 3), at.clone().setY(at.y + 9), 0.2);
    const head = at.clone().setY(at.y + 9.8);
    block(batch, m.kit, 2.6, 2.6, 2.2, xf(head.x, head.y, head.z, face, -0.3), 'black');
    const lens = head.clone().add(new THREE.Vector3(-Math.sin(face) * 1.12, 0.35, -Math.cos(face) * 1.12));
    batch.geometry(m.lamp, new THREE.CircleGeometry(1.0, 10), xf(lens.x, lens.y, lens.z, face + Math.PI, 0.3));
    for (const side of [-1, 1]) {
      const door = head.clone().add(new THREE.Vector3(-Math.sin(face) * 1.4 + Math.cos(face) * side * 1.4, 0.5, -Math.cos(face) * 1.4 - Math.sin(face) * side * 1.4));
      block(batch, m.kit, 0.1, 2.4, 1.2, xf(door.x, door.y, door.z, face + side * 0.5), 'black');
    }
    lights.add(frame(p, o * 0.3, 2), LAMP_LIGHT.clone().multiplyScalar(1.1), 30, 0.03, 4);
  }
  // A camera crane: a counterweighted arm on a dolly, its camera peering at the cars.
  {
    const { p, at } = spot(1475, 16);
    const face = Math.atan2(p.x - at.x, p.z - at.z);
    block(batch, m.kit, 3, 1, 4, xf(at.x, at.y + 0.9, at.z, face), 'black');
    for (const [x, z] of [[-1.3, -1.8], [1.3, -1.8], [-1.3, 1.8], [1.3, 1.8]]) {
      const w = new THREE.Vector3(x, 0.45, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(at);
      put(batch, m.kit, new THREE.CylinderGeometry(0.45, 0.45, 0.4, 8), xf(w.x, w.y, w.z, face, 0, Math.PI / 2), 'tyre');
    }
    batch.beam(m.steel, at.clone().setY(at.y + 1.4), at.clone().setY(at.y + 4.2), 0.4);
    const pivot = at.clone().setY(at.y + 4.4);
    const out = new THREE.Vector3(Math.sin(face), 0.35, Math.cos(face)).normalize();
    const tip = pivot.clone().addScaledVector(out, 9);
    const back = pivot.clone().addScaledVector(out, -4);
    batch.beam(m.steel, back, tip, 0.35);
    block(batch, m.kit, 1.2, 1.2, 1.2, xf(back.x, back.y, back.z, face), 'steel');
    block(batch, m.kit, 1.2, 1.0, 1.8, xf(tip.x, tip.y - 0.8, tip.z, face), 'black');
    put(batch, m.kit, new THREE.CylinderGeometry(0.45, 0.45, 0.6, 8), xf(tip.x + out.x, tip.y - 0.8, tip.z + out.z, face, Math.PI / 2), 'black');
    block(batch, m.kit, 0.8, 0.7, 0.1, xf(tip.x, tip.y + 0.1, tip.z, face), 'clapper');
  }
  // Palms at the edge of the ash: green away from the volcano, burnt stumps near it.
  for (let k = 0; k < 46; k++) {
    const x = -300 + rng() * 580;
    const z = -150 + rng() * 225;
    const r = fromCrater(x, z);
    const near = track.samples.some((q) => Math.hypot(q.x - x, q.z - z) < limitOf(q) + 10);
    if (near || r < 270 || onFlow(x, z).across < 14) continue;
    palm(batch, mats, ground(x, z), rng, r < 300 || rng() < 0.25);
  }
}

/** The lava river: out of a gully in the cliff and across the flats, under the jump. */
function river(batch: Batch, m: LavaMats, lights: Lights, flames: THREE.Vector3[]): void {
  const d = new THREE.Vector3(FLOW.dir.x, 0, FLOW.dir.z);
  const side = new THREE.Vector3(-d.z, 0, d.x);
  const at = (along: number, across: number) => new THREE.Vector3(CALDERA.x, FLOW.level, CALDERA.z).addScaledVector(d, along).addScaledVector(side, across);
  const up = new THREE.Vector3(0, 1, 0);
  const step = 6;
  for (let a = FLOW.from - 4; a < FLOW.to; a += step) {
    const w0 = FLOW.width / 2 + 1;
    for (let k = -2; k < 2; k++) {
      const quad = [at(a, (k * w0) / 2), at(a + step, (k * w0) / 2), at(a, ((k + 1) * w0) / 2), at(a, ((k + 1) * w0) / 2), at(a + step, (k * w0) / 2), at(a + step, ((k + 1) * w0) / 2)];
      quad.forEach((v, i) => {
        const along = i === 1 || i === 4 || i === 5 ? a + step : a;
        batch.vertex(m.lavaFlow, v, up, (v.dot(side) + 100) / 6, -along / 6);
      });
    }
  }
  // It pours from a crack high in the cliff.
  const top = at(FLOW.from - 10, 0).setY(22);
  const bottom = at(FLOW.from - 3, 0).setY(FLOW.level);
  lavafall(batch, m, top, bottom, 5, d.clone(), 1.2);
  lights.add(bottom.clone().setY(2), LAVA_LIGHT.clone().multiplyScalar(2), 30, 0.3, 1.5);
  for (const a of [FLOW.from + 20, FLOW.from + 80, FLOW.from + 140]) {
    const p = at(a, 0).setY(FLOW.level + 1);
    lights.add(p, LAVA_LIGHT.clone().multiplyScalar(1.8), 24, 0.3, 1.5);
    flames.push(p.clone().setY(FLOW.level + 0.3));
  }
}

/** The ledge out of the cliff: a timber platform built out over the drop, with a striped lip. */
function cliffLip(track: Track, batch: Batch, m: LavaMats, mats: Materials): void {
  const s = track.marks[SPOTS.cliff];
  for (let k = -6; k <= 0; k += 2) {
    const p = sampleAt(track, s + k);
    for (const o of [-0.45, 0, 0.45]) {
      const t = frame(p, o * p.width, -0.2);
      batch.beam(mats.planks, t, t.clone().setY(t.y - 12), 0.45);
    }
  }
  const p = sampleAt(track, s + 1);
  const at = frame(p, 0, 0.02);
  put(batch, m.kit, new THREE.PlaneGeometry(p.width, 1.2), xf(at.x, at.y, at.z, headingAt(p), -Math.PI / 2), 'stripes');
}

/** Everything out on the ash flats and the volcano's flanks. */
export function buildOutside(track: Track, batch: Batch, mats: Materials, m: LavaMats, terrain: Terrain, group: THREE.Group, lights: Lights, flames: THREE.Vector3[]): StartLamps {
  const lamps = gantry(track, batch, m, group, lights);
  verges(track, batch, m, mats);
  camp(track, batch, mats, m, terrain, lights);
  river(batch, m, lights, flames);
  cliffLip(track, batch, m, mats);
  return lamps;
}
