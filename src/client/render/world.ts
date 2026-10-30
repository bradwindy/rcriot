import * as THREE from 'three';
import type { Track } from '../../shared/track';
import { Batch } from './geometry';
import { createMaterials } from './materials';
import { buildProps } from './props';
import { buildTrackStructures, type Torch } from './road';
import { farIslands, Sky, water } from './sky';
import { buildTerrain } from './terrain';
import { TrackIndex } from './trackindex';
import { valueNoise } from './noise';

export class World {
  readonly scene = new THREE.Scene();
  readonly sky: Sky;
  private readonly torches: Torch[];

  constructor(track: Track, grid: { s: number; offset: number }[]) {
    const mats = createMaterials();
    const index = new TrackIndex(track);
    const batch = new Batch(mats.wire);
    const terrain = buildTerrain(index, mats, batch);
    this.torches = buildTrackStructures(track, batch, mats, grid);
    buildProps(track, index, terrain, batch, mats);
    for (const mesh of batch.meshes()) this.scene.add(mesh);
    this.sky = new Sky(mats);
    this.scene.add(this.sky.group, farIslands(mats), water(mats, terrain));
  }

  update(camera: THREE.Camera, time: number): void {
    this.sky.update(camera, time);
    for (const t of this.torches) {
      const f = 0.8 + 0.35 * valueNoise(time * 7 + t.seed, t.seed, 1);
      t.light.color.copy(t.base).multiplyScalar(f);
    }
  }
}
