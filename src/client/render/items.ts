import * as THREE from 'three';
import { FAKE_ARM, MINE_SIZE, type Entity, type ItemEvent, type Items } from '../../shared/items';
import type { Race } from '../../shared/race';
import type { Track } from '../../shared/track';
import type { CarView } from './cars';
import { ball } from './geometry';
import type { Dust } from './particles';
import { dynamicLight, ps1Material } from './ps1';
import { tex } from './textures';

const FIRE = [new THREE.Color(1, 0.85, 0.3), new THREE.Color(1, 0.5, 0.12), new THREE.Color(0.9, 0.25, 0.08)];
const SMOKE = new THREE.Color(0.35, 0.33, 0.32);
const SPARK = new THREE.Color(0.6, 0.85, 1);
const WATER = new THREE.Color(0.55, 0.8, 1);
const BOLT = new THREE.Color(1, 1, 0.75);
const OIL = new THREE.Color(0.12, 0.1, 0.16);
const BOX_BITS = [new THREE.Color(0.25, 0.55, 1), new THREE.Color(0.55, 0.85, 1), new THREE.Color(1, 1, 1)];
const DEBRIS = [new THREE.Color(0.22, 0.18, 0.15), new THREE.Color(0.4, 0.33, 0.25)];
const SHOCK_RADIUS = 11;
const BLAST_LIGHT = new THREE.Color(1, 0.62, 0.3);
const BOX_LIGHT = new THREE.Color(0.35, 0.6, 1);
const MINE_LIGHT = new THREE.Color(1, 0.15, 0.08);
const SHIELD_LIGHT = new THREE.Color(0.4, 1, 0.35);
/** Item boxes and mine lamps only get a light slot when nothing bigger is near. */
const MINOR = 25;

interface Arc {
  from: () => THREE.Vector3;
  to: () => THREE.Vector3;
  life: number;
  color: THREE.Color;
  /** Lights up its surroundings while it lasts. */
  bright?: boolean;
}

interface Ring {
  mesh: THREE.Mesh;
  age: number;
}

/** A short burst of light: blasts, pick-ups, thunderbolts. */
interface Flash {
  at: THREE.Vector3;
  color: THREE.Color;
  power: number;
  range: number;
  age: number;
  life: number;
}

const unlit = (color: THREE.ColorRepresentation, opacity = 1, map = tex.white(), glow = 0) =>
  ps1Material({ map, lit: false, tint: color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, glow });

/** Draws the pick-up boxes, everything items leave on the track, and the flashes, rings, arcs and bubbles they make. */
export class ItemView {
  readonly group = new THREE.Group();
  private readonly boxes: THREE.Mesh[] = [];
  private readonly things = new Map<number, THREE.Object3D>();
  private readonly shields: THREE.Mesh[] = [];
  private readonly bubbles: THREE.Mesh[] = [];
  private readonly arcs: Arc[] = [];
  private readonly rings: Ring[] = [];
  private readonly flashes: Flash[] = [];
  private readonly floating: boolean[] = [];
  private readonly arcLines: THREE.LineSegments;
  private readonly boxMat = ps1Material({ map: tex.itembox(), lit: false });
  private readonly fakeMat = ps1Material({ map: tex.itembox(), lit: false, tint: 0xffd8d8 });
  private readonly shieldMat = unlit(0x6aea5a, 0.4, tex.shimmer(), 0.6);
  private readonly bubbleMat = unlit(0xbfe8ff, 0.45, tex.shimmer(), 0.3);

  constructor(
    private readonly items: Items,
    private readonly views: CarView[],
    private readonly dust: Dust,
    private readonly embers: Dust,
    private readonly track: Track,
  ) {
    const cube = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    for (const b of items.boxes) {
      const m = new THREE.Mesh(cube, this.boxMat);
      m.position.set(b.x, b.y, b.z);
      this.boxes.push(m);
      this.group.add(m);
    }
    const { shieldMat, bubbleMat } = this;
    shieldMat.uniforms.uScroll.value.set(0.08, 0.2);
    bubbleMat.uniforms.uScroll.value.set(-0.05, 0.12);
    const sphere = ball(1, 1, 1, 1, 10);
    for (let i = 0; i < views.length; i++) {
      const s = new THREE.Mesh(sphere, shieldMat);
      s.scale.setScalar(1.7);
      const b = new THREE.Mesh(sphere, bubbleMat);
      b.scale.setScalar(1.5);
      s.visible = b.visible = false;
      this.shields.push(s);
      this.bubbles.push(b);
      this.group.add(s, b);
    }
    this.arcLines = new THREE.LineSegments(new THREE.BufferGeometry(), ps1Material({ map: tex.white(), lit: false, vertexColors: true, glow: 2.5 }));
    this.arcLines.frustumCulled = false;
    this.group.add(this.arcLines);
  }

  update(race: Race, dt: number, time: number, eye: THREE.Vector3, hear: (e: ItemEvent) => void): void {
    const { items } = this;
    // Boxes, and the fakes that copy them, breathe a soft glow.
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    this.boxMat.uniforms.uGlow.value = this.fakeMat.uniforms.uGlow.value = 0.1 + 0.3 * pulse;
    this.boxes.forEach((m, i) => {
      const b = items.boxes[i];
      m.visible = items.enabled && b.respawn <= 0;
      m.scale.setScalar(Math.min(1, m.scale.x + dt * 3));
      if (b.respawn > 0) m.scale.setScalar(0.01);
      m.rotation.set(0.4, time * 1.6 + i, 0.3);
      m.position.y = b.y + Math.sin(time * 2.5 + i) * 0.12;
      if (!m.visible) return;
      const p = m.position;
      dynamicLight(p.x, p.y, p.z, BOX_LIGHT, 0.5 + 0.4 * pulse, 6, MINOR);
      if (Math.random() < 2.5 * dt && p.distanceToSquared(eye) < 70 * 70) {
        const a = Math.random() * Math.PI * 2;
        const color = BOX_BITS[1 + Math.floor(Math.random() * 2)];
        this.embers.spawn(p.x + Math.cos(a) * 0.8, p.y - 0.4 + Math.random() * 0.8, p.z + Math.sin(a) * 0.8, 0, 0.6 + Math.random() * 0.6, 0, 0.06, 0.6 + Math.random() * 0.4, color);
      }
    });
    this.shieldMat.uniforms.uGlow.value = 0.4 + 0.35 * Math.sin(time * 7);

    for (const e of items.events) {
      this.react(e, race);
      hear(e);
    }
    items.events.length = 0;

    this.drawThings(items.entities, time);
    this.drawCars(race, time);
    this.drawArcs(dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        this.flashes.splice(i, 1);
        continue;
      }
      dynamicLight(f.at.x, f.at.y, f.at.z, f.color, f.power * (1 - t) * (1 - t), f.range);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.age += dt;
      const t = r.age / 0.45;
      r.mesh.scale.setScalar(1 + t * SHOCK_RADIUS);
      (r.mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = Math.max(0, 0.85 * (1 - t));
      if (t >= 1) {
        this.group.remove(r.mesh);
        this.rings.splice(i, 1);
      }
    }
  }

  private react(e: ItemEvent, race: Race): void {
    const car = (i: number) => race.racers[i].car;
    switch (e.type) {
      case 'explode': {
        const k = e.strength;
        // A fireball, hot sparks, chunks of debris thrown up and falling back, and smoke rolling off.
        this.burst(e.x, e.y + 0.3, e.z, 10 * k + 4, FIRE, 3, 0.6, this.embers, 0.45);
        this.burst(e.x, e.y + 0.3, e.z, 16 * k + 4, FIRE, 11, 0.4, this.embers, 0.08, 0.6);
        this.burst(e.x, e.y + 0.2, e.z, 10 * k + 3, DEBRIS, 7, 1.1, this.dust, 0.1, 1);
        this.burst(e.x, e.y + 0.5, e.z, 6 + 6 * k, [SMOKE], 2.5, 1.3, this.dust, 0.35);
        this.flash(e.x, e.y + 1.2, e.z, BLAST_LIGHT, 3.5 * k + 1, 10 + 10 * k, 0.45);
        break;
      }
      case 'splash':
        this.burst(e.x, e.y, e.z, 26, [WATER, BOX_BITS[2]], 4, 0.9, this.dust, 0.08, 1);
        this.burst(e.x, e.y, e.z, 8, [WATER], 1.5, 0.7, this.dust, 0.3);
        break;
      case 'pickup': {
        const b = this.items.boxes[e.box];
        this.burst(b.x, b.y, b.z, 18, BOX_BITS, 6, 0.45);
        this.burst(b.x, b.y, b.z, 22, BOX_BITS, 9, 0.35, this.embers, 0.09);
        this.flash(b.x, b.y, b.z, BOX_LIGHT, 2.5, 9, 0.3);
        break;
      }
      case 'zap':
        this.arcs.push({ from: () => this.views[e.from].aerialTip(), to: () => this.views[e.to].aerialTip(), life: 0.2, color: SPARK, bright: true });
        break;
      case 'thunder':
        // A thick bolt from the sky onto every struck car: a few jagged strands, a flash of sparks and a strobing car.
        for (const j of e.racers) {
          const c = car(j);
          for (let k = 0; k < 4; k++) {
            const top = new THREE.Vector3(c.x + (Math.random() - 0.5) * 6, c.y + 45, c.z + (Math.random() - 0.5) * 6);
            this.arcs.push({ from: () => top, to: () => this.views[j].aerialTip(), life: 0.45 + k * 0.08, color: k % 2 ? SPARK : BOLT });
          }
          this.burst(c.x, c.y + 0.6, c.z, 30, [SPARK, BOLT], 8, 0.55, this.embers, 0.1);
          this.burst(c.x, c.y + 0.6, c.z, 8, [SMOKE], 2, 1.2);
          this.flash(c.x, c.y + 3, c.z, SPARK, 4, 22, 0.6);
          this.views[j].shock(2.5);
        }
        break;
      case 'use':
        if (e.kind === 'shockwave') {
          const c = car(e.racer);
          const mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2), unlit(0xff8a2a, 0.85));
          mesh.position.set(c.x, c.y + 0.4, c.z);
          this.rings.push({ mesh, age: 0 });
          this.group.add(mesh);
          this.burst(c.x, c.y + 0.5, c.z, 20, FIRE, 9, 0.4, this.embers, 0.16);
          this.flash(c.x, c.y + 1, c.z, BLAST_LIGHT, 2.5, 16, 0.45);
        }
        break;
      case 'hit':
        if (e.hit === 'short' || e.hit === 'zap') {
          const c = car(e.racer);
          this.burst(c.x, c.y + 0.5, c.z, e.hit === 'zap' ? 14 : 10, [SPARK, BOLT], 5, 0.5, this.embers, 0.1);
          this.views[e.racer].shock(e.hit === 'zap' ? 1 : 2.5);
        }
        if (e.hit === 'bubble') {
          const c = car(e.racer);
          this.burst(c.x, c.y + 0.6, c.z, 22, [WATER, BOX_BITS[2]], 4, 0.9, this.dust, 0.08, 1);
        }
        if (e.hit === 'slick') {
          const c = car(e.racer);
          this.burst(c.x, c.y + 0.3, c.z, 12, [OIL], 3, 0.5);
        }
        break;
    }
  }

  private burst(x: number, y: number, z: number, n: number, colors: THREE.Color[], speed: number, life: number, into = this.dust, size = 0.18, fall = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const color = colors[Math.floor(Math.random() * colors.length)];
      into.spawn(x, y, z, Math.cos(a) * v, 1 + Math.random() * speed, Math.sin(a) * v, size * (1 + Math.random()), life * (0.6 + Math.random() * 0.6), color, fall);
    }
  }

  private flash(x: number, y: number, z: number, color: THREE.Color, power: number, range: number, life: number): void {
    this.flashes.push({ at: new THREE.Vector3(x, y, z), color, power, range, age: 0, life });
  }

  private thing(e: Entity): THREE.Object3D {
    const g = new THREE.Group();
    switch (e.kind) {
      case 'rocket': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 6).rotateX(Math.PI / 2), unlit(0xe8e8e8));
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 6).rotateX(-Math.PI / 2), unlit(0xd8322a));
        nose.position.z = -0.52;
        const fins = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.2), unlit(0xd8322a));
        fins.position.z = 0.3;
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.02, 0.4, 6).rotateX(-Math.PI / 2), unlit(0xffa030, 1, tex.white(), 2));
        glow.position.z = 0.55;
        glow.name = 'glow';
        g.add(body, nose, fins, glow);
        break;
      }
      case 'mine': {
        // A spiked ball: a dark core with spikes along the axes and diagonals, and a red light.
        const spin = new THREE.Group();
        spin.name = 'spin';
        const metal = ps1Material({ map: tex.plastic() });
        spin.add(new THREE.Mesh(ball(MINE_SIZE * 0.78, 1, 1, 1, 8), metal));
        const spike = new THREE.ConeGeometry(0.1, 0.36, 4);
        const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
          [1, 1, 1], [-1, 1, 1], [1, -1, 1], [1, 1, -1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]];
        for (const d of dirs) {
          const dir = new THREE.Vector3(...d).normalize();
          const cone = new THREE.Mesh(spike, metal);
          cone.position.copy(dir).multiplyScalar(MINE_SIZE * 0.85);
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          spin.add(cone);
        }
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), unlit(0xff2a1a, 1, tex.white(), 2.5));
        lamp.position.y = MINE_SIZE * 0.8;
        lamp.name = 'lamp';
        spin.add(lamp);
        g.add(spin);
        break;
      }
      case 'water':
        g.add(new THREE.Mesh(ball(0.45, 1, 1, 1, 8), unlit(0x4aa8ff, 0.8)));
        break;
      case 'oil': {
        const splat = new THREE.Mesh(
          new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2),
          ps1Material({ map: tex.oil(), transparent: true, alphaTest: 0.5, depthWrite: false }),
        );
        splat.rotation.y = e.id * 1.7;
        splat.renderOrder = 2;
        g.add(splat);
        break;
      }
      case 'fake':
        g.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), this.fakeMat));
        break;
    }
    this.group.add(g);
    return g;
  }

  private drawThings(entities: Entity[], time: number): void {
    const live = new Set<number>();
    for (const e of entities) {
      live.add(e.id);
      let obj = this.things.get(e.id);
      if (!obj) {
        obj = this.thing(e);
        this.things.set(e.id, obj);
      }
      obj.position.set(e.x, e.y, e.z);
      switch (e.kind) {
        case 'rocket': {
          obj.rotation.set(0, Math.atan2(-e.vx, -e.vz), 0);
          const glow = obj.getObjectByName('glow');
          if (glow) glow.scale.setScalar(0.8 + Math.random() * 0.6);
          // A smoke trail filled in between frames, with sparks spitting from the motor.
          for (let k = 0; k < 2; k++) {
            const back = 0.012 + k * 0.008;
            this.dust.spawn(e.x - e.vx * back, e.y, e.z - e.vz * back, (Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6, 0.16 + Math.random() * 0.08, 0.55, SMOKE);
          }
          this.embers.spawn(e.x - e.vx * 0.011, e.y, e.z - e.vz * 0.011, 0, 0, 0, 0.2, 0.05, FIRE[0]);
          if (Math.random() < 0.7) {
            this.embers.spawn(e.x - e.vx * 0.01, e.y, e.z - e.vz * 0.01, (Math.random() - 0.5) * 3 - e.vx * 0.1, Math.random() * 1.5, (Math.random() - 0.5) * 3 - e.vz * 0.1, 0.08, 0.22, FIRE[Math.floor(Math.random() * 2)]);
          }
          dynamicLight(e.x, e.y + 0.3, e.z, FIRE[1], 1.6 + Math.random() * 0.4, 9);
          break;
        }
        case 'mine': {
          // Rolls the way it travels, with a blinking light.
          const spin = obj.getObjectByName('spin');
          const speed = Math.hypot(e.vx, e.vz);
          if (spin && speed > 0.2) {
            obj.rotation.y = Math.atan2(-e.vx, -e.vz);
            spin.rotation.x -= (speed / MINE_SIZE) * (1 / 60);
          }
          const lamp = obj.getObjectByName('lamp');
          if (lamp) lamp.visible = Math.sin(time * 9 + e.id) > 0;
          if (lamp?.visible) dynamicLight(e.x, e.y + 0.6, e.z, MINE_LIGHT, 1.2, 4, MINOR);
          break;
        }
        case 'water':
          obj.scale.set(1 + Math.sin(time * 14) * 0.08, 1 - Math.sin(time * 14) * 0.08, 1);
          break;
        case 'oil': {
          // Laid flat on the track, tilted with its slope and banking, just above it so it never sinks out of sight.
          const p = this.track.samples[e.index];
          obj.position.y = e.y + 0.06;
          obj.rotation.set(Math.atan(p.grade), Math.atan2(-p.tx, -p.tz), p.bank, 'YXZ');
          break;
        }
        case 'fake':
          obj.rotation.set(0.4, -time * 1.6 + e.id, 0.3);
          if (e.landed) obj.position.y = e.y + Math.sin(time * 2.5 + e.id) * 0.12;
          // Flashes while it drops and arms, so nobody right behind is caught out.
          obj.visible = e.age >= FAKE_ARM || Math.floor(e.age * 12) % 2 === 0;
          break;
      }
    }
    for (const [id, obj] of this.things) {
      if (live.has(id)) continue;
      this.group.remove(obj);
      this.things.delete(id);
    }
  }

  /** Shields, water bubbles, Heat Ray flames, the Blue Lightning crackle, smoking tyres and shorted-out sparks. */
  private drawCars(race: Race, time: number): void {
    race.racers.forEach((r, i) => {
      const car = r.car;
      const view = this.views[i];
      const at = view.root.position;
      const shield = this.shields[i];
      shield.visible = car.shield > 0 && (car.shield > 2 || Math.sin(time * 30) > 0);
      shield.position.set(at.x, at.y + 0.7, at.z);
      shield.rotation.y = time;
      if (shield.visible) dynamicLight(at.x, at.y + 0.7, at.z, SHIELD_LIGHT, 0.6, 5, MINOR / 2);
      const bubble = this.bubbles[i];
      bubble.visible = car.bubble > 0;
      // The bubble pops in a shower of drops.
      if (this.floating[i] && !bubble.visible) this.burst(at.x, at.y + 0.6, at.z, 24, [WATER, BOX_BITS[2]], 5, 0.8, this.dust, 0.08, 1);
      this.floating[i] = bubble.visible;
      bubble.position.set(at.x, at.y + 0.6, at.z);
      bubble.scale.setScalar(1.5 + Math.sin(time * 6) * 0.06);

      if (this.items.heat[i] > 0) {
        // A long jet of flame, reaching about as far as the Heat Ray hurts.
        const n = view.nose();
        const f = new THREE.Vector3(-Math.sin(car.heading), 0, -Math.cos(car.heading));
        for (let k = 0; k < 6; k++) {
          const v = 26 + Math.random() * 12;
          const spread = (Math.random() - 0.5) * v * 0.45;
          const c = FIRE[Math.floor(Math.random() * FIRE.length)];
          const size = 0.26 + Math.random() * 0.22;
          this.embers.spawn(n.x, n.y, n.z, car.vx + f.x * v - f.z * spread, 0.8 + Math.random() * 1.5, car.vz + f.z * v + f.x * spread, size, 0.55 + Math.random() * 0.2, c);
        }
        if (Math.random() < 0.4) this.dust.spawn(n.x, n.y + 0.3, n.z, car.vx + f.x * 18, 2.5, car.vz + f.z * 18, 0.35, 0.9, SMOKE);
        dynamicLight(n.x + f.x * 5, n.y + 0.5, n.z + f.z * 5, FIRE[1], 2.2 + Math.random() * 0.6, 14);
      }
      if (car.slick > 0 && Math.hypot(car.vx, car.vz) > 4 && car.air < 0.1) {
        // Oil flicked off the tyres while the car slides.
        for (const w of view.rearWheels()) {
          if (Math.random() < 0.6) this.dust.spawn(w.x, w.y + 0.1, w.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4, 0.12, 0.45, OIL);
        }
      }
      if (this.items.charge[i] > 0 && Math.random() < 0.6) {
        const tip = view.aerialTip();
        this.embers.spawn(tip.x, tip.y, tip.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.1, 0.18, SPARK);
      }
      if (car.burn > 0 && Math.random() < 0.5) {
        for (const w of view.rearWheels()) {
          if (Math.random() < 0.5) this.dust.spawn(w.x, w.y + 0.2, w.z, 0, 1.5, 0, 0.25, 0.6, SMOKE);
          else this.embers.spawn(w.x, w.y + 0.2, w.z, 0, 1.5, 0, 0.2, 0.45, FIRE[1]);
        }
      }
      if (car.stun > 0) {
        // Shorted out: sparks, smoke and little arcs crackling over the car.
        if (Math.random() < 0.7) this.embers.spawn(at.x + (Math.random() - 0.5) * 1.5, at.y + 0.8, at.z + (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.12, 0.3, SPARK);
        if (Math.random() < 0.15) this.dust.spawn(at.x, at.y + 1, at.z, 0, 1.5, 0, 0.3, 0.9, SMOKE);
        if (Math.random() < 0.35) {
          const from = new THREE.Vector3(at.x + (Math.random() - 0.5) * 1.6, at.y + 0.3 + Math.random() * 0.8, at.z + (Math.random() - 0.5) * 1.6);
          const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6));
          this.arcs.push({ from: () => from, to: () => to, life: 0.08, color: SPARK });
        }
      }
    });
  }

  private drawArcs(dt: number): void {
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      if (a.life <= 0) {
        this.arcs.splice(i, 1);
        continue;
      }
      // A fresh jagged path every frame, so the bolt flickers.
      const from = a.from();
      const to = a.to();
      if (a.bright) dynamicLight((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, a.color, 2.4, 10);
      let prev = from;
      for (let k = 1; k <= 7; k++) {
        const t = k / 7;
        const next = from.clone().lerp(to, t);
        if (k < 7) next.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(from.distanceTo(to) * 0.08));
        pos.push(prev.x, prev.y, prev.z, next.x, next.y, next.z);
        col.push(a.color.r, a.color.g, a.color.b, a.color.r, a.color.g, a.color.b);
        prev = next;
      }
    }
    const g = this.arcLines.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
    g.setDrawRange(0, pos.length / 3);
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
