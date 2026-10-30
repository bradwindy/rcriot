import * as THREE from 'three';
import { grounded, type Car } from '../../shared/car';
import type { Body, CarModel } from '../../shared/roster';
import { limitOf, sampleAt, type Track } from '../../shared/track';
import { ball, beam, taper, xf } from './geometry';
import { INDOOR } from './materials';
import { ps1Material, type Ps1Material } from './ps1';
import { livery, numberPlate, tex } from './textures';

export interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

interface Parts {
  /** Body paint with the car's pattern. */
  paint: THREE.Material;
  /** Flat second colour. */
  accent: THREE.Material;
  dark: THREE.Material;
  metal: THREE.Material;
  wood: THREE.Material;
  bone: THREE.Material;
  white: THREE.Material;
  glass: THREE.Material;
  sail: THREE.Material;
  flag: THREE.Material;
  /** A warm headlamp lens. */
  lamp: THREE.Material;
  /** A lamp that ignores lighting, in a colour. */
  glow(color: THREE.ColorRepresentation): THREE.Material;
  add(g: THREE.BufferGeometry, m: THREE.Material, matrix: THREE.Matrix4): void;
  /** A rod from a to b, for bones, bars and stays. */
  rod(a: [number, number, number], b: [number, number, number], m: THREE.Material, w?: number): void;
}

type V3 = [number, number, number];

interface Kind {
  wheel: number;
  width: number;
  /** Half the distance between left and right wheels. */
  track: number;
  /** Half the wheelbase. */
  base: number;
  plate: V3;
  antenna: V3;
  exhaust: V3;
  /** Red tail lights at this distance back, or null for bodies that have their own. */
  tail: number | null;
  build(p: Parts): void;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const UP = Math.PI / 2;

/**
 * Ten low-poly RC bodies, each themed on one of RC Revenge's movie worlds. Front is -z and the ground is y = 0.
 * Rotations: rx = UP lays a cylinder along +z, rx = -UP points a cone forward, rz = UP lays a cylinder along x.
 */
const KINDS: Record<Body, Kind> = {
  // Pirate World: a beach buggy flying the jolly roger, with a cannon for an exhaust.
  buggy: {
    wheel: 0.42, width: 0.34, track: 0.74, base: 0.8, plate: [0, 0.87, 0.15], antenna: [-0.32, 0.8, 0.8],
    exhaust: [0, 0.6, 1.5], tail: 1.12,
    build({ paint, dark, metal, flag, add, rod }) {
      add(box(1.1, 0.16, 2.2), dark, xf(0, 0.36, 0));
      add(taper(1.05, 1.9, 0.62, 1.0, 0.42, 0.25), paint, xf(0, 0.44, 0.05));
      add(taper(0.9, 0.7, 0.7, 0.3, 0.16, -0.15), paint, xf(0, 0.4, -1.05));
      add(box(1.3, 0.06, 0.42), paint, xf(0, 1.12, 1.0, 0, -0.15));
      for (const s of [-1, 1]) add(box(0.05, 0.36, 0.2), dark, xf(s * 0.4, 0.92, 0.95));
      for (const s of [-1, 1]) rod([s * 0.3, 0.97, -0.4], [s * 0.3, 0.87, 0.6], metal, 0.06);
      add(cyl(0.12, 0.16, 0.6), metal, xf(0, 0.6, 1.2, 0, UP));
      add(cyl(0.18, 0.18, 0.08), dark, xf(0, 0.6, 0.95, 0, UP));
      rod([0.42, 0.9, 0.95], [0.42, 1.85, 0.95], dark, 0.04);
      add(new THREE.PlaneGeometry(0.55, 0.36), flag, xf(0.7, 1.67, 0.95));
    },
  },
  // Monster World: a shark on monster-truck wheels, all fins and teeth.
  shark: {
    wheel: 0.6, width: 0.44, track: 0.86, base: 0.82, plate: [0, 1.69, -0.55], antenna: [-0.3, 1.5, 0.9],
    exhaust: [0, 1.1, 1.5], tail: null,
    build({ paint, dark, white, add }) {
      add(box(0.85, 0.2, 1.8), dark, xf(0, 0.72, 0));
      add(ball(1, 0.72, 0.5, 1.45), paint, xf(0, 1.18, 0));
      add(ball(1, 0.62, 0.3, 1.25), white, xf(0, 1.0, -0.08));
      add(taper(0.08, 0.95, 0.04, 0.3, 0.75, 0.32), paint, xf(0, 1.55, 0.1));
      add(taper(0.06, 0.4, 0.03, 0.15, 0.75, 0.25), paint, xf(0, 1.25, 1.3, 0, -0.9));
      add(taper(0.06, 0.4, 0.03, 0.15, 0.55, 0.2), paint, xf(0, 1.15, 1.3, 0, -2.4));
      for (const s of [-1, 1]) add(taper(0.05, 0.5, 0.03, 0.2, 0.55, 0.2), paint, xf(s * 0.65, 1.0, -0.2, 0, 0, s * 2.2));
      add(box(0.78, 0.2, 0.12), dark, xf(0, 1.06, -1.4));
      for (let i = 0; i < 6; i++) {
        const x = -0.3 + i * 0.12;
        add(cone(0.05, 0.12, 4), white, xf(x, 1.12, -1.44, 0, Math.PI));
        add(cone(0.05, 0.12, 4), white, xf(x, 0.99, -1.44));
      }
      for (const s of [-1, 1]) add(box(0.12, 0.14, 0.14), dark, xf(s * 0.6, 1.32, -0.95));
    },
  },
  // Planet Adventure: a silver rocket with flames down the side, fins and a glowing nozzle.
  rocket: {
    wheel: 0.34, width: 0.34, track: 0.76, base: 0.9, plate: [0, 1.05, 0.35], antenna: [-0.25, 0.95, 0.75],
    exhaust: [0, 0.62, 1.6], tail: null,
    build({ paint, accent, dark, metal, glass, glow, add }) {
      add(box(0.9, 0.12, 2.0), dark, xf(0, 0.25, 0));
      add(cyl(0.42, 0.42, 2.2), paint, xf(0, 0.62, 0.15, 0, UP));
      add(cone(0.42, 0.8, 8), accent, xf(0, 0.62, -1.35, 0, -UP));
      add(cyl(0.3, 0.42, 0.35), metal, xf(0, 0.62, 1.42, 0, UP));
      add(cyl(0.25, 0.25, 0.04), glow('#ff8a2a'), xf(0, 0.62, 1.6, 0, UP));
      add(taper(0.06, 0.8, 0.04, 0.35, 0.55, 0.25), accent, xf(0, 0.98, 0.85));
      for (const s of [-1, 1]) add(taper(0.06, 0.8, 0.04, 0.35, 0.5, 0.25), accent, xf(s * 0.38, 0.62, 0.85, 0, 0, -s * UP));
      add(ball(0.28, 1, 0.8, 1.5), glass, xf(0, 0.98, -0.35));
    },
  },
  // Planet Adventure: a flying saucer on stubby wheels, with ring lights and a little pilot in the dome.
  saucer: {
    wheel: 0.3, width: 0.3, track: 0.62, base: 0.6, plate: [0, 0.71, 0.78], antenna: [-0.55, 0.6, 0.5],
    exhaust: [0, 0.45, 1.2], tail: null,
    build({ paint, accent, dark, glass, glow, add }) {
      add(box(0.8, 0.12, 1.4), dark, xf(0, 0.22, 0));
      add(cyl(1.25, 0.7, 0.18, 14), paint, xf(0, 0.42, 0));
      add(cyl(0.6, 1.25, 0.2, 14), paint, xf(0, 0.61, 0));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(box(0.14, 0.1, 0.14), glow(i % 2 ? '#40e8ff' : '#ff4ad8'), xf(Math.sin(a) * 1.2, 0.52, Math.cos(a) * 1.2, a));
      }
      add(ball(0.55, 1, 0.75, 1), glass, xf(0, 0.72, 0));
      add(ball(0.2, 1, 1.15, 1), accent, xf(0, 0.95, -0.05));
      for (const s of [-1, 1]) add(ball(0.06, 1, 1.4, 1, 6), dark, xf(s * 0.08, 1.0, -0.22));
    },
  },
  // Horror World: a long black hearse with a coffin on the roof, purple windows and a skull on the bonnet.
  hearse: {
    wheel: 0.36, width: 0.34, track: 0.76, base: 1.0, plate: [0, 1.36, -0.45], antenna: [-0.45, 1.3, 1.1],
    exhaust: [0, 0.45, 1.5], tail: 1.42,
    build({ paint, dark, metal, wood, bone, glow, add, rod }) {
      add(box(1.1, 0.14, 2.6), dark, xf(0, 0.3, 0));
      add(taper(1.3, 2.9, 1.25, 2.8, 0.38, 0), paint, xf(0, 0.36, 0));
      add(box(1.2, 0.62, 1.9), paint, xf(0, 1.04, 0.4));
      add(box(1.05, 0.34, 0.04), dark, xf(0, 1.06, -0.56, 0, -0.35));
      for (const s of [-1, 1]) add(box(0.04, 0.3, 1.45), glow('#7a3ab0'), xf(s * 0.61, 1.1, 0.48));
      for (const s of [-1, 1]) {
        rod([s * 0.62, 1.05, 1.0], [s * 0.62, 1.25, 1.15], metal, 0.04);
        rod([s * 0.62, 1.25, 1.15], [s * 0.62, 1.05, 1.3], metal, 0.04);
      }
      add(taper(0.5, 1.25, 0.42, 1.05, 0.22, 0), wood, xf(0, 1.35, 0.35));
      for (const s of [-1, 1]) rod([s * 0.27, 1.45, 0.05], [s * 0.27, 1.45, 0.65], metal, 0.04);
      add(ball(0.14, 1, 1, 1.1, 6), bone, xf(0, 0.86, -1.1));
      for (const s of [-1, 1]) add(box(0.06, 0.05, 0.04), dark, xf(s * 0.05, 0.88, -1.24));
      for (const s of [-1, 1]) add(box(0.22, 0.1, 0.05), glow('#c88aff'), xf(s * 0.42, 0.6, -1.45));
    },
  },
  // Jungle World: a zebra-striped safari jeep with a roll bar, light bar, snorkel and bull bar.
  safari: {
    wheel: 0.46, width: 0.38, track: 0.82, base: 0.82, plate: [0, 1.15, -0.68], antenna: [-0.55, 1.75, 0.45],
    exhaust: [0.45, 0.6, 1.15], tail: 1.07,
    build({ paint, dark, metal, lamp, add, rod }) {
      add(box(1.0, 0.16, 2.0), dark, xf(0, 0.5, 0));
      add(box(1.3, 0.5, 2.1), paint, xf(0, 0.82, 0));
      add(taper(1.25, 0.8, 1.1, 0.7, 0.08, 0), paint, xf(0, 1.07, -0.65));
      for (const s of [-1, 1]) rod([s * 0.58, 1.07, -0.25], [s * 0.55, 1.55, -0.12], metal, 0.06);
      rod([-0.55, 1.55, -0.12], [0.55, 1.55, -0.12], metal, 0.06);
      for (const s of [-1, 1]) rod([s * 0.55, 1.07, 0.45], [s * 0.55, 1.75, 0.45], metal, 0.08);
      rod([-0.55, 1.75, 0.45], [0.55, 1.75, 0.45], metal, 0.08);
      for (const x of [-0.36, -0.12, 0.12, 0.36]) add(box(0.18, 0.13, 0.1), lamp, xf(x, 1.84, 0.42));
      for (const s of [-1, 1]) add(box(0.4, 0.45, 0.4), dark, xf(s * 0.3, 1.2, 0.2));
      add(cyl(0.36, 0.36, 0.2, 10), dark, xf(0, 1.0, 1.15, 0, UP));
      rod([-0.6, 0.72, -1.12], [0.6, 0.72, -1.12], metal, 0.08);
      for (const s of [-1, 1]) rod([s * 0.35, 0.6, -1.12], [s * 0.35, 1.0, -1.12], metal, 0.07);
      rod([0.66, 0.9, -0.3], [0.66, 1.6, -0.2], dark, 0.09);
    },
  },
  // Jungle World: a dinosaur racer with a toothy head, back spikes and its tail for a spoiler.
  raptor: {
    wheel: 0.38, width: 0.36, track: 0.78, base: 0.9, plate: [0, 0.84, 0.2], antenna: [-0.35, 0.8, 0.7],
    exhaust: [0, 0.5, 1.25], tail: 1.18,
    build({ paint, accent, dark, white, glow, add }) {
      add(box(1.0, 0.14, 2.1), dark, xf(0, 0.32, 0));
      add(taper(1.3, 2.3, 0.9, 1.6, 0.45, 0.1), paint, xf(0, 0.38, 0));
      add(taper(0.55, 0.95, 0.42, 0.6, 0.36, -0.12), paint, xf(0, 0.72, -1.4));
      add(box(0.48, 0.1, 0.72), dark, xf(0, 0.68, -1.5));
      for (let i = 0; i < 4; i++) {
        for (const s of [-1, 1]) add(cone(0.04, 0.12, 4), white, xf(s * 0.2, 0.78, -1.25 - i * 0.15, 0, Math.PI));
      }
      for (const s of [-1, 1]) add(box(0.1, 0.08, 0.1), glow('#ffd23a'), xf(s * 0.24, 1.0, -1.35));
      [0.18, 0.22, 0.24, 0.2, 0.15].forEach((h, i) => add(cone(0.1, h * 1.6, 4), accent, xf(0, 0.83 + h * 0.6, -0.6 + i * 0.35)));
      add(cyl(0.04, 0.24, 1.7, 6), paint, xf(0, 0.9, 1.55, 0, UP - 0.35));
    },
  },
  // Pirate World: a little galleon on wheels, with a mast, sail, flag, bowsprit and cannons.
  galleon: {
    wheel: 0.42, width: 0.36, track: 0.8, base: 0.85, plate: [0, 1.61, 0.95], antenna: [-0.55, 1.1, 0.3],
    exhaust: [0, 0.75, 1.45], tail: null,
    build({ accent, dark, metal, wood, sail, flag, glow, add, rod }) {
      add(box(0.9, 0.16, 2.0), dark, xf(0, 0.45, 0));
      add(taper(0.85, 1.9, 1.35, 2.7, 0.62, 0), wood, xf(0, 0.5, 0));
      add(box(1.38, 0.08, 2.72), accent, xf(0, 1.1, 0));
      add(box(1.3, 0.5, 0.75), wood, xf(0, 1.35, 0.95));
      for (const x of [-0.35, 0, 0.35]) add(box(0.18, 0.14, 0.04), glow('#ffc84a'), xf(x, 1.38, 1.33));
      rod([0, 1.1, -1.25], [0, 1.6, -2.1], wood, 0.07);
      rod([0, 1.12, -0.1], [0, 3.0, -0.1], wood, 0.1);
      rod([-0.65, 2.55, -0.1], [0.65, 2.55, -0.1], wood, 0.06);
      add(new THREE.PlaneGeometry(1.25, 1.05), sail, xf(0, 2.0, -0.06));
      add(new THREE.PlaneGeometry(0.5, 0.32), flag, xf(0.26, 2.84, -0.1));
      for (const s of [-1, 1]) {
        for (const z of [-0.45, 0.25]) add(cyl(0.07, 0.09, 0.4, 6), metal, xf(s * 0.72, 0.88, z, 0, 0, UP));
      }
    },
  },
  // Cartoon World: a rubber duck with a beak, googly eyes and a wiggle of tail.
  duck: {
    wheel: 0.3, width: 0.3, track: 0.62, base: 0.58, plate: [0, 1.12, 0.3], antenna: [-0.3, 0.95, 0.6],
    exhaust: [0, 0.45, 0.95], tail: null,
    build({ paint, accent, dark, white, add }) {
      add(box(0.9, 0.12, 1.3), dark, xf(0, 0.22, 0));
      add(ball(1, 0.66, 0.5, 0.88, 10), paint, xf(0, 0.65, 0.1));
      add(cone(0.25, 0.45, 6), paint, xf(0, 1.0, 0.85, 0, 0.7));
      for (const s of [-1, 1]) add(ball(1, 0.12, 0.28, 0.5), paint, xf(s * 0.62, 0.75, 0.15));
      add(ball(0.42, 1, 1, 1, 10), paint, xf(0, 1.38, -0.55));
      add(box(0.42, 0.12, 0.38), accent, xf(0, 1.3, -1.0));
      add(box(0.36, 0.06, 0.3), accent, xf(0, 1.22, -0.98));
      for (const s of [-1, 1]) {
        add(ball(0.11, 1, 1, 0.7, 6), white, xf(s * 0.18, 1.52, -0.86));
        add(box(0.06, 0.08, 0.04), dark, xf(s * 0.18, 1.52, -0.94));
      }
    },
  },
  // Horror World: a dune buggy built from bones, with a ribcage roll cage and a skull up front.
  bones: {
    wheel: 0.46, width: 0.38, track: 0.84, base: 0.86, plate: [0, 0.91, 0.95], antenna: [-0.4, 0.9, 1.0],
    exhaust: [0, 0.7, 1.35], tail: 1.2,
    build({ dark, metal, bone, white, add, rod }) {
      add(box(1.0, 0.16, 2.2), dark, xf(0, 0.45, 0));
      add(box(0.5, 0.5, 0.5), dark, xf(0, 0.75, 0.25));
      add(box(0.6, 0.35, 0.5), metal, xf(0, 0.72, 0.95));
      for (const s of [-1, 1]) rod([s * 0.18, 0.85, 1.05], [s * 0.25, 1.35, 1.3], metal, 0.07);
      rod([0, 1.35, -0.55], [0, 1.35, 0.85], bone, 0.08);
      for (const z of [-0.45, -0.05, 0.35, 0.75]) {
        for (const s of [-1, 1]) {
          rod([s * 0.5, 0.55, z], [s * 0.45, 1.05, z], bone, 0.07);
          rod([s * 0.45, 1.05, z], [0, 1.35, z], bone, 0.07);
          add(ball(0.06, 1, 1, 1, 6), bone, xf(s * 0.45, 1.05, z));
        }
      }
      add(ball(0.32, 1, 0.95, 1.05, 8), bone, xf(0, 0.98, -1.05));
      for (const s of [-1, 1]) add(box(0.13, 0.11, 0.08), dark, xf(s * 0.12, 1.02, -1.36));
      add(box(0.06, 0.08, 0.06), dark, xf(0, 0.9, -1.38));
      add(box(0.36, 0.1, 0.3), bone, xf(0, 0.72, -1.12));
      for (let i = 0; i < 4; i++) add(box(0.05, 0.06, 0.04), white, xf(-0.09 + i * 0.06, 0.8, -1.28));
      rod([-0.6, 0.55, -1.25], [0.6, 0.55, -1.25], bone, 0.08);
      for (const s of [-1, 1]) add(ball(0.09, 1, 1, 1, 6), bone, xf(s * 0.62, 0.55, -1.25));
    },
  },
};

function lerpAngle(a: number, b: number, t: number): number {
  return a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
}

/** How far a drifting car's nose swings into the corner, in radians. */
const DRIFT_ANGLE = 0.38;

/** One RC car: body, four wheels, a whip antenna, an exhaust flame and a blob shadow, posed from the sim each frame. */
export class CarView {
  readonly root = new THREE.Group();
  readonly shadow: THREE.Mesh;
  readonly kind: Kind;
  private readonly yaw = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly antenna = new THREE.Group();
  private readonly flame = new THREE.Group();
  private readonly wheels: { pivot: THREE.Group; tyre: THREE.Mesh; front: boolean }[] = [];
  private readonly materials: Ps1Material[] = [];
  private readonly fire: Ps1Material;
  private steer = 0;
  private slip = 0;
  /** Spin flat on the spot while flung by a blast, with a small wobble, settling back after. */
  private spin = 0;
  private flip = 0;
  /** Seconds left of the electric flash after being zapped or struck by lightning, and each material's own tint. */
  private shocked = 0;
  private tints: THREE.Color[] = [];
  private glows: number[] = [];
  private roll = 0;
  private pitch = 0;
  private bob = 0;
  private bobV = 0;
  private whip = 0;
  private whipV = 0;
  private shade = 1;
  private lastSpeed = 0;
  private wasGrounded = true;

  constructor(model: CarModel, number: number) {
    this.kind = KINDS[model.body];
    const mat = (map: THREE.Texture, lit = true, glow = 0) => {
      const m = ps1Material({ map, lit, glow });
      this.materials.push(m);
      return m;
    };
    const tinted = (color: THREE.ColorRepresentation, lit = true, glow = 0) => {
      const m = ps1Material({ map: tex.white(), lit, tint: color, glow });
      this.materials.push(m);
      return m;
    };
    const cutout = (map: THREE.Texture) => {
      const m = ps1Material({ map, alphaTest: 0.5, side: THREE.DoubleSide });
      this.materials.push(m);
      return m;
    };
    const paint = mat(livery(model.color, model.stripe, number, model.pattern));
    const dark = mat(tex.plastic());
    const parts: Parts = {
      paint,
      accent: tinted(model.stripe),
      dark,
      metal: mat(tex.metal()),
      wood: mat(tex.planks()),
      bone: tinted('#e8e0c8'),
      white: tinted('#f8f8f0'),
      glass: tinted('#3a5a6a'),
      sail: cutout(tex.sail()),
      flag: cutout(tex.flag()),
      lamp: mat(tex.lens(), false, 0.4),
      glow: (color) => tinted(color, false, 0.6),
      add: (g, m, matrix) => {
        const mesh = new THREE.Mesh(g, m);
        mesh.applyMatrix4(matrix);
        this.body.add(mesh);
      },
      rod: (a, b, m, w = 0.06) => {
        const [g, matrix] = beam(new THREE.Vector3(...a), new THREE.Vector3(...b), w);
        parts.add(g, m, matrix);
      },
    };
    const k = this.kind;
    k.build(parts);
    if (k.tail !== null) {
      const tail = ps1Material({ map: tex.white(), lit: false, tint: 0xff3020, glow: 0.5 });
      for (const s of [-1, 1]) parts.add(box(0.2, 0.1, 0.05), tail, xf(s * 0.38, k.wheel + 0.12, k.tail));
    }
    parts.add(new THREE.PlaneGeometry(0.42, 0.42), mat(numberPlate(number)), xf(k.plate[0], k.plate[1] + 0.01, k.plate[2], 0, -UP));

    this.antenna.position.set(...k.antenna);
    const whip = new THREE.Mesh(box(0.035, 1.1, 0.035), dark);
    whip.position.y = 0.55;
    const tip = new THREE.Mesh(box(0.1, 0.1, 0.1), paint);
    tip.position.y = 1.1;
    // The whip is far thinner than a pixel. A 1-pixel line keeps it from vanishing and popping back.
    const wire = new THREE.BufferGeometry();
    wire.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1.1, 0], 3));
    wire.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0], 3));
    wire.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0], 2));
    this.antenna.add(whip, tip, new THREE.LineSegments(wire, dark));
    this.body.add(this.antenna);

    const fire = ps1Material({ map: tex.flame(), lit: false, alphaTest: 0.5, side: THREE.DoubleSide, fog: 0.5, glow: 1.4 });
    this.fire = fire;
    for (const turn of [0, Math.PI / 2]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.9), fire);
      plane.rotation.set(Math.PI / 2, 0, turn, 'ZXY');
      plane.position.z = 0.45;
      this.flame.add(plane);
    }
    this.flame.position.set(...k.exhaust);
    this.flame.visible = false;
    this.body.add(this.flame);

    const wheelGeo = new THREE.CylinderGeometry(k.wheel, k.wheel, k.width, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    const tyre = mat(tex.tyre());
    const hub = mat(tex.hub());
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
      this.yaw.add(pivot);
      this.wheels.push({ pivot, tyre: t, front });
    }
    this.yaw.add(this.body);
    this.root.add(this.yaw);

    const shadowMat = ps1Material({ map: tex.shadow(), lit: false, transparent: true, fog: 0.6 });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0).rotateX(-Math.PI / 2), shadowMat);
    this.shadow.renderOrder = 2;
  }

  set visible(v: boolean) {
    this.root.visible = v;
    this.shadow.visible = v;
  }

  /** Turntable pose for the car select screen. */
  showcase(at: THREE.Vector3, heading: number): void {
    this.root.position.copy(at);
    this.root.rotation.set(0, heading, 0, 'YXZ');
    this.yaw.rotation.set(0, 0, 0);
    this.spin = this.flip = 0;
    this.body.rotation.set(0, 0, 0);
    this.body.position.y = 0;
    this.flame.visible = false;
    for (const m of this.materials) m.uniforms.uShade.value = 1;
    this.shadow.position.set(at.x, at.y + 0.06, at.z);
    this.shadow.rotation.set(0, heading, 0, 'YXZ');
    this.shadow.scale.set(1, 1, 1);
    this.root.updateMatrixWorld();
  }

  update(car: Car, prev: Pose, alpha: number, track: Track, dt: number, steerInput: number, time: number): void {
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

    this.slip += (-car.drift * DRIFT_ANGLE - this.slip) * (1 - Math.exp(-dt * 9));
    const settle = 1 - Math.exp(-dt * 10);
    if (car.tumble > 0) {
      this.spin += 9.5 * dt;
      this.flip = 0.22 * Math.sin(car.tumble * 16);
    } else {
      this.spin += (Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2 - this.spin) * settle;
      this.flip -= this.flip * settle;
    }
    this.yaw.rotation.set(0, this.slip + this.spin, this.flip, 'YXZ');

    let pitch = Math.atan(p.grade * along + slope * across);
    const roll = Math.atan(-p.grade * across + slope * along);
    if (!onGround) pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(car.vy, Math.max(4, Math.abs(speed))) * 0.7));
    const accel = (speed - this.lastSpeed) / Math.max(dt, 1e-3);
    this.lastSpeed = speed;
    this.pitch += (pitch + accel * 0.004 - this.pitch) * ease;
    const lean = (car.drift ? car.drift * 0.6 : steerInput) * Math.min(1, Math.abs(speed) / 25) * 0.09;
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

    this.whipV += (-this.whip * 120 - this.whipV * 6 + accel * 0.6) * dt;
    this.whip += this.whipV * dt;
    this.antenna.rotation.x = Math.max(-0.7, Math.min(0.7, this.whip * 0.05));

    this.flame.visible = car.boost > 0;
    if (this.flame.visible) {
      const f = 0.8 + 0.4 * Math.sin(time * 61) * Math.sin(time * 37);
      this.flame.scale.set(f, f, f * (car.boostPower > 1 ? 1.4 : 1));
      this.fire.uniforms.uGlow.value = 0.9 + f * (car.boostPower > 1 ? 1 : 0.6);
    }
    this.root.updateMatrixWorld();

    const indoor = car.cover === 'tunnel' || car.cover === 'ship';
    this.shade += ((indoor ? INDOOR : 1) - this.shade) * (1 - Math.exp(-dt * 6));
    for (const m of this.materials) m.uniforms.uShade.value = this.shade;
    if (this.tints.length === 0) {
      this.tints = this.materials.map((m) => m.uniforms.uTint.value.clone());
      this.glows = this.materials.map((m) => m.uniforms.uGlow.value as number);
    }
    this.shocked = Math.max(0, this.shocked - dt);
    // Electrocuted: the whole car strobes a hot blue-white.
    const strobe = this.shocked > 0 && Math.floor(time * 18) % 2 === 0;
    this.materials.forEach((m, i) => {
      if (strobe) m.uniforms.uTint.value.setRGB(1.6, 1.9, 2.6);
      else m.uniforms.uTint.value.copy(this.tints[i]);
      m.uniforms.uGlow.value = strobe ? 0.7 : this.glows[i];
    });

    const limit = limitOf(p);
    const ground = p.y + Math.max(-limit, Math.min(limit, car.offset)) * slope;
    const lift = Math.max(0, y - ground);
    this.shadow.position.set(x, ground + 0.06, z);
    this.shadow.rotation.set(Math.atan(p.grade * along + slope * across), heading + this.slip, roll, 'YXZ');
    const size = Math.max(0.4, 1 - lift * 0.15);
    this.shadow.scale.set(size, 1, size);
    (this.shadow.material as Ps1Material).uniforms.uOpacity.value = Math.max(0.2, 1 - lift * 0.2) * (indoor ? 0.6 : 1);
  }

  /** World positions of the two rear tyres' contact patches, for dust and sparks. */
  shock(seconds: number): void {
    this.shocked = Math.max(this.shocked, seconds);
  }

  /** World position of the aerial tip, where Blue Lightning crackles. */
  aerialTip(): THREE.Vector3 {
    return this.antenna.localToWorld(new THREE.Vector3(0, 1.1, 0));
  }

  /** World position of the exhaust flame, or null while the car isn't boosting. */
  exhaust(): THREE.Vector3 | null {
    return this.flame.visible ? this.flame.localToWorld(new THREE.Vector3(0, 0, 0.5)) : null;
  }

  /** World position just in front of the car's nose, where the Heat Ray comes out. */
  nose(): THREE.Vector3 {
    return this.yaw.localToWorld(new THREE.Vector3(0, this.kind.wheel + 0.2, -1.5));
  }

  rearWheels(): THREE.Vector3[] {
    return this.wheels
      .filter((w) => !w.front)
      .map((w) => w.pivot.localToWorld(new THREE.Vector3(0, -this.kind.wheel + 0.05, 0)));
  }
}
