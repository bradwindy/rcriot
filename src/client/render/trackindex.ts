import type { Sample, Track } from '../../shared/track';

export interface Nearest {
  sample: Sample;
  /** Ground-plane distance to the sample. */
  d: number;
  /** Signed distance to the right of the centre line. */
  offset: number;
}

/** Every sample of the main track and of the fork's own stretch, so scenery keeps clear of both roads. */
export function allSamples(track: Track): Sample[] {
  return [...track.samples, ...track.routes.flatMap((r) => r.track.samples.filter((p) => p.s > r.rfrom && p.s < r.rto))];
}

/** Buckets track samples on a grid, for quick nearest-track lookups while building the world. */
export class TrackIndex {
  private readonly cells = new Map<string, Sample[]>();

  constructor(
    readonly track: Track,
    private readonly cell = 16,
  ) {
    for (const p of allSamples(track)) {
      const key = this.key(Math.floor(p.x / cell), Math.floor(p.z / cell));
      const list = this.cells.get(key);
      if (list) list.push(p);
      else this.cells.set(key, [p]);
    }
  }

  private key(i: number, j: number): string {
    return `${i},${j}`;
  }

  /** The nearest sample within `max` units, or null. */
  nearest(x: number, z: number, max: number): Nearest | null {
    const r = Math.ceil(max / this.cell);
    const ci = Math.floor(x / this.cell);
    const cj = Math.floor(z / this.cell);
    let best: Sample | null = null;
    let bestD = max * max;
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        const list = this.cells.get(this.key(i, j));
        if (!list) continue;
        for (const p of list) {
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
    }
    if (!best) return null;
    return { sample: best, d: Math.sqrt(bestD), offset: (x - best.x) * -best.tz + (z - best.z) * best.tx };
  }
}
