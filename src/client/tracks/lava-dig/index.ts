import type * as THREE from 'three';
import { paveRoad, startLine } from '../../render/road';
import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { buildDigHall, buildExitTunnel, buildTube, digHall } from './caves';
import { buildChamber } from './chamber';
import { volcanoGround } from './ground';
import { lavaMats } from './materials';
import { Lights } from './util';

/** Lava Dig: an excavation under a live volcano, a lava tube into the magma chamber and a rock bridge over its lake. */
export const lavaDig: TrackArt = {
  theme: {
    zenith: [0.1, 0.05, 0.06],
    upper: [0.32, 0.12, 0.08],
    below: [0.22, 0.1, 0.07],
    fog: [0.62, 0.27, 0.12],
    haze: 0.7,
    sunDir: [0.5, 0.32, -0.6],
    sunColor: [1.1, 0.62, 0.36],
    skyLight: [0.36, 0.22, 0.2],
    groundLight: [0.46, 0.22, 0.12],
    sun: false,
    clouds: false,
    stars: false,
    night: false,
  },
  build({ track, mats, batch, grid }) {
    const m = lavaMats();
    const index = new TrackIndex(track);
    buildTerrain(index, batch, volcanoGround(m));
    paveRoad(track, batch, {
      road: (p) => (p.surface === 'lava' ? null : p.surface === 'wood' ? (p.cover === 'open' ? mats.planks : m.timberIn) : p.zone === 'dig' ? m.digRoad : p.cover === 'open' ? m.road : m.roadIn),
      verge: (p) => (p.surface === 'lava' ? null : p.zone === 'dig' ? m.digFloor : p.cover === 'open' ? m.rubbleOut : m.rubbleIn),
      skirt: (p) => (p.cover === 'open' ? { mat: m.rubbleOut, drop: 1.2, out: 2.5 } : null),
    });
    startLine(track, batch, mats, grid);
    const lights = new Lights();
    const flames: THREE.Vector3[] = [];
    buildDigHall(track, batch, m, digHall(track));
    buildTube(track, batch, m, lights, flames);
    buildExitTunnel(track, batch, m, lights, flames);
    buildChamber(track, batch, m, lights, flames);
    return {
      flames,
      update(time) {
        lights.update(time);
      },
    };
  },
};
