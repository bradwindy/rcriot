import { COUNTDOWN } from '../../../shared/race';
import { buildTerrain } from '../../render/terrain';
import { TrackIndex } from '../../render/trackindex';
import { paveRoad, startLine } from '../../render/road';
import type { TrackArt } from '../types';
import { buildBase, openDoors } from './base';
import { earth, EARTH_DIR, farMountains, moonGround, SUN } from './ground';
import { landerRig, laserRig } from './hazards';
import { moonMats } from './materials';
import { buildProps } from './props';
import { buildTube } from './tube';

/** Moon Base: a lab, glass tubes and airlocks under a black sky, then out onto the craters in low gravity. */
export const moonBase: TrackArt = {
  theme: {
    zenith: [0, 0, 0.012],
    upper: [0.006, 0.008, 0.026],
    below: [0.02, 0.02, 0.03],
    fog: [0.04, 0.042, 0.065],
    haze: 1.6,
    sunDir: [SUN.x, SUN.y, SUN.z],
    sunColor: [1.55, 1.5, 1.42],
    skyLight: [0.1, 0.11, 0.16],
    groundLight: [0.2, 0.2, 0.22],
    sun: true,
    clouds: false,
    stars: true,
    night: false,
  },
  build({ track, mats, batch, group, grid }) {
    const mm = moonMats();
    const index = new TrackIndex(track);
    const terrain = buildTerrain(index, batch, moonGround(mm));
    paveRoad(track, batch, {
      road: (p) => (p.surface === 'void' ? null : p.cover === 'indoor' ? mm.platesIn : p.zone === 'tube' ? mm.plates : mm.lane),
      verge: (p) => (p.surface === 'void' ? null : p.cover === 'indoor' ? mm.stripesIn : p.zone === 'tube' ? mm.chase : mm.regolith),
      skirt: (p) => (p.cover === 'open' ? { mat: mm.regolith, drop: 1, out: 0.8 } : null),
    });
    startLine(track, batch, mats, grid);
    const base = buildBase(track, batch, mats, mm, group);
    buildTube(track, batch, mm, terrain);
    const props = buildProps(track, index, terrain, batch, mats, mm, group);
    const [laser, lander] = track.hazards.map((h) => (h.kind === 'sweep' ? laserRig : landerRig)(track, h, batch, mats, mm, group));
    const globe = earth(mm);
    group.add(globe, farMountains(mm));
    const { rover } = props;

    return {
      flames: [...laser.flames, ...lander.flames],
      update(time, _dt, clock, camera) {
        openDoors(base.doors, camera.position);
        laser.update(clock, time);
        lander.update(clock, time);
        globe.position.copy(camera.position).addScaledVector(EARTH_DIR, 640);
        globe.rotation.y = 2.2 + time * 0.01;

        const blink = time % 1.4 < 0.35;
        mm.beacon.uniforms.uTint.value.setScalar(blink ? 1.3 : 0.3);
        for (const w of base.warnings) w.light.color.copy(w.base).multiplyScalar(0.35 + 0.65 * Math.abs(Math.sin(time * 2.6 + w.seed)));

        props.lamps.red.forEach((lamp, i) => (lamp.visible = clock < COUNTDOWN && clock >= (i * COUNTDOWN) / 4));
        props.lamps.green.visible = clock >= COUNTDOWN;

        const a = time * 0.16;
        const x = rover.centre.x + Math.cos(a) * rover.radius;
        const z = rover.centre.z + Math.sin(a) * rover.radius;
        rover.rig.position.set(x, terrain.height(x, z), z);
        rover.rig.rotation.y = Math.PI - a;
      },
    };
  },
};
