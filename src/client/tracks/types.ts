import type * as THREE from 'three';
import type { Track } from '../../shared/track';
import type { Batch, RGB } from '../render/geometry';
import type { Materials } from '../render/materials';

/** A track's light and air. Colours are as the screen shows them, 0 to 1. */
export interface Theme {
  /** Sky from overhead down to the horizon, which is the fog colour, and below the horizon. */
  zenith: RGB;
  upper: RGB;
  below: RGB;
  fog: RGB;
  /** Fog distance as a share of the player's draw distance setting. Below 1 closes it in. */
  haze?: number;
  /** Where the sunlight (or moonlight) comes from, and its colour. */
  sunDir: [number, number, number];
  sunColor: RGB;
  /** Fill light from the sky above and bounced up off the ground. */
  skyLight: RGB;
  groundLight: RGB;
  sun: boolean;
  clouds: boolean;
  stars: boolean;
  /** Headlights stay on all lap, not just in the dark stretches. */
  night: boolean;
}

export interface ArtContext {
  /** The main track, with its fork as `track.routes`. */
  track: Track;
  /** Shared materials. A track's own materials should be made once per page and reused, not per build. */
  mats: Materials;
  /** Static scenery, merged by material. */
  batch: Batch;
  /** Anything that moves or animates. Cleared with the rest when another track loads. */
  group: THREE.Group;
  grid: { s: number; offset: number }[];
}

export interface Art {
  /** Each frame. `clock` is the race clock, which the hazards run off, so draw them with hazardAt(track, h, clock). */
  update?(time: number, dt: number, clock: number, camera: THREE.Camera): void;
  /** Flame tips that shed embers. */
  flames?: THREE.Vector3[];
}

export interface TrackArt {
  theme: Theme;
  build(ctx: ArtContext): Art;
}
