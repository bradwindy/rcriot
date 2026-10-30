import { stepCar, TICK, type Car, type CarInput, type CarSpec } from '../src/shared/car';
import { buildTrack, type ControlPoint, type Track } from '../src/shared/track';

export const BASE_TICKS = Math.round(1 / TICK);

/** A huge flat ring, wide enough to drift in circles without meeting a barrier. */
function arena(): Track {
  const points: ControlPoint[] = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: Math.cos(a) * 400, y: 0, z: Math.sin(a) * 400, width: 160, shoulder: 0, bank: 0, surface: 'sand', cover: 'open' };
  });
  return buildTrack(points);
}

/** Drives a car for `seconds` with one input. Moves it onto the arena the first time, unless one is passed in. */
export function driveFor(car: Car, spec: CarSpec, seconds: number, input: CarInput, track?: Track): Track {
  let t = track;
  if (!t) {
    t = arena();
    const p = t.samples[0];
    Object.assign(car, { x: p.x, z: p.z, y: 0, ground: 0, index: 0, heading: Math.atan2(-p.tx, -p.tz) });
  }
  for (let i = 0; i < Math.round(seconds / TICK); i++) stepCar(car, input, spec, t);
  return t;
}
