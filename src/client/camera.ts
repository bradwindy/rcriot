import * as THREE from 'three';
import { follow as onRoute } from '../shared/course';
import { limitOf, roofed, surfaceY, type Track } from '../shared/track';

export type CameraMode = 'chase' | 'far' | 'bumper';
export const CAMERA_MODES: CameraMode[] = ['chase', 'far', 'bumper'];

const RIG: Record<CameraMode, { back: number; up: number; look: number; lookUp: number; lag: number }> = {
  chase: { back: 5.2, up: 2.1, look: 4, lookUp: 0.9, lag: 7 },
  far: { back: 9, up: 3.6, look: 6, lookUp: 0.8, lag: 5 },
  bumper: { back: -0.4, up: 0.85, look: 10, lookUp: 0.6, lag: 40 },
};

const FOV = 62;
const BOOST_FOV = 72;
/** How far the camera swings to the outside of a drift, in radians. */
const DRIFT_SWING = 0.16;

export interface Follow {
  /** -1, 0 or 1, from the car's drift. */
  drift: number;
  boosting: boolean;
  lookBack: boolean;
  /** The car's route and nearest sample, so the camera keeps to the same road at a fork. */
  route: number;
  index: number;
}

/** Follows a car from behind with a little lag, kept inside the barriers and under the cave and hull roofs. */
export class ChaseCamera {
  readonly camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.3, 1400);
  mode: CameraMode = 'chase';
  private readonly pos = new THREE.Vector3();
  private yaw = 0;
  private swing = 0;
  private hint = -1;
  private route = 0;
  private started = false;

  constructor(private track: Track) {}

  /** A new track: the camera finds itself on it again from scratch. */
  setTrack(track: Track): void {
    this.track = track;
    this.hint = -1;
    this.route = 0;
    this.started = false;
  }

  cycle(): void {
    this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
  }

  /** Jump straight to the target next frame instead of easing in. */
  snap(): void {
    this.started = false;
  }

  update(target: THREE.Vector3, heading: number, dt: number, follow: Follow): void {
    const rig = follow.lookBack ? RIG.chase : RIG[this.mode];
    if (!this.started) this.yaw = heading;
    this.yaw += Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw)) * (1 - Math.exp(-dt * rig.lag * 0.9));
    this.swing += (follow.drift * DRIFT_SWING - this.swing) * (1 - Math.exp(-dt * 3));
    const view = this.yaw + this.swing + (follow.lookBack ? Math.PI : 0);
    const fx = -Math.sin(view);
    const fz = -Math.cos(view);
    const want = new THREE.Vector3(target.x - fx * rig.back, target.y + rig.up, target.z - fz * rig.back);

    if (follow.route !== this.route || this.hint < 0) {
      this.route = follow.route;
      this.hint = follow.index;
    }
    const loc = onRoute(this.track, this.route, want.x, want.z, this.hint, 0.6);
    this.hint = loc.index;
    this.route = loc.route;
    const p = loc.p;
    const indoor = roofed(p.cover);
    const limit = limitOf(p) - 0.6;
    if (indoor && Math.abs(loc.offset) > limit) {
      const push = Math.abs(loc.offset) - limit;
      want.x -= -p.tz * Math.sign(loc.offset) * push;
      want.z -= p.tx * Math.sign(loc.offset) * push;
    }
    const floor = surfaceY(p, loc.offset);
    want.y = Math.max(want.y, floor + 0.6);
    if (indoor) want.y = Math.min(want.y, floor + 5.2);

    if (!this.started || follow.lookBack) this.pos.copy(want);
    else this.pos.lerp(want, 1 - Math.exp(-dt * rig.lag));
    this.started = !follow.lookBack;
    this.camera.position.copy(this.pos);
    this.camera.lookAt(target.x + fx * rig.look, target.y + rig.lookUp, target.z + fz * rig.look);

    const fov = follow.boosting ? BOOST_FOV : FOV;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 6));
      this.camera.updateProjectionMatrix();
    }
  }

  /** Slowly circles a point, for the car select screen. */
  orbit(at: THREE.Vector3, time: number): void {
    const a = time * 0.35;
    this.camera.position.set(at.x + Math.sin(a) * 6.4, at.y + 2.3, at.z + Math.cos(a) * 6.4);
    this.camera.lookAt(at.x, at.y + 0.8, at.z);
    if (this.camera.fov !== FOV) {
      this.camera.fov = FOV;
      this.camera.updateProjectionMatrix();
    }
    this.started = false;
  }
}
