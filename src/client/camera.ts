import * as THREE from 'three';
import { limitOf, locate, sampleAt, surfaceY, type Track } from '../shared/track';

export type CameraMode = 'chase' | 'far' | 'bumper';
export const CAMERA_MODES: CameraMode[] = ['chase', 'far', 'bumper'];

const RIG: Record<CameraMode, { back: number; up: number; look: number; lookUp: number; lag: number }> = {
  chase: { back: 5.2, up: 2.1, look: 4, lookUp: 0.9, lag: 7 },
  far: { back: 9, up: 3.6, look: 6, lookUp: 0.8, lag: 5 },
  bumper: { back: -0.4, up: 0.85, look: 10, lookUp: 0.6, lag: 40 },
};

/** Follows a car from behind with a little lag, kept inside the barriers and under the cave and hull roofs. */
export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.3, 1400);
  mode: CameraMode = 'chase';
  private readonly pos = new THREE.Vector3();
  private yaw = 0;
  private hint = -1;
  private started = false;

  constructor(private readonly track: Track) {}

  cycle(): void {
    this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
  }

  /** Jump straight to the target next frame instead of easing in. */
  snap(): void {
    this.started = false;
  }

  update(target: THREE.Vector3, heading: number, dt: number): void {
    const rig = RIG[this.mode];
    if (!this.started) this.yaw = heading;
    this.yaw += Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw)) * (1 - Math.exp(-dt * rig.lag * 0.9));
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const want = new THREE.Vector3(target.x - fx * rig.back, target.y + rig.up, target.z - fz * rig.back);

    const loc = locate(this.track, want.x, want.z, this.hint);
    this.hint = loc.index;
    const p = sampleAt(this.track, loc.s);
    const indoor = p.cover === 'tunnel' || p.cover === 'ship';
    const limit = limitOf(p) - 0.6;
    if (indoor && Math.abs(loc.offset) > limit) {
      const push = Math.abs(loc.offset) - limit;
      want.x -= -p.tz * Math.sign(loc.offset) * push;
      want.z -= p.tx * Math.sign(loc.offset) * push;
    }
    const floor = surfaceY(p, loc.offset);
    want.y = Math.max(want.y, floor + 0.6);
    if (indoor) want.y = Math.min(want.y, floor + 5.2);

    if (!this.started) this.pos.copy(want);
    else this.pos.lerp(want, 1 - Math.exp(-dt * rig.lag));
    this.started = true;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(target.x + fx * rig.look, target.y + rig.lookUp, target.z + fz * rig.look);
  }
}
