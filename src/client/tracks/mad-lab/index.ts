import * as THREE from 'three';
import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { CEILING, edges, pave } from './edges';
import { Fx, Sparks } from './fx';
import { countryside } from './country';
import { crags, grounds, moat } from './ground';
import { halls } from './halls';
import { pendulum, teslaTrap, type Rig } from './hazards';
import { laboratory } from './lab';
import { madMats } from './materials';
import { storm } from './storm';
import { castle } from './structures';
import { towerFx } from './tower';
import { courtyard } from './yard';

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
    const fx = new Fx();
    const sparks = new Sparks(m.arc);
    group.add(sparks.mesh);
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, grounds(m));
    pave(track, batch, mats, m, grid);
    edges(track, batch, m);
    const { coil } = castle(track, batch, m);
    crags(batch, m);
    group.add(moat(m));
    const lab = laboratory(track, batch, m, fx, group, sparks);
    courtyard(track, batch, mats, m, fx);
    const hall = halls(track, batch, mats, m, fx);
    const land = countryside(track, terrain, batch, mats, m, fx, group);
    const tower = towerFx(track, batch, mats, m, fx, sparks, coil);
    const rigs: Rig[] = track.hazards.map((h) => (h.kind === 'sweep' ? pendulum(track, h, batch, m, group, sparks) : teslaTrap(track, h, batch, m, sparks, CEILING)));
    const sky = storm(group, m, sparks, coil.clone().setY(coil.y + 11));
    return {
      flames: fx.flames,
      update(time, _dt, clock, camera: THREE.Camera) {
        sparks.begin();
        fx.flicker(time);
        sky.update(time, camera);
        lab.update(time, sky);
        tower.update(time, sky);
        hall.update(time, sparks);
        land.update(time, sparks);
        for (const r of rigs) r.update(clock, time);
        sparks.end();
      },
    };
  },
};
