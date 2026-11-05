import * as THREE from 'three';
import { Batch, ball, taper, xf, type RGB } from '../../render/geometry';
import type { Materials } from '../../render/materials';
import { addPointLight, type PointLight } from '../../render/ps1';
import { box } from '../../render/road';
import { LAND } from './ground';
import { container, filmLight, PAINT, part } from './kit';
import { lamp, skin, type Looks } from './look';

interface Beast {
  root: THREE.Group;
  /** Where it stands and which way it faces, and when in its fight it is. */
  x: number;
  z: number;
  yaw: number;
  phase: number;
  /** The moving part: an ant's legs, a raptor's head. */
  limb: THREE.Group;
  kind: 'ant' | 'raptor';
}

/** A giant ant, facing -z: abdomen, thorax, head and mandibles in one piece, and six legs that rock together. */
function ant(looks: Looks, scale: number): { root: THREE.Group; limb: THREE.Group } {
  const m = looks.creature;
  const body = part((b) => {
    b.geometry(m, skin(ball(1.7, 1, 0.9, 1.5, 8), 'chitin'), xf(0, 1.9, 3));
    b.geometry(m, skin(ball(0.95, 0.9, 0.85, 1.3, 7), 'chitin'), xf(0, 2, 0.3));
    b.geometry(m, skin(ball(1.05, 1.15, 0.85, 1, 7), 'chitin'), xf(0, 2.4, -2));
    for (const side of [-1, 1]) {
      b.geometry(m, skin(new THREE.ConeGeometry(0.28, 1.7, 5), 'bone'), xf(side * 0.55, 2.1, -3.3, side * 0.5, -1.45));
      b.beam(m, new THREE.Vector3(side * 0.5, 3, -2.6), new THREE.Vector3(side * 1.2, 4.2, -3.6), 0.09, 0.09);
      b.beam(m, new THREE.Vector3(side * 1.2, 4.2, -3.6), new THREE.Vector3(side * 1.5, 3.7, -4.6), 0.07, 0.07);
      b.geometry(looks.glow, lamp(new THREE.BoxGeometry(0.1, 0.4, 0.4), 'apeEye'), xf(side * 1.1, 2.7, -2.4));
    }
  });
  const limb = part((b) => {
    for (const side of [-1, 1]) {
      for (const z of [-0.7, 0.3, 1.3]) {
        const hip = new THREE.Vector3(side * 0.7, 2, z);
        const knee = new THREE.Vector3(side * 2.6, 3, z + (z - 0.3) * 1.4);
        const foot = new THREE.Vector3(side * 3.8, 0, z + (z - 0.3) * 2.2);
        b.beam(m, hip, knee, 0.26, 0.26);
        b.beam(m, knee, foot, 0.2, 0.2);
      }
    }
  });
  limb.position.y = 2;
  limb.children.forEach((c) => (c.position.y = -2));
  const root = new THREE.Group();
  root.add(body, limb);
  root.scale.setScalar(scale);
  return { root, limb };
}

/** A raptor, facing -z: body, tail and legs in one piece, and a head on a pivot that snaps. */
function raptor(looks: Looks, scale: number): { root: THREE.Group; limb: THREE.Group } {
  const m = looks.creature;
  const body = part((b) => {
    b.geometry(m, skin(ball(1.05, 0.85, 0.95, 1.7, 8), 'raptor'), xf(0, 3, 0, 0, 0.2));
    b.geometry(m, skin(ball(0.6, 0.8, 0.8, 1.5, 7), 'raptor'), xf(0, 3.8, -1.7, 0, -0.65));
    for (let k = 0; k < 5; k++) {
      b.geometry(m, skin(ball(0.62 - k * 0.1, 1, 1, 1.5, 6), 'raptor'), xf(Math.sin(k * 0.7) * 0.2 * k, 2.9 + k * 0.1, 1.9 + k * 1), [0.95 - k * 0.04, 0.95, 0.85]);
    }
    for (const side of [-1, 1]) {
      b.geometry(m, skin(ball(0.6, 0.9, 1.3, 1.1, 6), 'raptor'), xf(side * 0.7, 2.3, 0.3));
      b.beam(m, new THREE.Vector3(side * 0.75, 1.6, 0.5), new THREE.Vector3(side * 0.8, 0.7, 1.1), 0.3, 0.3);
      b.beam(m, new THREE.Vector3(side * 0.8, 0.7, 1.1), new THREE.Vector3(side * 0.8, 0.1, 0.5), 0.26, 0.26);
      b.geometry(m, skin(new THREE.BoxGeometry(0.5, 0.16, 1.1), 'bone'), xf(side * 0.8, 0.08, 0.1));
      b.geometry(m, skin(new THREE.ConeGeometry(0.1, 0.8, 4), 'bone'), xf(side * 0.8, 0.45, -0.3, 0, -0.6));
      b.beam(m, new THREE.Vector3(side * 0.5, 3.3, -1.4), new THREE.Vector3(side * 0.7, 2.7, -2.1), 0.14, 0.14);
    }
    b.geometry(m, skin(new THREE.ConeGeometry(0.3, 1.2, 4), 'fin'), xf(0, 4.1, 0.1, 0, 0.3));
    b.geometry(m, skin(new THREE.ConeGeometry(0.25, 1, 4), 'fin'), xf(0, 3.9, 1.4, 0, 0.3));
  });
  const limb = part((b) => {
    b.geometry(m, skin(taper(0.9, 1.9, 0.5, 1.3, 0.55, -0.1), 'raptor'), xf(0, 0, -0.9));
    b.geometry(m, skin(new THREE.BoxGeometry(0.72, 0.16, 1.5), 'gum'), xf(0, -0.1, -0.95));
    b.geometry(m, skin(taper(0.7, 1.5, 0.5, 1.2, 0.26), 'raptor'), xf(0, -0.45, -0.85), [0.75, 0.8, 0.65]);
    for (const side of [-1, 1]) {
      b.geometry(looks.glow, lamp(new THREE.BoxGeometry(0.1, 0.18, 0.26), 'eye'), xf(side * 0.42, 0.3, -0.4));
      for (let k = 0; k < 3; k++) {
        b.geometry(m, skin(new THREE.ConeGeometry(0.08, 0.32, 4), 'bone'), xf(side * 0.3, -0.27, -0.4 - k * 0.42, 0, Math.PI));
      }
    }
  });
  limb.position.set(0, 4.25, -2.4);
  const root = new THREE.Group();
  root.add(body, limb);
  root.scale.setScalar(scale);
  return { root, limb };
}

/** Giant ants fighting the raptors that broke out of a smashed cage, in the open ground beside the home straight. */
export function paddock(batch: Batch, mats: Materials, looks: Looks): { group: THREE.Group; lights: PointLight[]; update(time: number): void } {
  const group = new THREE.Group();
  const beasts: Beast[] = [];
  const pairs: [number, number, number, number][] = [
    [-100, -35, Math.PI / 2 + 0.25, 2],
    [-52, -30, Math.PI / 2 - 0.3, 2.3],
    [-8, -36, -Math.PI / 2 + 0.2, 2],
  ];
  pairs.forEach(([x, z, yaw, scale], i) => {
    const dx = -Math.sin(yaw) * 5.2 * scale;
    const dz = -Math.cos(yaw) * 5.2 * scale;
    const a = ant(looks, scale);
    a.root.position.set(x + dx, LAND, z + dz);
    a.root.rotation.y = yaw + Math.PI;
    beasts.push({ root: a.root, x: x + dx, z: z + dz, yaw: yaw + Math.PI, phase: i * 2.1, limb: a.limb, kind: 'ant' });
    const r = raptor(looks, scale * 1.1);
    r.root.position.set(x - dx * 0.3, LAND, z - dz * 0.3);
    r.root.rotation.y = yaw;
    beasts.push({ root: r.root, x: x - dx * 0.3, z: z - dz * 0.3, yaw, phase: i * 2.1 + 0.8, limb: r.limb, kind: 'raptor' });
  });
  for (const b of beasts) group.add(b.root);

  // The smashed cage: bent bars, a burst door, and the scorched crate it came in.
  const cage = xf(-42, LAND, 2, 0.5);
  const local = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => cage.clone().multiply(xf(x, y, z, ry, rx, rz));
  batch.geometry(looks.plate, new THREE.BoxGeometry(22, 0.5, 14), local(0, 0.25, 0), [0.35, 0.35, 0.38]);
  batch.geometry(looks.plate, new THREE.BoxGeometry(22, 0.4, 14), local(0, 8, 0, 0, 0.08, -0.05), [0.35, 0.35, 0.38]);
  for (let k = 0; k <= 14; k++) {
    const x = -11 + k * (22 / 14);
    const bent = k > 4 && k < 9;
    for (const z of [-7, 7]) {
      if (bent && z < 0) {
        const top = new THREE.Vector3(x, 7.9, z).applyMatrix4(cage);
        const mid = new THREE.Vector3(x + (k - 6.5) * 0.9, 3.8, z - 2.4).applyMatrix4(cage);
        const foot = new THREE.Vector3(x, 0.4, z).applyMatrix4(cage);
        batch.beam(mats.metal, foot, mid, 0.22, 0.22, [0.45, 0.42, 0.38]);
        batch.beam(mats.metal, mid, top, 0.22, 0.22, [0.45, 0.42, 0.38]);
      } else {
        box(batch, mats.metal, 0.22, 7.6, 0.22, local(x, 4.1, z), [0.45, 0.42, 0.38]);
      }
    }
  }
  for (const x of [-11, 11]) {
    for (let z = -7; z <= 7; z += 2) box(batch, mats.metal, 0.22, 7.6, 0.22, local(x, 4.1, z), [0.45, 0.42, 0.38]);
  }
  container(batch, looks, local(14, 0.1, 9, 0.9, 0, 0.2), PAINT[3]);
  // Toppled containers and a film light on the fight: the studio showing through.
  for (const [x, z, yaw, tone] of [
    [-92, 8, 0.4, 0],
    [-70, 22, 1.8, 2],
    [-14, 12, 2.6, 5],
    [8, 30, 0.9, 1],
    [-108, 30, 2.2, 3],
  ] as const) {
    container(batch, looks, xf(x, LAND + 1.2, z, yaw, 0, 1.2), PAINT[tone]);
  }
  const rig = new THREE.Vector3(-30, LAND, -43.5);
  filmLight(batch, mats, looks, rig, new THREE.Vector3(-52, LAND + 5, -30));
  const lights = pairs.map(([x, z]) => addPointLight(new THREE.Vector3(x, LAND + 9, z - 9), new THREE.Color(1, 0.72, 0.5).multiplyScalar(1.1), 30));
  return {
    group,
    lights,
    update(time) {
      for (const b of beasts) {
        const t = time * (b.kind === 'ant' ? 2.4 : 3) + b.phase;
        const lunge = Math.max(0, Math.sin(t)) ** 2;
        const f = (b.kind === 'ant' ? 1.1 : 1.8) * lunge;
        b.root.position.x = b.x - Math.sin(b.yaw) * f;
        b.root.position.z = b.z - Math.cos(b.yaw) * f;
        if (b.kind === 'ant') {
          b.root.rotation.x = -0.14 * lunge;
          b.limb.rotation.z = 0.1 * Math.sin(time * 15 + b.phase);
        } else {
          b.root.position.y = LAND + 0.7 * lunge;
          b.root.rotation.x = 0.22 * lunge - 0.05;
          b.limb.rotation.x = -0.45 + 0.5 * Math.abs(Math.sin(time * 6 + b.phase));
        }
      }
    },
  };
}

const coneColours = (g: THREE.BufferGeometry, top: RGB, bottom: RGB): THREE.BufferGeometry => {
  const pos = g.getAttribute('position');
  const hit = pos.count;
  const col: number[] = [];
  g.computeBoundingBox();
  const box3 = g.boundingBox as THREE.Box3;
  for (let i = 0; i < hit; i++) {
    const f = (pos.getY(i) - box3.min.y) / (box3.max.y - box3.min.y);
    col.push(bottom[0] + (top[0] - bottom[0]) * f, bottom[1] + (top[1] - bottom[1]) * f, bottom[2] + (top[2] - bottom[2]) * f);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
};

/** The Martian ship, hovering over the yard: a slow-turning saucer, a ring of chasing lights and a pulsing tractor beam. */
export function saucer(looks: Looks, x: number, z: number): { group: THREE.Group; lights: PointLight[]; update(time: number): void } {
  const height = 42;
  const m = looks.creature;
  const hull = part((b) => {
    const rim: [number, number][] = [
      [0, -3.2],
      [5, -3.1],
      [7, -2],
      [15, -0.5],
      [17.5, 0.3],
      [15, 1.2],
      [8, 2.6],
      [5.5, 3.6],
    ];
    b.geometry(m, skin(new THREE.LatheGeometry(rim.map(([r, y]) => new THREE.Vector2(r, y)), 14), 'ufo'));
    b.geometry(m, skin(new THREE.SphereGeometry(5.6, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), 'wing'), xf(0, 3.3, 0), [0.45, 0.95, 0.75]);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.geometry(m, skin(new THREE.BoxGeometry(5, 0.5, 1), 'iron'), xf(Math.cos(a) * 11, -1.3, Math.sin(a) * 11, -a));
    }
  });
  const ring = part((b) => {
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const tile = k % 2 ? 'green' : 'magenta';
      b.geometry(looks.glow, lamp(new THREE.BoxGeometry(1.1, 0.5, 1.1), tile), xf(Math.cos(a) * 16.4, 0.15, Math.sin(a) * 16.4, -a));
    }
  });
  const craft = new THREE.Group();
  craft.add(hull, ring);
  craft.position.set(x, LAND + height, z);

  const beamHeight = height - 3;
  const beamGeometry = coneColours(new THREE.CylinderGeometry(3.6, 11, beamHeight, 14, 3, true), [0.6, 1.2, 0.8], [0.12, 0.42, 0.25]);
  const uv = beamGeometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 3);
  const beam = new THREE.Mesh(beamGeometry, looks.tractor);
  beam.position.set(x, LAND + beamHeight / 2, z);
  beam.renderOrder = 3;

  const b0 = new Batch();
  container(b0, looks, xf(0, -1.3, 0, 0.3), PAINT[4]);
  const cargo = new THREE.Group();
  for (const mesh of b0.meshes()) cargo.add(mesh);
  cargo.position.set(x, LAND + 18, z);

  const pad = addPointLight(new THREE.Vector3(x, LAND + 7, z), new THREE.Color(0.3, 1, 0.5), 38);
  const group = new THREE.Group();
  group.add(craft, beam, cargo);
  return {
    group,
    lights: [pad],
    update(time) {
      hull.rotation.y = time * 0.25;
      ring.rotation.y = -time * 1.4;
      craft.position.y = LAND + height + 1.2 * Math.sin(time * 0.7);
      craft.rotation.z = 0.05 * Math.sin(time * 0.5);
      craft.rotation.x = 0.05 * Math.cos(time * 0.37);
      const pulse = 0.65 + 0.35 * Math.sin(time * 4.2);
      looks.tractor.uniforms.uTint.value.setScalar(0.6 + 0.7 * pulse);
      pad.color.setRGB(0.3, 1, 0.5).multiplyScalar(0.5 + 1.2 * pulse);
      cargo.rotation.y = time * 0.5;
      cargo.rotation.z = 0.2 * Math.sin(time * 0.8);
      cargo.position.y = LAND + 16 + 6 * Math.sin(time * 0.45);
    },
  };
}
