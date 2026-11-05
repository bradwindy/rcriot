import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { Batch, boulder, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { hash2 } from '../../render/noise';
import { addPointLight } from '../../render/ps1';
import { box, frame, headingAt, loft } from '../../render/road';
import { TUNNEL_HEIGHT } from '../../render/terrain';
import { flame, type Fire } from './kit';
import type { IncaMats } from './palette';

/** A flat sheet of falling water, `w` wide, hanging from `top` down to `bottom`, facing along `yaw`. */
export function fallSheet(batch: Batch, inca: IncaMats, at: THREE.Vector3, yaw: number, w: number, top: number, bottom: number, color: RGB = [1, 1, 1]): void {
  const g = new THREE.PlaneGeometry(w, top - bottom, Math.max(1, Math.round(w / 4)), Math.max(1, Math.round((top - bottom) / 4)));
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 5, (uv.getY(i) * (top - bottom)) / 10);
  batch.geometry(inca.falls, g, xf(at.x, (top + bottom) / 2, at.z, yaw), color);
}

/** Foam boiling up where falling water hits. */
export function foamAt(batch: Batch, inca: IncaMats, at: THREE.Vector3, size: number, seed: number): void {
  for (let k = 0; k < 3; k++) {
    const turn = seed + (k * Math.PI) / 3;
    batch.geometry(inca.foam, new THREE.PlaneGeometry(size, size * 0.8), xf(at.x, at.y + size * 0.3, at.z, turn));
  }
}

/** A cluster of glowing toadstools at the foot of the cave wall. */
function toadstools(batch: Batch, inca: IncaMats, at: THREE.Vector3, seed: number, tint: RGB): void {
  for (let k = 0; k < 4; k++) {
    const a = hash2(seed, k, 1) * Math.PI * 2;
    const d = hash2(seed, k, 2) * 1.1;
    const size = 0.6 + hash2(seed, k, 3) * (k ? 0.8 : 1.6);
    const x = at.x + Math.cos(a) * d;
    const z = at.z + Math.sin(a) * d;
    batch.geometry(inca.cap, new THREE.CylinderGeometry(size * 0.18, size * 0.24, size * 1.3, 5), xf(x, at.y + size * 0.65, z), [0.32, 0.38, 0.36]);
    batch.geometry(inca.cap, new THREE.ConeGeometry(size * 0.75, size * 0.6, 7), xf(x, at.y + size * 1.5, z, a), tint);
  }
}

/**
 * The cave through the hill: a rough rock bore, entered through a waterfall that pours over the mouth. Inside, glowing
 * toadstools light the floor blue and green, with a torch or two, and the far end opens onto a drop to the jungle.
 */
export function buildCave(track: Track, batch: Batch, mats: Materials, inca: IncaMats, fires: Fire[]): void {
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
            o += Math.sign(o) * 0.3;
            h = -0.5;
          }
          out.push([o, h]);
        }
        return out;
      },
    });

    // The waterfall over the mouth: a curtain the cars burst through, fed from the hill above, foaming either side.
    const mouth = sampleAt(track, a - 7);
    const yaw = headingAt(mouth);
    const span = (limitOf(mouth) + 2.5) * 2;
    const at = frame(mouth, 0, 0);
    fallSheet(batch, inca, at, yaw, span, at.y + TUNNEL_HEIGHT + 14, at.y - 0.3);
    fallSheet(batch, inca, frame(mouth, 0, 0).addScaledVector(new THREE.Vector3(-mouth.tx, 0, -mouth.tz), 0.6), yaw, span * 0.7, at.y + TUNNEL_HEIGHT + 14, at.y - 0.3, [0.8, 0.9, 1]);
    for (const side of [-1, 1]) {
      const foot = frame(mouth, side * (limitOf(mouth) + 0.5), 0);
      foamAt(batch, inca, foot, 3.2, side);
      const rock = frame(mouth, side * (limitOf(mouth) + 3.5), 0.5);
      batch.geometry(mats.rock, boulder(17 + side, 5, 0.9), xf(rock.x, rock.y, rock.z, side));
    }
    foamAt(batch, inca, frame(mouth, 0, -0.2), 4.5, 3);
    addPointLight(frame(mouth, 0, 3), new THREE.Color(0.55, 0.8, 1.0).multiplyScalar(1.2), 16);

    // Toadstools down both walls, and the odd torch on a stake.
    const tints: RGB[] = [[0.35, 0.9, 1.0], [0.5, 1.0, 0.55], [0.75, 0.5, 1.0]];
    for (let s = a + 3, k = 0; s < b - 2; s += 5, k++) {
      const p = sampleAt(track, s);
      const side = k % 2 ? 1 : -1;
      const tint = tints[k % 3];
      toadstools(batch, inca, frame(p, side * (limitOf(p) + 0.6), -0.1), k, tint);
      if (k % 2 === 1) {
        const c = new THREE.Color(...tint).multiplyScalar(1.3);
        addPointLight(frame(p, side * (limitOf(p) - 0.5), 1.6), c, 15);
      }
      if (k % 6 === 3) torch(batch, mats, p, -side, fires);
    }

    // Glow-worms speckle the roof.
    for (let s = a + 1, k = 0; s < b; s += 1.5, k++) {
      const p = sampleAt(track, s);
      const ang = Math.PI * (0.2 + 0.6 * hash2(k, 9, 4));
      const at = frame(p, Math.cos(ang) * (limitOf(p) + 0.6), Math.sin(ang) * TUNNEL_HEIGHT - 0.5);
      batch.geometry(inca.cap, new THREE.OctahedronGeometry(0.12), xf(at.x, at.y, at.z), [0.4, 1, 0.9]);
    }

    // A carved doorway at the far end, half buried in the hill, looking out over the drop.
    const exit = sampleAt(track, b + 3.5);
    portal(batch, inca, exit);
  }
}

function torch(batch: Batch, mats: Materials, p: Sample, side: number, fires: Fire[]): void {
  const h = headingAt(p);
  const base = frame(p, side * (limitOf(p) + 0.15), 2.4);
  box(batch, mats.planksIndoor, 0.14, 1.0, 0.14, xf(base.x, base.y + 0.5, base.z, h, 0, side * 0.3));
  flame(batch, mats, frame(p, side * (limitOf(p) - 0.15), 3.1), 0.8, fires, 15, 1.4);
}

/** An Inca doorway: sloping jambs, a carved lintel and a stone face over it. */
function portal(batch: Batch, inca: IncaMats, p: Sample): void {
  const h = headingAt(p);
  const span = limitOf(p) + 1.2;
  for (const side of [-1, 1]) {
    const j = frame(p, side * span, 3.6);
    batch.geometry(inca.carved, new THREE.BoxGeometry(2.2, 8.4, 2.4), xf(j.x, j.y, j.z, h, 0, -side * 0.08));
  }
  const top = frame(p, 0, 8.4);
  box(batch, inca.carved, span * 2 + 3.4, 1.8, 2.6, xf(top.x, top.y, top.z, h));
  const face = frame(p, 0, 10.6);
  const m = xf(face.x, face.y, face.z, h + Math.PI);
  batch.geometry(inca.stone, new THREE.BoxGeometry(4.2, 3.2, 1.6), m);
  batch.geometry(inca.stone, new THREE.BoxGeometry(1, 1.4, 0.8), m.clone().multiply(xf(0, -0.1, 0.9)));
  for (const e of [-1, 1]) batch.geometry(inca.gold, new THREE.BoxGeometry(0.8, 0.4, 0.3), m.clone().multiply(xf(e * 1.1, 0.6, 0.85)));
  batch.geometry(inca.stone, new THREE.BoxGeometry(2.4, 0.4, 0.4), m.clone().multiply(xf(0, -1, 0.85)));
}
