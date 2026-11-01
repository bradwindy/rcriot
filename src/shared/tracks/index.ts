import { buildCourse, type TrackDef } from '../course';
import type { Track } from '../track';
import { CARTOON_FARM } from './cartoon-farm';
import { GRAVEYARD } from './graveyard';
import { INCA_TEMPLE } from './inca-temple';
import type { TrackId } from './info';
import { LAVA_DIG } from './lava-dig';
import { MAD_LAB } from './mad-lab';
import { MONSTER_DOCKS } from './monster-docks';
import { MOON_BASE } from './moon-base';
import { PIRATE_COVE } from './pirate-cove';
import { REACTOR } from './reactor';

export * from './info';

export const TRACK_DEFS: Record<TrackId, TrackDef> = {
  'inca-temple': INCA_TEMPLE,
  'lava-dig': LAVA_DIG,
  graveyard: GRAVEYARD,
  'mad-lab': MAD_LAB,
  'moon-base': MOON_BASE,
  reactor: REACTOR,
  'monster-docks': MONSTER_DOCKS,
  'cartoon-farm': CARTOON_FARM,
  'pirate-cove': PIRATE_COVE,
};

const built = new Map<TrackId, Track>();

/** The built track, made once and kept. */
export function courseOf(id: TrackId): Track {
  let t = built.get(id);
  if (!t) {
    t = buildCourse(TRACK_DEFS[id]);
    built.set(id, t);
  }
  return t;
}
