import * as THREE from 'three';
import { sampleAt, type Sample, type Track } from '../../../shared/track';
import { valueNoise } from '../../render/noise';
import { addPointLight, type PointLight } from '../../render/ps1';

/**
 * The height of the ground along a route with its jumps and pits smoothed out: the 60th percentile of the road's height
 * over 24 m. Cave walls and side floors sit on this, so they don't dip into a pit or rise over a kicker.
 */
export function levelOf(track: Track): (s: number) => number {
  const n = track.samples.length;
  const out = new Float32Array(n);
  const half = Math.round(12 / track.step);
  const win: number[] = [];
  for (let i = 0; i < n; i++) {
    win.length = 0;
    for (let k = -half; k <= half; k += 2) win.push(track.samples[(i + k + n) % n].y);
    win.sort((a, b) => a - b);
    out[i] = win[Math.floor(win.length * 0.6)];
  }
  return (s: number) => {
    const f = (((s / track.step) % n) + n) % n;
    const i = Math.floor(f);
    const t = f - i;
    return out[i] + (out[(i + 1) % n] - out[i]) * t;
  };
}

/** Offset `h` is above the level line rather than the road: the frame height that puts a point there. */
export function lift(p: Sample, o: number, y: number): number {
  return y - p.y - o * Math.tan(p.bank);
}

/** Calls `f` every `step` along a route between s0 and s1. */
export function along(track: Track, s0: number, s1: number, step: number, f: (p: Sample, s: number, k: number) => void): void {
  for (let s = s0, k = 0; s <= s1; s += step, k++) f(sampleAt(track, s), s, k);
}

interface Flicker {
  light: PointLight;
  base: THREE.Color;
  seed: number;
  speed: number;
  depth: number;
}

/** Lights that waver: lava glows slowly, bulbs barely. */
export class Lights {
  private readonly all: Flicker[] = [];

  add(at: THREE.Vector3, color: THREE.Color, range: number, depth = 0.3, speed = 2): PointLight {
    const light = addPointLight(at, color, range);
    this.all.push({ light, base: color.clone(), seed: this.all.length * 13.7, speed, depth });
    return light;
  }

  update(time: number): void {
    for (const f of this.all) {
      const k = 1 - f.depth + f.depth * 2 * valueNoise(time * f.speed + f.seed, f.seed, 3);
      f.light.color.copy(f.base).multiplyScalar(k);
    }
  }
}

export const LAVA_LIGHT = new THREE.Color(1.0, 0.42, 0.12);
export const LAMP_LIGHT = new THREE.Color(1.0, 0.92, 0.74);
