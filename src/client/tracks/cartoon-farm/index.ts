import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { valueNoise } from '../../render/noise';
import { barns } from './barns';
import { farHills, farmGround, MAP, milkRiver, outerGround, pondWater } from './ground';
import { looks } from './look';
import { decks, fences, paveFarm, startArch } from './roadside';
import { cartoonSky } from './sky';
import { Toon } from './toon';

/** Cartoon Farm: AKLM Studios' madcap cartoon set, all saturated colour, bold ink lines and bouncing livestock. */
export const cartoonFarm: TrackArt = {
  theme: {
    zenith: [0.14, 0.4, 0.92],
    upper: [0.36, 0.66, 1.0],
    below: [0.5, 0.74, 0.46],
    fog: [0.8, 0.92, 1.0],
    haze: 1.5,
    sunDir: [-0.45, 0.72, 0.5],
    sunColor: [0.78, 0.7, 0.52],
    skyLight: [0.72, 0.76, 0.86],
    groundLight: [0.52, 0.52, 0.42],
    sun: false,
    clouds: false,
    stars: false,
    night: false,
  },
  build({ track, mats, batch, group, grid }) {
    const L = looks();
    const toon = new Toon(batch, L);
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, farmGround(L));
    outerGround(batch, L);
    milkRiver(batch, L);
    paveFarm(track, batch, L, mats, grid);
    startArch(track, toon, L, mats);
    fences(track, toon, L);
    decks(track, toon, L, terrain, 0);
    const lamps = barns(track, toon, L);
    const sky = cartoonSky(L);
    group.add(farHills(L), pondWater(L), sky.group);
    void MAP;
    return {
      update(time, _dt, _clock, camera) {
        sky.update(time, camera);
        for (const l of lamps) l.light.color.copy(l.base).multiplyScalar(0.85 + 0.25 * valueNoise(time * 6 + l.seed, l.seed, 3));
      },
    };
  },
};
