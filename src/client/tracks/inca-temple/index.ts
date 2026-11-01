import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import { valueNoise } from '../../render/noise';
import { paveRoad, startLine } from '../../render/road';
import type { TrackArt } from '../types';
import { jungleGround } from './ground';
import { incaMats } from './palette';
import { buildTemple } from './temple';

export const incaTemple: TrackArt = {
  theme: {
    zenith: [0.16, 0.42, 0.58],
    upper: [0.48, 0.74, 0.74],
    below: [0.3, 0.4, 0.24],
    fog: [0.8, 0.86, 0.6],
    haze: 0.85,
    sunDir: [0.35, 0.78, -0.35],
    sunColor: [1.0, 0.88, 0.56],
    skyLight: [0.42, 0.58, 0.46],
    groundLight: [0.3, 0.34, 0.16],
    sun: true,
    clouds: true,
    stars: false,
    night: false,
  },
  build({ track, mats, batch, grid }) {
    const inca = incaMats();
    const index = new TrackIndex(track);
    buildTerrain(index, batch, jungleGround(track, mats, inca));
    paveRoad(track, batch, {
      road: (p) => {
        if (p.surface === 'void') return null;
        if (p.surface === 'mud') return inca.mud;
        if (p.surface === 'rock') return mats.cave;
        if (p.surface === 'wood') return mats.planks;
        if (p.surface === 'stone') return p.zone === 'stair' ? inca.stair : p.cover === 'indoor' ? inca.stoneIndoor : inca.stone;
        return mats.dirt;
      },
      verge: (p) => {
        if (p.surface === 'void') return null;
        if (p.cover === 'tunnel') return mats.cave;
        if (p.cover === 'indoor') return inca.stoneIndoor;
        if (p.surface === 'wood') return mats.planks;
        if (p.cover === 'deck') return inca.stone;
        return p.surface === 'mud' ? inca.mud : inca.ground;
      },
      skirt: (p) => (p.cover === 'open' ? { mat: p.surface === 'mud' ? inca.mud : inca.ground, drop: 1, out: 0.7 } : null),
    });
    startLine(track, batch, mats, grid);
    const fires = buildTemple(track, batch, mats, inca);
    return {
      flames: fires.map((f) => f.light.position),
      update(time) {
        for (const f of fires) f.light.color.copy(f.base).multiplyScalar(0.8 + 0.35 * valueNoise(time * 7 + f.seed, f.seed, 1));
      },
    };
  },
};
