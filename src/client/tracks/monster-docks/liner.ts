import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { Batch, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { smoothstep } from '../../render/noise';
import { addPointLight, type PointLight } from '../../render/ps1';
import { box, frame, headingAt, loft, rim, type Profile } from '../../render/road';
import { beacon, fire, slab } from './kit';
import { lamp, type Looks } from './look';

/** World height of the lower deck the road runs along, and of the open deck on top of the hull. */
const FLOOR = 3.3;
const DECK = 13.6;
const BEAM = 11;
const BLACK: RGB = [0.13, 0.13, 0.16];
const RED: RGB = [0.62, 0.14, 0.1];
const WHITE: RGB = [0.95, 0.92, 0.86];
/** Hull plating heights. The claw marks are cut through the bands from HOLED up. */
const LEVELS = [-5, -1, 1.2, 3.6, 6, 8.4, 10.8, 13.2];
const HOLED = 2;

interface Half {
  a: number;
  b: number;
  /** Degrees of list. The two halves of the broken ship lean opposite ways. */
  list: number;
  /** Centre lines of the claw marks, along the track. */
  claws: number[];
}

const ribShape = (y: number) => (y < -1 ? 0.7 + ((y + 5) / 4) * 0.25 : y < 3 ? 0.95 + ((y + 1) / 4) * 0.05 : 1);

/** The liner's hull, decks and funnels: two halves round the fork, broken apart over the hole in the road. */
export function liner(track: Track, batch: Batch, mats: Materials, looks: Looks): { lights: PointLight[]; flames: THREE.Vector3[]; update(time: number): void } {
  const t = track.routes[0].track;
  const [first, second] = zoneRanges(t, 'liner');
  const stern = first[0];
  const prow = second[1];
  const halves: Half[] = [
    { a: first[0], b: first[1], list: -6, claws: [first[0] + 12, first[0] + 22, first[0] + 32] },
    { a: second[0], b: second[1], list: 7, claws: [second[0] + 10, second[0] + 20] },
  ];
  const lights: PointLight[] = [];
  const alarms: { light: PointLight; phase: number }[] = [];
  const flames: THREE.Vector3[] = [];
  const rng = mulberry32(1912);

  for (const half of halves) {
    const list = Math.tan((half.list * Math.PI) / 180);
    const width = (s: number) => BEAM * (0.64 + 0.36 * smoothstep(0, 18, Math.min(s - stern, prow - s)));
    /** A road-frame height that puts a point at world height y on this half's rigid, listing hull. */
    const hull = (p: Sample, o: number, y: number) => y + o * list - p.y - o * Math.tan(p.bank);
    const clawed = (s: number, band: number) => half.claws.some((c) => Math.abs(s - (c + (band - 4) * 1.7)) < 2.1);
    const sideAt = (p: Sample, y: number) => width(p.s) * ribShape(y);

    // Hull plating in bands, port and starboard. The side facing the quay road carries the claw marks.
    for (const side of [-1, 1]) {
      for (let j = 0; j < LEVELS.length - 1; j++) {
        const profile: Profile = (p) => {
          const pts: [number, number][] = [LEVELS[j], LEVELS[j + 1]].map((y) => {
            const o = side * sideAt(p, y);
            return [o, hull(p, o, y)];
          });
          return side < 0 ? pts : pts.reverse();
        };
        loft(batch, t, half.a, half.b, {
          spacing: 2,
          vScale: 8,
          uScale: 8,
          outward: true,
          color: j < HOLED ? RED : BLACK,
          material: (p) => (side < 0 && j >= HOLED && clawed(p.s, j) ? null : looks.plate),
          profile,
        });
      }
      // A white strake along the rail.
      loft(batch, t, half.a, half.b, {
        spacing: 2,
        vScale: 8,
        uScale: 8,
        outward: true,
        color: WHITE,
        material: () => looks.plate,
        profile: (p) => {
          const pts: [number, number][] = [13.2, DECK].map((y) => {
            const o = side * sideAt(p, y);
            return [o, hull(p, o, y)];
          });
          return side < 0 ? pts : pts.reverse();
        },
      });
    }
    // The open deck.
    loft(batch, t, half.a, half.b, {
      spacing: 3,
      vScale: 8,
      uScale: 8,
      outward: true,
      color: [0.72, 0.56, 0.4],
      material: () => looks.plate,
      profile: (p) => {
        const w = sideAt(p, DECK);
        return [-1, -0.5, 0, 0.5, 1].map((f) => {
          const o = f * w;
          return [o, hull(p, o, DECK)] as [number, number];
        });
      },
    });

    // The corridor the road runs down: walls in bands, holed where the claws went through, and a ceiling.
    const bandH = [-0.5, 1.6, 3.8, 6.0];
    for (const side of [-1, 1]) {
      for (let i = 0; i < bandH.length - 1; i++) {
        loft(batch, t, half.a, half.b, {
          spacing: 2,
          vScale: 5,
          uScale: 5,
          color: [0.62, 0.6, 0.6],
          material: (p) => (side < 0 && clawed(p.s, i + 3) ? null : looks.plateIndoor),
          profile: (p) => {
            const o = side * (limitOf(p) + 0.15);
            const pts: [number, number][] = [
              [o, bandH[i]],
              [o, bandH[i + 1]],
            ];
            return side < 0 ? pts : pts.reverse();
          },
        });
      }
    }
    const roof: Profile = (p) => {
      const l = limitOf(p) + 0.15;
      return [
        [-l, 6],
        [-l + 1.3, 6.9],
        [l - 1.3, 6.9],
        [l, 6],
      ];
    };
    loft(batch, t, half.a, half.b, { spacing: 2.5, vScale: 5, uScale: 5, color: [0.5, 0.48, 0.5], material: () => looks.plateIndoor, profile: roof });

    // Closing plates at each end of this half, round the opening for the road.
    for (const [s, forward] of [
      [half.a, false],
      [half.b, true],
    ] as const) {
      const p = sampleAt(t, s);
      const l = limitOf(p) + 0.15;
      const w = width(s);
      const out = (o: number, y: number) => frame(p, o, hull(p, o, y));
      const inner = [frame(p, -l, -0.5), frame(p, -l, 6), frame(p, -l + 1.3, 6.9), frame(p, l - 1.3, 6.9), frame(p, l, 6), frame(p, l, -0.5)];
      const outer = [out(-w, 3), out(-w, DECK), out(-w * 0.5, DECK), out(w * 0.5, DECK), out(w, DECK), out(w, 3)];
      rim(batch, looks.plateIndoor, p, inner, outer, forward);
      rim(batch, looks.plateIndoor, p, [frame(p, -l, -0.5), frame(p, l, -0.5)], [out(-w * 0.7, -5), out(w * 0.7, -5)], forward);
      // Torn plates bristling from the broken edge.
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const o = Math.cos(a) * (l + (w - l) * rng());
        const y = 8.5 + Math.sin(a) * 5.2 + rng();
        const at = out(o, y);
        const dir = forward ? 1 : -1;
        const m = xf(at.x + p.tx * dir, at.y, at.z + p.tz * dir, headingAt(p) + (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.9, (rng() - 0.5) * 0.9);
        batch.geometry(looks.plate, new THREE.BoxGeometry(1 + rng() * 2, 0.15, 2 + rng() * 3.5), m, BLACK);
      }
    }

    // Steel ribs round the corridor, pipes along the ceiling, and glowing portholes in the walls.
    for (let s = half.a + 2; s < half.b - 1; s += 3.2) {
      loft(batch, t, s, s + 0.4, {
        spacing: 0.4,
        vScale: 4,
        uScale: 4,
        color: [0.42, 0.4, 0.42],
        material: () => looks.plateIndoor,
        profile: (p) => {
          const l = limitOf(p);
          return [
            [-l - 0.1, -0.4],
            [-l + 0.3, 6],
            [-l + 1.4, 6.6],
            [l - 1.4, 6.6],
            [l - 0.3, 6],
            [l + 0.1, -0.4],
          ];
        },
      });
    }
    for (const [o, h, w, tone] of [
      [-3.4, 6.2, 0.42, [0.62, 0.3, 0.14]],
      [-2.4, 6.3, 0.3, [0.42, 0.45, 0.48]],
      [2.9, 6.2, 0.5, [0.5, 0.5, 0.3]],
      [4.1, 6.1, 0.3, [0.62, 0.3, 0.14]],
    ] as [number, number, number, RGB][]) {
      for (let s = half.a; s < half.b - 3; s += 3) {
        batch.beam(mats.metalIndoor, frame(sampleAt(t, s), o, h), frame(sampleAt(t, s + 3), o, h), w, w, tone);
      }
    }
    for (let s = half.a + 3.5, k = 0; s < half.b - 2; s += 4, k++) {
      const p = sampleAt(t, s);
      const h = headingAt(p);
      for (const side of [-1, 1]) {
        if (side < 0 && half.claws.some((c) => Math.abs(s - c) < 5)) continue;
        const at = frame(p, side * limitOf(p), 3.1);
        batch.geometry(looks.glow, lamp(new THREE.CircleGeometry(0.65, 8), 'porthole'), xf(at.x, at.y, at.z, h - side * Math.PI / 2), [1, 0.75, 0.55]);
      }
    }

    // Alarm lamps down the ceiling: red, pulsing, the only real light in here.
    for (let s = half.a + 5, k = 0; s < half.b - 2; s += 12, k++) {
      const p = sampleAt(t, s);
      const at = frame(p, 0, 6.1);
      batch.geometry(looks.alarm, new THREE.BoxGeometry(0.9, 0.35, 0.9), xf(at.x, at.y, at.z, headingAt(p)), [1, 0.08, 0.05]);
      const light = addPointLight(at.clone().setY(at.y - 1), new THREE.Color(1, 0.12, 0.08), 18);
      alarms.push({ light, phase: k * 1.3 });
      lights.push(light);
    }

    // On deck, in a frame that shares this half's list.
    const mid = sampleAt(t, (half.a + half.b) / 2);
    const len = half.b - half.a;
    const S = xf(mid.x, FLOOR, mid.z, headingAt(mid)).multiply(xf(0, 0, 0, 0, 0, (half.list * Math.PI) / 180));
    const on = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => S.clone().multiply(xf(x, y, z, ry, rx, rz));
    const deck = DECK - FLOOR;
    const house = half === halves[0] ? [len - 12, 8.4, 0] : [len - 12, 7, 0];
    batch.geometry(looks.superstructure, slab(house[1] * 2, 3.6, house[0], 16), on(0, deck + 1.8, house[2]));
    batch.geometry(looks.plate, new THREE.BoxGeometry(house[1] * 2 + 0.8, 0.25, house[0] + 0.8), on(0, deck + 3.7, house[2]), [0.72, 0.56, 0.4]);
    batch.geometry(looks.superstructure, slab(house[1] * 1.5, 3.2, house[0] - 8, 16), on(0, deck + 5.4, house[2]));
    batch.geometry(looks.plate, new THREE.BoxGeometry(house[1] * 1.5 + 0.8, 0.25, house[0] - 7), on(0, deck + 7.1, house[2]), [0.72, 0.56, 0.4]);
    // Lifeboats along the first tier.
    for (const side of [-1, 1]) {
      for (let z = -house[0] / 2 + 3; z < house[0] / 2 - 2; z += 6.5) {
        const x = side * (house[1] + 1.4);
        batch.geometry(looks.plate, new THREE.CapsuleGeometry(0.75, 3.4, 2, 6).rotateX(Math.PI / 2), on(x, deck + 4.6, z), [0.95, 0.5, 0.15]);
        for (const dz of [-1.8, 1.8]) box(batch, mats.metal, 0.12, 2.2, 0.12, on(x - side * 0.3, deck + 4.4, z + dz, 0, 0, side * 0.4), [0.9, 0.9, 0.9]);
      }
    }
    // Funnels: red with black tops, raked back, smoking. The stern half's second one has been knocked askew.
    const stacks = half === halves[0] ? [-9, 9] : [1];
    stacks.forEach((z, i) => {
      const crooked = half === halves[0] && i === 1;
      const m = on(0, deck + 7, z, 0, 0.14 + (crooked ? 0.1 : 0), crooked ? -0.32 : 0);
      batch.geometry(looks.plate, new THREE.CylinderGeometry(2.6, 2.9, 9, 10), m.clone().multiply(xf(0, 4.5, 0)), RED);
      batch.geometry(looks.plate, new THREE.CylinderGeometry(2.7, 2.65, 2.6, 10), m.clone().multiply(xf(0, 10.2, 0)), [0.09, 0.09, 0.11]);
      const top = new THREE.Vector3(0, 12, 0).applyMatrix4(m);
      for (const turn of [0.3, 1.9]) {
        batch.geometry(looks.smoke, new THREE.PlaneGeometry(9, 36), xf(top.x, top.y + 17, top.z, turn), [0.9, 0.85, 0.9]);
      }
    });
    // Fires on deck, at the break and forward of the funnels.
    const blaze = on(rng() * 4 - 2, deck + 0.3, half === halves[0] ? -len / 2 + 1.5 : len / 2 - 1.5);
    const fireAt = new THREE.Vector3().setFromMatrixPosition(blaze);
    const light = fire(batch, mats, looks, fireAt, 4.5, true, true);
    if (light) lights.push(light);
    flames.push(fireAt.clone().setY(fireAt.y + 3));
  }

  // Sparks and a glow where the deck is torn open, down in the hold between the halves.
  {
    const gap = sampleAt(t, (first[1] + second[0]) / 2);
    const fall = new THREE.Vector3(gap.x, FLOOR + 3, gap.z);
    const glow = addPointLight(fall.clone(), new THREE.Color(1.0, 0.42, 0.14).multiplyScalar(1.4), 22);
    lights.push(glow);
    for (const o of [-4, 0, 4]) {
      const a = frame(sampleAt(t, first[1]), o, 5);
      const b = frame(sampleAt(t, second[0]), o + 0.6, 5.4);
      const low = a.clone().lerp(b, 0.5).setY(a.y - 3.2);
      batch.beam(mats.metalIndoor, a, low, 0.12, 0.12, [0.25, 0.25, 0.25]);
      batch.beam(mats.metalIndoor, low, b, 0.12, 0.12, [0.25, 0.25, 0.25]);
      flames.push(low);
    }
  }

  // A prow over the way out: the stem raked forward above the smashed bow.
  {
    const p = sampleAt(t, prow);
    const w = BEAM * 0.64;
    const list = Math.tan((7 * Math.PI) / 180);
    const at = (o: number, y: number) => frame(p, o, y + o * list - p.y - o * Math.tan(p.bank));
    const tip = at(0, DECK + 2.4).add(new THREE.Vector3(p.tx * 8, 0, p.tz * 8));
    const foot = at(0, 9.8).add(new THREE.Vector3(p.tx * 3.6, 0, p.tz * 3.6));
    const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, tone: RGB) => {
      const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      for (const [v, u, w2] of [
        [a, 0, 0],
        [b, 1, 0],
        [c, 0.5, 1],
      ] as const) batch.vertex(looks.plate, v, n, u * 3, w2 * 3, tone);
      for (const [v, u, w2] of [
        [a, 0, 0],
        [c, 0.5, 1],
        [b, 1, 0],
      ] as const) batch.vertex(looks.plate, v, n.clone().negate(), u * 3, w2 * 3, tone);
    };
    const left = at(-w, DECK);
    const right = at(w, DECK);
    tri(at(-w, 9.8), left, foot, BLACK);
    tri(right, at(w, 9.8), foot, BLACK);
    tri(left, tip, foot, BLACK);
    tri(tip, right, foot, BLACK);
    tri(left, right, tip, [0.72, 0.56, 0.4]);
  }

  // Beacons either side of the way in, so the opening in the stern reads from the junction.
  {
    const p = sampleAt(t, stern - 1);
    for (const side of [-1, 1]) beacon(batch, mats, looks, frame(p, side * (limitOf(p) + 1), 8));
    const top = frame(p, 0, 8);
    box(batch, looks.stripes, limitOf(p) * 2 + 3, 0.7, 0.7, xf(top.x, top.y - 0.3, top.z, headingAt(p)));
    for (const side of [-1, 1]) {
      const base = frame(p, side * (limitOf(p) + 1), 0);
      box(batch, looks.stripes, 0.7, 8, 0.7, xf(base.x, base.y + 4, base.z, headingAt(p)));
    }
  }

  return {
    lights,
    flames,
    update(time) {
      const beat = 0.55 + 0.45 * Math.sin(time * 5);
      looks.alarm.uniforms.uTint.value.setScalar(0.35 + beat);
      for (const a of alarms) {
        a.light.color.setRGB(1.5, 0.14, 0.1).multiplyScalar(0.25 + 0.75 * Math.max(0, Math.sin(time * 5 + a.phase)));
      }
    },
  };
}
