import * as THREE from 'three';
import { hazardAt, type HazardState } from '../../../shared/hazards';
import { NOOSE, SPIDER } from '../../../shared/tracks/graveyard';
import type { Track } from '../../../shared/track';
import { ball, Batch, xf } from '../../render/geometry';
import { hash2 } from '../../render/noise';
import { dynamicLight } from '../../render/ps1';
import { MOON_SKY, POND } from './ground';
import { cube, type Kit, limb, skull } from './kit';
import type { SetPieces } from './structures';

export interface Life {
  update(time: number, dt: number, clock: number, camera: THREE.Camera): void;
}

const BATS = 44;
const GHOSTS = 5;
const WISPS = 6;
/** How much bigger than life the skeleton angler is, so he reads from the road. */
const GIANT = 2.2;
const UP = new THREE.Vector3(0, 1, 0);

/** One mesh of many quads rewritten every frame, so a flock costs a single draw call. */
class Flock {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  private cursor = 0;

  constructor(quads: number, material: THREE.Material, uvs: (quad: number) => [number, number, number, number]) {
    this.pos = new Float32Array(quads * 12);
    const uv = new Float32Array(quads * 8);
    const col = new Float32Array(quads * 12).fill(1);
    const nor = new Float32Array(quads * 12);
    const index: number[] = [];
    for (let q = 0; q < quads; q++) {
      const [u0, v0, u1, v1] = uvs(q);
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
      for (let i = 0; i < 4; i++) nor[q * 12 + i * 3 + 1] = 1;
      index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
    }
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(index);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }

  begin(): void {
    this.cursor = 0;
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void {
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z], this.cursor * 12);
    this.cursor++;
  }

  end(): void {
    this.pos.fill(0, this.cursor * 12);
    this.attr.needsUpdate = true;
  }
}

/** A mesh built once from a private batch of static parts, for a set piece that moves as one. */
function solid(fill: (batch: Batch) => void): THREE.Object3D {
  const batch = new Batch(null);
  fill(batch);
  const group = new THREE.Group();
  for (const m of batch.meshes()) {
    m.matrixAutoUpdate = true;
    m.frustumCulled = false;
    group.add(m);
  }
  return group;
}

/** Everything that moves: the moon, bats, ghosts, wisps, the noose, the spider and the skeleton's rod. */
export function buildLife(track: Track, kit: Kit, group: THREE.Group, pieces: SetPieces): Life {
  const moon = buildMoon(kit, group);
  const bats = buildBats(kit, group, pieces);
  const ghosts = buildGhosts(kit, group, pieces);
  const wisps = buildWisps(kit, group);
  const noose = buildNoose(track, kit, group, pieces);
  const spider = buildSpider(track, kit, group, pieces);
  const angler = buildAngler(kit, group, pieces);
  return {
    update(time, _dt, clock, camera) {
      moon(camera);
      bats(time, camera);
      ghosts(time, camera);
      wisps(time, camera);
      noose(clock);
      spider(clock);
      angler(time);
    },
  };
}

function buildMoon(kit: Kit, group: THREE.Group): (camera: THREE.Camera) => void {
  const { g } = kit;
  const dir = new THREE.Vector3(...MOON_SKY).normalize();
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), g.moon);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(620, 620), g.halo);
  moon.renderOrder = -1;
  halo.renderOrder = -1;
  moon.frustumCulled = false;
  halo.frustumCulled = false;
  group.add(halo, moon);
  return (camera) => {
    for (const [m, d] of [
      [halo, 780],
      [moon, 760],
    ] as const) {
      m.position.copy(camera.position).addScaledVector(dir, d);
      m.lookAt(camera.position);
    }
  };
}

/** A flock that bursts out of the crypt every few seconds, and bats wheeling for ever over the lair and the tower. */
function buildBats(kit: Kit, group: THREE.Group, pieces: SetPieces): (time: number, camera: THREE.Camera) => void {
  const flock = new Flock(BATS * 2, kit.g.bat, (q) => (q % 2 ? [0.5, 0, 1, 1] : [0, 0, 0.5, 1]));
  group.add(flock.mesh);
  const { cryptExit, cryptDir, lair, house } = pieces;
  const tower = house.at(-3, 13.5, 30);
  const side = new THREE.Vector3(-cryptDir.z, 0, cryptDir.x);
  const body = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const across = new THREE.Vector3();
  const wing = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const tail = new THREE.Vector3();
  const tailTip = new THREE.Vector3();
  const lead = new THREE.Vector3();
  const swarm = Math.floor(BATS * 0.64);
  return (time, camera) => {
    flock.begin();
    for (let i = 0; i < BATS; i++) {
      const seed = hash2(i, 3, 61);
      let scale = 0.9 + seed * 0.7;
      if (i < swarm) {
        // Out of the mouth in a stream, fanning up and away, gone before the next burst.
        const t = ((time / 7 + (i / swarm) * 0.16 + seed * 0.05) % 1) * 1.0;
        const fly = t / 0.5;
        if (fly >= 1) {
          scale = 0;
          body.copy(cryptExit);
        } else {
          const d = fly * 95 - 5;
          const spread = (seed - 0.5) * (6 + fly * 46) + Math.sin(time * 3 + i) * 1.4;
          body.copy(cryptExit).addScaledVector(cryptDir, d).addScaledVector(side, spread);
          body.y += fly * fly * 34 * (0.4 + hash2(i, 5, 61)) + Math.sin(time * 5 + i * 2) * 0.7 - 0.5;
        }
        lead.copy(cryptDir).addScaledVector(side, (seed - 0.5) * 1.2).normalize();
      } else {
        const round = i % 2 ? lair : tower;
        const r = 12 + seed * 14;
        const a = time * (0.9 + seed * 0.7) * (i % 3 ? 1 : -1) + i * 2.4;
        body.set(round.x + Math.cos(a) * r, round.y + 3 + Math.sin(time * 1.3 + i) * 3, round.z + Math.sin(a) * r);
        lead.set(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(i % 3 ? 1 : -1);
      }
      if (scale === 0 || body.distanceToSquared(camera.position) > 220 * 220) {
        body.set(0, -500, 0);
        for (let q = 0; q < 2; q++) flock.quad(body, body, body, body);
        continue;
      }
      fwd.copy(lead);
      across.crossVectors(fwd, UP).normalize();
      const flap = Math.sin(time * 18 + i * 1.7) * 0.9;
      const span = 0.9 * scale;
      const chord = 0.5 * scale;
      wing.copy(across).multiplyScalar(Math.cos(flap) * span).addScaledVector(UP, Math.sin(flap) * span);
      tip.copy(body).add(wing);
      tail.copy(body).addScaledVector(fwd, chord);
      tailTip.copy(tip).addScaledVector(fwd, chord);
      const noseL = body.clone().addScaledVector(fwd, -chord);
      const tipL = tip.clone().addScaledVector(fwd, -chord);
      flock.quad(tipL, noseL, tail, tailTip);
      wing.x = -across.x * Math.cos(flap) * span;
      wing.z = -across.z * Math.cos(flap) * span;
      tip.copy(body).add(wing);
      tail.copy(body).addScaledVector(fwd, chord);
      tailTip.copy(tip).addScaledVector(fwd, chord);
      const tipR = tip.clone().addScaledVector(fwd, -chord);
      flock.quad(noseL, tipR, tailTip, tail);
    }
    flock.end();
  };
}

/** Ghosts drifting through the house, always turning their faces to the camera. */
function buildGhosts(kit: Kit, group: THREE.Group, pieces: SetPieces): (time: number, camera: THREE.Camera) => void {
  const flock = new Flock(GHOSTS, kit.g.ghost, () => [0, 0, 1, 1]);
  group.add(flock.mesh);
  const { house } = pieces;
  const c = new THREE.Vector3();
  const across = new THREE.Vector3();
  const to = new THREE.Vector3();
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const glow = new THREE.Color(0.5, 0.85, 1);
  return (time, camera) => {
    flock.begin();
    for (let i = 0; i < GHOSTS; i++) {
      const al = ((i + 0.5) / GHOSTS) * house.length + Math.sin(time * 0.31 + i * 2) * 5;
      const ac = Math.sin(time * (0.55 + i * 0.08) + i * 1.9) * 7.5;
      const y = house.floor + 7.5 + i * 0.5 + Math.sin(time * 0.9 + i) * 1.3;
      c.copy(house.at(al, ac, y));
      to.copy(camera.position).sub(c).setY(0).normalize();
      across.crossVectors(UP, to).normalize();
      const size = 1.4 + (i % 2) * 0.5;
      const lean = Math.sin(time * 1.4 + i) * 0.4;
      corners[0].copy(c).addScaledVector(across, -size).setY(c.y - size * 1.2);
      corners[1].copy(c).addScaledVector(across, size).setY(c.y - size * 1.2);
      corners[2].copy(c).addScaledVector(across, size + lean).setY(c.y + size * 1.2);
      corners[3].copy(c).addScaledVector(across, -size + lean).setY(c.y + size * 1.2);
      flock.quad(corners[0], corners[1], corners[2], corners[3]);
      if (i % 2 === 0) dynamicLight(c.x, c.y, c.z, glow, 0.7, 11, 30);
    }
    flock.end();
  };
}

/** Will-o'-the-wisps bobbing over the pond, each a little cross of light. */
function buildWisps(kit: Kit, group: THREE.Group): (time: number, camera: THREE.Camera) => void {
  const flock = new Flock(WISPS * 2, kit.g.wisp, () => [0, 0, 1, 1]);
  group.add(flock.mesh);
  const c = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const e = new THREE.Vector3();
  const to = new THREE.Vector3();
  const across = new THREE.Vector3();
  const color = new THREE.Color(0.35, 1, 0.5);
  return (time, camera) => {
    flock.begin();
    for (let i = 0; i < WISPS; i++) {
      const ang = time * 0.12 * (i % 2 ? 1 : -1) + i * 1.05;
      const r = 0.25 + hash2(i, 1, 62) * 0.5;
      c.set(POND.x - 14 + Math.cos(ang) * POND.rx * r * 0.6, 1.4 + Math.sin(time * 1.2 + i * 2) * 0.5, POND.z + Math.sin(ang) * POND.rz * r);
      const size = 0.26 + 0.1 * Math.sin(time * 5 + i);
      to.copy(camera.position).sub(c).setY(0).normalize();
      across.crossVectors(UP, to).normalize();
      a.copy(c).addScaledVector(across, -size * 2);
      b.copy(c).addScaledVector(across, size * 2);
      d.copy(c).addScaledVector(UP, size * 2);
      e.copy(c).addScaledVector(UP, -size * 2);
      flock.quad(a, e, b, d);
      flock.quad(e, b, d, a);
      if (i % 3 === 0) dynamicLight(c.x, c.y, c.z, color, 0.9, 9, 20);
    }
    flock.end();
  };
}

/** A unit-tall rope, stretched each frame between two points. */
function stretch(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  const d = b.clone().sub(a);
  mesh.scale.set(1, d.length(), 1);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
}

/** The noose: its loop rides at car height exactly where the hazard is, swinging from the branch. */
function buildNoose(track: Track, kit: Kit, group: THREE.Group, pieces: SetPieces): (clock: number) => void {
  const { mats } = kit;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1, 5, 1, true), mats.rope);
  const loop = solid((batch) => {
    batch.geometry(mats.rope, new THREE.TorusGeometry(0.72, 0.13, 5, 10), xf(0, -0.7, 0));
    batch.geometry(mats.rope, new THREE.CylinderGeometry(0.2, 0.17, 0.75, 6), xf(0, 0.25, 0));
  });
  rope.frustumCulled = false;
  group.add(rope, loop);
  const hook = new THREE.Vector3();
  return (clock) => {
    const at: HazardState = hazardAt(track, NOOSE, clock);
    hook.set(at.x, at.y + 1.75, at.z);
    stretch(rope, pieces.noosePivot, hook);
    loop.position.copy(hook);
    loop.quaternion.copy(rope.quaternion);
    loop.rotateY((clock * 1.3) % (Math.PI * 2));
  };
}

/** The evil spider: creeps down its thread, sits on the bridge while the hazard is live, then hauls itself back up. */
function buildSpider(track: Track, kit: Kit, group: THREE.Group, pieces: SetPieces): (clock: number) => void {
  const { g, mats } = kit;
  const legs: THREE.Object3D[] = [];
  const spider = new THREE.Group();
  spider.add(
    solid((batch) => {
      batch.geometry(g.spider, ball(1, 1, 0.8, 1.25, 7), xf(0, 0.2, 0.75, 0, 0, 0, 1.1));
      batch.geometry(g.spider, ball(0.62, 1, 0.8, 1, 6), xf(0, 0.1, -0.7));
      for (const [x, y] of [[-0.24, 0.3], [0.24, 0.3], [-0.42, 0.15], [0.42, 0.15]]) batch.geometry(g.satin, ball(0.12, 1, 1, 1, 4), xf(x, y, -1.2));
      for (const side of [-1, 1]) batch.geometry(g.satin, new THREE.ConeGeometry(0.1, 0.5, 4), xf(side * 0.2, -0.2, -1.3, 0, Math.PI, 0));
    }),
  );
  // Two sets of alternate legs, which scurry in turn.
  for (const set of [0, 1]) {
    const leg = solid((batch) => {
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          if ((k + (side > 0 ? 1 : 0)) % 2 !== set) continue;
          const turn = xf(side * 0.35, 0.1, -0.5 + k * 0.32, -side * (k - 1.5) * 0.42);
          const hip = new THREE.Vector3().applyMatrix4(turn);
          const knee = new THREE.Vector3(side * 1.6, 0.9, 0).applyMatrix4(turn);
          const foot = new THREE.Vector3(side * 2.7, -0.9, 0).applyMatrix4(turn);
          limb(batch, g.spider, hip, knee, 0.13, 0.1);
          limb(batch, g.spider, knee, foot, 0.1, 0.04);
        }
      }
    });
    spider.add(leg);
    legs.push(leg);
  }
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 4, 1, true), mats.white);
  thread.frustumCulled = false;
  group.add(spider, thread);
  const tie = new THREE.Vector3();
  const color = new THREE.Color(1, 0.15, 0.1);
  return (clock) => {
    const at = hazardAt(track, SPIDER, clock);
    const { t } = at;
    const duty = SPIDER.duty;
    const high = 8.2;
    // Live: down on the bridge. Then back up fast. Hanging still. Then a slow drop that gives fair warning.
    let lift = 0;
    if (t >= duty) {
      const rest = (t - duty) / (1 - duty);
      if (rest < 0.25) lift = high * (1 - (1 - rest / 0.25) ** 2);
      else if (rest < 0.55) lift = high;
      else lift = high * (1 - ((rest - 0.55) / 0.45) ** 2);
    }
    const bob = at.live ? Math.abs(Math.sin(clock * 11)) * 0.2 : Math.sin(clock * 2) * 0.1;
    spider.position.set(at.x, at.y + 1.15 + lift + bob, at.z);
    spider.rotation.y = lift > 0.5 ? clock * 0.5 : Math.sin(clock * 4) * 0.25;
    const scurry = at.live ? 0.35 : 0.1;
    legs.forEach((leg, i) => {
      leg.rotation.z = Math.sin(clock * 16 + i * 1.8) * scurry;
    });
    tie.copy(pieces.spiderPivot);
    stretch(thread, tie, spider.position.clone().setY(spider.position.y + 0.8));
    if (at.live) dynamicLight(at.x, at.y + 1.6, at.z, color, 1.3, 9);
  };
}

/** The skeleton on the jetty: he sits, the float bobs, and every so often he strikes and lands a bony fish. */
function buildAngler(kit: Kit, group: THREE.Group, pieces: SetPieces): (time: number) => void {
  const { g, mats } = kit;
  const bones = solid((batch) => {
    skull({ batch, g }, xf(0, 2.0, 0.05, Math.PI, -0.25), 0.34);
    for (let i = 0; i < 5; i++) {
      const w = 0.72 - Math.abs(i - 1.6) * 0.08;
      batch.box(g.bone, w, 0.08, 0.46, xf(0, 1.18 + i * 0.13, 0), [0.92, 0.9, 0.85]);
    }
    batch.box(g.bone, 0.1, 0.85, 0.1, xf(0, 1.2, 0.2));
    batch.box(g.bone, 0.68, 0.14, 0.24, xf(0, 0.85, 0.05));
    for (const side of [-1, 1]) {
      const hip = new THREE.Vector3(side * 0.24, 0.8, 0);
      const knee = new THREE.Vector3(side * 0.3, 0.72, -0.85);
      const foot = new THREE.Vector3(side * 0.28, -0.05, -1.0);
      batch.beam(g.bone, hip, knee, 0.11);
      batch.beam(g.bone, knee, foot, 0.1);
      batch.box(g.bone, 0.2, 0.1, 0.42, xf(side * 0.28, -0.08, -1.12));
      batch.beam(g.bone, new THREE.Vector3(side * 0.42, 1.72, 0), new THREE.Vector3(side * 0.38, 1.22, -0.32), 0.1);
    }
    cube(batch, g.bark, xf(0, 2.32, 0, 0.2, -0.1), 0.9, 0.08, 0.9, [0.55, 0.5, 0.42]);
    cube(batch, g.bark, xf(0, 2.46, 0, 0.2, -0.1), 0.48, 0.24, 0.48, [0.55, 0.5, 0.42]);
  });
  bones.applyMatrix4(pieces.angler);
  bones.scale.setScalar(GIANT);
  bones.position.y -= 0.85 * GIANT;
  const rod = solid((batch) => {
    for (const side of [-1, 1]) batch.beam(g.bone, new THREE.Vector3(side * 0.38, -0.5, 0.36), new THREE.Vector3(side * 0.08, 0.02, 0.05), 0.09);
    batch.beam(mats.planks, new THREE.Vector3(0, -0.05, 0.3), new THREE.Vector3(0, 2.1, -5.4), 0.07);
  });
  const shoulder = new THREE.Vector3(0, 0.35 * GIANT, -0.55 * GIANT).applyMatrix4(pieces.angler);
  rod.position.copy(shoulder);
  rod.scale.setScalar(GIANT);
  rod.rotation.setFromRotationMatrix(pieces.angler);
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 3, 1, true), mats.white);
  line.frustumCulled = false;
  const float = solid((batch) => {
    batch.geometry(g.pumpkin, new THREE.OctahedronGeometry(0.32), xf(0, 0.1, 0));
  });
  const fish = solid((batch) => {
    batch.box(g.bone, 0.06, 0.06, 0.9, xf(0, 0, 0));
    skull({ batch, g }, xf(0, 0, -0.52, Math.PI), 0.16);
    for (let i = 0; i < 5; i++) batch.box(g.bone, 0.03, 0.38 - i * 0.05, 0.04, xf(0, 0, -0.26 + i * 0.16));
    batch.geometry(g.bone, new THREE.ConeGeometry(0.2, 0.3, 3), xf(0, 0, 0.56, 0, Math.PI / 2));
  });
  fish.visible = false;
  group.add(bones, rod, line, float, fish);
  const tip = new THREE.Vector3();
  const end = new THREE.Vector3();
  const local = new THREE.Vector3();
  return (time) => {
    const cycle = time % 11;
    // A bite, a heave, a fish in the air, then it wriggles off and he casts again.
    const bite = cycle > 7 && cycle < 8 ? Math.sin((cycle - 7) * 28) * 0.04 : 0;
    const heave = cycle > 8 ? Math.sin(Math.min(1, (cycle - 8) / 2.4) * Math.PI) : 0;
    rod.rotation.setFromRotationMatrix(pieces.angler);
    rod.rotateX(heave * 0.55 + Math.sin(time * 1.4) * 0.015 + bite);
    tip.copy(local.set(0, 2.1, -5.4)).applyMatrix4(rod.matrixWorld.identity().compose(rod.position, rod.quaternion, rod.scale));
    end.copy(pieces.float);
    end.y += Math.sin(time * 2.1) * 0.05 + bite * 2 - 0.05;
    if (heave > 0) {
      end.lerp(tip, 0.75 * heave);
      end.y = Math.max(end.y, tip.y - 5);
    }
    float.position.copy(end);
    stretch(line, tip, end);
    fish.visible = heave > 0.15;
    if (fish.visible) {
      fish.position.copy(end).setY(end.y - 0.9);
      fish.scale.setScalar(GIANT);
      fish.rotation.set(Math.PI / 2 - 0.3, time * 2.5, Math.sin(time * 22) * 0.5);
    }
  };
}
