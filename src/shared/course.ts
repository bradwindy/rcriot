import type { Hazard } from './hazards';
import { buildTrack, limitOf, locate, sampleAt, wrapS, type ControlPoint, type Route, type Sample, type Track } from './track';

/** Everything the race needs to know about one track. Its scenery lives with the client. */
export interface TrackDef {
  points: ControlPoint[];
  /**
   * A second way round. It leaves the main loop at control point `from`, runs through `points` and joins again at
   * control point `to`. Keep it clear of the start line and the grid behind it.
   */
  fork?: { from: number; to: number; points: ControlPoint[] };
  hazards?: Hazard[];
  /** Height of the sea or lake, where there is one. Things knocked off a deck splash into it. */
  water?: number;
  /** Rows of pick-up boxes, as shares of the lap. */
  boxes?: number[];
}

export const DEFAULT_BOXES = [0.07, 0.3, 0.64, 0.86];

export function routeTrack(track: Track, route: number): Track {
  return route > 0 ? track.routes[route - 1].track : track;
}

/** A route's own distance as a distance along the main track. */
export function toMain(track: Track, route: number, s: number): number {
  if (route <= 0) return s;
  const r = track.routes[route - 1];
  if (s <= r.rfrom) return s;
  if (s >= r.rto) return wrapS(track, s - r.rto + r.to);
  return r.from + ((s - r.rfrom) * (r.to - r.from)) / (r.rto - r.rfrom);
}

/** A main-track distance as a distance along a route. */
export function fromMain(track: Track, route: number, s: number): number {
  if (route <= 0) return s;
  const r = track.routes[route - 1];
  if (s <= r.from) return s;
  if (s >= r.to) return wrapS(r.track, s - r.to + r.rto);
  return r.rfrom + ((s - r.from) * (r.rto - r.rfrom)) / (r.to - r.from);
}

/** Where something is, on the route it is on. */
export interface Fix {
  route: number;
  /** Nearest sample on the route, for next time's hint. */
  index: number;
  /** Distance along the route, and along the main track. */
  s: number;
  ms: number;
  offset: number;
  p: Sample;
}

/**
 * Projects a point onto its route. Past the route's edge at a fork or join, where the two roads overlap, it moves
 * across to the other road if the point is on that one. `pad` is how far inside the edge counts as on the road.
 */
export function follow(track: Track, route: number, x: number, z: number, hint: number, pad: number): Fix {
  const own = routeTrack(track, route);
  const loc = locate(own, x, z, hint);
  const p = sampleAt(own, loc.s);
  const ms = toMain(track, route, loc.s);
  const here: Fix = { route, index: loc.index, s: loc.s, ms, offset: loc.offset, p };
  if (Math.abs(loc.offset) <= limitOf(p) - pad) return here;
  for (let j = 0; j <= track.routes.length; j++) {
    if (j === route || (route > 0 && j > 0)) continue;
    if (!track.routes[Math.max(j, route) - 1].zones.some(([a, b]) => ms >= a && ms <= b)) continue;
    const other = routeTrack(track, j);
    const guess = Math.round(fromMain(track, j, ms) / other.step) % other.samples.length;
    const near = locate(other, x, z, guess);
    const q = sampleAt(other, near.s);
    if (Math.abs(near.offset) <= limitOf(q) - pad) {
      return { route: j, index: near.index, s: near.s, ms: toMain(track, j, near.s), offset: near.offset, p: q };
    }
  }
  return here;
}

/** Main-track distance ranges where the two roads overlap, at the fork and at the join. */
function overlaps(main: Track, r: Omit<Route, 'zones'>): [number, number][] {
  const touching = (a: Track, b: Track, s: number, hint: number) => {
    const p = sampleAt(a, s);
    const loc = locate(b, p.x, p.z, hint);
    return Math.abs(loc.offset) < limitOf(p) + limitOf(sampleAt(b, loc.s)) && Math.abs(sampleAt(b, loc.s).y - p.y) < 3;
  };
  const hint = (t: Track, s: number) => Math.round(s / t.step) % t.samples.length;
  let split = r.from;
  while (split < r.to && touching(main, r.track, split, hint(r.track, r.rfrom + (split - r.from)))) split += 1;
  let rsplit = r.rfrom;
  while (rsplit < r.rto && touching(r.track, main, rsplit, hint(main, r.from + (rsplit - r.rfrom)))) rsplit += 1;
  let join = r.to;
  while (join > r.from && touching(main, r.track, join, hint(r.track, r.rto - (r.to - join)))) join -= 1;
  let rjoin = r.rto;
  while (rjoin > r.rfrom && touching(r.track, main, rjoin, hint(main, r.to - (r.rto - rjoin)))) rjoin -= 1;
  const mapped = (s: number) => r.from + ((s - r.rfrom) * (r.to - r.from)) / (r.rto - r.rfrom);
  return [
    [r.from - 2, Math.max(split, mapped(rsplit)) + 2],
    [Math.min(join, mapped(rjoin)) - 2, r.to + 2],
  ];
}

/** The main loop, with its fork as a second route, its hazards and its water. */
export function buildCourse(def: TrackDef): Track {
  const main = buildTrack(def.points);
  main.hazards = def.hazards ?? [];
  main.water = def.water ?? null;
  main.boxes = def.boxes ?? DEFAULT_BOXES;
  const fork = def.fork;
  if (fork) {
    const n = def.points.length;
    if (!(fork.from > 0 && fork.from < fork.to && fork.to < n - 1)) throw new Error('A fork must sit inside the lap');
    const points = [...def.points.slice(0, fork.from + 1), ...fork.points, ...def.points.slice(fork.to)];
    const track = buildTrack(points);
    const join = fork.from + 1 + fork.points.length + 1;
    const r = { track, from: main.marks[fork.from - 1], to: main.marks[fork.to + 1], rfrom: track.marks[fork.from - 1], rto: track.marks[join] };
    main.routes.push({ ...r, zones: overlaps(main, r) });
  }
  return main;
}
