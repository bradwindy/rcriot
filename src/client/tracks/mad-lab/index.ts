import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { edges, pave } from './edges';
import { crags, grounds, moat } from './ground';
import { madMats } from './materials';
import { castle } from './structures';

export const madLab: TrackArt = {
  theme: {
    zenith: [0.03, 0.03, 0.07],
    upper: [0.08, 0.08, 0.15],
    below: [0.05, 0.05, 0.08],
    fog: [0.17, 0.18, 0.27],
    haze: 0.75,
    sunDir: [0.45, 0.7, -0.5],
    sunColor: [0.3, 0.34, 0.52],
    skyLight: [0.22, 0.24, 0.36],
    groundLight: [0.1, 0.09, 0.13],
    sun: false,
    clouds: false,
    stars: false,
    night: true,
  },
  build({ track, mats, batch, group, grid }) {
    const m = madMats();
    const index = new TrackIndex(track);
    buildTerrain(index, batch, grounds(m));
    pave(track, batch, mats, m, grid);
    edges(track, batch, m);
    castle(track, batch, m);
    crags(batch, m);
    group.add(moat(m));
    return {};
  },
};
