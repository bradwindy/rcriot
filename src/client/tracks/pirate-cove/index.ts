import { valueNoise } from '../../render/noise';
import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { island } from './ground';
import { buildProps } from './props';
import { farIslands, water } from './sea';
import { buildTrackStructures } from './structures';

export const pirateCove: TrackArt = {
  theme: {
    zenith: [0.24, 0.42, 0.74],
    upper: [0.55, 0.62, 0.86],
    below: [0.86, 0.66, 0.52],
    fog: [0.96, 0.78, 0.6],
    sunDir: [-0.62, 0.42, 0.45],
    sunColor: [1.0, 0.86, 0.66],
    skyLight: [0.5, 0.56, 0.7],
    groundLight: [0.42, 0.34, 0.28],
    sun: true,
    clouds: true,
    stars: false,
    night: false,
  },
  build({ track, mats, batch, group, grid }) {
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, island(mats));
    const torches = buildTrackStructures(track, batch, mats, grid);
    buildProps(track, index, terrain, batch, mats);
    group.add(farIslands(mats), water(mats, terrain));
    return {
      flames: torches.map((t) => t.light.position),
      update(time) {
        for (const t of torches) {
          const f = 0.8 + 0.35 * valueNoise(time * 7 + t.seed, t.seed, 1);
          t.light.color.copy(t.base).multiplyScalar(f);
        }
      },
    };
  },
};
