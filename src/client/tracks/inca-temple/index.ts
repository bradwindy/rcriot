import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import { valueNoise } from '../../render/noise';
import { paveRoad, startLine } from '../../render/road';
import type { TrackArt } from '../types';
import { buildCave } from './cave';
import { jungleGround } from './ground';
import { buildGorge, river } from './gorge';
import { buildJungle } from './jungle';
import { incaMats } from './palette';
import { buildTemple } from './temple';
import { boulderTrap, logTrap } from './traps';

export const incaTemple: TrackArt = {
  theme: {
    zenith: [0.1, 0.42, 0.72],
    upper: [0.42, 0.74, 0.86],
    below: [0.34, 0.5, 0.3],
    fog: [0.78, 0.9, 0.8],
    haze: 0.8,
    sunDir: [0.35, 0.78, -0.35],
    sunColor: [1.05, 0.92, 0.62],
    skyLight: [0.44, 0.6, 0.56],
    groundLight: [0.3, 0.38, 0.18],
    sun: true,
    clouds: true,
    stars: false,
    night: false,
  },
  build({ track, mats, batch, group, grid }) {
    const inca = incaMats();
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, jungleGround(track, mats, inca));
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
    buildJungle(track, batch, mats, inca, index, terrain);
    buildCave(track, batch, mats, inca, fires);
    buildGorge(track, batch, mats, inca, terrain, index);
    group.add(river(mats, terrain));
    const [ball, log] = track.hazards;
    const traps = [boulderTrap(track, ball, inca, group), logTrap(track, log, mats, inca, batch, group, fires)];
    return {
      flames: fires.map((f) => f.light.position),
      update(time, _dt, clock) {
        for (const t of traps) t.update(clock);
        for (const f of fires) f.light.color.copy(f.base).multiplyScalar(0.8 + 0.35 * valueNoise(time * 7 + f.seed, f.seed, 1));
      },
    };
  },
};
