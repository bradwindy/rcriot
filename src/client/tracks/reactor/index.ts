import * as THREE from 'three';
import type { Sample } from '../../../shared/track';
import { BASE } from '../../../shared/tracks/reactor';
import { paveRoad, startLine } from '../../render/road';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { Rig } from './fx';
import { buildGround } from './ground';
import { buildHall, placeRings, type Pulse } from './hall';
import { reactorMats, type ReactorMats } from './materials';

function roadOf(m: ReactorMats, p: Sample): THREE.Material | null {
  if (p.surface === 'goo' || (p.zone === 'catwalk' && p.y < BASE - 0.4)) return null;
  switch (p.zone) {
    case 'apron':
      return p.surface === 'metal' ? m.plateOut : m.asphalt;
    case 'ramp':
      return m.plateOut;
    case 'hall':
    case 'goo':
      return m.plateIn;
    case 'gantry':
      return m.gratingOut;
    default:
      return m.gratingIn;
  }
}

function vergeOf(m: ReactorMats, p: Sample): THREE.Material | null {
  if (roadOf(m, p) === null) return null;
  switch (p.zone) {
    case 'apron':
      return m.floorOut;
    case 'ramp':
    case 'gantry':
      return m.stripesOut;
    case 'catwalk':
      return m.gratingIn;
    default:
      return m.stripesIn;
  }
}

/** Reactor: a night at the launch complex, through the reactor hall and the goo pool and up the rocket tube. */
export const reactor: TrackArt = {
  theme: {
    zenith: [0.01, 0.02, 0.03],
    upper: [0.03, 0.08, 0.07],
    below: [0.03, 0.05, 0.04],
    fog: [0.09, 0.19, 0.14],
    haze: 0.8,
    sunDir: [0.35, 0.8, -0.45],
    sunColor: [0.26, 0.34, 0.4],
    skyLight: [0.16, 0.22, 0.24],
    groundLight: [0.06, 0.12, 0.08],
    sun: false,
    clouds: false,
    stars: true,
    night: true,
  },
  build({ track, mats, batch, group, grid }) {
    const m = reactorMats();
    const index = new TrackIndex(track);
    buildGround(index, batch, m);
    paveRoad(track, batch, {
      road: (p) => roadOf(m, p),
      verge: (p) => vergeOf(m, p),
      skirt: (p) => {
        if (roadOf(m, p) === null) return null;
        if (p.cover === 'open') return { mat: m.floorOut, drop: 1, out: 0.7 };
        if (p.cover === 'indoor') return { mat: m.floorIn, drop: 1, out: 0.7 };
        return { mat: p.zone === 'gantry' || p.zone === 'ramp' ? m.paintOut : m.paintIn, drop: 0.7, out: 0 };
      },
    });
    startLine(track, batch, mats, grid);
    const neonRig = new Rig(m.neon);
    const hall = buildHall(track, batch, m, neonRig);
    const pulses: Pulse[] = [...hall.pulses];
    group.add(neonRig.mesh);
    return {
      update(time) {
        for (const p of pulses) {
          if (!p.speed) continue;
          const f = 1 - p.depth * (0.5 + 0.5 * Math.sin(time * p.speed + p.phase));
          p.light.color.copy(p.base).multiplyScalar(f);
        }
        placeRings(neonRig, hall.rings, time);
        neonRig.update();
      },
    };
  },
};
