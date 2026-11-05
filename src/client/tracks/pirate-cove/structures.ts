import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { Batch, boulder, xf } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2, smoothstep } from '../../render/noise';
import { addPointLight, type PointLight } from '../../render/ps1';
import { box, flagOnPole, frame, headingAt, loft, paveRoad, rim, rope, startLine, type Profile } from '../../render/road';
import { TUNNEL_HEIGHT } from '../../render/terrain';

export interface Torch {
  light: PointLight;
  base: THREE.Color;
  seed: number;
}

export function buildTrackStructures(track: Track, batch: Batch, mats: Materials, grid: { s: number; offset: number }[]): Torch[] {
  const torches: Torch[] = [];
  const L = track.length;
  paveRoad(track, batch, {
    road: (p) => {
      if (p.surface === 'rock') return mats.cave;
      if (p.surface === 'wood') return p.zone === 'ship' ? mats.planksIndoor : mats.planks;
      return mats.dirt;
    },
    verge: (p) => {
      if (p.cover === 'open') return mats.sand;
      if (p.zone === 'cave') return mats.cave;
      return p.zone === 'ship' ? mats.planksIndoor : mats.planks;
    },
    skirt: (p) =>
      p.cover === 'open' ? { mat: mats.sand, drop: 1, out: 0.7 } : p.zone === 'pier' ? { mat: mats.planks, drop: 0.4, out: 0 } : null,
  });
  startLine(track, batch, mats, grid);
  {
    const p = sampleAt(track, 0);
    const h = headingAt(p);
    const span = limitOf(p) + 1;
    for (const side of [-1, 1]) {
      const b = frame(p, side * span, 0);
      box(batch, mats.planks, 0.8, 10, 0.8, xf(b.x, b.y + 5, b.z, h));
    }
    const top = frame(p, 0, 10);
    box(batch, mats.planks, span * 2 + 0.8, 0.8, 0.8, xf(top.x, top.y, top.z, h));
    const ban = frame(p, 0, 8.6);
    batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 1, 2.6), xf(ban.x, ban.y, ban.z, h, 0, 0).multiply(xf(0, 0, 0.05)));
    batch.geometry(mats.banner, new THREE.PlaneGeometry(span * 2 - 1, 2.6), xf(ban.x, ban.y, ban.z, h + Math.PI).multiply(xf(0, 0, 0.05)));
    flagOnPole(batch, mats, frame(p, 0, 10.4), h, 3.2, 1.4);
  }

  // Rope fence along open sand, left and right.
  for (const side of [-1, 1]) {
    let last: THREE.Vector3 | null = null;
    for (let s = 3; s < L - 3; s += 6) {
      const p = sampleAt(track, s);
      if (p.cover !== 'open' || p.shoulder < 1.5) {
        last = null;
        continue;
      }
      const b = frame(p, side * (limitOf(p) + 0.2), 0);
      box(batch, mats.planks, 0.2, 1.1, 0.2, xf(b.x, b.y + 0.55, b.z, headingAt(p)));
      const top = b.clone().setY(b.y + 0.9);
      if (last) rope(batch, mats.rope, last, top);
      last = top;
    }
  }

  // The pier: pilings, cross beams, rope rails and lanterns.
  for (const [a, b] of zoneRanges(track, 'pier')) {
    let lastRail: [THREE.Vector3, THREE.Vector3][] = [];
    for (let s = a, k = 0; s <= b; s += 4, k++) {
      const p = sampleAt(track, s);
      const h = headingAt(p);
      const limit = limitOf(p);
      const rails: [THREE.Vector3, THREE.Vector3][] = [];
      for (const side of [-1, 1]) {
        const deck = frame(p, side * (limit - 0.15), 0);
        if (k % 2 === 0) {
          const bottom = -4.5;
          const top = deck.y - 0.3;
          box(batch, mats.planks, 0.42, top - bottom, 0.42, xf(deck.x, (top + bottom) / 2, deck.z, h));
        }
        box(batch, mats.planks, 0.18, 1.25, 0.18, xf(deck.x, deck.y + 0.62, deck.z, h));
        rails.push([deck.clone().setY(deck.y + 1.1), deck.clone().setY(deck.y + 0.6)]);
        if (k % 7 === (side < 0 ? 0 : 3)) {
          const pole = frame(p, side * (limit + 0.15), 0);
          box(batch, mats.planks, 0.2, 2.6, 0.2, xf(pole.x, pole.y + 1.3, pole.z, h));
          box(batch, mats.lantern, 0.45, 0.6, 0.45, xf(pole.x, pole.y + 2.9, pole.z, h));
          box(batch, mats.plastic, 0.62, 0.12, 0.62, xf(pole.x, pole.y + 3.26, pole.z, h));
        }
      }
      if (lastRail.length) {
        for (let i = 0; i < 2; i++) {
          rope(batch, mats.rope, lastRail[i][0], rails[i][0]);
          rope(batch, mats.rope, lastRail[i][1], rails[i][1], 0.05);
        }
      }
      lastRail = rails;
      if (k % 3 === 0) {
        const mid = frame(p, 0, -0.55);
        box(batch, mats.planks, limit * 2, 0.3, 0.35, xf(mid.x, mid.y, mid.z, h));
      }
    }
  }

  // Flags either side of the stunt ramp lip: the end of each open stretch surfaced in wood.
  for (let i = 0; i < track.samples.length; i++) {
    const p = track.samples[i];
    const next = track.samples[(i + 1) % track.samples.length];
    if (p.cover === 'open' && p.surface === 'wood' && next.surface !== 'wood') {
      for (const side of [-1, 1]) flagOnPole(batch, mats, frame(p, side * (limitOf(p) + 0.6), 0), headingAt(p), 3.4);
    }
  }

  // The smugglers' cave: a rough rock arch, a timber frame at each mouth, boulders round it and torches inside.
  for (const [a, b] of zoneRanges(track, 'cave')) {
    loft(batch, track, a - 3, b + 3, {
      spacing: 2.5,
      vScale: 6,
      uScale: 6,
      material: () => mats.cave,
      profile: (p, ring) => {
        const limit = limitOf(p);
        const out: [number, number][] = [];
        for (let k = 0; k <= 10; k++) {
          const ang = Math.PI * (1 - k / 10);
          const bulge = Math.sin(ang);
          let o = Math.cos(ang) * (limit + 1.3 * Math.sqrt(bulge));
          let h = bulge * TUNNEL_HEIGHT;
          if (k > 0 && k < 10) {
            o += (hash2(ring, k, 1) - 0.5) * 1.0;
            h += (hash2(ring, k, 2) - 0.5) * 0.9;
          } else {
            // Tuck the wall foot under the verge, so snapped vertices never open a crack at the floor.
            o += Math.sign(o) * 0.3;
            h = -0.5;
          }
          out.push([o, h]);
        }
        return out;
      },
    });
    for (const [s, dir] of [
      [a - 3.6, -1],
      [b + 3.6, 1],
    ] as const) {
      const p = sampleAt(track, s);
      const h = headingAt(p);
      const span = limitOf(p) + 0.7;
      for (const side of [-1, 1]) {
        const post = frame(p, side * span, 0);
        box(batch, mats.planks, 0.7, 6.4, 0.7, xf(post.x, post.y + 3.2, post.z, h));
        const rockAt = frame(p, side * (span + 2.4), 1.2);
        batch.geometry(mats.rock, boulder(Math.round(s) + side, 4.5, 0.9), xf(rockAt.x, rockAt.y, rockAt.z, s));
        const high = frame(p, side * (span + 1.2), 6.2);
        batch.geometry(mats.rock, boulder(Math.round(s) + side * 3, 4, 0.8), xf(high.x, high.y, high.z, s * 2));
      }
      const lintel = frame(p, 0, 6.6);
      box(batch, mats.planks, span * 2 + 1.2, 0.8, 0.8, xf(lintel.x, lintel.y, lintel.z, h));
      const cap = frame(p, 0, 9.4);
      batch.geometry(mats.rock, boulder(Math.round(s) * 5, 6, 0.6), xf(cap.x, cap.y, cap.z, s + dir));
    }
    for (let s = a + 6, k = 0; s < b - 3; s += 15, k++) {
      const p = sampleAt(track, s);
      const h = headingAt(p);
      const side = k % 2 ? 1 : -1;
      const base = frame(p, side * (limitOf(p) + 0.15), 2.4);
      box(batch, mats.planksIndoor, 0.14, 1.0, 0.14, xf(base.x, base.y + 0.5, base.z, h, 0, side * 0.3));
      const tip = frame(p, side * (limitOf(p) - 0.15), 3.2);
      for (const turn of [0, Math.PI / 2]) {
        batch.geometry(mats.flame, new THREE.PlaneGeometry(0.55, 0.85), xf(tip.x, tip.y + 0.35, tip.z, h + turn));
      }
      const glow = frame(p, side * (limitOf(p) - 0.8), 3.6);
      const base3 = new THREE.Color(1.0, 0.52, 0.22).multiplyScalar(1.5);
      const light = addPointLight(glow, base3.clone(), 18);
      torches.push({ light, base: base3, seed: k * 17 });
    }
  }

  // The wreck: a hull shell lofted round the track, broken open at both ends, with a mast, sail, flag and cannons.
  for (const [a, b] of zoneRanges(track, 'ship')) {
    const broken = (p: Sample, k: number, h: number) => {
      const end = 1 - smoothstep(0, 5, Math.min(p.s - a, b - p.s));
      return k >= 3 && k <= 7 ? h * (1 - end * (0.25 + 0.3 * hash2(Math.round(p.s), k, 4))) : h;
    };
    const inner: Profile = (p) => {
      const l = limitOf(p);
      const pts: [number, number][] = [
        [-l - 0.2, -0.5], [-l - 0.8, 1.4], [-l - 1.2, 3.2], [-l - 0.9, 5.0], [-l + 0.6, 6.4], [0, 6.8],
        [l - 0.6, 6.4], [l + 0.9, 5.0], [l + 1.2, 3.2], [l + 0.8, 1.4], [l + 0.2, -0.5],
      ];
      return pts.map(([o, h], k) => [o, broken(p, k, h)]);
    };
    const outer: Profile = (p) => {
      const l = limitOf(p);
      const pts: [number, number][] = [
        [-l - 0.3, -1.6], [-l - 1.6, 1.2], [-l - 2.0, 3.2], [-l - 1.6, 5.4], [-l - 0.6, 7.2], [0, 7.5],
        [l + 0.6, 7.2], [l + 1.6, 5.4], [l + 2.0, 3.2], [l + 1.6, 1.2], [l + 0.3, -1.6],
      ];
      return pts.map(([o, h], k) => [o, broken(p, k, h)]);
    };
    loft(batch, track, a, b, { spacing: 2, vScale: 4, uScale: 4, material: () => mats.hullIndoor, profile: inner });
    loft(batch, track, a, b, { spacing: 2, vScale: 4, uScale: 4, outward: true, material: () => mats.hull, profile: outer });
    for (const [s, forward] of [
      [a, false],
      [b, true],
    ] as const) {
      const p = sampleAt(track, s);
      rim(batch, mats.hull, p, inner(p, 0).map(([o, h]) => frame(p, o, h)), outer(p, 0).map(([o, h]) => frame(p, o, h)), forward);
    }
    for (let s = a + 2; s < b - 1; s += 3) {
      const p = sampleAt(track, s);
      loft(batch, track, s, s + 0.45, {
        spacing: 1,
        vScale: 4,
        uScale: 4,
        material: () => mats.planksIndoor,
        color: [0.7, 0.62, 0.55],
        profile: (q) => inner(q, 0).map(([o, h]) => [o * 0.94, h * 0.95]),
      });
      if (Math.round(s - a) % 7 === 2) {
        for (const side of [-1, 1]) {
          const at = frame(p, side * (limitOf(p) + 2.3), 3.3);
          batch.geometry(mats.metal, new THREE.CylinderGeometry(0.3, 0.38, 1.6, 6), xf(at.x, at.y, at.z, headingAt(p), 0, Math.PI / 2), [0.5, 0.5, 0.55]);
        }
      }
    }
    const mid = sampleAt(track, (a + b) / 2);
    const h = headingAt(mid);
    const deck = frame(mid, 0, 7.3);
    const mast = xf(deck.x, deck.y, deck.z, h, -0.08, 0.22);
    batch.geometry(mats.bark, new THREE.CylinderGeometry(0.42, 0.55, 18, 6), mast.clone().multiply(xf(0, 9, 0)));
    batch.geometry(mats.bark, new THREE.CylinderGeometry(0.22, 0.22, 10, 5), mast.clone().multiply(xf(0, 14, 0, 0, 0, Math.PI / 2)));
    batch.geometry(mats.sail, new THREE.PlaneGeometry(9, 7.5), mast.clone().multiply(xf(0, 10.2, 0.3, 0, 0.12)));
    batch.geometry(mats.flag, new THREE.PlaneGeometry(2.6, 1.6), mast.clone().multiply(xf(1.3, 17.6, 0, Math.PI / 2)));
    // A raised stern castle over the way in, and a bowsprit jutting from the broken bow over the way out.
    {
      const p = sampleAt(track, a + 5);
      const at = frame(p, 0, 7.3);
      const m = xf(at.x, at.y, at.z, headingAt(p));
      batch.geometry(mats.hull, new THREE.BoxGeometry(limitOf(p) * 2 + 2.6, 2.6, 8), m.clone().multiply(xf(0, 1.3, 1)));
      batch.geometry(mats.planks, new THREE.BoxGeometry(limitOf(p) * 2 + 3.2, 0.3, 8.6), m.clone().multiply(xf(0, 2.7, 1)));
      for (const side of [-1, 1]) {
        for (let z = -2.5; z <= 4.5; z += 1.75) {
          box(batch, mats.planks, 0.18, 1.1, 0.18, m.clone().multiply(xf(side * (limitOf(p) + 1.4), 3.4, z)));
        }
        rope(batch, mats.planks, frame(p, side * (limitOf(p) + 1.4), 11.2), frame(sampleAt(track, a + 12), side * (limitOf(p) + 1.4), 11.2), 0.14);
        const lamp = frame(p, side * (limitOf(p) + 1.6), 10.4);
        box(batch, mats.lantern, 0.5, 0.7, 0.5, xf(lamp.x, lamp.y, lamp.z, headingAt(p)));
      }
    }
    {
      const p = sampleAt(track, b - 1);
      const at = frame(p, 0, 7.2);
      const m = xf(at.x, at.y, at.z, headingAt(p), 0.35);
      batch.geometry(mats.bark, new THREE.CylinderGeometry(0.22, 0.4, 11, 6), m.clone().multiply(xf(0, 0, -5, 0, -Math.PI / 2)));
      rope(batch, mats.rope, new THREE.Vector3(0, 0, -10.4).applyMatrix4(m), deck.clone().setY(deck.y + 14), 0.06);
    }
    for (const f of [0.28, 0.72]) {
      const p = sampleAt(track, a + (b - a) * f);
      const at = frame(p, 0, 5.7);
      box(batch, mats.lantern, 0.5, 0.65, 0.5, xf(at.x, at.y, at.z, headingAt(p)));
      box(batch, mats.metalIndoor, 0.06, 0.6, 0.06, xf(at.x, at.y + 0.62, at.z, headingAt(p)));
      const color = new THREE.Color(1.0, 0.7, 0.35).multiplyScalar(1.3);
      const light = addPointLight(at.clone().setY(at.y - 0.4), color.clone(), 16);
      torches.push({ light, base: color, seed: Math.round(f * 100) });
    }
  }
  return torches;
}
