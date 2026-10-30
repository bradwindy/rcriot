import * as THREE from 'three';
import type { Track } from '../../shared/track';
import { Batch } from './geometry';
import { createMaterials, type Materials } from './materials';
import { globals } from './ps1';
import { buildProps } from './props';
import { buildTrackStructures, type Torch } from './road';
import { farIslands, Sky, water } from './sky';
import { buildTerrain } from './terrain';
import { TrackIndex } from './trackindex';
import { valueNoise } from './noise';

/** How dark the sun, sky and fog get at the height of the Ultimate Weapon's storm. */
const STORM_DARK = 0.38;

export class World {
  readonly scene = new THREE.Scene();
  readonly sky: Sky;
  private readonly torches: Torch[];
  private readonly mats: Materials;
  private readonly calm: THREE.Color[];
  private storm = 0;
  private stormLength = 1;

  constructor(track: Track, grid: { s: number; offset: number }[]) {
    const mats = createMaterials();
    this.mats = mats;
    const index = new TrackIndex(track);
    const batch = new Batch(mats.wire);
    const terrain = buildTerrain(index, mats, batch);
    this.torches = buildTrackStructures(track, batch, mats, grid);
    buildProps(track, index, terrain, batch, mats);
    for (const mesh of batch.meshes()) this.scene.add(mesh);
    this.sky = new Sky(mats);
    this.scene.add(this.sky.group, farIslands(mats), water(mats, terrain));
    this.calm = [globals.uSunColor.value, globals.uSkyLight.value, globals.uGroundLight.value, globals.uFogColor.value].map((c) =>
      c.clone(),
    );
  }

  /** Torch flame positions, for embers. */
  get flames(): THREE.Vector3[] {
    return this.torches.map((t) => t.light.position);
  }

  /** Darkens the sky, sun and fog for a few seconds, for the Ultimate Weapon's thunderbolt. */
  darken(seconds: number): void {
    this.storm = seconds;
    this.stormLength = seconds;
  }

  update(camera: THREE.Camera, time: number, dt: number): void {
    this.sky.update(camera, time);
    for (const t of this.torches) {
      const f = 0.8 + 0.35 * valueNoise(time * 7 + t.seed, t.seed, 1);
      t.light.color.copy(t.base).multiplyScalar(f);
    }
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
