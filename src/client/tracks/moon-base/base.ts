import * as THREE from 'three';
import { limitOf, ranges, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { xf, type Batch, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { addPointLight, type PointLight } from '../../render/ps1';
import { box, frame, headingAt } from '../../render/road';
import type { MoonMats } from './materials';
import { cap, eased, sweep, type Corner } from './sweep';

interface Room {
  wall: number;
  ceil: number;
  light: RGB;
  tint: RGB;
}

/** Wall and ceiling heights above the floor, the colour of each room's lamps, and a tint for its walls. */
const ROOMS: Record<string, Room> = {
  airlock: { wall: 4.4, ceil: 6.6, light: [1.3, 0.75, 0.3], tint: [1.0, 0.88, 0.66] },
  lab: { wall: 4.6, ceil: 7.0, light: [0.7, 0.9, 1.4], tint: [1, 1, 1] },
  hall: { wall: 7.2, ceil: 10.5, light: [0.8, 0.9, 1.25], tint: [0.86, 0.9, 0.96] },
  rotunda: { wall: 5.6, ceil: 8.6, light: [0.5, 1.0, 1.3], tint: [0.9, 1, 1.05] },
  gallery: { wall: 5.2, ceil: 7.4, light: [0.75, 0.9, 1.35], tint: [1, 1, 1] },
  ring: { wall: 4.8, ceil: 7.2, light: [1.6, 1.25, 0.85], tint: [1.05, 0.98, 0.9] },
};
const room = (p: Sample): Room => ROOMS[p.zone] ?? ROOMS.airlock;

/** What fills each wall between its skirting and its top: plain panels, a window out, or a slot with a conveyor. */
type Inset = 'window' | 'belt' | null;
function inset(zone: string, side: number): Inset {
  if ((zone === 'gallery' || zone === 'ring') && side > 0) return 'window';
  if (zone === 'rotunda' && side < 0) return 'window';
  if (zone === 'hall' && side < 0) return 'belt';
  return null;
}

/** How far the outer cladding stands off the inner wall. Windows are set this deep. */
const SKIN = 1.0;
const KICK = 1.3;

export interface Door {
  panels: [THREE.Mesh, THREE.Mesh];
  at: THREE.Vector3;
  p: Sample;
  half: number;
  height: number;
}

export interface BaseArt {
  doors: Door[];
  /** Amber lights in the airlocks that pulse, and their colour at full strength. */
  warnings: { light: PointLight; base: THREE.Color; seed: number }[];
  /** The middle of the rotunda, where the hologram turns, and its height. */
  core: THREE.Vector3;
}

export function heights(track: Track, s: number): { wall: number; ceil: number } {
  return { wall: eased(track, s, (q) => room(q).wall), ceil: eased(track, s, (q) => room(q).ceil) };
}

function interior(mm: MoonMats, track: Track, p: Sample, s: number): Corner[] {
  const L = limitOf(p) + 0.25;
  const { wall: W, ceil: C } = heights(track, s);
  const tint = room(p).tint;
  const u = (h: number) => (h - KICK) / (W - KICK);
  const side = (dir: -1 | 1): Corner[] => {
    const kind = inset(p.zone, dir);
    const d = kind ? SKIN : 0;
    const bot = kind === 'belt' ? 1.6 : 2.2;
    const top = kind === 'belt' ? 3.4 : W - 0.6;
    const sill = kind === 'belt' ? mm.belt : mm.wall;
    const back = kind === 'window' ? mm.glass : kind === 'belt' ? mm.ceiling : mm.wall;
    const up: Corner[] = [
      { o: dir * L, h: 0.03, u: u(0), m: mm.ceiling },
      { o: dir * L, h: KICK, u: 0, m: mm.wall, c: tint },
      { o: dir * L, h: bot, u: u(bot), m: sill, c: tint },
      { o: dir * (L + d), h: bot, u: kind === 'belt' ? 0 : u(bot), m: back, c: kind === 'window' ? [1, 1, 1] : tint },
      { o: dir * (L + d), h: top, u: kind === 'belt' ? 1 : u(top), m: mm.wall, c: tint },
      { o: dir * L, h: top, u: u(top), m: mm.wall, c: tint },
      { o: dir * L, h: W, u: 1, m: mm.ceiling },
    ];
    if (dir > 0) {
      // Walking down the right wall, each face's material moves to the corner above it.
      const down = up.slice().reverse();
      return down.map((c, k) => ({ ...c, m: k < down.length - 1 ? down[k + 1].m : null }));
    }
    return up;
  };
  return [
    { o: -L + 0.6, h: 0.03, u: 0, m: mm.ceiling },
    ...side(-1),
    { o: -L + 1.6, h: C - 0.5, u: (-L + 1.6) / 4, m: mm.ceiling },
    { o: -L / 3, h: C, u: -L / 12, m: mm.ceiling },
    { o: L / 3, h: C, u: L / 12, m: mm.ceiling },
    { o: L - 1.6, h: C - 0.5, u: (L - 1.6) / 4, m: mm.ceiling },
    ...side(1).map((c, k, all) => (k === all.length - 1 ? { ...c, m: mm.ceiling } : c)),
    { o: L - 0.6, h: 0.03, u: 0 },
  ];
}

function exterior(mm: MoonMats, track: Track, p: Sample, s: number): Corner[] {
  const L = limitOf(p) + 0.25 + SKIN;
  const { wall: W, ceil: C } = heights(track, s);
  const gap = (dir: number) => (inset(p.zone, dir) === 'window' ? null : mm.hull);
  return [
    { o: -L, h: -1.6, m: mm.hull },
    { o: -L, h: 2.2, m: gap(-1) },
    { o: -L, h: W - 0.6, m: mm.hull },
    { o: -L, h: W + 0.8, m: mm.hull },
    { o: -L + 2.2, h: C + 1.1, m: mm.hull },
    { o: L - 2.2, h: C + 1.1, m: mm.hull },
    { o: L, h: W + 0.8, m: mm.hull },
    { o: L, h: W - 0.6, m: gap(1) },
    { o: L, h: 2.2, m: mm.hull },
    { o: L, h: -1.6 },
  ];
}

/** The outline of a room's end, inside and out, for closing the shell where the road leaves it. */
function ends(track: Track, p: Sample, s: number): { inner: Corner[]; outer: Corner[] } {
  const L = limitOf(p) + 0.25;
  const Lo = L + SKIN;
  const { wall: W, ceil: C } = heights(track, s);
  return {
    inner: [
      { o: -L, h: -0.6 },
      { o: -L, h: W },
      { o: -L + 1.6, h: C - 0.5 },
      { o: -L / 3, h: C },
      { o: L / 3, h: C },
      { o: L - 1.6, h: C - 0.5 },
      { o: L, h: W },
      { o: L, h: -0.6 },
    ],
    outer: [
      { o: -Lo, h: -1.6 },
      { o: -Lo, h: W + 0.8 },
      { o: -Lo + 2.2, h: C + 1.1 },
      { o: -L / 3, h: C + 1.1 },
      { o: L / 3, h: C + 1.1 },
      { o: Lo - 2.2, h: C + 1.1 },
      { o: Lo, h: W + 0.8 },
      { o: Lo, h: -1.6 },
    ],
  };
}

/** A screen from the atlas: 0 radar, 1 bars, 2 moon map, 3 trace. */
function screen(batch: Batch, mm: MoonMats, mats: Materials, m: THREE.Matrix4, w: number, h: number, which: number): void {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv');
  const u0 = (which % 2) * 0.5;
  const v0 = which < 2 ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  batch.geometry(mm.screens, g, m);
  batch.geometry(mats.metalIndoor, new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.2), m.clone().multiply(xf(0, 0, -0.12)), [0.5, 0.52, 0.56]);
}

function pipe(batch: Batch, mat: THREE.Material, track: Track, s0: number, s1: number, o: (p: Sample) => number, h: number, r: number): void {
  sweep(batch, track, s0, s1, {
    spacing: 3,
    vScale: 2,
    section: (p) =>
      Array.from({ length: 7 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2;
        return { o: o(p) + Math.cos(a) * r, h: h + Math.sin(a) * r, u: k / 6, m: mat };
      }),
    outward: true,
  });
}

function airlockDoors(track: Track, mm: MoonMats, batch: Batch, group: THREE.Group, s: number): Door {
  const p = sampleAt(track, s);
  const L = limitOf(p) + 0.25;
  const { wall: W, ceil: C } = heights(track, s);
  const h = headingAt(p);
  const half = L;
  const height = W + 0.2;
  const geo = new THREE.BoxGeometry(half, height, 0.45);
  const panel = () => {
    const mesh = new THREE.Mesh(geo, mm.door);
    mesh.rotation.y = h;
    group.add(mesh);
    return mesh;
  };
  const panels: [THREE.Mesh, THREE.Mesh] = [panel(), panel()];
  // A header over the doorway and a housing each side that the panels slide into.
  const head = frame(p, 0, (W + C) / 2 + 0.1);
  box(batch, mm.stripes, L * 2 + 0.4, C - W + 0.9, 0.9, xf(head.x, head.y, head.z, h));
  for (const side of [-1, 1]) {
    const at = frame(p, side * (L + half / 2 + 0.3), height / 2 - 0.4);
    box(batch, mm.hull, half + 0.8, height + 1.2, 1.3, xf(at.x, at.y, at.z, h), [0.84, 0.86, 0.88]);
    const lamp = frame(p, side * (L + 0.9), W + 1.4);
    box(batch, mm.beacon, 0.6, 0.6, 0.6, xf(lamp.x, lamp.y, lamp.z, h));
  }
  return { panels, at: frame(p, 0, height / 2), p, half, height };
}

/** Opens doors when the camera comes near, so the way ahead always slides open in front of the player. */
export function openDoors(doors: Door[], eye: THREE.Vector3): void {
  for (const d of doors) {
    const near = d.at.distanceTo(eye);
    const t = Math.max(0, Math.min(1, (58 - near) / 26));
    const open = t * t * (3 - 2 * t) * (d.half + 0.3);
    d.panels.forEach((m, i) => {
      const side = i === 0 ? -1 : 1;
      const at = frame(d.p, side * (d.half / 2 + open), d.height / 2 - 0.4);
      m.position.copy(at);
    });
  }
}

export function buildBase(track: Track, batch: Batch, mats: Materials, mm: MoonMats, group: THREE.Group): BaseArt {
  const doors: Door[] = [];
  const warnings: BaseArt['warnings'] = [];
  const runs = ranges(track, (p) => p.cover === 'indoor');

  for (const [a, b] of runs) {
    sweep(batch, track, a, b, { spacing: 2, vScale: 4, section: (p, s) => interior(mm, track, p, s) });
    sweep(batch, track, a, b, { spacing: 2, vScale: 8, uScale: 8, outward: true, section: (p, s) => exterior(mm, track, p, s) });
    for (const [s, forward] of [
      [a, false],
      [b, true],
    ] as const) {
      const p = sampleAt(track, s);
      const { inner, outer } = ends(track, p, s);
      cap(batch, mm.hull, p, inner, outer, forward, [0.8, 0.82, 0.85]);
      // A striped portal round each way in and out.
      const { ceil: C } = heights(track, s);
      const L = limitOf(p) + 0.25;
      const h = headingAt(p);
      const out = forward ? 0.45 : -0.45;
      for (const side of [-1, 1]) {
        const post = frame(p, side * (L + 0.6), (C + 1.6) / 2 - 0.8);
        box(batch, mm.stripes, 1.4, C + 1.6, 1.0, xf(post.x, post.y, post.z, h).multiply(xf(0, 0, -out)));
      }
      const lintel = frame(p, 0, C + 0.6);
      box(batch, mm.stripes, L * 2 + 2.6, 1.6, 1.0, xf(lintel.x, lintel.y, lintel.z, h).multiply(xf(0, 0, -out)));
      const top = frame(p, 0, C + 1.9);
      box(batch, mm.beacon, 0.9, 0.7, 0.9, xf(top.x, top.y, top.z, h));
    }

    // Strip lights down the ceiling, lamps in pools with dark between, and screens on the walls.
    for (let s = a + 3, k = 0; s < b - 2; s += 5, k++) {
      const p = sampleAt(track, s);
      const { ceil: C, wall: W } = heights(track, s);
      const h = headingAt(p);
      const r = room(p);
      const rows = p.zone === 'hall' ? [-3.5, 3.5] : [0];
      for (const o of rows) {
        const at = frame(p, o, C - 0.12);
        box(batch, mm.strip, 0.45, 0.14, 3.2, xf(at.x, at.y, at.z, h), r.light.map((c) => Math.min(1, c * 0.8)) as RGB);
      }
      if (k % 3 === 0) {
        const at = frame(p, 0, C - 1.2);
        const color = new THREE.Color(...r.light);
        const light = addPointLight(at, color, p.zone === 'hall' ? 20 : 15);
        if (p.zone === 'airlock') warnings.push({ light, base: color.clone(), seed: s });
      }
      const side = k % 2 ? 1 : -1;
      if (k % 3 === 1 && !inset(p.zone, side) && p.zone !== 'airlock') {
        const at = frame(p, side * (limitOf(p) + 0.1), Math.min(3.4, W - 1.2));
        screen(batch, mm, mats, xf(at.x, at.y, at.z, h - (side * Math.PI) / 2), 2.8, 1.6, (k + Math.round(s)) % 4);
      }
    }

    // Pipes along the upper walls of the corridors.
    for (const [c, d] of ranges(track, (p) => p.s >= a && p.s <= b && (p.zone === 'lab' || p.zone === 'ring' || p.zone === 'gallery'))) {
      for (const [o, h, r] of [
        [-0.45, 0.6, 0.22],
        [-0.95, 0.3, 0.16],
      ]) {
        pipe(batch, mats.metalIndoor, track, c + 1, d - 1, (p) => -(limitOf(p) + 0.25) - o, heights(track, (c + d) / 2).wall - h, r);
      }
    }
  }

  // Doors at both ends of every airlock.
  for (const [a, b] of zoneRanges(track, 'airlock')) {
    doors.push(airlockDoors(track, mm, batch, group, a + 1), airlockDoors(track, mm, batch, group, b - 1));
  }

  // Window frames: mullions every few metres where a wall is glazed.
  for (const [a, b] of runs) {
    for (let s = a + 2; s < b - 1; s += 3.5) {
      const p = sampleAt(track, s);
      const { wall: W } = heights(track, s);
      for (const side of [-1, 1]) {
        if (inset(p.zone, side) !== 'window') continue;
        const at = frame(p, side * (limitOf(p) + 0.25 + SKIN - 0.15), (2.2 + W - 0.6) / 2);
        box(batch, mm.frame, 0.25, W - 2.8, 0.25, xf(at.x, at.y, at.z, headingAt(p)), [0.5, 0.52, 0.56]);
      }
    }
  }

  // The laser hall's gantry rails along each wall.
  for (const [a, b] of zoneRanges(track, 'hall')) {
    for (const side of [-1, 1]) {
      sweep(batch, track, a - 4, b + 4, {
        spacing: 2,
        vScale: 4,
        outward: true,
        section: (p, s) => {
          const o = side * (limitOf(p) - 0.2);
          const h = heights(track, s).wall + 0.4;
          return [
            { o: o - 0.35, h: h - 0.3, m: mm.stripesIn },
            { o: o - 0.35, h: h + 0.3, m: mm.stripesIn },
            { o: o + 0.35, h: h + 0.3, m: mm.stripesIn },
            { o: o + 0.35, h: h - 0.3, m: mm.stripesIn },
            { o: o - 0.35, h: h - 0.3 },
          ];
        },
      });
    }
  }

  // The rotunda's courtyard: a platform inside the hairpin where the hologram turns, seen through the inner windows.
  const rot = zoneRanges(track, 'rotunda')[0];
  const mid = sampleAt(track, (rot[0] + rot[1]) / 2);
  const inward = frame(mid, -(limitOf(mid) + 15), 0);
  const core = new THREE.Vector3(inward.x, mid.y + 6.5, inward.z);
  let radius = Infinity;
  for (let s = rot[0] - 20; s < rot[1] + 20; s += 2) {
    const p = sampleAt(track, s);
    radius = Math.min(radius, Math.hypot(p.x - core.x, p.z - core.z) - limitOf(p) - 0.25 - SKIN);
  }
  {
    const floor = new THREE.CylinderGeometry(radius + 1, radius + 1, 0.4, 24);
    batch.geometry(mm.platesIn, floor, xf(core.x, core.y - 6.5 + 0.5, core.z), [0.7, 0.75, 0.8]);
    // A glowing ring on the floor under the globe and a plinth.
    batch.geometry(mm.strip, new THREE.TorusGeometry(radius * 0.55, 0.3, 4, 32), xf(core.x, core.y - 5.7, core.z, 0, Math.PI / 2), [0.4, 0.9, 1]);
    batch.geometry(mats.metalIndoor, new THREE.CylinderGeometry(2.5, 3.5, 2, 8), xf(core.x, core.y - 5, core.z));
    addPointLight(core.clone().setY(core.y - 1), new THREE.Color(0.3, 0.9, 1.3), radius + 10);
  }
  return { doors, warnings, core };
}
