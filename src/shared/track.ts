import type { Hazard } from './hazards';

/** What the wheels run on. Lava, goo and void swallow a car that lands on them, and it comes back a little way behind. */
export const SURFACES = [
  'sand', 'wood', 'rock', 'dirt', 'grass', 'mud', 'stone', 'metal', 'asphalt', 'glass', 'dust', 'lava', 'goo', 'void',
] as const;
export type Surface = (typeof SURFACES)[number];

export const SURFACE: Record<Surface, { grip: number; top: number; kill?: true }> = {
  sand: { grip: 1, top: 1 },
  wood: { grip: 1, top: 1 },
  rock: { grip: 1, top: 1 },
  dirt: { grip: 0.95, top: 1 },
  grass: { grip: 0.9, top: 1 },
  mud: { grip: 0.75, top: 0.86 },
  stone: { grip: 1, top: 1 },
  metal: { grip: 0.92, top: 1 },
  asphalt: { grip: 1.08, top: 1 },
  glass: { grip: 0.85, top: 1 },
  dust: { grip: 0.85, top: 1 },
  lava: { grip: 1, top: 1, kill: true },
  goo: { grip: 1, top: 1, kill: true },
  void: { grip: 1, top: 1, kill: true },
};

/**
 * What the track runs through. Open ground: the terrain meets the road and the shoulders are rough. A deck: a bridge,
 * pier or gantry, raised clear of the ground. Indoor: inside a building or hull. A tunnel: through rock or earth.
 */
export const COVERS = ['open', 'deck', 'indoor', 'tunnel'] as const;
export type Cover = (typeof COVERS)[number];

export const roofed = (c: Cover): boolean => c === 'indoor' || c === 'tunnel';

export interface ControlPoint {
  x: number;
  y: number;
  z: number;
  width: number;
  /** Drivable verge beyond each road edge, out to the barrier. */
  shoulder: number;
  /** Degrees. Positive raises the right-hand edge. */
  bank: number;
  /** Surface and cover apply from this point to the next. */
  surface: Surface;
  cover: Cover;
  /** The track's own name for this stretch, for its scenery: 'pier', 'temple', 'airlock'. */
  zone?: string;
  /** Dark enough for headlights. Defaults to true indoors and in tunnels. */
  dark?: boolean;
  /** Share of normal gravity, for low-gravity stretches. */
  gravity?: number;
}

export interface Sample {
  x: number;
  y: number;
  z: number;
  /** Unit tangent in the ground plane. */
  tx: number;
  tz: number;
  /** Rise per unit of distance along the track. */
  grade: number;
  width: number;
  shoulder: number;
  /** Radians. Positive raises the right-hand edge. */
  bank: number;
  surface: Surface;
  cover: Cover;
  zone: string;
  dark: boolean;
  gravity: number;
  s: number;
}

export interface Track {
  samples: Sample[];
  length: number;
  step: number;
  /** Distance along the track of each control point. */
  marks: number[];
  /** Other ways round, each a whole lap that leaves this one at a fork and joins it again. Route 0 is this track. */
  routes: Route[];
  /** Height of the sea or lake, where there is one. */
  water: number | null;
  hazards: Hazard[];
  /** Rows of pick-up boxes, as shares of the lap. */
  boxes: number[];
}

/**
 * Another way round. Its distances map to the main track's: the same before the fork and after the join, and spread
 * evenly between them. Cars may cross between routes only in the zones, where the two roads overlap.
 */
export interface Route {
  track: Track;
  /** Main-track distances where the fork starts and the join ends, and the same points along this route. */
  from: number;
  to: number;
  rfrom: number;
  rto: number;
  /** Main-track distance ranges where the roads overlap at the fork and the join. */
  zones: [number, number][];
}

/** Where a point sits relative to the track: nearest sample, distance along, and signed distance to the right. */
export interface Locus {
  index: number;
  s: number;
  offset: number;
}

const SUB = 64;

function centripetal(p0: number[], p1: number[], p2: number[], p3: number[], t: number): number[] {
  const knot = (a: number[], b: number[]) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), 1e-4);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: number, b: number, ta: number, tb: number) => (a * (tb - u) + b * (u - ta)) / (tb - ta);
  return [0, 1, 2].map((i) => {
    const a1 = mix(p0[i], p1[i], 0, t1);
    const a2 = mix(p1[i], p2[i], t1, t2);
    const a3 = mix(p2[i], p3[i], t2, t3);
    const b1 = mix(a1, a2, 0, t2);
    const b2 = mix(a2, a3, t1, t3);
    return mix(b1, b2, t1, t2);
  });
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Closed centripetal Catmull-Rom loop through the control points, resampled every `step` units. */
export function buildTrack(points: ControlPoint[], step = 1): Track {
  const n = points.length;
  const dense: { x: number; y: number; z: number; seg: number; t: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((d) => {
      const p = points[(i + d + n) % n];
      return [p.x, p.y, p.z];
    });
    for (let k = 0; k < SUB; k++) {
      const [x, y, z] = centripetal(p0, p1, p2, p3, k / SUB);
      dense.push({ x, y, z, seg: i, t: k / SUB });
    }
  }
  dense.push({ ...dense[0], seg: n - 1, t: 1 });

  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = cum[cum.length - 1];
  const count = Math.round(total / step);
  const realStep = total / count;
  const marks = points.map((_, i) => cum[i * SUB]);

  const samples: Sample[] = [];
  let j = 0;
  for (let m = 0; m < count; m++) {
    const target = m * realStep;
    while (cum[j + 1] < target) j++;
    const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j];
    const b = dense[j + 1];
    const seg = a.seg;
    const t = smooth(Math.min(1, a.t + f / SUB));
    const p1 = points[seg];
    const p2 = points[(seg + 1) % n];
    samples.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
      tx: 0,
      tz: 0,
      grade: 0,
      width: p1.width + (p2.width - p1.width) * t,
      shoulder: p1.shoulder + (p2.shoulder - p1.shoulder) * t,
      bank: ((p1.bank + (p2.bank - p1.bank) * t) * Math.PI) / 180,
      surface: p1.surface,
      cover: p1.cover,
      zone: p1.zone ?? '',
      dark: p1.dark ?? roofed(p1.cover),
      gravity: (p1.gravity ?? 1) + ((p2.gravity ?? 1) - (p1.gravity ?? 1)) * t,
      s: target,
    });
  }
  for (let i = 0; i < count; i++) {
    const prev = samples[(i - 1 + count) % count];
    const next = samples[(i + 1) % count];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz);
    samples[i].tx = dx / len;
    samples[i].tz = dz / len;
    samples[i].grade = (next.y - prev.y) / (2 * realStep);
  }
  return { samples, length: total, step: realStep, marks, routes: [], water: null, hazards: [], boxes: [] };
}

export function wrapS(track: Track, s: number): number {
  return ((s % track.length) + track.length) % track.length;
}

/** The track interpolated at any distance along it. Surface and cover come from the sample behind. */
export function sampleAt(track: Track, s: number): Sample {
  const { samples, step } = track;
  const n = samples.length;
  const w = wrapS(track, s);
  const f = w / step;
  const i = Math.floor(f) % n;
  const t = f - Math.floor(f);
  const a = samples[i];
  const b = samples[(i + 1) % n];
  const tx = a.tx + (b.tx - a.tx) * t;
  const tz = a.tz + (b.tz - a.tz) * t;
  const tl = Math.hypot(tx, tz) || 1;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    tx: tx / tl,
    tz: tz / tl,
    grade: a.grade + (b.grade - a.grade) * t,
    width: a.width + (b.width - a.width) * t,
    shoulder: a.shoulder + (b.shoulder - a.shoulder) * t,
    bank: a.bank + (b.bank - a.bank) * t,
    surface: a.surface,
    cover: a.cover,
    zone: a.zone,
    dark: a.dark,
    gravity: a.gravity + (b.gravity - a.gravity) * t,
    s: w,
  };
}

/** Half-width from the centre line to the barrier. */
export function limitOf(p: Sample): number {
  return p.width / 2 + p.shoulder;
}

/** Height of the drivable surface at a signed offset from the centre line, flat beyond the barrier. */
export function surfaceY(p: Sample, offset: number): number {
  const limit = limitOf(p);
  return p.y + Math.max(-limit, Math.min(limit, offset)) * Math.tan(p.bank);
}

/**
 * Projects a ground-plane point onto the track. With a hint it only searches nearby samples, which keeps each car
 * on its own stretch of track where two stretches pass close together.
 */
export function locate(track: Track, x: number, z: number, hint = -1): Locus {
  const { samples } = track;
  const n = samples.length;
  const span = hint < 0 ? n : 48;
  const start = hint < 0 ? 0 : hint - span / 2;
  let best = 0;
  let bestD = Infinity;
  let bestT = 0;
  for (let k = 0; k < span; k++) {
    const i = (((start + k) % n) + n) % n;
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
    const d = (x - a.x - abx * t) ** 2 + (z - a.z - abz * t) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
      bestT = t;
    }
  }
  const a = samples[best];
  const b = samples[(best + 1) % n];
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len = Math.hypot(abx, abz);
  const offset = ((x - a.x - abx * bestT) * -abz + (z - a.z - abz * bestT) * abx) / len;
  return { index: best, s: wrapS(track, a.s + bestT * track.step), offset };
}

/** Distance ranges along the track where `test` holds, in order. */
export function ranges(track: Track, test: (p: Sample) => boolean): [number, number][] {
  const out: [number, number][] = [];
  const { samples, step } = track;
  let start = -1;
  samples.forEach((p, i) => {
    if (test(p) && start < 0) start = i;
    if (!test(p) && start >= 0) {
      out.push([start * step, i * step]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start * step, track.length]);
  return out;
}

/** Distance ranges along the track with the given cover, in order. */
export function coverRanges(track: Track, cover: Cover): [number, number][] {
  return ranges(track, (p) => p.cover === cover);
}

/** Distance ranges along the track in the named zone, in order. */
export function zoneRanges(track: Track, zone: string): [number, number][] {
  return ranges(track, (p) => p.zone === zone);
}
