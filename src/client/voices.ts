/** How one car's motor sounds: a muffled two-stroke hum that sits under the rest of the game. */
export interface Voice {
  /** Firings per second at idle and at top speed. Two-strokes fire every turn, so these run high. */
  idle: number;
  top: number;
  /** Pitch of the exhaust ring, about 1. Higher is nasal and screamy, lower is chunkier. */
  ring: number;
  /** 0 a clean ring-ding, 1 a raspy crackle. */
  grit: number;
  /** Random wander in each firing's timing and strength. More is a rougher, burblier idle. */
  jitter: number;
  /** Brightness of the filter, about 1. */
  tone: number;
}

export const DEFAULT_VOICE: Voice = { idle: 34, top: 95, ring: 1, grit: 0.3, jitter: 0.02, tone: 1 };

export const VOICES: Record<string, Voice> = {
  sandflea: DEFAULT_VOICE,
  chomper: { idle: 28, top: 80, ring: 0.85, grit: 0.35, jitter: 0.02, tone: 0.9 },
  comet: { idle: 38, top: 108, ring: 1.15, grit: 0.25, jitter: 0.015, tone: 1.1 },
  saucer: { idle: 37, top: 102, ring: 1.1, grit: 0.15, jitter: 0.01, tone: 1.05 },
  lastride: { idle: 26, top: 74, ring: 0.8, grit: 0.35, jitter: 0.025, tone: 0.85 },
  safari: { idle: 31, top: 88, ring: 0.9, grit: 0.4, jitter: 0.025, tone: 0.95 },
  raptor: { idle: 33, top: 100, ring: 1.05, grit: 0.45, jitter: 0.02, tone: 1.05 },
  galleon: { idle: 25, top: 70, ring: 0.8, grit: 0.3, jitter: 0.03, tone: 0.85 },
  quackers: { idle: 40, top: 110, ring: 1.2, grit: 0.2, jitter: 0.015, tone: 1.05 },
  boneshaker: { idle: 32, top: 92, ring: 1, grit: 0.55, jitter: 0.03, tone: 1 },
};

export function voiceOf(id: string): Voice {
  return VOICES[id] ?? DEFAULT_VOICE;
}
