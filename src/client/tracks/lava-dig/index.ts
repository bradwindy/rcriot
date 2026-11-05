import * as THREE from 'three';
import { COUNTDOWN } from '../../../shared/race';
import { CALDERA } from '../../../shared/tracks/lava-dig';
import { paveRoad, startLine } from '../../render/road';
import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { buildDigHall, buildExitTunnel, buildTube, digHall } from './caves';
import { buildChamber } from './chamber';
import { buildDig } from './dig';
import { FLOW, volcanoGround } from './ground';
import { cartRig, geyserRig } from './hazards';
import { lavaMats } from './materials';
import { buildOutside } from './outside';
import { Smoke } from './smoke';
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
  build({ track, mats, batch, group, grid }) {
    const m = lavaMats();
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, volcanoGround(m));
    paveRoad(track, batch, {
      road: (p) =>
        p.surface === 'lava'
          ? null
          : p.surface === 'wood'
            ? p.cover === 'open'
              ? mats.planks
              : m.timberIn
            : p.zone === 'dig'
              ? m.digRoad
              : p.cover === 'open'
                ? m.road
                : m.roadIn,
      verge: (p) => (p.surface === 'lava' ? null : p.zone === 'dig' ? m.digFloor : p.cover === 'open' ? m.rubbleOut : m.rubbleIn),
      skirt: (p) => (p.cover === 'open' ? { mat: m.rubbleOut, drop: 1.2, out: 2.5 } : null),
    });
    startLine(track, batch, mats, grid);
    const lights = new Lights();
    const flames: THREE.Vector3[] = [];
    const hall = digHall(track);
    buildDigHall(track, batch, m, hall);
    buildDig(track, batch, mats, m, hall, lights);
    buildTube(track, batch, m, lights, flames);
    buildExitTunnel(track, batch, m, lights, flames);
    buildChamber(track, batch, m, lights, flames);
    const lamps = buildOutside(track, batch, mats, m, terrain, group, lights, flames);
    const rigs = track.hazards.map((h) => (h.kind === 'roll' ? cartRig : geyserRig)(track, h, batch, m, group));
    for (const r of rigs) flames.push(...r.flames);

    const vent = new THREE.Vector3(CALDERA.x, 88, CALDERA.z);
    const source = new THREE.Vector3(CALDERA.x + FLOW.dir.x * FLOW.from, 0, CALDERA.z + FLOW.dir.z * FLOW.from);
    const wind = new THREE.Vector3(3, 0, 1.5);
    const smoke = new Smoke(
      [
        { at: vent, count: 22, rise: 7, size: [14, 46], life: 16, drift: wind, tone: [0.3, 0.26, 0.25] },
        { at: source, count: 8, rise: 3, size: [4, 14], life: 7, drift: wind.clone().multiplyScalar(0.5), tone: [0.5, 0.42, 0.38] },
      ],
      m.smoke,
    );
    group.add(smoke.mesh);

    return {
      flames,
      update(time, _dt, clock, camera) {
        lights.update(time);
        for (const r of rigs) r.update(clock, time);
        smoke.update(time, camera);
        lamps.red.forEach((lamp, i) => (lamp.visible = clock < COUNTDOWN && clock >= (i * COUNTDOWN) / 4));
        lamps.green.visible = clock >= COUNTDOWN;
      },
    };
  },
};
