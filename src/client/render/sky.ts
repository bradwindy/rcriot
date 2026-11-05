import * as THREE from 'three';
import type { Theme } from '../tracks/types';
import type { Materials } from './materials';
import { hash2 } from './noise';
import { globals } from './ps1';

/** The sky, sun, clouds and stars ride with the camera. Each track's theme colours them. */
export class Sky {
  readonly group = new THREE.Group();
  private readonly dome: THREE.Mesh<THREE.SphereGeometry>;
  private readonly clouds: THREE.Mesh;
  private readonly sun: THREE.Mesh;
  private readonly stars: THREE.Mesh;

  constructor(mats: Materials) {
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 12), mats.sky);
    this.dome.renderOrder = -2;

    const band = new THREE.CylinderGeometry(820, 820, 170, 24, 1, true);
    const uv = band.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 4);
    this.clouds = new THREE.Mesh(band, mats.cloud);
    this.clouds.position.y = 120;
    this.clouds.renderOrder = -1;

    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mats.sun);
    this.sun.renderOrder = -1;

    this.stars = new THREE.Mesh(starField(), mats.stars);
    this.stars.renderOrder = -1;

    this.group.add(this.dome, this.clouds, this.sun, this.stars);
  }

  /** Colours the dome from overhead to the horizon, which is the fog colour, and shows what the theme asks for. */
  setTheme(theme: Theme): void {
    const horizon = new THREE.Color(...theme.fog);
    const zenith = new THREE.Color(...theme.zenith);
    const upper = new THREE.Color(...theme.upper);
    const below = new THREE.Color(...theme.below);
    const dome = this.dome.geometry;
    const pos = dome.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 900;
      const c =
        y < 0
          ? below.clone().lerp(horizon, Math.max(0, 1 + y * 4))
          : y < 0.25
            ? horizon.clone().lerp(upper, y / 0.25)
            : upper.clone().lerp(zenith, Math.min(1, (y - 0.25) / 0.5));
      colors.push(c.r, c.g, c.b);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.clouds.visible = theme.clouds;
    this.sun.visible = theme.sun;
    this.stars.visible = theme.stars;
  }

  update(camera: THREE.Camera, time: number): void {
    this.group.position.copy(camera.position);
    this.clouds.rotation.y = time * 0.004;
    this.sun.position.copy(globals.uSunDir.value).multiplyScalar(780);
    this.sun.lookAt(camera.position);
  }
}

/** A few hundred specks scattered over the upper sky. */
function starField(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < 420; i++) {
    const a = hash2(i, 1, 41) * Math.PI * 2;
    const up = 0.08 + hash2(i, 2, 41) * 0.92;
    const r = 860;
    const flat = Math.sqrt(1 - up * up);
    const centre = new THREE.Vector3(Math.cos(a) * flat * r, up * r, Math.sin(a) * flat * r);
    const size = 1.6 + hash2(i, 3, 41) * 2.4;
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(size);
    const lift = new THREE.Vector3().crossVectors(centre.clone().normalize(), side).normalize().multiplyScalar(size);
    const b = 0.55 + hash2(i, 4, 41) * 0.45;
    const corners = [side.clone().negate().sub(lift), side.clone().sub(lift), side.clone().add(lift), side.clone().negate().add(lift)];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const v = centre.clone().add(corners[k]);
      pos.push(v.x, v.y, v.z);
      col.push(b, b, b * 1.05);
      uv.push(0, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
