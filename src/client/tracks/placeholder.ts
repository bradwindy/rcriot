import { buildTerrain } from '../render/terrain';
import { TrackIndex } from '../render/trackindex';
import { paveRoad, startLine } from '../render/road';
import type { TrackArt } from './types';

/** Flat ground and a plain road, standing in until a track's own scenery is built. */
export function placeholderArt(): TrackArt {
  return {
    theme: {
      zenith: [0.3, 0.42, 0.62],
      upper: [0.55, 0.6, 0.72],
      below: [0.5, 0.48, 0.44],
      fog: [0.72, 0.72, 0.7],
      sunDir: [-0.5, 0.6, 0.4],
      sunColor: [1, 0.95, 0.85],
      skyLight: [0.5, 0.55, 0.65],
      groundLight: [0.4, 0.36, 0.3],
      sun: true,
      clouds: true,
      stars: false,
      night: false,
    },
    build({ track, mats, batch, grid }) {
      buildTerrain(new TrackIndex(track), batch, {
        x0: -400,
        x1: 400,
        z0: -400,
        z1: 400,
        cell: 8,
        height: () => 0,
        paint: () => mats.sand,
        tint: () => [0.8, 0.85, 0.7],
        headwall: mats.rock,
      });
      paveRoad(track, batch, { road: () => mats.dirt, verge: () => mats.sand });
      startLine(track, batch, mats, grid);
      return {};
    },
  };
}
