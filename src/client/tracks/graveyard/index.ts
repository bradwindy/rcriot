import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import { type Sample } from '../../../shared/track';
import { valueNoise } from '../../render/noise';
import { paveRoad, startLine } from '../../render/road';
import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { groundSpec, horizon, mist, MOON_DIR, pondWater } from './ground';
import { Kit } from './kit';
import { buildLife } from './life';
import { scatter } from './scatter';
import { buildSetPieces } from './structures';
import { gm } from './textures';

export const graveyard: TrackArt = {
  theme: {
    zenith: [0.01, 0.015, 0.05],
    upper: [0.05, 0.07, 0.16],
    below: [0.03, 0.04, 0.07],
    fog: [0.11, 0.14, 0.22],
    haze: 0.72,
    sunDir: MOON_DIR,
    sunColor: [0.42, 0.5, 0.8],
    skyLight: [0.2, 0.24, 0.4],
    groundLight: [0.08, 0.08, 0.12],
    sun: false,
    clouds: false,
    stars: true,
    night: true,
  },
  build({ track, mats, batch, group, grid }) {
    const g = gm();
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, groundSpec(mats, g));
    const kit = new Kit(batch, mats, g, terrain, index, mulberry32(1031));
    paveRoad(track, batch, {
      road: (p) => road(p, kit),
      verge: (p) => verge(p, kit),
      skirt: (p) => {
        if (p.cover === 'indoor' || p.cover === 'tunnel' || inHouse(p)) return null;
        if (p.zone === 'pond') return { mat: mats.planks, drop: 0.5, out: 0 };
        if (p.zone === 'lair') return { mat: g.blocks, drop: 1.4, out: 0 };
        if (p.zone === 'porch' && p.surface === 'wood') return { mat: mats.planks, drop: 2.5, out: 0 };
        return { mat: g.grass, drop: 1.4, out: 0.8 };
      },
    });
    startLine(track, batch, mats, grid);
    horizon(batch, g);
    pondWater(batch, g);
    mist(track, batch, g, terrain, index);
    const pieces = buildSetPieces(track, kit, grid);
    scatter(track, kit);
    const life = buildLife(track, kit, group, pieces);
    return {
      flames: kit.flames,
      update(time, dt, clock, camera) {
        for (const f of kit.lights) {
          const k = 1 - f.depth + f.depth * 2 * valueNoise(time * f.rate + f.seed, f.seed, 3);
          f.light.color.copy(f.base).multiplyScalar(k);
        }
        life.update(time, dt, clock, camera);
      },
    };
  },
};

const inHouse = (p: Sample) => p.zone === 'house' || p.zone === 'stairs' || p.zone === 'landing';

function road(p: Sample, kit: Kit): THREE.Material {
  const { g, mats } = kit;
  if (p.cover === 'tunnel') return g.cobbleIndoor;
  if (p.zone === 'stairs') return g.stairs;
  if (inHouse(p)) return g.floor;
  if (p.zone === 'lair' || p.surface === 'stone') return g.cobble;
  if (p.surface === 'wood') return mats.planks;
  return g.path;
}

function verge(p: Sample, kit: Kit): THREE.Material {
  const { g, mats } = kit;
  if (p.cover === 'tunnel') return g.cobbleIndoor;
  if (p.cover === 'indoor' || inHouse(p)) return mats.planksIndoor;
  if (p.zone === 'lair' || p.surface === 'stone') return g.flags;
  if (p.surface === 'wood') return mats.planks;
  return g.grass;
}
