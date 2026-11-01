import { isTrack, type TrackId } from '../shared/tracks/info';

/*
 * Records kept on this device: your best lap on each track and the last track you raced. Storage can be blocked or
 * full, in which case nothing is remembered and the game carries on.
 */

const BEST = 'rcriot.best.';
const LAST = 'rcriot.track';

/** Your best lap on this track in seconds, or null if you have none. */
export function bestLap(id: TrackId): number | null {
  try {
    const seconds = parseFloat(localStorage.getItem(BEST + id) ?? '');
    return seconds > 0 && Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/** Keeps the lap if it beats your best on this track. True when it does. */
export function recordLap(id: TrackId, seconds: number): boolean {
  if (!(seconds > 0 && Number.isFinite(seconds))) return false;
  const best = bestLap(id);
  if (best !== null && best <= seconds) return false;
  try {
    localStorage.setItem(BEST + id, String(seconds));
  } catch {
    // Still a best, just not remembered.
  }
  return true;
}

export function lastTrack(): TrackId | null {
  try {
    const id = localStorage.getItem(LAST);
    return isTrack(id) ? id : null;
  } catch {
    return null;
  }
}

export function setLastTrack(id: TrackId): void {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    // The level select will just open on the default track.
  }
}
