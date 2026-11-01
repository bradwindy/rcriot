import { BITE } from '../../../shared/tracks/monster-docks';
import { valueNoise } from '../../render/noise';
import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { docksGround, harbourWater, searchlights, skyline } from './ground';
import { fire } from './kit';
import { looks } from './look';
import { seaMonster } from './monster';
import { barriers, pave, startGate, viaduct } from './roads';
import { warehouse } from './warehouse';

export const monsterDocks: TrackArt = {
  theme: {
    zenith: [0.13, 0.08, 0.27],
    upper: [0.44, 0.2, 0.44],
    below: [0.18, 0.1, 0.16],
    fog: [0.9, 0.45, 0.32],
    haze: 1.05,
    sunDir: [-0.86, 0.14, 0.32],
    sunColor: [1.0, 0.56, 0.32],
    skyLight: [0.44, 0.34, 0.58],
    groundLight: [0.32, 0.2, 0.22],
    sun: true,
    clouds: false,
    stars: true,
    night: false,
  },
  build({ track, mats, batch, group, grid }) {
    const look = looks();
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, docksGround(look));
    pave(track, batch, mats, look, grid);
    const lamps = barriers(track, batch, mats, look);
    viaduct(track, batch, mats, look);
    startGate(track, batch, mats, look);
    const shed = warehouse(track, batch, mats, look);
    const monster = seaMonster(track, batch, look, BITE);
    const city = skyline(batch, look);
    const flames = city.fires.map((f, i) => {
      fire(batch, mats, look, f, 10 + (i % 3) * 4, true, false);
      return f;
    });
    const beams = searchlights(look, city.lights);
    group.add(harbourWater(look, terrain), beams.mesh, shed.group, monster.group);
    return {
      flames,
      update(time, _dt, clock) {
        beams.update(time);
        monster.update(time, clock);
        shed.update(time);
        for (const [i, l] of lamps.entries()) {
          if (i % 7 === 3) l.color.setRGB(1, 0.62, 0.3).multiplyScalar(valueNoise(time * 9, i, 4) > 0.25 ? 1.3 : 0.2);
        }
      },
    };
  },
};
