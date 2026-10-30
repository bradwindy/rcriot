export interface RacerStats {
  /** World units per second. Multiply by 3 for the speedo figure shown on screen. */
  topSpeed: number;
  driftBoosts: number;
  orangeBoosts: number;
  rocketStart: boolean;
  itemsUsed: number;
  /** Pick-ups of yours that hit another car. */
  hitsLanded: number;
  hitsTaken: number;
  /** Seconds off the ground in total, and the longest single jump. */
  airTime: number;
  bigAir: number;
  wallHits: number;
  /** Car-to-car bumps. */
  bumps: number;
  overtakes: number;
  lapsLed: number;
  /** Seconds off the road. */
  offroad: number;
  /** Places gained from the worst place you held to where you finished. */
  comeback: number;
}

export interface ResultRow {
  name: string;
  bot: boolean;
  /** Car model id from ROSTER. */
  model: string;
  place: number;
  /** Total race time in seconds, or null if they didn't finish. */
  time: number | null;
  bestLap: number | null;
  stats: RacerStats;
}

export const newStats = (): RacerStats => ({
  topSpeed: 0,
  driftBoosts: 0,
  orangeBoosts: 0,
  rocketStart: false,
  itemsUsed: 0,
  hitsLanded: 0,
  hitsTaken: 0,
  airTime: 0,
  bigAir: 0,
  wallHits: 0,
  bumps: 0,
  overtakes: 0,
  lapsLed: 0,
  offroad: 0,
  comeback: 0,
});
