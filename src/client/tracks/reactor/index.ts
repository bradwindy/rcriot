import * as THREE from 'three';
import type { Sample } from '../../../shared/track';
import { BASE } from '../../../shared/tracks/reactor';
import { xf } from '../../render/geometry';
import { paveRoad, startLine } from '../../render/road';
import { TrackIndex } from '../../render/trackindex';
import type { TrackArt } from '../types';
import { buildApron, buildBarriers } from './apron';
import { Quads, Rig } from './fx';
import { buildGround } from './ground';
import { buildHall, placeRings, type Pulse } from './hall';
import { plasmaVent, robotArm } from './hazards';
import { buildSilo, placeOrbit } from './silo';
import { planet, PLANET_DIR } from './sky';
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

const STEAM: [number, number, number] = [0.75, 0.85, 0.85];

/** Reactor: a space station's reactor complex at night, round the core, over the coolant and up the plasma coil. */
export const reactor: TrackArt = {
  theme: {
    zenith: [0.012, 0.006, 0.03],
    upper: [0.05, 0.03, 0.1],
    below: [0.03, 0.03, 0.05],
    fog: [0.08, 0.07, 0.16],
    haze: 0.85,
    sunDir: [0.55, 0.32, -0.77],
    sunColor: [0.34, 0.24, 0.3],
    skyLight: [0.16, 0.16, 0.26],
    groundLight: [0.07, 0.1, 0.1],
    sun: false,
    clouds: false,
    stars: true,
    night: true,
  },
  build({ track, batch, mats, group, grid }) {
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
        return { mat: m.neon, drop: 0.25, out: 0 };
      },
    });
    startLine(track, batch, mats, grid);
    buildBarriers(track, batch, m);
    const neonRig = new Rig(m.neon);
    const armRig = new Rig(m.paintIn);
    const hall = buildHall(track, batch, m, neonRig);
    const pulses: Pulse[] = [...hall.pulses];
    const spire = buildSilo(track, batch, m, neonRig, pulses);
    const apron = buildApron(track, index, batch, m, pulses);
    const hazards = track.hazards.map((h) => (h.kind === 'sweep' ? robotArm(track, h, batch, m, armRig, neonRig) : plasmaVent(track, h, batch, m)));
    for (const v of apron.vents) batch.box(m.gratingOut, 2, 0.3, 2, xf(v.x, v.y + 0.1, v.z));
    const sparks = new Quads(m.spark, 500, 3);
    const steam = new Quads(m.smoke, 200, 2);
    const beams = new Quads(m.beam, 60, 4);
    const sky = planet(m);
    Object.assign(window, { __fx: { sparks, steam, beams } });
    group.add(neonRig.mesh, armRig.mesh, sparks.mesh, steam.mesh, beams.mesh, sky);
    const ray = new THREE.Vector3();
    const tip = new THREE.Vector3();
    const side = new THREE.Vector3();

    return {
      update(time, _dt, clock, camera) {
        for (const p of pulses) {
          if (!p.speed) continue;
          const f = 1 - p.depth * (0.5 + 0.5 * Math.sin(time * p.speed + p.phase));
          p.light.color.copy(p.base).multiplyScalar(f);
        }
        placeRings(neonRig, hall.rings, time);
        placeOrbit(neonRig, spire, time);
        sky.position.copy(camera.position).addScaledVector(PLANET_DIR, 640);
        sparks.begin(camera);
        steam.begin(camera);
        beams.begin(camera);
        const dbg = (window as unknown as { __t?: number[] }).__t;
        if (dbg) { sparks.puff(dbg[0], dbg[1], dbg[2], 4, [1, 1, 1], 1); steam.puff(dbg[0] + 10, dbg[1], dbg[2], 4, [1, 1, 1], 1); }
        for (const hz of hazards) hz.update(clock, time, sparks);
        for (const [k, v] of apron.vents.entries()) {
          if (v.distanceToSquared(camera.position) > 140 * 140) continue;
          const t = (time / 5 + k * 0.37) % 1;
          if (t > 0.5) continue;
          for (let i = 0; i < 10; i++) {
            const f = (time * 0.9 + i / 10) % 1;
            steam.puff(v.x + Math.sin(i * 3.1 + time) * f * 0.8, v.y + 0.4 + f * 6, v.z + Math.cos(i * 1.7) * f * 0.8, 0.5 + f * 1.4, STEAM, 0.55 * (1 - f) * Math.min(1, (0.5 - t) * 8));
          }
        }
        for (const b of apron.beacons) {
          if (b.at.distanceToSquared(camera.position) > 200 * 200) continue;
          const a = time * b.speed + b.phase;
          const f = 0.5 + 0.5 * Math.cos(a - Math.atan2(camera.position.x - b.at.x, camera.position.z - b.at.z));
          b.light.color.copy(b.base).multiplyScalar(0.3 + f * 0.9);
          for (const flip of [0, Math.PI]) {
            ray.set(Math.sin(a + flip), 0, Math.cos(a + flip));
            side.set(ray.z, 0, -ray.x).multiplyScalar(0.25);
            tip.copy(b.at).addScaledVector(ray, 7);
            const wide = ray.clone().set(ray.z, 0, -ray.x).multiplyScalar(1.6);
            const c: [number, number, number] = [b.base.r * 0.5, b.base.g * 0.5, b.base.b * 0.5];
            beams.quad(b.at.clone().add(side), b.at.clone().sub(side), tip.clone().sub(wide), tip.clone().add(wide), c, 0.8);
          }
        }
        sparks.end();
        steam.end();
        beams.end();
        neonRig.update();
        armRig.update();
      },
    };
  },
};
