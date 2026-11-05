import * as THREE from 'three';
import { limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { xf, type Batch } from '../../render/geometry';
import { addPointLight } from '../../render/ps1';
import { box, frame, headingAt } from '../../render/road';
import type { Terrain } from '../../render/terrain';
import type { MoonMats } from './materials';
import { sweep, type Corner } from './sweep';

/** Height of the tube's crown above its floor. */
const CROWN = 7.2;
/** Height of the metal kerb the glass stands on. */
const KERB = 1.5;

/** Half an ellipse from the left kerb over to the right one, `grow` metres out from the glass. */
function arch(p: Sample, grow: number, m: THREE.Material | null, steps = 8): Corner[] {
  const R = limitOf(p) + 0.4 + grow;
  const H = CROWN - KERB + grow;
  return Array.from({ length: steps + 1 }, (_, k) => {
    const a = Math.PI * (1 - k / steps);
    return { o: Math.cos(a) * R, h: KERB + Math.sin(a) * H, u: k / steps, m };
  });
}

/** Ground under a deck point, if it isn't another road. */
function clearBelow(track: Track, x: number, z: number): boolean {
  const all = [...track.samples, ...track.routes.flatMap((r) => r.track.samples)];
  return !all.some((q) => q.cover !== 'deck' && Math.hypot(q.x - x, q.z - z) < limitOf(q) + 2.5);
}

export function buildTube(track: Track, batch: Batch, mm: MoonMats, terrain: Terrain): void {
  for (const [a, b] of zoneRanges(track, 'tube')) {
    // The glass, standing on a metal kerb each side.
    sweep(batch, track, a, b, {
      spacing: 2,
      vScale: 6,
      section: (p) => {
        const R = limitOf(p) + 0.4;
        return [{ o: -R, h: -0.4, u: 0, m: mm.frame }, ...arch(p, 0, mm.glass).map((c, k, all) => ({ ...c, m: k < all.length - 1 ? mm.glass : mm.frame })), { o: R, h: -0.4, u: 1 }];
      },
    });
    // The outside of the kerb and the deck's underside.
    sweep(batch, track, a, b, {
      spacing: 2,
      vScale: 8,
      uScale: 4,
      outward: true,
      section: (p) => {
        const R = limitOf(p) + 0.6;
        return [
          { o: -R, h: KERB, m: mm.hull },
          { o: -R, h: -1.2, m: mm.hull },
          { o: -2.5, h: -2.4, m: mm.hull },
          { o: 2.5, h: -2.4, m: mm.hull },
          { o: R, h: -1.2, m: mm.hull },
          { o: R, h: KERB },
        ];
      },
    });
    // Hoops every few metres, inside and out, and a spine along the crown.
    for (let s = a + 3; s < b - 2; s += 6) {
      for (const [grow, outward] of [
        [0.3, true],
        [-0.15, false],
      ] as const) {
        sweep(batch, track, s, s + 0.6, { spacing: 0.6, vScale: 2, outward, section: (p) => arch(p, grow, mm.frame, 6) });
      }
    }
    sweep(batch, track, a, b, {
      spacing: 3,
      vScale: 4,
      outward: true,
      section: () => [
        { o: -0.5, h: CROWN + 0.1, m: mm.frame },
        { o: -0.5, h: CROWN + 0.6, m: mm.frame },
        { o: 0.5, h: CROWN + 0.6, m: mm.frame },
        { o: 0.5, h: CROWN + 0.1 },
      ],
    });
    // Legs down to the dust, in pairs with a cross brace, kept off any road below.
    for (let s = a + 10; s < b - 6; s += 17) {
      const p = sampleAt(track, s);
      const h = headingAt(p);
      const feet: THREE.Vector3[] = [];
      for (const side of [-1, 1]) {
        const top = frame(p, side * (limitOf(p) - 1), -2.2);
        const foot = frame(p, side * (limitOf(p) + 1.5), 0);
        foot.y = terrain.height(foot.x, foot.z) - 0.4;
        if (!clearBelow(track, foot.x, foot.z)) continue;
        batch.beam(mm.frame, top, foot, 0.7, 0.7, [0.78, 0.8, 0.84]);
        box(batch, mm.hull, 1.8, 0.6, 1.8, xf(foot.x, foot.y + 0.3, foot.z, h), [0.6, 0.6, 0.62]);
        feet.push(foot);
      }
      if (feet.length === 2 && p.y - feet[0].y > 5) {
        const l = feet[0].clone().lerp(frame(p, -(limitOf(p) - 1), -2.2), 0.45);
        const r = feet[1].clone().lerp(frame(p, limitOf(p) - 1, -2.2), 0.45);
        batch.beam(mm.frame, l, r, 0.3, 0.3, [0.7, 0.72, 0.76]);
      }
    }
    // A cool lamp now and then under the crown, so cars catch some light on the deck.
    for (let s = a + 20; s < b - 10; s += 40) {
      addPointLight(frame(sampleAt(track, s), 0, CROWN - 1), new THREE.Color(0.35, 0.6, 0.9), 16);
    }
  }
}
