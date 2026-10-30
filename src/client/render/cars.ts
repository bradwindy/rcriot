import * as THREE from 'three';
import { grounded, type Car } from '../../shared/car';
import { limitOf, sampleAt, type Track } from '../../shared/track';
import { taper, xf } from './geometry';
import { INDOOR } from './materials';
import { ps1Material, type Ps1Material } from './ps1';
import { livery, numberPlate, tex } from './textures';

export type BodyKind = 'buggy' | 'truck' | 'sport';

export interface Look {
  kind: BodyKind;
  color: string;
  stripe: string;
  number: number;
}

export interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface Kind {
  wheel: number;
  width: number;
  track: number;
  base: number;
  /** Height of the number plate above the ground. */
  roof: number;
}

const KINDS: Record<BodyKind, Kind> = {
  buggy: { wheel: 0.42, width: 0.34, track: 0.74, base: 0.8, roof: 0.87 },
  truck: { wheel: 0.56, width: 0.42, track: 0.82, base: 0.82, roof: 1.62 },
  sport: { wheel: 0.34, width: 0.36, track: 0.76, base: 0.86, roof: 0.63 },
};

function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

/** One RC car: body, four wheels, a whip antenna and a blob shadow, posed from the sim each frame. */
export class CarView {
  readonly root = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private readonly body = new THREE.Group();
  private readonly antenna = new THREE.Group();
  private readonly wheels: { pivot: THREE.Group; tyre: THREE.Mesh; front: boolean }[] = [];
  private readonly materials: Ps1Material[] = [];
  private readonly kind: Kind;
  private steer = 0;
  private roll = 0;
  private pitch = 0;
  private bob = 0;
  private bobV = 0;
  private whip = 0;
  private whipV = 0;
  private shade = 1;
  private lastSpeed = 0;
  private wasGrounded = true;

  constructor(look: Look) {
    this.kind = KINDS[look.kind];
    const mat = (map: THREE.Texture, lit = true) => {
      const m = ps1Material({ map, lit });
      this.materials.push(m);
      return m;
    };
    const paint = mat(livery(look.color, look.stripe, look.number));
    const dark = mat(tex.plastic());
    const metal = mat(tex.metal());
    const tyre = mat(tex.tyre());
    const hub = mat(tex.hub());
    const plate = mat(numberPlate(look.number));
    const tail = ps1Material({ map: tex.white(), lit: false, tint: 0xff3020 });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, matrix: THREE.Matrix4) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.applyMatrix4(matrix);
      this.body.add(mesh);
      return mesh;
    };
    const k = this.kind;

    if (look.kind === 'buggy') {
      add(new THREE.BoxGeometry(1.1, 0.16, 2.2), dark, xf(0, 0.36, 0));
      add(taper(1.05, 1.9, 0.62, 1.0, 0.42, 0.25), paint, xf(0, 0.44, 0.05));
      add(taper(0.9, 0.7, 0.7, 0.3, 0.16, -0.15), paint, xf(0, 0.4, -1.05));
      add(new THREE.BoxGeometry(1.3, 0.06, 0.42), paint, xf(0, 1.12, 1.0, 0, -0.15));
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.36, 0.2), dark, xf(s * 0.4, 0.92, 0.95));
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.06, 1.0), metal, xf(s * 0.3, 0.92, 0.1, 0, 0.1));
    } else if (look.kind === 'truck') {
      add(new THREE.BoxGeometry(1.0, 0.2, 2.0), dark, xf(0, 0.62, 0));
      add(taper(1.25, 2.3, 1.15, 2.1, 0.42, 0), paint, xf(0, 0.72, 0));
      add(taper(1.1, 1.0, 0.95, 0.75, 0.48, 0.05), paint, xf(0, 1.14, 0.05));
      add(new THREE.BoxGeometry(1.2, 0.1, 0.2), metal, xf(0, 0.86, -1.2));
      const lamp = mat(tex.lens(), false);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.22, 0.14, 0.1), lamp, xf(s * 0.3, 1.66, -0.25));
    } else {
      add(new THREE.BoxGeometry(1.2, 0.12, 2.3), dark, xf(0, 0.22, 0));
      add(taper(1.42, 2.5, 0.95, 1.1, 0.36, 0.2), paint, xf(0, 0.26, 0));
      add(new THREE.BoxGeometry(1.5, 0.05, 0.38), paint, xf(0, 0.86, 1.1, 0, -0.2));
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.25, 0.2), dark, xf(s * 0.55, 0.72, 1.1));
    }
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.2, 0.1, 0.05), tail, xf(s * 0.38, k.wheel + 0.12, 1.12));
    add(new THREE.PlaneGeometry(0.42, 0.42), plate, xf(0, k.roof + 0.01, 0.15, 0, -Math.PI / 2));

    this.antenna.position.set(-0.32, k.roof - 0.1, 0.8);
    const whip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.1, 0.035), dark);
    whip.position.y = 0.55;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), paint);
    tip.position.y = 1.1;
    // The whip is far thinner than a pixel. A 1-pixel line keeps it from vanishing and popping back.
    const wire = new THREE.BufferGeometry();
    wire.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1.1, 0], 3));
    wire.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0], 3));
    wire.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0], 2));
    this.antenna.add(whip, tip, new THREE.LineSegments(wire, dark));
    this.body.add(this.antenna);

    const wheelGeo = new THREE.CylinderGeometry(k.wheel, k.wheel, k.width, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [x, z, front] of [
      [-k.track, -k.base, true],
      [k.track, -k.base, true],
      [-k.track, k.base, false],
      [k.track, k.base, false],
    ] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(x, k.wheel, z);
      const t = new THREE.Mesh(wheelGeo, [tyre, hub, hub]);
      pivot.add(t);
      this.root.add(pivot);
      this.wheels.push({ pivot, tyre: t, front });
    }
    this.root.add(this.body);

    const shadowMat = ps1Material({ map: tex.shadow(), lit: false, transparent: true, fog: 0.6 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0).rotateX(-Math.PI / 2), shadowMat);
    this.shadow.renderOrder = 2;
  }

  update(car: Car, prev: Pose, alpha: number, track: Track, dt: number, steerInput: number): void {
    const x = prev.x + (car.x - prev.x) * alpha;
    const y = prev.y + (car.y - prev.y) * alpha;
    const z = prev.z + (car.z - prev.z) * alpha;
    const heading = lerpAngle(prev.heading, car.heading, alpha);
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, heading, 0, 'YXZ');

    const p = sampleAt(track, car.s);
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    const along = fx * p.tx + fz * p.tz;
    const across = fx * -p.tz + fz * p.tx;
    const slope = Math.tan(p.bank);
    const speed = car.vx * fx + car.vz * fz;
    const onGround = grounded(car);
    const ease = 1 - Math.exp(-dt * 12);

    let pitch = Math.atan(p.grade * along + slope * across);
    const roll = Math.atan(-p.grade * across + slope * along);
    if (!onGround) pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(car.vy, Math.max(4, Math.abs(speed))) * 0.7));
    const accel = (speed - this.lastSpeed) / Math.max(dt, 1e-3);
    this.lastSpeed = speed;
    this.pitch += (pitch + accel * 0.004 - this.pitch) * ease;
    const lean = steerInput * Math.min(1, Math.abs(speed) / 25) * 0.07;
    this.roll += (roll + lean - this.roll) * ease;

    if (onGround && !this.wasGrounded) this.bobV -= 3;
    this.wasGrounded = onGround;
    this.bobV += (-this.bob * 260 - this.bobV * 14) * dt;
    this.bob += this.bobV * dt;
    this.body.rotation.set(this.pitch, 0, this.roll, 'YXZ');
    this.body.position.y = this.bob * 0.15;

    this.steer += (steerInput - this.steer) * (1 - Math.exp(-dt * 10));
    const spin = (speed * dt) / this.kind.wheel;
    for (const w of this.wheels) {
      w.tyre.rotation.x -= spin;
      w.pivot.rotation.y = w.front ? -this.steer * 0.45 : 0;
    }
    this.root.updateMatrixWorld();

    this.whipV += (-this.whip * 120 - this.whipV * 6 + accel * 0.6) * dt;
    this.whip += this.whipV * dt;
    this.antenna.rotation.x = Math.max(-0.7, Math.min(0.7, this.whip * 0.05));

    const indoor = car.cover === 'tunnel' || car.cover === 'ship';
    this.shade += ((indoor ? INDOOR : 1) - this.shade) * (1 - Math.exp(-dt * 6));
    for (const m of this.materials) m.uniforms.uShade.value = this.shade;

    const limit = limitOf(p);
    const ground = p.y + Math.max(-limit, Math.min(limit, car.offset)) * slope;
    const lift = Math.max(0, y - ground);
    this.shadow.position.set(x, ground + 0.06, z);
    this.shadow.rotation.set(Math.atan(p.grade * along + slope * across), heading, roll, 'YXZ');
    const size = Math.max(0.4, 1 - lift * 0.15);
    this.shadow.scale.set(size, 1, size);
    (this.shadow.material as Ps1Material).uniforms.uOpacity.value = Math.max(0.2, 1 - lift * 0.2) * (indoor ? 0.6 : 1);
  }
}
