import * as THREE from 'three';
import { routeTrack } from '../../../shared/course';
import { hazardAt, type Hazard } from '../../../shared/hazards';
import { sampleAt, type Track } from '../../../shared/track';
import { boulder, xf, type Batch } from '../../render/geometry';
import { smoothstep } from '../../render/noise';
import { dynamicLight } from '../../render/ps1';
import { frame, headingAt } from '../../render/road';
import { cart } from './dig';
import { block, part } from './kit';
import type { LavaMats } from './materials';
import { LAVA_LIGHT } from './util';

export interface Rig {
  flames: THREE.Vector3[];
  update(clock: number, time: number): void;
}

const ORE = new THREE.Color(1, 0.5, 0.18);

/**
 * The runaway mine cart: a hoist at the top of the climb lowers a cart of molten ore onto the rails, it rocks, then
 * breaks loose and thunders down against the traffic into a buffer at the bottom.
 */
export function cartRig(track: Track, h: Hazard, batch: Batch, m: LavaMats, group: THREE.Group): Rig {
  const t = routeTrack(track, h.route);
  const end = h.s + h.reach;
  const dir = Math.sign(h.reach);
  // Rails on sleepers from the hoist to the buffer.
  for (let s = Math.min(h.s, end) - 4; s <= Math.max(h.s, end) + 4; s += 1.4) {
    const p = sampleAt(t, s);
    const q = sampleAt(t, s + 1.4);
    batch.beam(m.timberIn, frame(p, h.offset - 1.1, 0.04), frame(p, h.offset + 1.1, 0.04), 0.3, 0.1);
    for (const d of [-0.7, 0.7]) batch.beam(m.steelIn, frame(p, h.offset + d, 0.16), frame(q, h.offset + d, 0.16), 0.12, 0.14);
  }
  // The buffer stop at the bottom: a timber frame packed with sandbags.
  const bp = sampleAt(t, end + dir * 2.6);
  const by = headingAt(bp);
  const buffer = frame(bp, h.offset, 0);
  batch.box(m.timberIn, 2.8, 0.5, 0.5, xf(buffer.x, buffer.y + 1.0, buffer.z, by));
  for (const d of [-1.2, 1.2]) {
    const post = frame(bp, h.offset + d, 0);
    batch.box(m.timberIn, 0.4, 1.6, 0.4, xf(post.x, post.y + 0.8, post.z, by));
  }
  block(batch, m.kitIn, 2.6, 0.9, 0.5, xf(buffer.x, buffer.y + 1.0, buffer.z, by), 'stripes');
  // The hoist at the top: two legs, a beam over the rails, a chain and a pulley.
  const hp = sampleAt(t, h.s);
  const hy = headingAt(hp);
  const top = 6.2;
  for (const d of [-2.2, 2.2]) {
    const foot = frame(hp, h.offset + d, 0);
    batch.beam(m.timberIn, foot, foot.clone().setY(foot.y + top), 0.4);
  }
  const l = frame(hp, h.offset - 2.6, top);
  const r = frame(hp, h.offset + 2.6, top);
  batch.beam(m.timberIn, l, r, 0.5);
  const pulley = frame(hp, h.offset, top - 0.5);
  block(batch, m.kitIn, 0.5, 0.8, 0.8, xf(pulley.x, pulley.y, pulley.z, hy), 'black');

  const body = part((b) => {
    cart(b, m, xf(0, 0, 0, 0, 0, 0, 1.4), m.kitIn);
    b.geometry(m.lava, boulder(5, 2.1, 0.45), xf(0, 2.5, 0));
  });
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), m.steelIn);
  group.add(body, chain);
  const flames = [new THREE.Vector3(), new THREE.Vector3()];
  const away = new THREE.Vector3(0, -999, 0);

  return {
    flames,
    update(clock, time) {
      const at = hazardAt(track, h, clock);
      const p = sampleAt(t, at.s);
      const yaw = headingAt(p) + (dir < 0 ? Math.PI : 0);
      body.visible = true;
      chain.visible = false;
      let lift = 0;
      let pitch = Math.atan(p.grade) * -dir;
      let roll = 0;
      if (at.live) {
        roll = Math.sin(time * 30) * 0.03;
      } else if (at.t < h.duty + 0.08) {
        // Smashed into the buffer: it rears up and spills.
        const k = (at.t - h.duty) / 0.08;
        pitch -= Math.sin(k * Math.PI) * 0.5;
        lift = Math.sin(k * Math.PI) * 0.8;
      } else if (at.t < 0.62) {
        body.visible = false;
      } else {
        // Lowered by the hoist, then rocking against its brake before it breaks loose.
        const down = smoothstep(0.62, 0.8, at.t);
        lift = (1 - down) * (top - 3.4);
        const rock = smoothstep(0.84, 1, at.t);
        pitch += Math.sin(time * 14) * 0.06 * rock;
        chain.visible = down < 1;
        chain.position.set(pulley.x, (pulley.y + p.y + lift + 3.2) / 2, pulley.z);
        chain.scale.y = Math.max(0.1, pulley.y - (p.y + lift + 3.2));
      }
      const atStart = !at.live && at.t >= 0.62;
      const q = atStart ? hp : p;
      const pos = atStart ? frame(hp, h.offset, 0) : new THREE.Vector3(at.x, at.y, at.z);
      body.position.set(pos.x, pos.y + lift, pos.z);
      body.rotation.set(pitch, atStart ? headingAt(q) + (dir < 0 ? Math.PI : 0) : yaw, roll, 'YXZ');
      if (body.visible) {
        flames[0].set(pos.x, pos.y + lift + 3, pos.z);
        flames[1].set(pos.x + 0.6, pos.y + lift + 2.8, pos.z - 0.4);
        dynamicLight(pos.x, pos.y + lift + 3.5, pos.z, ORE, at.live ? 2.2 : 1.4, 14);
      } else {
        flames[0].copy(away);
        flames[1].copy(away);
      }
    },
  };
}

/**
 * The lava geyser: a crusted vent in the road that glows and spits as it builds, then blasts a column of lava. Its
 * live share is the column; the build-up is the warning.
 */
export function geyserRig(track: Track, h: Hazard, batch: Batch, m: LavaMats, group: THREE.Group): Rig {
  const t = routeTrack(track, h.route);
  const at = hazardAt(track, h, 0);
  const p = sampleAt(t, h.s);
  const yaw = headingAt(p);
  // A ring of crusted rock round the vent, low enough to drive over, and the glowing crack inside it.
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const r = h.radius + 0.3;
    batch.geometry(m.rubbleOut, boulder(40 + k, 1.2, 0.35), xf(at.x + Math.cos(a) * r, at.y + 0.05, at.z + Math.sin(a) * r, a));
  }
  const crack = new THREE.Mesh(new THREE.CircleGeometry(h.radius, 10), m.lava);
  crack.rotation.set(-Math.PI / 2, 0, yaw);
  crack.position.set(at.x, at.y + 0.06, at.z);
  const spout = new THREE.Group();
  for (const a of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(h.radius * 1.6, 1), m.spout);
    plane.position.y = 0.5;
    plane.rotation.y = a;
    spout.add(plane);
  }
  spout.position.set(at.x, at.y, at.z);
  const blobs = Array.from({ length: 6 }, () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), m.lava));
  group.add(crack, spout, ...blobs);
  const flames = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const tall = h.height + 4;

  return {
    flames,
    update(clock, time) {
      const state = hazardAt(track, h, clock);
      const build = state.live ? 1 : smoothstep(0.7, 1, state.t);
      const blast = state.live ? Math.min(1, state.t / 0.04) * (1 - smoothstep(h.duty * 0.75, h.duty, state.t)) : 0;
      const height = state.live ? tall * blast : build * 1.2 * (0.6 + 0.4 * Math.sin(time * 23));
      spout.visible = height > 0.15;
      spout.scale.set(state.live ? 1 : 0.5, Math.max(0.01, height), state.live ? 1 : 0.5);
      spout.rotation.y = time * 2;
      m.lavaVent.uniforms.uGlow.value = 0.2 + build * 1.4;
      crack.material = build > 0.05 ? m.lavaVent : m.lava;
      blobs.forEach((b, i) => {
        const phase = (time * 0.9 + i / blobs.length) % 1;
        const a = i * 2.4;
        const up = state.live ? phase * tall * 0.9 : 0;
        b.visible = state.live && blast > 0.3;
        b.position.set(at.x + Math.cos(a) * phase * 3, at.y + up - phase * phase * 6, at.z + Math.sin(a) * phase * 3);
      });
      const glow = state.live ? 3.5 * blast : build * 1.6;
      dynamicLight(at.x, at.y + 2 + height * 0.4, at.z, LAVA_LIGHT, glow, 22);
      flames.forEach((f, i) => f.set(at.x + Math.cos(i * 2.1) * 0.8, at.y + 0.4 + height * (0.3 + i * 0.3), at.z + Math.sin(i * 2.1) * 0.8));
    },
  };
}
