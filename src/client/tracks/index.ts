import type { TrackId } from '../../shared/tracks';
import { cartoonFarm } from './cartoon-farm';
import { graveyard } from './graveyard';
import { incaTemple } from './inca-temple';
import { lavaDig } from './lava-dig';
import { madLab } from './mad-lab';
import { monsterDocks } from './monster-docks';
import { moonBase } from './moon-base';
import { pirateCove } from './pirate-cove';
import { reactor } from './reactor';
import type { TrackArt } from './types';

export const TRACK_ART: Record<TrackId, TrackArt> = {
  'inca-temple': incaTemple,
  'lava-dig': lavaDig,
  graveyard,
  'mad-lab': madLab,
  'moon-base': moonBase,
  reactor,
  'monster-docks': monsterDocks,
  'cartoon-farm': cartoonFarm,
  'pirate-cove': pirateCove,
};
