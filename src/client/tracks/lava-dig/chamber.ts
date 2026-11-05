import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { CALDERA, LAVA_LEVEL } from '../../../shared/tracks/lava-dig';
import { boulder, xf, type Batch } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { atJunction, frame, headingAt, loft } from '../../render/road';
import { lavafall } from './caves';
import { block, put } from './kit';
import type { LavaMats } from './materials';
import { along, Lights, LAMP_LIGHT, LAVA_LIGHT } from './util';

/** Top of the chamber's roof, where the vent opens to the sky and the magma pours in. */
const VENT_Y = 82;
const VENT_R = 22;

/** Which side of the road the lava lake is on, +1 for the right. */
function lakeSide(p: Sample): 1 | -1 {
  return -p.tz * (CALDERA.x - p.x) + p.tx * (CALDERA.z - p.z) > 0 ? 1 : -1;
}

/** The lava lake: a disc of molten rock filling the chamber's floor, its pits and the gaps under the causeway. */
function lake(batch: Batch, m: LavaMats): void {
  const rings = [0, 8, 18, 28, 38, 48, 56, 62, 68];
  const n = 36;
  const at = (r: number, k: number) => {
    const a = (k / n) * Math.PI * 2;
    return new THREE.Vector3(CALDERA.x + Math.cos(a) * r, LAVA_LEVEL, CALDERA.z + Math.sin(a) * r);
  };
  const up = new THREE.Vector3(0, 1, 0);
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < n; k++) {
      const quad = [at(rings[j], k), at(rings[j + 1], k), at(rings[j], k + 1), at(rings[j], k + 1), at(rings[j + 1], k), at(rings[j + 1], k + 1)];
      for (const v of quad) batch.vertex(m.lava, v, up, v.x / 16, v.z / 16);
    }
  }
}

/** The roof of the magma chamber, a rough dome over the lake, open at its vent. */
function dome(batch: Batch, m: LavaMats): void {
  const rings: [number, number][] = [
    [CALDERA.wall + 14, 38],
    [CALDERA.wall + 4, 50],
    [CALDERA.wall - 2, 64],
    [78, 72],
    [60, 78],
    [40, 81],
    [VENT_R, VENT_Y],
    [VENT_R - 2, VENT_Y + 6],
  ];
  const n = 40;
  const at = (j: number, k: number) => {
    const [r, y] = rings[j];
    const a = (k / n) * Math.PI * 2;
    const jag = j > 0 && j < rings.length - 1 ? (hash2(j, k % n, 31) - 0.5) * 6 : 0;
    return new THREE.Vector3(CALDERA.x + Math.cos(a) * (r + jag), y + jag * 0.6, CALDERA.z + Math.sin(a) * (r + jag));
  };
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < n; k++) {
      const a = at(j, k);
      const b = at(j + 1, k);
      const c = at(j, k + 1);
      const d = at(j + 1, k + 1);
      const nrm = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      const shade = 0.55 + 0.45 * hash2(j, k, 32);
      for (const v of [a, c, b, c, d, b]) batch.vertex(m.basaltIn, v, nrm, Math.atan2(v.z - CALDERA.z, v.x - CALDERA.x) * 6, v.y / 8, [shade, shade * 0.9, shade * 0.85]);
    }
  }
}

/** Magma pouring from the vent straight down into the middle of the lake, a pillar of light for the whole chamber. */
function column(batch: Batch, m: LavaMats, lights: Lights, flames: THREE.Vector3[]): void {
  const h = VENT_Y + 4 - LAVA_LEVEL;
  const g = new THREE.CylinderGeometry(3.2, 4.4, h, 10, 6, true);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * (h / 10));
  batch.geometry(m.fall, g, xf(CALDERA.x, LAVA_LEVEL + h / 2, CALDERA.z));
  // A boiling mound where it hits the lake.
  batch.geometry(m.lava, new THREE.CylinderGeometry(4.5, 9, 2.4, 12, 1, true), xf(CALDERA.x, LAVA_LEVEL + 0.8, CALDERA.z));
  lights.add(new THREE.Vector3(CALDERA.x, LAVA_LEVEL + 4, CALDERA.z), LAVA_LIGHT.clone().multiplyScalar(3.2), 70, 0.25, 1.2);
  lights.add(new THREE.Vector3(CALDERA.x, 30, CALDERA.z), LAVA_LIGHT.clone().multiplyScalar(2.2), 60, 0.2, 0.8);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    flames.push(new THREE.Vector3(CALDERA.x + Math.cos(a) * 6, LAVA_LEVEL + 0.5, CALDERA.z + Math.sin(a) * 6));
  }
}

/** A work lamp on a pole: a black housing with a glowing face, turned to light the road. */
export function workLamp(batch: Batch, m: LavaMats, foot: THREE.Vector3, yaw: number, high: number, inside: boolean): THREE.Vector3 {
  const pole = inside ? m.steelIn : m.steel;
  const kit = inside ? m.kitIn : m.kit;
  batch.beam(pole, foot, foot.clone().setY(foot.y + high), 0.16);
  for (const a of [0, 2.1, 4.2]) {
    const leg = new THREE.Vector3(foot.x + Math.sin(yaw + a) * 1.1, foot.y, foot.z + Math.cos(yaw + a) * 1.1);
    batch.beam(pole, leg, foot.clone().setY(foot.y + 1.4), 0.1);
  }
  const head = foot.clone().setY(foot.y + high + 0.3);
  block(batch, kit, 1.1, 0.8, 0.7, xf(head.x, head.y, head.z, yaw, -0.35), 'black');
  const face = new THREE.Vector3(Math.sin(yaw) * -0.36, 0.13, Math.cos(yaw) * -0.36).add(head);
  batch.geometry(m.lamp, new THREE.PlaneGeometry(0.9, 0.6), xf(face.x, face.y, face.z, yaw + Math.PI, 0.35));
  return head;
}

/** The ledge round the lake, the fork's causeway across it and the climb up the wall: kerbs, rails and lamps. */
function edges(track: Track, batch: Batch, m: LavaMats, lights: Lights, flames: THREE.Vector3[]): void {
  const stretches: { t: Track; a: number; b: number; route: number }[] = [];
  for (const z of ['hall', 'ledge', 'climb']) for (const [a, b] of zoneRanges(track, z)) stretches.push({ t: track, a, b, route: 0 });
  const fork = track.routes[0];
  for (const [a, b] of zoneRanges(fork.track, 'causeway')) stretches.push({ t: fork.track, a, b, route: 1 });

  for (const { t, a, b, route } of stretches) {
    const causeway = route === 1;
    // Rocks and rope along the lake side, rubble and lamps against the wall.
    along(t, a + 1, b - 1, 3.2, (p, s, k) => {
      const ms = route === 0 ? s : s - fork.rfrom + fork.from;
      if (atJunction(track, ms, 4)) return;
      const lakeDir = lakeSide(p);
      const L = limitOf(p);
      for (const side of [-1, 1] as const) {
        if (p.surface === 'lava') continue;
        const toLake = side === lakeDir || causeway;
        const seed = k * 2 + side + route * 1000;
        const o = side * (L + 0.5 + hash2(seed, 3, 40) * 0.4);
        const at = frame(p, o, 0);
        if (toLake) {
          if (k % 2 === 0) {
            const size = 1.2 + hash2(seed, 1, 41) * 0.8;
            batch.geometry(m.basaltIn, boulder(seed, size, 0.6), xf(at.x, at.y + 0.1, at.z, hash2(seed, 2, 42) * 6));
          } else {
            const post = frame(p, side * (L + 0.3), 0);
            batch.beam(m.timberIn, post.clone().setY(post.y - 0.3), post.clone().setY(post.y + 1.3), 0.18);
            const next = sampleAt(t, s + 6.4);
            if (next.surface !== 'lava') {
              const far = frame(next, side * (limitOf(next) + 0.3), 0);
              batch.beam(m.ropeIn, post.clone().setY(post.y + 1.15), far.setY(far.y + 1.15), 0.07);
            }
          }
        } else if (hash2(seed, 5, 43) < 0.7) {
          const size = 1.5 + hash2(seed, 1, 44) * 2.2;
          batch.geometry(m.rubbleIn, boulder(seed, size, 0.8), xf(at.x + side * 0.6, at.y + size * 0.2, at.z, hash2(seed, 2, 45) * 6));
        }
      }
    });
    // Lava glow from the lake beside the road, and a work lamp on the wall side, in turn.
    along(t, a + 8, b - 4, 15, (p, _s, k) => {
      const lakeDir = causeway ? (k % 2 ? 1 : -1) : lakeSide(p);
      const L = limitOf(p);
      if (k % 2 === 0 || causeway) {
        const at = frame(p, lakeDir * (L + 5), 0).setY(LAVA_LEVEL + 1.5);
        lights.add(at, LAVA_LIGHT.clone().multiplyScalar(2.2), 24, 0.3, 1.6);
        flames.push(at.clone().setY(LAVA_LEVEL + 0.3));
      }
      if (!causeway && k % 2 === 1) {
        const foot = frame(p, -lakeDir * (L + 1.4), 0);
        const head = workLamp(batch, m, foot, headingAt(p) - lakeDir * 1.2, 4.2, true);
        lights.add(head.clone().addScaledVector(new THREE.Vector3(-p.tz, 0, p.tx), lakeDir * 3), LAMP_LIGHT.clone().multiplyScalar(1.3), 22, 0.05, 6);
      }
    });
  }
}

/** The rock bridge over the lake: a slab of basalt on rough piers, kerbed in rock, with a plank kicker in its middle. */
function bridge(track: Track, batch: Batch, m: LavaMats, lights: Lights): void {
  for (const [a, b] of zoneRanges(track, 'bridge')) {
    loft(batch, track, a - 2, b + 2, {
      spacing: 2.5,
      vScale: 6,
      uScale: 5,
      outward: true,
      material: () => m.basaltIn,
      profile: (p, ring) => {
        const L = limitOf(p);
        const j = (k: number) => (hash2(ring, k, 50) - 0.5) * 1.2;
        return [
          [L, 0],
          [L + 0.5, -1.2 + j(1)],
          [L * 0.7, -3.6 + j(2)],
          [0, -5 + j(3)],
          [-L * 0.7, -3.6 + j(4)],
          [-L - 0.5, -1.2 + j(5)],
          [-L, 0],
        ];
      },
    });
    along(track, a + 1, b - 1, 2.6, (p, s, k) => {
      const L = limitOf(p);
      for (const side of [-1, 1]) {
        if (p.surface === 'wood') {
          if (k % 2) continue;
          const post = frame(p, side * (L + 0.1), 0);
          batch.beam(m.timberIn, post.clone().setY(post.y - 0.6), post.clone().setY(post.y + 1.4), 0.2);
          const next = sampleAt(track, s + 5.2);
          const far = frame(next, side * (limitOf(next) + 0.1), 0);
          for (const h of [0.6, 1.25]) batch.beam(m.ropeIn, post.clone().setY(post.y + h), far.clone().setY(far.y + h), 0.07);
        } else {
          const at = frame(p, side * (L + 0.45), 0.35);
          const tall = 0.8 + hash2(k, side, 51) * 0.5;
          batch.box(m.basaltIn, 1.1, tall, 2.4, xf(at.x, at.y + tall / 2 - 0.3, at.z, headingAt(p) + (hash2(k, side, 52) - 0.5) * 0.3));
        }
      }
    });
    // Piers down to the lake, clear of the causeway and the ledge.
    for (const s of [a + 6, a + 82, a + 120]) {
      const p = sampleAt(track, s);
      for (let k = 0; k < 4; k++) {
        const y = LAVA_LEVEL - 1 + k * ((p.y - 5 - LAVA_LEVEL + 1) / 3);
        const size = 7 - k * 0.5;
        batch.geometry(m.basaltIn, boulder(Math.round(s) + k, size, 0.75), xf(p.x, y, p.z, k * 1.7));
      }
      lights.add(new THREE.Vector3(p.x, LAVA_LEVEL + 1.5, p.z), LAVA_LIGHT.clone().multiplyScalar(2), 26, 0.3, 1.4);
    }
    // Lamps hung under the span at each end, so the deck reads in the dark.
    for (const s of [a + 20, b - 26]) {
      const p = sampleAt(track, s);
      lights.add(frame(p, 0, 3), LAMP_LIGHT.clone().multiplyScalar(1.2), 22, 0.05, 6);
    }
  }
}

/** Lava pouring down the chamber wall behind the ledge, at bearings round the crater clear of the roads into it. */
function wallFalls(batch: Batch, m: LavaMats, lights: Lights, flames: THREE.Vector3[]): void {
  for (const deg of [95, 168, 202, 236]) {
    const a = (deg * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const at = (r: number, y: number) => new THREE.Vector3(CALDERA.x, y, CALDERA.z).addScaledVector(dir, r);
    lavafall(batch, m, at(CALDERA.wall + 3, 42), at(CALDERA.ledge + 12, 1.5), 3.2, dir.clone().negate(), 1.4);
    const foot = at(CALDERA.ledge + 10, 3);
    lights.add(foot, LAVA_LIGHT.clone().multiplyScalar(2.2), 30, 0.3, 2);
    flames.push(foot.clone().setY(2));
  }
}

/**
 * Rock heaped over the two tunnel mouths in the chamber wall. The ground is cut open round a tunnel mouth, and up a wall
 * this steep the cut would show sky through the rock.
 */
function plugs(track: Track, batch: Batch, m: LavaMats): void {
  const [, tubeEnd] = zoneRanges(track, 'tube')[0];
  const [exitStart] = zoneRanges(track, 'exit')[0];
  for (const [s, into] of [[tubeEnd + 3.6, -1], [exitStart - 3.6, 1]] as const) {
    const p = sampleAt(track, s);
    const back = new THREE.Vector3(p.tx * into, 0, p.tz * into);
    let k = 0;
    for (const d of [1, 7]) {
      for (const h of [15, 25, 35, 45]) {
        for (const o of [-10, 0, 10]) {
          const at = frame(p, o, h).addScaledVector(back, d + h * 0.15);
          batch.geometry(m.basaltIn, boulder(k * 7 + Math.round(s), 16, 0.8), xf(at.x, at.y, at.z, k));
          k++;
        }
      }
    }
  }
}

/** The magma chamber: the lake, its roof and vent, the falling magma, the ledge, causeway, climb and bridge. */
export function buildChamber(track: Track, batch: Batch, m: LavaMats, lights: Lights, flames: THREE.Vector3[]): void {
  lake(batch, m);
  dome(batch, m);
  column(batch, m, lights, flames);
  edges(track, batch, m, lights, flames);
  bridge(track, batch, m, lights);
  wallFalls(batch, m, lights, flames);
  plugs(track, batch, m);
  // A few crates and a canvas-covered dig table where the tube comes out into the chamber.
  const [ha] = zoneRanges(track, 'hall')[0];
  const p = sampleAt(track, ha + 4);
  const side = -lakeSide(p);
  const at = frame(p, side * (limitOf(p) + 3), 0);
  const yaw = headingAt(p);
  for (const [dx, dy] of [[-0.8, 0], [0.8, 0], [0, 1.4]]) {
    put(batch, m.kitIn, new THREE.BoxGeometry(1.4, 1.4, 1.4), xf(at.x + Math.cos(yaw) * dx, at.y + 0.7 + dy, at.z - Math.sin(yaw) * dx, yaw + dx * 0.2), 'crate');
  }
}
