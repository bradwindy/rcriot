import './style.css';
import * as THREE from 'three';
import { botInput } from '../shared/bot';
import { driftLevel, grounded, TICK, type CarInput } from '../shared/car';
import { routeTrack } from '../shared/course';
import { ITEM_KINDS, ROLL_TIME, type ItemEvent, type ItemKind } from '../shared/items';
import { DEFAULT_SETTINGS } from '../shared/lobby';
import { normalizeCode, sanitizeName, type RoomMsg } from '../shared/protocol';
import { COUNTDOWN, gridFor, gridSlot, MAX_RACERS, Race, type Racer } from '../shared/race';
import type { ResultRow } from '../shared/results';
import { ROSTER, type CarModel } from '../shared/roster';
import { roofed, sampleAt, surfaceY, type Surface, type Track } from '../shared/track';
import { courseOf, TRACK_IDS, type TrackId } from '../shared/tracks';
import { Attract } from './attract';
import { Sound, type Nearby } from './audio';
import { lastTrack, recordLap, setLastTrack } from './best';
import { ChaseCamera } from './camera';
import { Hud } from './hud';
import { Keyboard } from './input';
import { LevelSelect } from './levels';
import { LobbyPanel } from './lobby';
import { Panel } from './panel';
import { PartySession, randomCode } from './party';
import { Predictor } from './predict';
import { CarView, type Pose } from './render/cars';
import { itemIcon } from './render/icons';
import { ItemView } from './render/items';
import { Dust } from './render/particles';
import { Pipeline } from './render/post';
import { dynamicLight, flushLights, globals } from './render/ps1';
import { setFiltering } from './render/textures';
import { World } from './render/world';
import { mockResults, ResultsBoard } from './results';
import { CarSelect } from './select';
import { loadFx, saveFx } from './settings';
import { Title } from './title';
import { TouchPad } from './touch';
import { voiceOf } from './voices';

// Colours are written as the screen should show them, the way the PS1 did. No linear-light conversions anywhere.
THREE.ColorManagement.enabled = false;

/** Cars in a practice race, and the player's grid slot. */
const GRID = 8;
const PRACTICE_SLOT = 5;
const PRACTICE_LAPS = 3;
const ENGINE_VOLUME = { quiet: 0.5, normal: 1, off: 0 };
/** The colour of the dust each surface throws up. Hard and wet surfaces throw none. */
const DUST: Partial<Record<Surface, THREE.Color>> = {
  sand: new THREE.Color(0.86, 0.74, 0.55),
  rock: new THREE.Color(0.55, 0.52, 0.48),
  stone: new THREE.Color(0.6, 0.58, 0.55),
  dirt: new THREE.Color(0.62, 0.48, 0.34),
  grass: new THREE.Color(0.46, 0.56, 0.3),
  mud: new THREE.Color(0.36, 0.27, 0.18),
  dust: new THREE.Color(0.72, 0.72, 0.74),
};
/** Surfaces that smoke under a sliding tyre. */
const HARD: Surface[] = ['wood', 'rock', 'stone', 'metal', 'asphalt', 'glass'];
const LAMP = new THREE.Color(1.0, 0.92, 0.75);
const SPARK = [new THREE.Color(0, 0, 0), new THREE.Color(0.45, 0.72, 1.0), new THREE.Color(1.0, 0.58, 0.15)];
const HOT = new THREE.Color(1.0, 0.9, 0.5);
const SMOKE = new THREE.Color(0.78, 0.76, 0.74);
const EXHAUST = new THREE.Color(0.42, 0.4, 0.42);
const EMBER = new THREE.Color(1.0, 0.55, 0.18);
const FLARE = [new THREE.Color(1.0, 0.75, 0.3), new THREE.Color(1.0, 0.45, 0.12)];
/** Seconds after the race ends before the results board comes up. */
const RESULTS_DELAY = 2.5;
/** Name tags show over people's cars closer than this. */
const TAG_RANGE = 70;
const NAME_KEY = 'rcriot.name';

/** Scales world units per second to the speedo's figure, so a fast car tops out near 100. */
const SPEEDO = 3;

const el = (id: string) => document.getElementById(id) as HTMLElement;

function savedName(): string {
  try {
    return sanitizeName(localStorage.getItem(NAME_KEY));
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // The name just won't be remembered.
  }
}

/** Your saved name, or a made-up one that is saved so a reload keeps it. */
function playerName(): string {
  const name = savedName();
  if (name) return name;
  const made = `RACER ${10 + Math.floor(Math.random() * 90)}`;
  saveName(made);
  return made;
}

const world = new World();
let track: Track = courseOf('pirate-cove');
/** Car bodies by model and grid number, made the first time a race needs one and kept for the next. */
const pool = new Map<string, CarView>();
function viewFor(model: CarModel, slot: number): CarView {
  const key = `${model.id}:${slot}`;
  let view = pool.get(key);
  if (!view) {
    view = new CarView(model, slot + 1);
    world.scene.add(view.root, view.shadow);
    pool.set(key, view);
  }
  return view;
}
const hideCars = () => {
  for (const v of pool.values()) v.visible = false;
};
const dust = new Dust();
const embers = new Dust(true);
world.scene.add(dust.mesh, embers.mesh);

const canvas = el('stage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const pipeline = new Pipeline(renderer);
const chase = new ChaseCamera(track);
const sound = new Sound();
const hud = new Hud(el('hud'));

/** The race on screen, or null on the menus. */
let session: Session | null = null;
/** The track of the race on screen or the last one. Your best lap on it is kept when the race ends. */
let raceTrack: TrackId = lastTrack() ?? DEFAULT_SETTINGS.track;
/** The party this page is in, or null. */
let party: PartySession | null = null;
let fx = loadFx();
const applyFx = () => {
  // A page opened in a hidden tab can start at zero size. It gets a resize when it shows.
  pipeline.resize(Math.max(1, innerWidth), Math.max(1, innerHeight), Math.min(devicePixelRatio, 2), fx, chase.camera);
  pipeline.apply(fx);
  hud.fit(pipeline.viewport, pipeline.size.w, pipeline.size.h);
  pipeline.setUi(hud.canvas);
  setFiltering(fx.pixelated, fx.mipmaps, fx.cutoutMipmaps);
  sound.muted = !fx.sound;
  sound.engineVolume = ENGINE_VOLUME[fx.engine];
  if (session && !session.pred) session.race.items.enabled = fx.items;
};
applyFx();
addEventListener('resize', applyFx);

const panel = new Panel(el('ui'), fx, (next) => {
  fx = next;
  saveFx(fx);
  applyFx();
});

/** Everything about the race on screen. */
interface Session {
  race: Race;
  /** Your grid slot, or -1 while watching someone else race. */
  me: number;
  names: string[];
  /** Drives an online race from the host's snapshots. Null for practice, which runs on this page. */
  pred: Predictor | null;
  /** The online race's number, or 0 for practice. */
  n: number;
  views: CarView[];
  items: ItemView;
  poses: Pose[];
  air: number[];
  /** Each racer's last bump already shown as sparks, last boost shown as a flare, and last fall into lava or goo. */
  bumps: number[];
  flares: number[];
  sinks: number[];
  /** Ages of the followed car's events already turned into sounds. */
  heard: { hop: number; boost: number; bump: number; land: number };
  count: string;
  acc: number;
  /** The item slot's spin after a pick-up: when it stops, when it next ticks, and the icon on show. */
  rollUntil: number;
  rollNext: number;
  rollIcon: HTMLCanvasElement | null;
  /** When the race was seen to end, and the results once known. The board comes up RESULTS_DELAY later. */
  overAt: number | null;
  results: ResultRow[] | null;
  resetQueued: boolean;
}

/** Where the car select's turntable stands: on the road just past the start line. */
const showroom = { at: new THREE.Vector3(), heading: 0 };

/** Puts a track up: its scenery, the camera and map on it, and the fog and textures set up for it. */
function useTrack(id: TrackId): Track {
  if (world.id === id) return track;
  track = courseOf(id);
  world.load(id, track, Array.from({ length: MAX_RACERS }, (_, i) => gridSlot(track, i)));
  chase.setTrack(track);
  hud.setTrack(track);
  const p = sampleAt(track, 14);
  showroom.at.set(p.x, surfaceY(p, 0), p.z);
  showroom.heading = Math.atan2(-p.tx, -p.tz);
  applyFx();
  return track;
}
useTrack(raceTrack);

function endSession(): void {
  const best = session && session.me >= 0 ? session.race.racers[session.me].bestLap : null;
  if (best !== null) recordLap(raceTrack, best);
  session?.items.dispose();
  session = null;
  hideCars();
  hud.show(false);
  touch.setVisible(false);
  sound.idle();
}

/** The car select screen: practice on its own, or the lobby of the party this page is in. */
function toSelect(): void {
  endSession();
  results.hide();
  levels.hide();
  attract.stop();
  select.show();
  syncLobby();
}

/** The go button and the party panel, to fit whether this page is in a party and whether it hosts. */
function syncLobby(): void {
  if (party) {
    document.body.classList.add('party');
    const host = party.room?.host === party.myId;
    select.configure(host ? 'START RACE' : 'WAITING FOR HOST', host, host ? 'ARROWS CHOOSE   ENTER START' : 'ARROWS CHOOSE');
    lobby.show(party.code, party.room, party.myId, party.status);
  } else {
    document.body.classList.remove('party');
    select.configure('RACE!', true, 'ARROWS CHOOSE   ENTER RACE');
    lobby.hide();
  }
}

function beginSession(race: Race, me: number, names: string[], pred: Predictor | null, n: number): void {
  leaveTitle();
  endSession();
  const raceViews = race.racers.map((r, i) => viewFor(r.model, i));
  for (const v of raceViews) v.visible = true;
  const items = new ItemView(race.items, raceViews, dust, embers, track);
  world.scene.add(items.group);
  session = {
    race,
    me,
    names,
    pred,
    n,
    views: raceViews,
    items,
    poses: pred ? pred.poses : race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading })),
    air: race.racers.map(() => 0),
    bumps: race.racers.map(() => -1),
    flares: race.racers.map(() => -1),
    sinks: race.racers.map(() => -1),
    heard: { hop: -1, boost: -1, bump: -1, land: -1 },
    count: '',
    acc: 0,
    rollUntil: 0,
    rollNext: 0,
    rollIcon: null,
    overAt: null,
    results: null,
    resetQueued: false,
  };
  sound.voice(voiceOf(race.racers[followed(session)].model.id));
  select.hide();
  lobby.hide();
  results.hide();
  levels.hide();
  hud.show(true);
  touch.setVisible(me >= 0);
  chase.snap();
}

function startPractice(id = raceTrack): void {
  const seed = Math.floor(Math.random() * 1e9);
  const models = gridFor(ROSTER, select.car, GRID, PRACTICE_SLOT, seed);
  const race = new Race(useTrack(id), models, PRACTICE_SLOT, seed, fx.items, { laps: PRACTICE_LAPS });
  const names = models.map((m) => m.name.toUpperCase());
  names[PRACTICE_SLOT] = playerName().toUpperCase();
  // After beginSession, which files the last race's best lap under the last race's track.
  beginSession(race, PRACTICE_SLOT, names, null, 0);
  raceTrack = id;
  setLastTrack(id);
}

/** The racer the camera and HUD follow: your own car, or the leader while you watch. */
function followed(s: Session): number {
  return s.me >= 0 ? s.me : s.race.racers.indexOf(s.race.standings()[0]);
}

function startOnline(room: RoomMsg, myId: string): void {
  const models = room.grid.map((g) => ROSTER.find((m) => m.id === g.car) ?? ROSTER[0]);
  const humans = room.grid.flatMap((g, i) => (g.id ? [i] : []));
  const { settings } = room;
  const race = new Race(useTrack(settings.track), models, humans, room.seed, settings.items, { laps: settings.laps, level: settings.level });
  const me = room.grid.findIndex((g) => g.id === myId);
  beginSession(race, me, room.grid.map((g) => g.name.toUpperCase()), new Predictor(race, room.race, me), room.race);
  raceTrack = settings.track;
  setLastTrack(settings.track);
  // Someone watching has no controls, so the party panel stays up with its LEAVE button.
  if (me < 0 && party) lobby.show(party.code, room, myId, party.status);
}

/** Follows the party's room: lobby, race or results. */
function onRoom(room: RoomMsg): void {
  if (!party) return;
  if (room.phase === 'race') {
    if (session?.n !== room.race) startOnline(room, party.myId);
    else if (lobby.open) lobby.show(party.code, room, party.myId, party.status);
    return;
  }
  if (room.phase === 'results' && room.results) {
    if (session?.n === room.race) {
      session.results ??= room.results;
      session.overAt ??= time;
      return;
    }
    // Joined after the race: straight to its board.
    endSession();
    select.hide();
    lobby.hide();
    showResults(room.results, room.grid.findIndex((g) => g.id === party?.myId));
    return;
  }
  // The host picking a track stays in the level select while the lobby changes.
  if (levels.open && room.host === party.myId) return;
  if (session || results.open || !select.open) toSelect();
  else syncLobby();
}

function showResults(rows: ResultRow[], me: number): void {
  const host = party ? party.room?.host === party.myId : true;
  hud.show(false);
  touch.setVisible(false);
  sound.idle();
  results.show(rows, me, host);
}

function enterParty(code: string): void {
  leaveTitle();
  party?.close();
  const name = playerName();
  history.replaceState(null, '', `/p/${code}${location.search}`);
  party = new PartySession(code, name, () => select.car.id, {
    room: (room) => onRoom(room),
    snapshot: (buf) => session?.pred?.onSnapshot(buf),
    host: (msg) => {
      const s = session;
      if (!s?.pred) return;
      if (msg.t === 'e' && msg.n === s.n) s.pred.onEvents(msg.e);
      if (msg.t === 'over' && msg.race === s.n) {
        s.results ??= msg.results;
        s.overAt ??= time;
      }
    },
    status: () => {
      if (lobby.open && party) lobby.show(party.code, party.room, party.myId, party.status);
    },
    link: (up) => {
      if (up) session?.pred?.forget();
    },
  });
  toSelect();
}

function leaveParty(): void {
  party?.close();
  party = null;
  history.replaceState(null, '', `/${location.search}`);
  toTitle();
}

const select = new CarSelect(
  el('select'),
  (car) => {
    sound.select();
    party?.pickCar(car.id);
  },
  () => {
    if (party) party.start();
    else toLevels();
  },
  () => (party ? leaveParty() : toTitle()),
);
const lobby = new LobbyPanel(el('ui'), {
  settings: (s) => party?.settings(s),
  pickTrack: () => toLevels(),
  rename: (name) => {
    const clean = sanitizeName(name);
    if (!clean) return;
    saveName(clean);
    party?.rename(clean);
  },
  leave: () => leaveParty(),
});
addEventListener('resize', () => {
  if (lobby.open && party) lobby.show(party.code, party.room, party.myId, party.status);
});
const results = new ResultsBoard(el('select'), () => sound.select());
results.onNext = () => {
  if (party) party.again();
  else startPractice();
};

/** The highlighted track flies by behind the level select, after a moment's pause so stepping past one doesn't build it. */
let previewTimer = 0;
function preview(id: TrackId): void {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    if (levels.open) attract.start(useTrack(id));
  }, 220);
}

const levels = new LevelSelect(el('select'), {
  select: () => sound.select(),
  lengthOf: (id) => courseOf(id).length,
  outlineOf: (id) => courseOf(id).samples,
  preview,
});
levels.onPick = (id) => {
  if (!party) startPractice(id);
  else {
    party.settings({ track: id });
    toSelect();
  }
};
levels.onBack = () => toSelect();

/** From the car select to the level select: practice picks the track to race, a party's host the next race's. */
function toLevels(): void {
  const room = party?.room;
  if (party && (room?.host !== party.myId || room.phase !== 'lobby')) return;
  select.hide();
  lobby.hide();
  levels.show(room?.settings.track ?? lastTrack() ?? DEFAULT_SETTINGS.track, party ? 'party' : 'practice');
}

function requestReset(): void {
  const s = session;
  if (!s || s.me < 0) return;
  if (s.pred) s.resetQueued = true;
  else {
    s.race.reset(s.race.racers[s.me]);
    chase.snap();
  }
}

/**
 * Esc and the touch MENU button: back out of practice. An online race carries on, so they open and close the party
 * panel over it instead, where LEAVE quits the party.
 */
function back(): void {
  if (session && !session.pred) toSelect();
  else if (session && party) {
    if (lobby.open) lobby.hide();
    else lobby.show(party.code, party.room, party.myId, party.status);
  }
}

/** The title's flyover moves on to the next track each time its race restarts. */
let titleTrack = Math.floor(Math.random() * TRACK_IDS.length);
function nextTitleRace(): void {
  if (levels.open) return attract.start(track);
  titleTrack = (titleTrack + 1) % TRACK_IDS.length;
  attract.start(useTrack(TRACK_IDS[titleTrack]));
}

// The title screen with bots racing behind it.
const attract = new Attract(nextTitleRace, { viewFor, hideAll: hideCars }, world, dust, embers, chase);
const title = new Title(
  el('select'),
  panel,
  {
    create: () => enterParty(randomCode()),
    join: (raw) => {
      const code = normalizeCode(raw);
      if (code) enterParty(code);
    },
    practice: () => {
      leaveTitle();
      toSelect();
    },
  },
  () => sound.select(),
);

function toTitle(): void {
  endSession();
  results.hide();
  levels.hide();
  select.hide();
  lobby.hide();
  document.body.classList.remove('party');
  title.show();
  nextTitleRace();
}

/** Off the title to a lobby or race. The attract race's cars and item boxes go with it. */
function leaveTitle(): void {
  title.hide();
  attract.stop();
}

const touch = new TouchPad(el('touch'), (action) => {
  sound.unlock();
  if (action === 'menu') back();
  if (action === 'camera') chase.cycle();
  if (action === 'reset') requestReset();
});
const keys = new Keyboard((code) => {
  sound.unlock();
  if (lobby.typing) return;
  if (code === 'KeyP') panel.toggle();
  if (code === 'KeyM') {
    fx = { ...fx, sound: !fx.sound };
    saveFx(fx);
    applyFx();
    panel.sync(fx);
  }
  if (results.open) {
    if (code === 'Escape' && !party) toTitle();
    else results.key(code);
    return;
  }
  if (title.open) {
    title.key(code);
    return;
  }
  if (levels.open) {
    levels.key(code);
    return;
  }
  if (select.open) {
    if (code === 'ArrowLeft' || code === 'KeyA') select.step(-1);
    if (code === 'ArrowRight' || code === 'KeyD') select.step(1);
    if (code === 'Enter' || code === 'Space') select.go();
    if (code === 'KeyT' && party) toLevels();
    if (code === 'Escape' && !party) toTitle();
    return;
  }
  if (code === 'KeyC') chase.cycle();
  if (code === 'Escape') back();
  if (code === 'KeyR') requestReset();
});
for (const type of ['pointerdown', 'touchstart'] as const) addEventListener(type, () => sound.unlock(), { capture: true });

function merged(dt: number): CarInput {
  const k = keys.sample(dt);
  if (!touch.active) return k;
  const t = touch.sample();
  return {
    throttle: t.throttle || k.throttle,
    steer: Math.abs(t.steer) > Math.abs(k.steer) ? t.steer : k.steer,
    drift: t.drift || k.drift,
    item: t.item || k.item,
    itemBack: t.itemBack || k.itemBack,
  };
}

function kickUp(r: Racer, view: CarView, i: number, s: Pick<Session, 'air' | 'bumps' | 'flares' | 'sinks'>, dt: number): void {
  const car = r.car;
  const speed = Math.hypot(car.vx, car.vz);
  const dark = (world.theme?.night ?? false) || sampleAt(routeTrack(track, car.route), car.rs).dark;
  view.lamps(dark);
  if (dark) {
    const spot = view.lampSpot();
    dynamicLight(spot.x, spot.y, spot.z, LAMP, 1.5, 11, 6);
  }
  const landed = grounded(car) && s.air[i] > 0.25;
  s.air[i] = car.air;
  const wheels = view.rearWheels();
  if (car.sinkAt > s.sinks[i]) {
    // Back from the lava or goo: a puff of smoke and sparks where it reappears.
    s.sinks[i] = car.sinkAt;
    for (let n = 0; n < 24; n++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 3;
      dust.spawn(car.x, car.y + 0.4, car.z, Math.cos(a) * v, 1 + Math.random() * 2, Math.sin(a) * v, 0.3 + Math.random() * 0.25, 0.8, SMOKE);
      if (n % 2) embers.spawn(car.x, car.y + 0.4, car.z, Math.cos(a) * v * 2, 2 + Math.random() * 3, Math.sin(a) * v * 2, 0.08, 0.4, HOT);
    }
  }
  if (car.bumpAt > s.bumps[i]) {
    s.bumps[i] = car.bumpAt;
    for (let n = Math.round(car.bump * 16); n > 0; n--) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 5;
      embers.spawn(car.x, car.y + 0.4, car.z, Math.cos(a) * v, 1 + Math.random() * 3, Math.sin(a) * v, 0.07 + Math.random() * 0.05, 0.25, HOT);
    }
  }
  const exhaust = view.exhaust();
  if (exhaust) {
    const big = car.boostPower > 1;
    const bx = Math.sin(car.heading);
    const bz = Math.cos(car.heading);
    dynamicLight(exhaust.x, exhaust.y + 0.2, exhaust.z, FLARE[1], (big ? 1.6 : 1.1) + Math.random() * 0.3, big ? 8 : 6);
    // A burst of flame out of the exhaust as the boost kicks in, then a trickle of sparks.
    const n = car.boostAt > s.flares[i] ? 14 : Math.random() < (big ? 0.9 : 0.5) ? 1 : 0;
    s.flares[i] = car.boostAt;
    for (let k = 0; k < n; k++) {
      const v = 4 + Math.random() * 5;
      const c = FLARE[Math.floor(Math.random() * FLARE.length)];
      embers.spawn(exhaust.x, exhaust.y, exhaust.z, car.vx * 0.6 + bx * v + (Math.random() - 0.5) * 3, Math.random() * 2, car.vz * 0.6 + bz * v + (Math.random() - 0.5) * 3, 0.1 + Math.random() * 0.08, 0.25 + Math.random() * 0.15, c);
    }
  }
  const throttle = r.input.throttle;
  if (Math.random() < (throttle > 0 ? (speed < 14 ? 14 : 4) : 1.5) * dt) {
    const tail = wheels[0].clone().add(wheels[1]).multiplyScalar(0.5);
    dust.spawn(tail.x, tail.y + 0.35, tail.z, -car.vx * 0.1, 0.8, -car.vz * 0.1, 0.1 + Math.random() * 0.06, 0.6, EXHAUST);
  }
  if (!grounded(car)) return;
  if (car.stall > 0) {
    // A botched start: the rear tyres spin on the spot in a cloud of smoke.
    for (const w of wheels) {
      if (Math.random() < 30 * dt) dust.spawn(w.x, w.y + 0.2, w.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3, 0.35 + Math.random() * 0.2, 0.9, SMOKE);
    }
  }
  const level = driftLevel(car);
  if (level) {
    for (const w of wheels) {
      for (let n = 0; n < 2; n++) {
        const out = (Math.random() - 0.5) * 6;
        const up = 1.5 + Math.random() * 2.5;
        embers.spawn(w.x, w.y + 0.1, w.z, out, up, out, 0.08 + Math.random() * 0.07, 0.18 + Math.random() * 0.15, SPARK[level]);
      }
    }
  }
  const hard = HARD.includes(car.surface);
  const slide = Math.abs(car.vx * Math.cos(car.heading) - car.vz * Math.sin(car.heading));
  if (hard && speed > 8 && (car.drift || slide > 6) && Math.random() < 24 * dt) {
    const w = wheels[Math.floor(Math.random() * wheels.length)];
    dust.spawn(w.x, w.y + 0.2, w.z, (Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2, 0.25 + Math.random() * 0.15, 0.7, SMOKE);
  }
  const color = roofed(car.cover) && car.surface !== 'rock' ? undefined : DUST[car.surface];
  if (!color) return;
  const rate = landed ? 1 : speed < 7 ? 0 : (speed / 32) * (car.offroad ? 34 : car.drift ? 22 : 9) * dt;
  for (let n = landed ? 8 : 1; n > 0; n--) {
    if (Math.random() > rate) continue;
    const w = wheels[Math.floor(Math.random() * wheels.length)];
    dust.spawn(
      w.x,
      w.y + 0.25,
      w.z,
      (Math.random() - 0.5) * 3 - car.vx * 0.06,
      0.6 + Math.random() * 1.2,
      (Math.random() - 0.5) * 3 - car.vz * 0.06,
      0.22 + Math.random() * 0.18,
      0.5 + Math.random() * 0.5,
      color,
    );
  }
}

function hearPlayer(s: Session): void {
  const r = s.race.racers[followed(s)];
  const car = r.car;
  const fx = -Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const vf = car.vx * fx + car.vz * fz;
  const vr = car.vx * -fz + car.vz * fx;
  const onGround = grounded(car);
  sound.engine(Math.abs(vf) / r.spec.topSpeed, r.input.throttle, car.boost > 0, !onGround || !s.race.started);
  sound.skid(onGround ? (car.drift ? 0.75 : Math.min(1, Math.abs(vr) / 9)) : 0);
  sound.sparks(onGround ? driftLevel(car) : 0);
  const h = s.heard;
  if (car.hopAt > h.hop) sound.hop();
  if (car.boostAt > h.boost) sound.boost(car.boostPower > 1 ? 2 : 1);
  if (car.bumpAt > h.bump) sound.bump(car.bump);
  if (car.landAt > h.land) sound.land(car.land);
  Object.assign(h, { hop: car.hopAt, boost: car.boostAt, bump: car.bumpAt, land: car.landAt });

  const cam = chase.camera.position;
  const right = new THREE.Vector3().setFromMatrixColumn(chase.camera.matrixWorld, 0);
  const nearby: Nearby[] = s.race.racers
    .filter((b) => b !== r)
    .map((b) => {
      const dx = b.car.x - cam.x;
      const dz = b.car.z - cam.z;
      const distance = Math.hypot(dx, dz);
      return {
        voice: voiceOf(b.model.id),
        speed: Math.hypot(b.car.vx, b.car.vz) / b.spec.topSpeed,
        throttle: b.input.throttle,
        distance,
        pan: (dx * right.x + dz * right.z) / Math.max(distance, 1),
      };
    })
    .sort((a, b) => a.distance - b.distance);
  sound.traffic(nearby);
}

/** Item sounds: the followed car's own pick-ups and shots, and anything that goes off near the camera. */
function hearItem(e: ItemEvent, s: Session): void {
  const me = followed(s);
  const cam = chase.camera.position;
  const near = (x: number, z: number) => Math.max(0, 1 - Math.hypot(x - cam.x, z - cam.z) / 45);
  const car = (i: number) => s.race.racers[i].car;
  switch (e.type) {
    case 'pickup': {
      const c = car(e.racer);
      if (e.racer === me || near(c.x, c.z) > 0.4) sound.boxBreak();
      if (e.racer === me) {
        s.rollUntil = time + ROLL_TIME;
        s.rollNext = time;
      }
      break;
    }
    case 'lock':
      if (e.racer === me) sound.lockOn();
      break;
    case 'use': {
      const c = car(e.racer);
      if (e.racer !== me && near(c.x, c.z) < 0.3) break;
      if (e.kind === 'rocket' || e.kind === 'water') sound.launch();
      else if (e.kind === 'mines' || e.kind === 'oil' || e.kind === 'fake') sound.drop();
      else if (e.kind === 'shield') sound.shieldUp();
      else if (e.kind === 'shockwave') sound.shockwave();
      else if (e.kind === 'ultimate') {
        sound.thunder();
        hud.flashScreen();
      }
      break;
    }
    case 'explode': {
      const n = near(e.x, e.z);
      if (n > 0) sound.explode(e.strength * n);
      break;
    }
    case 'splash':
      if (near(e.x, e.z) > 0) sound.splash();
      break;
    case 'zap':
      if (e.from === me || e.to === me || near(car(e.to).x, car(e.to).z) > 0.5) sound.zap();
      break;
    case 'thunder':
      hud.flashScreen();
      world.darken(3.5);
      break;
  }
}

function countdown(s: Session): void {
  const { race } = s;
  const mine = s.me >= 0 ? race.racers[s.me] : null;
  let text = '';
  if (!race.started) text = String(Math.ceil(COUNTDOWN - race.clock));
  else if (race.clock < COUNTDOWN + 0.8) text = 'GO!';
  else if (mine && mine.finish !== null && race.clock < mine.finish + RESULTS_DELAY + 1) text = 'FINISH!';
  else if (s.pred && s.me >= 0 && party && !party.linked && !race.over) text = 'CONNECTING';
  if (text !== s.count) {
    if (text && text !== 'CONNECTING') sound.beep(text === 'GO!');
    s.count = text;
  }
  hud.countdown(text);
}

let last = performance.now();
let time = 0;
/** Dev only: a fixed camera for screenshots, or null to follow the race. */
let pinned: { at: THREE.Vector3; look: THREE.Vector3 } | null = null;
/** Dev only: your car drives itself, for testing races from a script. */
let autopilot = false;
const target = new THREE.Vector3();
const tagAt = new THREE.Vector3();

/** One local tick: your controls into the race, or into the prediction and off to the host. */
function tick(s: Session, input: CarInput): void {
  if (!s.pred) {
    s.race.racers.forEach((r, i) => Object.assign(s.poses[i], { x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
    s.race.step(input);
    return;
  }
  const batch = s.pred.tick(input, s.resetQueued);
  s.resetQueued = false;
  if (batch) party?.input(batch);
}

function drawCars(s: Session, dt: number): void {
  const alpha = s.acc / TICK;
  const offsets = s.pred?.offsets;
  s.race.racers.forEach((r, i) => {
    const o = offsets?.[i];
    const pose = s.poses[i];
    const car = o ? { ...r.car, x: r.car.x + o.x, y: r.car.y + o.y, z: r.car.z + o.z, heading: r.car.heading + o.heading } : r.car;
    const prev = o ? { x: pose.x + o.x, y: pose.y + o.y, z: pose.z + o.z, heading: pose.heading + o.heading } : pose;
    s.views[i].update(car, prev, alpha, track, dt, r.input.steer, time);
    kickUp(r, s.views[i], i, s, dt);
  });
}

/** Name tags over the other people's cars, where the camera can see them. */
function tags(s: Session, me: number): { x: number; y: number; name: string }[] {
  const out: { x: number; y: number; name: string }[] = [];
  if (!s.pred) return out;
  s.race.racers.forEach((r, i) => {
    if (i === me || !r.human) return;
    tagAt.copy(s.views[i].root.position);
    tagAt.y += 1.9;
    if (tagAt.distanceTo(chase.camera.position) > TAG_RANGE) return;
    tagAt.project(chase.camera);
    if (tagAt.z > 1 || Math.abs(tagAt.x) > 1 || Math.abs(tagAt.y) > 1) return;
    out.push({ x: tagAt.x, y: tagAt.y, name: s.names[i] });
  });
  return out;
}

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  document.body.classList.toggle('touch-on', touch.active);
  document.body.classList.toggle('racing', session !== null && !results.open);

  const s = session;
  if (s && !results.open) {
    const mine = s.me >= 0 ? s.race.racers[s.me] : null;
    const input = autopilot && mine ? botInput(mine.car, mine.spec, track, mine.brain, mine.lap) : merged(dt);
    s.acc += dt;
    while (s.acc >= TICK) {
      tick(s, input);
      s.acc -= TICK;
    }
    s.pred?.fade(dt);
    if (s.race.over && s.overAt === null) s.overAt = time;
    if (s.overAt !== null && time - s.overAt > RESULTS_DELAY) {
      const rows = s.results ?? (s.pred ? null : s.race.results(s.names));
      if (rows) showResults(rows, s.me);
    }
    drawCars(s, dt);
    const index = followed(s);
    const player = s.race.racers[index];
    const me = s.views[index].root;
    target.copy(me.position);
    chase.update(target, me.rotation.y, dt, {
      drift: player.car.drift,
      boosting: player.car.boost > 0,
      lookBack: keys.lookingBack,
      route: player.car.route,
      index: player.car.index,
    });
    s.items.update(s.race, dt, time, chase.camera.position, (e) => hearItem(e, s));
    const held = s.race.items.held[index];
    if (s.rollUntil > 0 && time < s.rollUntil) {
      if (time >= s.rollNext) {
        s.rollIcon = itemIcon(ITEM_KINDS[Math.floor(Math.random() * (ITEM_KINDS.length - 1))]);
        s.rollNext = time + 0.07;
        sound.rollTick();
      }
      hud.item(s.rollIcon, 0, false);
    } else {
      if (s.rollUntil > 0) {
        s.rollUntil = 0;
        sound.pickup();
        hud.pop();
      }
      hud.item(s.race.items.enabled ? (held ? itemIcon(held.kind) : null) : undefined, held?.count ?? 0, s.race.items.lock[index] >= 0);
    }
    sound.heat(s.race.items.heat[index] > 0);
    sound.charge(s.race.items.charge[index] > 0);
    hearPlayer(s);
    countdown(s);
    const speed = Math.hypot(player.car.vx, player.car.vz);
    hud.frame({
      place: s.race.standings().indexOf(player) + 1,
      total: s.race.racers.length,
      lap: Math.max(1, player.lap),
      laps: s.race.laps,
      lapTime: s.race.started && player.finish === null ? s.race.clock - player.lapStart : 0,
      bestLap: player.bestLap,
      speed: speed / player.spec.topSpeed,
      speedValue: speed * SPEEDO,
      cars: s.race.racers.map((r) => ({ x: r.car.x, z: r.car.z, me: r === player, color: r.model.color })),
      tags: tags(s, index),
    });
  } else if (!s && attract.running) {
    attract.update(dt, time, (r, view, i) => kickUp(r, view, i, attract, dt));
  } else if (!s) {
    const view = viewFor(select.car, 0);
    hideCars();
    view.visible = true;
    view.showcase(showroom.at, showroom.heading + time * 0.6);
    chase.orbit(showroom.at, time);
  }

  globals.uTime.value = time;
  world.update(chase.camera, time, dt, s?.race.clock ?? attract.clock ?? time);
  for (const f of world.flames) {
    if (Math.random() < 5 * dt && f.distanceToSquared(chase.camera.position) < 80 * 80) {
      embers.spawn(f.x + (Math.random() - 0.5) * 0.3, f.y - 0.3, f.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6, 0.06, 1.2 + Math.random() * 0.6, EMBER);
    }
  }
  dust.update(dt, chase.camera);
  embers.update(dt, chase.camera);
  draw();
  panel.tick(dt);
  requestAnimationFrame(frame);
}

function draw(): void {
  if (pinned) {
    chase.camera.position.copy(pinned.at);
    chase.camera.lookAt(pinned.look);
  }
  flushLights(chase.camera.position);
  hud.paint();
  pipeline.render(world.scene, chase.camera);
}

/** Party links like /p/ABCDE join that party. Anything else starts on the menus. */
function route(): void {
  const match = location.pathname.match(/^\/p\/([^/]+)\/?$/);
  const code = match ? normalizeCode(match[1]) : null;
  if (code) enterParty(code);
  else {
    if (match) history.replaceState(null, '', `/${location.search}`);
    toTitle();
  }
}

route();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  const give = (kind: ItemKind, count = 1) => {
    if (session && session.me >= 0) session.race.items.held[session.me] = { kind, count };
  };
  const debug = {
    chase,
    keys,
    useTrack,
    /** Practice on a track: rc.practice('lava-dig'). */
    practice: (id: TrackId = raceTrack) => {
      leaveTitle();
      startPractice(id);
    },
    levels,
    select,
    touch,
    sound,
    startPractice,
    toSelect,
    give,
    pipeline,
    hud,
    create: () => enterParty(randomCode()),
    join: (code: string) => {
      const c = normalizeCode(code);
      if (c) enterParty(c);
    },
    leave: leaveParty,
    autopilot: (on = true) => (autopilot = on),
    title,
    attract,
    toTitle,
    /** Pins the camera at a point looking at another, for screenshots. With no arguments, lets it follow again. */
    cam: (at?: [number, number, number], look?: [number, number, number]) => {
      pinned = at && look ? { at: new THREE.Vector3(...at), look: new THREE.Vector3(...look) } : null;
    },
    /** Pins the camera over the track: `back` behind and `up` above the point `s` along a route, looking down the road. */
    view: (s: number, up = 7, back = 16, route = 0, side = 0) => {
      const t = routeTrack(track, route);
      const p = sampleAt(t, s);
      const q = sampleAt(t, s + 12);
      pinned = {
        at: new THREE.Vector3(p.x - p.tx * back - p.tz * side, p.y + up, p.z - p.tz * back + p.tx * side),
        look: new THREE.Vector3(q.x, q.y + 1, q.z),
      };
    },
    /** Runs the race on for some seconds at once, for a page that isn't on screen. */
    advance: (seconds: number) => {
      const s = session;
      for (let k = 0; k < seconds / TICK; k++) {
        if (s) tick(s, autopilot && s.me >= 0 ? botInput(s.race.racers[s.me].car, s.race.racers[s.me].spec, track, s.race.racers[s.me].brain, s.race.racers[s.me].lap) : merged(TICK));
        else attract.update(TICK, time, () => {});
        time += TICK;
      }
      if (s) drawCars(s, TICK);
    },
    /**
     * Draws one frame now and posts it to the dev server's /__shot, which saves it as `name`.jpg where the server's
     * config says. Works in a tab that isn't on screen.
     */
    shot: async (name: string, withHud = false) => {
      globals.uTime.value = time;
      world.update(chase.camera, time, 0, session?.race.clock ?? attract.clock ?? time);
      const shown = session !== null && !results.open;
      hud.show(withHud && shown);
      draw();
      hud.show(shown);
      const data = canvas.toDataURL('image/jpeg', 0.88);
      const res = await fetch('/__shot', { method: 'POST', body: JSON.stringify({ name, data }) });
      return res.ok ? `saved ${name}.jpg` : `failed ${res.status}`;
    },
    /** Draw calls and triangles in the last frame drawn. */
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    /** Milliseconds to draw a frame, averaged over `frames` drawn back to back, waiting for the GPU each time. */
    bench: (frames = 60) => {
      const gl = renderer.getContext();
      const px = new Uint8Array(4);
      draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        draw();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      return (performance.now() - t0) / frames;
    },
    /** Shows the results board with made-up racers, over whatever is on screen. */
    results: (rows = mockResults(), me = 3, host = true) => {
      title.hide();
      hud.show(false);
      touch.setVisible(false);
      results.show(rows, me, host);
    },
  };
  Object.defineProperty(debug, 'race', { get: () => session?.race });
  Object.defineProperty(debug, 'track', { get: () => track });
  Object.defineProperty(debug, 'session', { get: () => session });
  Object.defineProperty(debug, 'party', { get: () => party });
  Object.assign(window, { rc: debug });
}
