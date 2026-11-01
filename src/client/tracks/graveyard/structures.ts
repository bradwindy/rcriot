import * as THREE from 'three';
import { NOOSE, SPIDER } from '../../../shared/tracks/graveyard';
import { coverRanges, limitOf, sampleAt, zoneRanges, type Sample, type Track } from '../../../shared/track';
import { xf } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { box, frame, headingAt, loft, rope, type Profile } from '../../render/road';
import { TUNNEL_HEIGHT } from '../../render/terrain';
import { pondDepth, POND } from './ground';
import { buildHouse, type House } from './house';
import { angel, candles, coffin, column, cube, deadTree, jackOLantern, type Kit, limb, prism, skull, spearPost, WARM } from './kit';

/** Places the moving parts hang from, worked out while the static scenery is built. */
export interface SetPieces {
  /** The crypt's far mouth, where the bats burst out, and the way out. */
  cryptExit: THREE.Vector3;
  cryptDir: THREE.Vector3;
  /** Where the noose's rope is tied to the hangman's branch. */
  noosePivot: THREE.Vector3;
  /** The top of the spider's arch over the lair bridge, and the middle of the lair below. */
  spiderPivot: THREE.Vector3;
  lair: THREE.Vector3;
  /** The skeleton's seat on the jetty, facing the pond, and where his float sits. */
  angler: THREE.Matrix4;
  float: THREE.Vector3;
  house: House;
}

const RED = new THREE.Color(1.0, 0.12, 0.1);
const MOONLIT = new THREE.Color(0.5, 0.62, 1.0);

export function buildSetPieces(track: Track, kit: Kit, grid: { s: number; offset: number }[]): SetPieces {
  gate(track, kit, grid);
  const crypt = buildCrypt(track, kit);
  const lair = buildLair(track, kit);
  const noosePivot = hangmansTree(track, kit);
  crest(track, kit);
  const pond = boardwalk(track, kit);
  const house = buildHouse(track, kit);
  return { ...crypt, ...lair, noosePivot, ...pond, house };
}

/** A film light on a stand with a blue gel, for the moonlight on the gates. */
function filmLight(kit: Kit, at: THREE.Vector3, target: THREE.Vector3): void {
  const { batch, mats, g } = kit;
  const yaw = Math.atan2(-(target.x - at.x), -(target.z - at.z));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    batch.beam(mats.metal, at.clone().add(new THREE.Vector3(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3)), at.clone().setY(at.y + 3.4), 0.12, 0.12, [0.6, 0.6, 0.65]);
  }
  box(batch, mats.metal, 0.14, 2.6, 0.14, xf(at.x, at.y + 4.5, at.z, yaw));
  const head = xf(at.x, at.y + 5.9, at.z, yaw, -0.3);
  batch.geometry(mats.plastic, new THREE.BoxGeometry(2, 1.5, 1.3), head);
  batch.geometry(g.gel, new THREE.PlaneGeometry(1.7, 1.2), head.clone().multiply(xf(0, 0, -0.66, Math.PI)));
  for (const side of [-1, 1]) batch.geometry(mats.plastic, new THREE.PlaneGeometry(1, 1.5), head.clone().multiply(xf(side * 1.4, 0, -0.8, side * 0.6)));
  kit.light(at.clone().setY(at.y + 4).lerp(target, 0.4), MOONLIT.clone().multiplyScalar(1.1), 30, 2, 0.04);
}

/** The cemetery gates over the start line: stone pillars, an iron arch with a skull, gates swung open and braziers. */
function gate(track: Track, kit: Kit, grid: { s: number; offset: number }[]): void {
  const { batch, g, mats } = kit;
  const p = sampleAt(track, 0);
  const h = headingAt(p);
  const span = limitOf(p) + 1.4;
  for (const side of [-1, 1]) {
    const b = frame(p, side * span, 0);
    const m = xf(b.x, b.y, b.z, h);
    cube(batch, g.blocks, m.clone().multiply(xf(0, 0.5, 0)), 2.8, 1, 2.8);
    cube(batch, g.blocks, m.clone().multiply(xf(0, 4.75, 0)), 2.2, 7.5, 2.2);
    cube(batch, g.stone, m.clone().multiply(xf(0, 8.7, 0)), 2.7, 0.5, 2.7);
    cube(batch, g.stone, m.clone().multiply(xf(0, 9.2, 0)), 1.6, 0.5, 1.6);
    skull(kit, m.clone().multiply(xf(0, 10.05, 0, side * 0.3)), 0.75, g.stone);
    // A lantern on a bracket on the inner face.
    const arm = m.clone().multiply(xf(-side * 1.1, 6.4, 0));
    box(batch, g.iron, 1.4, 0.12, 0.12, arm.clone().multiply(xf(-side * 0.7, 0, 0)));
    const lamp = arm.clone().multiply(xf(-side * 1.3, -0.6, 0));
    cube(batch, mats.lantern, lamp, 0.5, 0.75, 0.5);
    kit.light(new THREE.Vector3(0, -0.3, 0).applyMatrix4(lamp), WARM.clone().multiplyScalar(1.3), 14, 8, 0.2);
    // The gate leaf, swung open against the railings.
    for (let k = 0; k <= 16; k++) {
      const s = 1.2 + k * 0.62;
      const q = sampleAt(track, s);
      const foot = frame(q, side * (limitOf(q) + 0.6), 0);
      spearPost(batch, g.iron, foot, k % 4 === 0 ? 5.4 : 4.8, headingAt(q));
    }
    const a0 = frame(sampleAt(track, 1.2), side * (limitOf(p) + 0.6), 0);
    const a1 = frame(sampleAt(track, 1.2 + 16 * 0.62), side * (limitOf(p) + 0.6), 0);
    for (const y of [0.4, 2.2, 4.2]) rope(batch, g.iron, a0.clone().setY(a0.y + y), a1.clone().setY(a1.y + y), 0.12);
    // A brazier outside each pillar, on the grid side.
    const fire = frame(sampleAt(track, -4), side * (span + 2.6), 0);
    fire.y = kit.terrain.height(fire.x, fire.z);
    cube(batch, g.stone, xf(fire.x, fire.y + 0.7, fire.z, h), 0.8, 1.4, 0.8);
    batch.geometry(g.iron, new THREE.CylinderGeometry(0.85, 0.45, 0.6, 8, 1, true), xf(fire.x, fire.y + 1.7, fire.z), [1, 1, 1]);
    const tip = fire.clone().setY(fire.y + 2.4);
    for (const turn of [0, Math.PI / 3, (2 * Math.PI) / 3]) batch.geometry(mats.flame, new THREE.PlaneGeometry(1.3, 1.7), xf(tip.x, tip.y, tip.z, turn));
    kit.flames.push(tip.clone().setY(tip.y + 0.5));
    kit.light(tip, new THREE.Color(1.0, 0.5, 0.18).multiplyScalar(1.6), 16, 12, 0.3);
  }
  // The iron arch: an outer and an inner curve, bars between, and a skull and crossbones at the top.
  const curve = (t: number, lift: number) => {
    const ang = Math.PI * (1 - t);
    return frame(p, Math.cos(ang) * (span - 1.1), 7.3 + lift + Math.sin(ang) * 3.2);
  };
  for (let k = 0; k < 18; k++) {
    rope(batch, g.iron, curve(k / 18, 0), curve((k + 1) / 18, 0), 0.22);
    rope(batch, g.iron, curve(k / 18, -1.1), curve((k + 1) / 18, -1.1), 0.14);
    const a = curve(k / 18, 0);
    if (k > 0) rope(batch, g.iron, a, frame(p, Math.cos(Math.PI * (1 - k / 18)) * (span - 1.1), 6.6), 0.08);
  }
  rope(batch, g.iron, frame(p, -(span - 1.1), 6.6), frame(p, span - 1.1, 6.6), 0.2);
  const top = curve(0.5, 0.3);
  skull(kit, xf(top.x, top.y, top.z, h + Math.PI), 1.0, g.bone);
  skull(kit, xf(top.x, top.y, top.z, h), 1.0, g.bone);
  for (const turn of [-0.7, 0.7]) cube(batch, g.bone, xf(top.x, top.y - 0.5, top.z, h, 0, turn), 3.2, 0.32, 0.32);
  // The race banner hangs from the cross bar on two chains.
  const ban = frame(p, 0, 5.2);
  const width = span * 2 - 5;
  batch.geometry(mats.banner, new THREE.PlaneGeometry(width, 1.8), xf(ban.x, ban.y, ban.z, h).multiply(xf(0, 0, 0.05)));
  batch.geometry(mats.banner, new THREE.PlaneGeometry(width, 1.8), xf(ban.x, ban.y, ban.z, h + Math.PI).multiply(xf(0, 0, 0.05)));
  for (const side of [-1, 1]) rope(batch, g.iron, frame(p, side * (width / 2 - 0.4), 6.1), frame(p, side * (width / 2 - 0.4), 6.6), 0.06);

  // The film crew: blue-gelled lights on the gates and a camera crane over the grid.
  const back = grid.length ? Math.min(...grid.map((q) => q.s)) : -40;
  filmLight(kit, kit.ground(...xz(frame(sampleAt(track, 14), -(span + 7), 0))), frame(p, 0, 4));
  filmLight(kit, kit.ground(...xz(frame(sampleAt(track, -22), span + 8, 0))), frame(p, 0, 5));
  filmLight(kit, kit.ground(...xz(frame(sampleAt(track, back - 6), -(span + 6), 0))), frame(sampleAt(track, back + 10), 0, 2));
}

const xz = (v: THREE.Vector3): [number, number] => [v.x, v.z];

/**
 * The crypt under Hangman's Hill: a vaulted stone passage wider than the road, with coffins on shelves, skulls,
 * columns along the barriers and candles, and a columned mausoleum front at each mouth.
 */
function buildCrypt(track: Track, kit: Kit): Pick<SetPieces, 'cryptExit' | 'cryptDir'> {
  const { batch, g } = kit;
  const [a, b] = coverRanges(track, 'tunnel')[0];
  const wall = (p: Sample) => limitOf(p) + 3.2;
  const vault: Profile = (p) => {
    const w = wall(p);
    const pts: [number, number][] = [[-w, -0.6], [-w, 4.4]];
    for (let k = 1; k < 10; k++) {
      const ang = Math.PI * (1 - k / 10);
      pts.push([Math.cos(ang) * w, 4.4 + Math.sin(ang) * 3.4]);
    }
    pts.push([w, 4.4], [w, -0.6]);
    return pts;
  };
  loft(batch, track, a - 3, b + 3, { spacing: 2, vScale: 5, uScale: 5, material: () => g.blocksIndoor, profile: vault });
  for (const side of [-1, 1]) {
    loft(batch, track, a - 3, b + 3, {
      spacing: 2,
      vScale: 4,
      outward: true,
      material: () => g.flags,
      profile: (p) => {
        const edge: [number, number, number][] = [
          [side * limitOf(p), 0.01, 0],
          [side * wall(p), 0.01, 1],
        ];
        return side < 0 ? edge.reverse() : edge;
      },
    });
  }
  for (let s = a + 2, k = 0; s < b - 1; s += 7, k++) {
    loft(batch, track, s, s + 0.9, {
      spacing: 1,
      vScale: 4,
      uScale: 4,
      material: () => g.blocksIndoor,
      color: [0.6, 0.58, 0.62],
      profile: (q) => vault(q, 0).map(([o, hh]) => [o * 0.93, hh * 0.95]),
    });
    const p = sampleAt(track, s + 0.45);
    const h = headingAt(p);
    for (const side of [-1, 1]) {
      column(kit, g.stoneIndoor, frame(p, side * (limitOf(p) + 0.45), -0.05), 4.6, 0.32, [0.7, 0.7, 0.75]);
      if (s + 7 > b - 1) continue;
      // A bay of shelves between this rib and the next: coffins below, skulls above.
      const mid = sampleAt(track, s + 4);
      const mh = headingAt(mid);
      for (const lvl of [0.9, 2.7]) {
        const shelf = frame(mid, side * (wall(mid) - 1.2), lvl);
        cube(batch, g.blocksIndoor, xf(shelf.x, shelf.y, shelf.z, mh), 2.4, 0.25, 5.4, [0.75, 0.75, 0.8]);
        if (lvl < 1) coffin(kit, xf(shelf.x, shelf.y + 0.12, shelf.z, mh + (hash2(k, side, 3) - 0.5) * 0.2), hash2(k, side, 5) < 0.3);
        else {
          for (let i = -3; i <= 3; i++) skull(kit, xf(shelf.x, shelf.y + 0.4, shelf.z, mh - side * Math.PI / 2).multiply(xf(i * 0.72, 0, 0, (hash2(i, k, 7) - 0.5) * 0.6)), 0.3, g.bone);
        }
      }
      const top = frame(mid, side * (wall(mid) - 1.2), 4.2);
      cube(batch, g.blocksIndoor, xf(top.x, top.y, top.z, mh), 2.4, 0.25, 5.4, [0.75, 0.75, 0.8]);
      if ((k + (side > 0 ? 1 : 0)) % 2 === 0) candles(kit, top.clone().setY(top.y + 0.12), mh, 4, true);
      else candles(kit, frame(mid, side * (wall(mid) - 1.2), 1.5).setY(frame(mid, 0, 1.5).y + 0.6), mh, 2, false);
    }
    // An iron cage lantern on a chain from every other rib, to pool light on the road, and cobwebs in the corners.
    if (k % 2 === 0) {
      const top = frame(p, 0, 7.4);
      const lamp = frame(p, 0, 5.2);
      box(batch, g.ironIndoor, 0.1, top.y - lamp.y, 0.1, xf(p.x, (top.y + lamp.y) / 2, p.z, h));
      cube(batch, kit.mats.lantern, xf(lamp.x, lamp.y - 0.4, lamp.z, h), 0.7, 0.9, 0.7);
      kit.light(lamp.clone().setY(lamp.y - 0.9), WARM.clone().multiplyScalar(1.5), 20, 7, 0.16);
      for (const side of [-1, 1]) {
        const at = frame(p, side * (wall(p) - 1.2), 5.6);
        batch.geometry(g.web, new THREE.PlaneGeometry(3, 3), xf(at.x, at.y, at.z, h, 0, side * 0.6));
      }
    }
  }
  for (const [s, out] of [
    [a - 3.6, -1],
    [b + 3.6, 1],
  ] as const) {
    mausoleumFront(kit, track, s, out);
  }
  const exit = sampleAt(track, b + 4);
  return { cryptExit: frame(exit, 0, 4), cryptDir: new THREE.Vector3(exit.tx, 0, exit.tz) };
}

/** The columned front of the crypt round the engine's arch in the hillside. `out` is the way the front faces. */
function mausoleumFront(kit: Kit, track: Track, s: number, out: number): void {
  const { batch, g, mats } = kit;
  const p = sampleAt(track, s);
  const at = (o: number, hh: number, d: number) => {
    const v = frame(p, o, hh);
    return v.add(new THREE.Vector3(p.tx, 0, p.tz).multiplyScalar(out * d));
  };
  const h = headingAt(p) + (out > 0 ? Math.PI : 0);
  const limit = limitOf(p);
  // Voussoirs round the arch opening.
  for (let k = 0; k <= 12; k++) {
    const ang = Math.PI * (1 - k / 12);
    const bulge = Math.sin(ang);
    const o = Math.cos(ang) * (limit + 1.3 * Math.sqrt(bulge)) * 0.96 * 1.06;
    const v = at(o, bulge * TUNNEL_HEIGHT * 0.96 + 0.35, 0.5);
    cube(batch, g.stone, xf(v.x, v.y, v.z, h, 0, Math.cos(ang) * 1.2 * out), 1.3, 1.1, 1.3, [0.82, 0.82, 0.88]);
  }
  for (const side of [-1, 1]) {
    for (const o of [limit + 2.3, limit + 4.6]) column(kit, g.stone, at(side * o, -0.1, 1.2), 9, 0.6, [0.85, 0.85, 0.9]);
    const lamp = at(side * (limit + 1.2), 5.2, 1.0);
    cube(batch, mats.lantern, xf(lamp.x, lamp.y, lamp.z, h), 0.55, 0.8, 0.55);
    kit.light(lamp.clone().addScaledVector(new THREE.Vector3(p.tx, 0, p.tz), out * 1.5), WARM.clone().multiplyScalar(1.2), 13, 8, 0.25);
    jackOLantern(kit, at(side * (limit + 3.4), 0, 3.2), h, 1.1, side > 0);
  }
  const beam = at(0, 9.4, 1.2);
  cube(batch, g.stone, xf(beam.x, beam.y, beam.z, h), 2 * (limit + 5.6), 1.0, 2.2, [0.85, 0.85, 0.9]);
  cube(batch, g.blocks, xf(beam.x, beam.y + 1.0, beam.z, h), 2 * (limit + 5.4), 1.0, 2.0);
  prism(batch, g.stone, xf(beam.x, beam.y + 1.5, beam.z, h), 2 * (limit + 5.8), 4.2, 2.4, [0.85, 0.85, 0.9]);
  skull(kit, xf(beam.x, beam.y + 3.0, beam.z, h).multiply(xf(0, 0, 1.2)), 1.1, g.bone);
  // A stone angel on the apex and urns at the corners.
  angel(kit, at(0, 15.5, 1.2), h, 0.9);
  for (const side of [-1, 1]) {
    const urn = at(side * (limit + 5.4), 10.9, 1.2);
    batch.geometry(g.stone, new THREE.CylinderGeometry(0.5, 0.3, 1.1, 6), xf(urn.x, urn.y + 0.55, urn.z));
  }
  // Steps down to the gravel in front.
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      const st = at(side * (limit + 3.5), 0.15 + k * 0.3 - 0.4, 2.6 - k * 0.6);
      cube(batch, g.flags, xf(st.x, st.y, st.z, h), 5.4, 0.3, 1.2);
    }
  }
}

/**
 * The vampire's lair, on the shortcut: a roofless ruined chapel full of coffins, the vampire's own open one glowing red
 * on a dais, crossed by a narrow stone bridge with a gothic arch where the spider waits.
 */
function buildLair(track: Track, kit: Kit): Pick<SetPieces, 'spiderPivot' | 'lair'> {
  const { batch, g } = kit;
  const route = track.routes[0];
  const ft = route.track;
  const c = sampleAt(ft, SPIDER.s);
  const h = headingAt(c);
  const fwd = new THREE.Vector3(c.tx, 0, c.tz);
  const right = new THREE.Vector3(-c.tz, 0, c.tx);
  const centre = new THREE.Vector3(c.x, 0, c.z);
  const pos = (along: number, across: number) => centre.clone().addScaledVector(fwd, along).addScaledVector(right, across);
  const L = 19;
  const W = 14;

  // Ruined walls, higher away from the bridge, gap-toothed, with lancet windows glowing faintly red.
  const wallRun = (from: THREE.Vector3, to: THREE.Vector3, maxH: number, seed: number) => {
    const len = from.distanceTo(to);
    const n = Math.ceil(len / 3);
    const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
    for (let i = 0; i < n; i++) {
      const v = from.clone().lerp(to, (i + 0.5) / n);
      const gy = kit.terrain.height(v.x, v.z);
      const tall = maxH * (0.7 + 0.3 * hash2(i, seed, 11)) * (hash2(i, seed, 12) < 0.12 ? 0.45 : 1);
      cube(batch, g.blocks, xf(v.x, gy + tall / 2 - 0.4, v.z, yaw), 1.1, tall + 0.8, len / n + 0.02);
      if (i % 3 === 1 && tall > 4) {
        const win = xf(v.x, gy + tall * 0.55, v.z, yaw + Math.PI / 2);
        for (const face of [0, Math.PI]) batch.geometry(g.glass, new THREE.PlaneGeometry(1.2, 2.4), win.clone().multiply(xf(0, 0, 0.56, face).multiply(xf(0, 0, 0))), [1, 0.5, 0.5]);
      }
    }
  };
  wallRun(pos(-L, -W), pos(L, -W), 6.5, 1);
  wallRun(pos(-L, W), pos(L, W), 6.5, 2);
  wallRun(pos(-L, -W), pos(-L, -limitOf(c) - 1.2), 3.2, 3);
  wallRun(pos(-L, limitOf(c) + 1.2), pos(-L, W), 3.2, 4);
  wallRun(pos(L, -W), pos(L, -limitOf(c) - 1.2), 3.2, 5);
  wallRun(pos(L, limitOf(c) + 1.2), pos(L, W), 3.2, 6);
  for (const [al, ac] of [[-L, -W], [L, -W], [-L, W], [L, W]]) {
    const v = pos(al, ac);
    column(kit, g.blocks, v.setY(kit.terrain.height(v.x, v.z) - 0.3), 7.5, 0.9);
  }
  // Flagstone floor.
  const floor = new THREE.PlaneGeometry(2 * L, 2 * W, 10, 7);
  floor.rotateX(-Math.PI / 2);
  const fp = floor.getAttribute('position');
  const fuv = floor.getAttribute('uv');
  for (let i = 0; i < fp.count; i++) {
    const v = pos(fp.getX(i), fp.getZ(i));
    fp.setXYZ(i, v.x, kit.terrain.height(v.x, v.z) + 0.06, v.z);
    fuv.setXY(i, fuv.getX(i) * 7, fuv.getY(i) * 5);
  }
  floor.computeVertexNormals();
  batch.geometry(g.flags, floor);

  // Coffins round the walls, and the vampire's on a dais to the right of the bridge.
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const al = -L + 4 + (Math.floor(i / 2) / 4) * (2 * L - 8);
    const v = pos(al, side * (W - 2.6));
    if (Math.abs(al) < 3 && side > 0) continue;
    const yaw = h + Math.PI / 2 + (hash2(i, 1, 21) - 0.5) * 0.5;
    coffin(kit, xf(v.x, kit.terrain.height(v.x, v.z) + 0.05, v.z, yaw, 0, (hash2(i, 2, 21) - 0.5) * 0.1), hash2(i, 3, 21) < 0.35);
  }
  const dais = pos(0, 9);
  const dy = kit.terrain.height(dais.x, dais.z);
  cube(batch, g.flags, xf(dais.x, dy + 0.3, dais.z, h), 6, 0.6, 4.4);
  cube(batch, g.flags, xf(dais.x, dy + 0.75, dais.z, h), 4.6, 0.4, 3.4);
  coffin(kit, xf(dais.x, dy + 0.95, dais.z, h + Math.PI / 2, 0, 0).multiply(xf(0, 0, 0, 0, 0, 0, 1.35)), true, [0.75, 0.32, 0.42]);
  for (const [al, ac] of [[-2.6, -1.8], [2.6, -1.8], [-2.6, 1.8], [2.6, 1.8]]) {
    const cd = pos(al, 9 + ac);
    const cy = kit.terrain.height(cd.x, cd.z);
    box(batch, g.iron, 0.1, 1.6, 0.1, xf(cd.x, cy + 0.8, cd.z));
    candles(kit, new THREE.Vector3(cd.x, cy + 1.6, cd.z), h, 2, false);
  }
  kit.light(new THREE.Vector3(dais.x, dy + 2.4, dais.z), RED.clone().multiplyScalar(2.2), 16, 1.5, 0.35);
  kit.light(pos(-10, -6).setY(dy + 3), RED.clone().multiplyScalar(1.2), 14, 2, 0.3);
  kit.light(pos(10, -6).setY(dy + 3), RED.clone().multiplyScalar(1.2), 14, 2.2, 0.3);

  // The bridge: parapets along the deck, piers under it, and the arch over the middle.
  const [a, b] = zoneRanges(ft, 'lair').find(([s0, s1]) => s0 > route.rfrom && s1 < route.rto) ?? [SPIDER.s - 25, SPIDER.s + 25];
  for (const side of [-1, 1]) {
    loft(batch, ft, a - 2, b + 6, {
      spacing: 2,
      vScale: 4,
      uScale: 4,
      outward: true,
      material: () => g.blocks,
      profile: (p) => {
        const l = limitOf(p);
        const pts: [number, number][] = [
          [side * l, -1.4],
          [side * l, 0.75],
          [side * (l + 0.7), 0.75],
          [side * (l + 0.7), -1.4],
        ];
        return side < 0 ? pts : pts.reverse();
      },
    });
  }
  loft(batch, ft, a - 2, b + 6, {
    spacing: 3,
    vScale: 4,
    uScale: 4,
    material: () => g.blocks,
    color: [0.6, 0.6, 0.65],
    profile: (p) => [
      [-limitOf(p) - 0.7, -1.4],
      [limitOf(p) + 0.7, -1.4],
    ],
  });
  for (let s = a + 3; s < b + 4; s += 9) {
    const p = sampleAt(ft, s);
    const ph = headingAt(p);
    const top = frame(p, 0, -1.4);
    const gy = kit.terrain.height(top.x, top.z);
    if (top.y - gy < 1) continue;
    for (const side of [-1, 1]) {
      const v = frame(p, side * (limitOf(p) - 0.6), -1.4);
      cube(batch, g.blocks, xf(v.x, (v.y + gy) / 2 - 0.3, v.z, ph), 1.6, v.y - gy + 0.6, 2.2);
    }
  }
  const arch = sampleAt(ft, SPIDER.s);
  const ah = headingAt(arch);
  const span = limitOf(arch) + 0.35;
  for (const side of [-1, 1]) {
    const foot = frame(arch, side * span, 0.75);
    cube(batch, g.stone, xf(foot.x, foot.y + 3.5, foot.z, ah), 1.0, 7, 1.4);
    limb(batch, g.stone, frame(arch, side * span, 7.6), frame(arch, side * 1.2, 10.4), 0.55, 0.45);
    limb(batch, g.stone, frame(arch, side * 1.2, 10.4), frame(arch, 0, 10.9), 0.45, 0.45);
    candles(kit, frame(arch, side * span, 7.1), ah, 3, side < 0, RED);
  }
  skull(kit, xf(...frame(arch, 0, 11.6).toArray(), ah), 0.55, g.bone);
  batch.geometry(g.web, new THREE.PlaneGeometry(7, 6), xf(...frame(arch, 0, 7.4).toArray(), ah));
  // Gargoyle-ish urns and a toppled angel at the secret way in.
  const way = sampleAt(ft, route.rfrom + 112);
  angel(kit, kit.ground(...xz(frame(way, -(limitOf(way) + 3.5), 0))), headingAt(way) + 1.2, 0.8);
  const fallen = frame(way, limitOf(way) + 3, 0);
  fallen.y = kit.terrain.height(fallen.x, fallen.z);
  const fm = xf(fallen.x, fallen.y + 0.4, fallen.z, headingAt(way) + 0.3, Math.PI / 2 - 0.15);
  cube(batch, g.stone, fm, 1.2, 3.2, 1.0);
  for (const side of [-1, 1]) {
    for (const s of [route.rfrom + 112, route.rto - 86]) {
      const q = sampleAt(ft, s);
      const v = frame(q, side * (limitOf(q) + 0.9), 0);
      v.y = Math.min(v.y, kit.terrain.height(v.x, v.z));
      cube(batch, g.blocks, xf(v.x, v.y + 1.6, v.z, headingAt(q)), 1.4, 3.6, 1.4, [0.7, 0.85, 0.7]);
      jackOLantern(kit, v.clone().setY(v.y + 3.4), headingAt(q) - side * 0.4, 0.8, side > 0);
    }
  }
  return { spiderPivot: frame(arch, 0, 10.4), lair: pos(0, 0).setY(dy + 3) };
}

/** The hangman's tree beside the hill road, its great branch reaching over the road with the noose. */
function hangmansTree(track: Track, kit: Kit): THREE.Vector3 {
  const { batch, g, mats } = kit;
  const p = sampleAt(track, NOOSE.s);
  const limit = limitOf(p);
  const base = frame(p, -(limit + 5.5), 0);
  base.y = kit.terrain.height(base.x, base.z) - 0.3;
  const trunk = [base, base.clone().add(new THREE.Vector3(0.6, 4, 0.3)), base.clone().add(new THREE.Vector3(-0.3, 8, -0.4)), frame(p, -(limit + 4.2), 11.5)];
  const r = [1.25, 1.0, 0.85, 0.7];
  for (let i = 0; i < trunk.length - 1; i++) limb(batch, g.bark, trunk[i], trunk[i + 1], r[i], r[i + 1]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const foot = base.clone().add(new THREE.Vector3(Math.cos(a) * 3.2, -0.4, Math.sin(a) * 3.2));
    limb(batch, g.bark, base.clone().setY(base.y + 1.6), foot, 0.7, 0.25);
  }
  const pivot = frame(p, 0, 11.1);
  const crook = frame(p, -(limit + 4.2), 11.5);
  const reach = [crook, frame(p, -limit * 0.5, 12.3), frame(p, 0, 11.9), frame(p, limit * 0.7, 12.6), frame(p, limit + 2.5, 14.2)];
  const rr = [0.7, 0.55, 0.45, 0.35, 0.18];
  for (let i = 0; i < reach.length - 1; i++) limb(batch, g.bark, reach[i], reach[i + 1], rr[i], rr[i + 1]);
  // Twisted crown branches above the crook.
  deadTree(kit, crook.clone().setY(crook.y - 0.5), 12, 2, 0.37);
  const twig = frame(p, limit * 0.4, 12.4);
  limb(batch, g.bark, twig, twig.clone().add(new THREE.Vector3(0.6, 2.4, 1.2)), 0.18, 0.06);
  // A lantern hung from the branch, and crows on it.
  const hook = frame(p, -limit * 0.65, 12.2);
  rope(batch, mats.rope, hook, hook.clone().setY(hook.y - 1.8), 0.05);
  cube(batch, mats.lantern, xf(hook.x, hook.y - 2.2, hook.z, headingAt(p)), 0.45, 0.65, 0.45);
  kit.light(hook.clone().setY(hook.y - 2.4), WARM.clone().multiplyScalar(1.2), 16, 6, 0.2);
  for (const o of [-limit * 0.2, limit * 0.9]) {
    const c = frame(p, o, o > 0 ? 13.3 : 12.6);
    batch.geometry(g.iron, new THREE.OctahedronGeometry(0.45), xf(c.x, c.y + 0.35, c.z, 0, 0, 0, 1, 0.8, 1.4));
    batch.geometry(g.iron, new THREE.OctahedronGeometry(0.25), xf(c.x, c.y + 0.85, c.z - 0.4));
  }
  // A heap of skulls and a gravestone at the foot.
  for (let i = 0; i < 6; i++) {
    const v = base.clone().add(new THREE.Vector3((hash2(i, 1, 31) - 0.5) * 3, 0.5 + (i > 3 ? 0.4 : 0), (hash2(i, 2, 31) - 0.5) * 3));
    skull(kit, xf(v.x, v.y, v.z, hash2(i, 3, 31) * 6), 0.35);
  }
  jackOLantern(kit, frame(p, limit + 2.2, 0), headingAt(p) - 0.6, 1.3, true);
  return pivot;
}

/** The kicker over the crypt's roof: a stone causeway with walls down into the hill and parapets. */
function crest(track: Track, kit: Kit): void {
  const { batch, g } = kit;
  const s0 = NOOSE.s + 25;
  const s1 = NOOSE.s + 78;
  let lip = s0;
  for (let s = s0, best = -Infinity; s < s1; s += 0.5) {
    const y = sampleAt(track, s).y;
    if (y > best) {
      best = y;
      lip = s;
    }
  }
  for (const side of [-1, 1]) {
    loft(batch, track, lip - 22, lip + 18, {
      spacing: 1.5,
      vScale: 4,
      uScale: 4,
      outward: true,
      material: () => g.blocks,
      profile: (p) => {
        const l = limitOf(p);
        const pts: [number, number][] = [
          [side * l, -4.5],
          [side * l, 0.6],
          [side * (l + 0.8), 0.6],
          [side * (l + 0.8), -4.5],
        ];
        return side < 0 ? pts : pts.reverse();
      },
    });
  }
  const p = sampleAt(track, lip);
  for (const side of [-1, 1]) {
    const v = frame(p, side * (limitOf(p) + 0.4), 0.6);
    for (const turn of [0, Math.PI / 2]) batch.geometry(kit.mats.flame, new THREE.PlaneGeometry(0.8, 1.3), xf(v.x, v.y + 0.7, v.z, turn));
    kit.flames.push(v.clone().setY(v.y + 1.0));
    kit.light(v.clone().setY(v.y + 1.2), new THREE.Color(1, 0.5, 0.2).multiplyScalar(1.4), 12, 12, 0.3);
  }
}

/** The boardwalk across the pond: pilings, rope rails, lanterns, a jetty with the skeleton angler, reeds and pads. */
function boardwalk(track: Track, kit: Kit): Pick<SetPieces, 'angler' | 'float'> {
  const { batch, g, mats, rng } = kit;
  const [a, b] = zoneRanges(track, 'pond')[0];
  let last: THREE.Vector3[] = [];
  for (let s = a, k = 0; s <= b + 0.1; s += 4, k++) {
    const p = sampleAt(track, s);
    const h = headingAt(p);
    const limit = limitOf(p);
    const rails: THREE.Vector3[] = [];
    for (const side of [-1, 1]) {
      const deck = frame(p, side * (limit - 0.15), 0);
      if (k % 2 === 0) box(batch, mats.planks, 0.45, deck.y + 2.6, 0.45, xf(deck.x, (deck.y - 2.6) / 2 - 0.2, deck.z, h));
      box(batch, mats.planks, 0.18, 1.3, 0.18, xf(deck.x, deck.y + 0.65, deck.z, h));
      rails.push(deck.clone().setY(deck.y + 1.15), deck.clone().setY(deck.y + 0.6));
      if (k % 4 === (side < 0 ? 1 : 3)) {
        const pole = frame(p, side * (limit + 0.15), 0);
        box(batch, mats.planks, 0.2, 2.8, 0.2, xf(pole.x, pole.y + 1.4, pole.z, h));
        cube(batch, mats.lantern, xf(pole.x, pole.y + 3.1, pole.z, h), 0.45, 0.6, 0.45);
        kit.light(pole.clone().setY(pole.y + 3), WARM.clone(), 12, 7, 0.2);
      }
    }
    if (last.length) for (let i = 0; i < 4; i++) rope(batch, mats.rope, last[i], rails[i], i % 2 ? 0.05 : 0.07);
    last = rails;
    if (k % 2 === 0) {
      const mid = frame(p, 0, -0.55);
      box(batch, mats.planks, limit * 2, 0.3, 0.35, xf(mid.x, mid.y, mid.z, h));
    }
  }
  // The jetty, off to the pond side, with the angler at its end on a barrel.
  const js = a + (b - a) * 0.42;
  const p = sampleAt(track, js);
  const h = headingAt(p);
  const toward = new THREE.Vector3(POND.x - p.x, 0, POND.z - p.z);
  const side = toward.x * -p.tz + toward.z * p.tx > 0 ? 1 : -1;
  const limit = limitOf(p);
  for (let o = limit + 0.6; o < limit + 9; o += 1.2) {
    const v = frame(p, side * o, -0.2);
    box(batch, mats.planks, 1.1, 0.16, 3.2, xf(v.x, v.y, v.z, h + (hash2(Math.round(o * 10), 1, 41) - 0.5) * 0.06));
  }
  for (const o of [limit + 3, limit + 8.4]) {
    for (const along of [-1.4, 1.4]) {
      const v = frame(sampleAt(track, js + along), side * o, -0.3);
      box(batch, mats.planks, 0.3, v.y + 2.4, 0.3, xf(v.x, (v.y - 2.4) / 2, v.z, h));
    }
  }
  const seat = frame(p, side * (limit + 7.6), -0.1);
  const face = h - side * Math.PI / 2;
  batch.geometry(mats.barrel, new THREE.CylinderGeometry(1.1, 1.1, 2.4, 8), xf(seat.x, seat.y + 1.2, seat.z));
  const lamp = frame(p, side * (limit + 8.4), -0.1).add(new THREE.Vector3(p.tx, 0, p.tz).multiplyScalar(1.2));
  cube(batch, mats.lantern, xf(lamp.x, lamp.y + 0.3, lamp.z, h), 0.4, 0.55, 0.4);
  kit.light(lamp.clone().setY(lamp.y + 1.2), WARM.clone().multiplyScalar(1.3), 11, 7, 0.25);
  batch.geometry(g.iron, new THREE.CylinderGeometry(0.35, 0.28, 0.5, 8, 1, true), xf(lamp.x - p.tx * 2.2, lamp.y + 0.25, lamp.z - p.tz * 2.2));
  const angler = xf(seat.x, seat.y + 2.4, seat.z, face);
  const float = new THREE.Vector3(0, 0, -15).applyMatrix4(xf(seat.x, 0, seat.z, face)).setY(0.05);

  // Reeds round the shore, lily pads on the water.
  for (let i = 0; i < 160; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 0.7 + rng() * 0.45;
    const x = POND.x + Math.cos(ang) * POND.rx * rad;
    const z = POND.z + Math.sin(ang) * POND.rz * rad;
    const d = pondDepth(x, z);
    if (!kit.clear(x, z, 1.2)) continue;
    if (d > 0.05 && d < 0.75) {
      const y = Math.max(0, kit.terrain.height(x, z));
      const sz = 1 + rng() * 0.8;
      for (const turn of [0, Math.PI / 2]) batch.geometry(g.weeds, new THREE.PlaneGeometry(1.6 * sz, 1.6 * sz), xf(x, y + 0.75 * sz, z, rng() + turn), [0.7, 0.9, 0.7]);
    } else if (d >= 0.75 && rng() < 0.6) {
      const pad = new THREE.CircleGeometry(0.6 + rng() * 0.5, 7, 0.4, Math.PI * 1.8);
      pad.rotateX(-Math.PI / 2);
      batch.geometry(g.grass, pad, xf(x, 0.06, z, rng() * 6), [1.4, 1.9, 1.3]);
    }
  }
  return { angler, float };
}
