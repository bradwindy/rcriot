import * as THREE from 'three';
import type { Track } from '../../shared/track';
import type { TrackId } from '../../shared/tracks';
import { TRACK_ART } from '../tracks';
import type { Art, Theme } from '../tracks/types';
import { Batch } from './geometry';
import { createMaterials, type Materials } from './materials';
import { valueNoise } from './noise';
import { clearPointLights, globals, haze } from './ps1';
import { Sky } from './sky';

/** How dark the sun, sky and fog get at the height of the Ultimate Weapon's storm. */
const STORM_DARK = 0.38;

/** The scene: a sky that stays, and one track's scenery at a time. */
export class World {
  readonly scene = new THREE.Scene();
  readonly sky: Sky;
  readonly mats: Materials;
  id: TrackId | null = null;
  theme: Theme | null = null;
  private stage: { group: THREE.Group; art: Art } | null = null;
  private calm: THREE.Color[] = [];
  private storm = 0;
  private stormLength = 1;

  constructor() {
    this.mats = createMaterials();
    this.sky = new Sky(this.mats);
    this.scene.add(this.sky.group);
  }

  /** Builds a track's scenery and light, replacing the last track's. Does nothing if it is already up. */
  load(id: TrackId, track: Track, grid: { s: number; offset: number }[]): void {
    if (this.id === id) return;
    this.unload();
    const { theme, build } = TRACK_ART[id];
    this.id = id;
    this.theme = theme;
    globals.uSunDir.value.set(...theme.sunDir).normalize();
    globals.uSunColor.value.setRGB(...theme.sunColor);
    globals.uSkyLight.value.setRGB(...theme.skyLight);
    globals.uGroundLight.value.setRGB(...theme.groundLight);
    globals.uFogColor.value.setRGB(...theme.fog);
    haze.value = theme.haze ?? 1;
    this.sky.setTheme(theme);
    this.calm = [globals.uSunColor.value, globals.uSkyLight.value, globals.uGroundLight.value, globals.uFogColor.value].map((c) => c.clone());
    this.storm = 0;

    const batch = new Batch(this.mats.wire);
    const group = new THREE.Group();
    const art = build({ track, mats: this.mats, batch, group, grid });
    for (const mesh of batch.meshes()) group.add(mesh);
    this.scene.add(group);
    this.stage = { group, art };
  }

  private unload(): void {
    if (!this.stage) return;
    this.scene.remove(this.stage.group);
    this.stage.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
    });
    this.stage = null;
    clearPointLights();
  }

  /** Flame tips that shed embers. */
  get flames(): THREE.Vector3[] {
    return this.stage?.art.flames ?? [];
  }

  /** Darkens the sky, sun and fog for a few seconds, for the Ultimate Weapon's thunderbolt. */
  darken(seconds: number): void {
    this.storm = seconds;
    this.stormLength = seconds;
  }

  /** `clock` is the race clock, for the hazards. */
  update(camera: THREE.Camera, time: number, dt: number, clock: number): void {
    this.sky.update(camera, time);
    this.stage?.art.update?.(time, dt, clock, camera);
    // Lanterns and film lights flicker a touch, like old bulbs.
    this.mats.lantern.uniforms.uTint.value.setScalar(0.85 + 0.2 * valueNoise(time * 5, 3, 7));
    this.mats.lens.uniforms.uTint.value.setScalar(0.92 + 0.1 * valueNoise(time * 9, 5, 2));
    this.mats.lantern.uniforms.uGlow.value = 0.45 + 0.35 * valueNoise(time * 4, 9, 1);
    this.mats.flame.uniforms.uGlow.value = 0.9 + 0.6 * valueNoise(time * 8, 2, 4);

    this.storm = Math.max(0, this.storm - dt);
    // Quick to darken, slow to clear: full dark for most of the storm, easing back in the last second.
    const dark = this.storm > 0 ? Math.min(1, this.storm / Math.min(1, this.stormLength)) : 0;
    const k = 1 - (1 - STORM_DARK) * dark;
    const targets = [globals.uSunColor.value, globals.uSkyLight.value, globals.uGroundLight.value, globals.uFogColor.value];
    targets.forEach((c, i) => c.copy(this.calm[i]).multiplyScalar(i === 3 ? 0.55 + 0.45 * k : k));
    this.mats.sky.uniforms.uTint.value.setScalar(0.4 + 0.6 * k);
    this.mats.cloud.uniforms.uTint.value.setRGB(0.5 + 0.5 * k, 0.5 + 0.5 * k, 0.55 + 0.45 * k);
    this.mats.sun.uniforms.uTint.value.setScalar(k);
  }
}
