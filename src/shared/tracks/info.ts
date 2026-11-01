/** The movie worlds, in the order the level select shows them. */
export const WORLDS = [
  { id: 'jungle', name: 'JUNGLE WORLD' },
  { id: 'horror', name: 'HORROR WORLD' },
  { id: 'planet', name: 'PLANET ADVENTURE' },
  { id: 'monster', name: 'MONSTER WORLD' },
  { id: 'aklm', name: 'AKLM STUDIOS' },
  { id: 'pirate', name: 'PIRATE WORLD' },
] as const;
export type WorldId = (typeof WORLDS)[number]['id'];

export const TRACK_INFO = [
  { id: 'inca-temple', name: 'INCA TEMPLE', world: 'jungle' },
  { id: 'lava-dig', name: 'LAVA DIG', world: 'jungle' },
  { id: 'graveyard', name: 'GRAVEYARD', world: 'horror' },
  { id: 'mad-lab', name: 'MAD LAB', world: 'horror' },
  { id: 'moon-base', name: 'MOON BASE', world: 'planet' },
  { id: 'reactor', name: 'REACTOR', world: 'planet' },
  { id: 'monster-docks', name: 'MONSTER DOCKS', world: 'monster' },
  { id: 'cartoon-farm', name: 'CARTOON FARM', world: 'aklm' },
  { id: 'pirate-cove', name: 'PIRATE COVE', world: 'pirate' },
] as const satisfies readonly { id: string; name: string; world: WorldId }[];
export type TrackId = (typeof TRACK_INFO)[number]['id'];

export const TRACK_IDS: readonly TrackId[] = TRACK_INFO.map((t) => t.id);

export function isTrack(id: unknown): id is TrackId {
  return typeof id === 'string' && (TRACK_IDS as readonly string[]).includes(id);
}

export function trackInfo(id: TrackId): (typeof TRACK_INFO)[number] {
  return TRACK_INFO.find((t) => t.id === id) ?? TRACK_INFO[0];
}
