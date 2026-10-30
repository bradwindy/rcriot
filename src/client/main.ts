import './style.css';
import * as THREE from 'three';
import { driftLevel, grounded, TICK, type CarInput } from '../shared/car';
import { PIRATE_COVE } from '../shared/circuit';
import { ITEM_KINDS, ROLL_TIME, type ItemEvent, type ItemKind } from '../shared/items';
import { COUNTDOWN, gridFor, gridSlot, Race, type Racer } from '../shared/race';
import { ROSTER } from '../shared/roster';
import { buildTrack, sampleAt, surfaceY } from '../shared/track';
import { Sound, type Nearby } from './audio';
import { ChaseCamera } from './camera';
import { Hud } from './hud';
import { Keyboard } from './input';
import { Panel } from './panel';
import { CarView, type Pose } from './render/cars';
import { itemIcon } from './render/icons';
import { ItemView } from './render/items';
import { Dust } from './render/particles';
import { Pipeline } from './render/post';
import { dynamicLight, flushLights, globals } from './render/ps1';
import { setFiltering } from './render/textures';
import { World } from './render/world';
import { CarSelect } from './select';
import { loadFx, saveFx } from './settings';
import { TouchPad } from './touch';
import { voiceOf } from './voices';

// Colours are written as the screen should show them, the way the PS1 did. No linear-light conversions anywhere.
THREE.ColorManagement.enabled = false;

const GRID = 8;
const ENGINE_VOLUME = { quiet: 0.5, normal: 1, off: 0 };
const PLAYER_SLOT = 5;
const SAND = new THREE.Color(0.86, 0.74, 0.55);
const STONE = new THREE.Color(0.55, 0.52, 0.48);
const SPARK = [new THREE.Color(0, 0, 0), new THREE.Color(0.45, 0.72, 1.0), new THREE.Color(1.0, 0.58, 0.15)];
const HOT = new THREE.Color(1.0, 0.9, 0.5);
const SMOKE = new THREE.Color(0.78, 0.76, 0.74);
const EXHAUST = new THREE.Color(0.42, 0.4, 0.42);
const EMBER = new THREE.Color(1.0, 0.55, 0.18);
const FLARE = [new THREE.Color(1.0, 0.75, 0.3), new THREE.Color(1.0, 0.45, 0.12)];

/** Scales world units per second to the speedo's figure, so a fast car tops out near 100. */
const SPEEDO = 3;

const el = (id: string) => document.getElementById(id) as HTMLElement;

const track = buildTrack(PIRATE_COVE);
const world = new World(
  track,
  Array.from({ length: GRID }, (_, i) => gridSlot(track, i)),
);
const views = new Map(ROSTER.map((m, i) => [m.id, new CarView(m, i + 1)]));
for (const v of views.values()) {
  world.scene.add(v.root, v.shadow);
  v.visible = false;
}
const dust = new Dust();
const embers = new Dust(true);
world.scene.add(dust.mesh, embers.mesh);

const canvas = el('stage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const pipeline = new Pipeline(renderer);
const chase = new ChaseCamera(track);
const sound = new Sound();
const hud = new Hud(el('hud'), track.samples);

/** The race in progress, or null on the car select screen. */
let session: Session | null = null;
let fx = loadFx();
const applyFx = () => {
  pipeline.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2), fx, chase.camera);
  pipeline.apply(fx);
  hud.fit(pipeline.viewport, pipeline.size.w, pipeline.size.h);
  pipeline.setUi(hud.canvas);
  setFiltering(fx.pixelated, fx.mipmaps, fx.cutoutMipmaps);
  sound.muted = !fx.sound;
  sound.engineVolume = ENGINE_VOLUME[fx.engine];
  if (session) session.race.items.enabled = fx.items;
};
applyFx();
addEventListener('resize', applyFx);

const panel = new Panel(el('ui'), fx, (next) => {
  fx = next;
  saveFx(fx);
  applyFx();
});

/** Everything about the race in progress. */
interface Session {
  race: Race;
  views: CarView[];
  items: ItemView;
  poses: Pose[];
  air: number[];
  /** The player's lap clock: the lap last seen, when it began on the race clock, and the best lap so far. */
  lapSeen: number;
  lapStart: number;
  bestLap: number | null;
  /** Each racer's last bump already shown as sparks, and last boost already shown as a flare. */
  bumps: number[];
  flares: number[];
  /** Ages of the player's car events already turned into sounds. */
  heard: { hop: number; boost: number; bump: number; land: number };
  count: string;
  acc: number;
  /** The item slot's spin after a pick-up: when it stops, when it next ticks, and the icon on show. */
  rollUntil: number;
  rollNext: number;
  rollIcon: HTMLCanvasElement | null;
}

const showroom = (() => {
  const p = sampleAt(track, 14);
  return { at: new THREE.Vector3(p.x, surfaceY(p, 0), p.z), heading: Math.atan2(-p.tx, -p.tz) };
})();

function toSelect(): void {
  session?.items.dispose();
  session = null;
  for (const v of views.values()) v.visible = false;
  select.show();
  hud.show(false);
  touch.setVisible(false);
  sound.idle();
}

function startRace(): void {
  const seed = Math.floor(Math.random() * 1e9);
  session?.items.dispose();
  const race = new Race(track, gridFor(ROSTER, select.car, GRID, PLAYER_SLOT, seed), PLAYER_SLOT, seed, fx.items);
  for (const v of views.values()) v.visible = false;
  const raceViews = race.racers.map((r) => views.get(r.model.id) as CarView);
  for (const v of raceViews) v.visible = true;
  const items = new ItemView(race.items, raceViews, dust, embers, track);
  world.scene.add(items.group);
  session = {
    race,
    views: raceViews,
    items,
    poses: race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading })),
    air: race.racers.map(() => 0),
    bumps: race.racers.map(() => -1),
    flares: race.racers.map(() => -1),
    lapSeen: race.player.lap,
    lapStart: COUNTDOWN,
    bestLap: null,
    heard: { hop: -1, boost: -1, bump: -1, land: -1 },
    count: '',
    acc: 0,
    rollUntil: 0,
    rollNext: 0,
    rollIcon: null,
  };
  sound.voice(voiceOf(race.player.model.id));
  select.hide();
  hud.show(true);
  touch.setVisible(true);
  chase.snap();
}

const select = new CarSelect(el('select'), () => sound.select(), startRace);
const touch = new TouchPad(el('touch'), (action) => {
  sound.unlock();
  if (action === 'menu') toSelect();
  if (action === 'camera') chase.cycle();
  if (action === 'reset' && session) session.race.reset(session.race.player);
});
const keys = new Keyboard((code) => {
  sound.unlock();
  if (code === 'KeyP') panel.toggle();
  if (code === 'KeyM') {
    fx = { ...fx, sound: !fx.sound };
    saveFx(fx);
    applyFx();
    panel.sync(fx);
  }
  if (select.open) {
    if (code === 'ArrowLeft' || code === 'KeyA') select.step(-1);
    if (code === 'ArrowRight' || code === 'KeyD') select.step(1);
    if (code === 'Enter' || code === 'Space') select.go();
    return;
  }
  if (code === 'KeyC') chase.cycle();
  if (code === 'Escape') toSelect();
  if (code === 'KeyR' && session) {
    session.race.reset(session.race.player);
    chase.snap();
  }
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

function kickUp(r: Racer, view: CarView, i: number, s: Session, dt: number): void {
  const car = r.car;
  const speed = Math.hypot(car.vx, car.vz);
  const landed = grounded(car) && s.air[i] > 0.25;
  s.air[i] = car.air;
  const wheels = view.rearWheels();
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
  const hard = car.surface === 'wood' || car.surface === 'rock' || car.cover === 'ship';
  const slide = Math.abs(car.vx * Math.cos(car.heading) - car.vz * Math.sin(car.heading));
  if (hard && speed > 8 && (car.drift || slide > 6) && Math.random() < 24 * dt) {
    const w = wheels[Math.floor(Math.random() * wheels.length)];
    dust.spawn(w.x, w.y + 0.2, w.z, (Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2, 0.25 + Math.random() * 0.15, 0.7, SMOKE);
  }
  if (car.surface === 'wood' || car.cover === 'ship') return;
  const color = car.surface === 'rock' ? STONE : SAND;
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
  const r = s.race.player;
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
    .filter((b) => b.brain)
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

/** Item sounds: the player's own pick-ups and shots, and anything that goes off near the camera. */
function hearItem(e: ItemEvent, s: Session): void {
  const me = PLAYER_SLOT;
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
  let text = '';
  if (!race.started) text = String(Math.ceil(COUNTDOWN - race.clock));
  else if (race.clock < COUNTDOWN + 0.8) text = 'GO!';
  if (text !== s.count) {
    if (text) sound.beep(text === 'GO!');
    s.count = text;
  }
  hud.countdown(text);
}

let last = performance.now();
let time = 0;
const target = new THREE.Vector3();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  document.body.classList.toggle('touch-on', touch.active);
  document.body.classList.toggle('racing', session !== null);

  const s = session;
  if (s) {
    const input = merged(dt);
    s.acc += dt;
    while (s.acc >= TICK) {
      s.race.racers.forEach((r, i) => Object.assign(s.poses[i], { x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
      s.race.step(input);
      s.acc -= TICK;
    }
    const alpha = s.acc / TICK;
    s.race.racers.forEach((r, i) => {
      s.views[i].update(r.car, s.poses[i], alpha, track, dt, r.input.steer, time);
      kickUp(r, s.views[i], i, s, dt);
    });
    const player = s.race.player;
    const me = s.views[s.race.racers.indexOf(player)].root;
    target.copy(me.position);
    chase.update(target, me.rotation.y, dt, {
      drift: player.car.drift,
      boosting: player.car.boost > 0,
      lookBack: keys.lookingBack,
    });
    s.items.update(s.race, dt, time, chase.camera.position, (e) => hearItem(e, s));
    const index = s.race.racers.indexOf(player);
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
    if (player.lap > s.lapSeen) {
      if (s.lapSeen >= 1) {
        const lap = s.race.clock - s.lapStart;
        s.bestLap = s.bestLap === null ? lap : Math.min(s.bestLap, lap);
      }
      s.lapSeen = player.lap;
      s.lapStart = s.race.clock;
    }
    const speed = Math.hypot(player.car.vx, player.car.vz);
    hud.frame({
      place: s.race.standings().indexOf(player) + 1,
      total: s.race.racers.length,
      lap: Math.max(1, player.lap),
      lapTime: s.race.started ? s.race.clock - s.lapStart : 0,
      bestLap: s.bestLap,
      speed: speed / player.spec.topSpeed,
      speedValue: speed * SPEEDO,
      cars: s.race.racers.map((r) => ({ x: r.car.x, z: r.car.z, me: r === player, color: r.model.color })),
    });
  } else {
    const view = views.get(select.car.id) as CarView;
    for (const v of views.values()) v.visible = v === view;
    view.showcase(showroom.at, showroom.heading + time * 0.6);
    chase.orbit(showroom.at, time);
  }

  globals.uTime.value = time;
  world.update(chase.camera, time, dt);
  for (const f of world.flames) {
    if (Math.random() < 5 * dt && f.distanceToSquared(chase.camera.position) < 80 * 80) {
      embers.spawn(f.x + (Math.random() - 0.5) * 0.3, f.y - 0.3, f.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6, 0.06, 1.2 + Math.random() * 0.6, EMBER);
    }
  }
  dust.update(dt, chase.camera);
  embers.update(dt, chase.camera);
  flushLights(chase.camera.position);
  hud.paint();
  pipeline.render(world.scene, chase.camera);
  panel.tick(dt);
  requestAnimationFrame(frame);
}

toSelect();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  const give = (kind: ItemKind, count = 1) => {
    if (session) session.race.items.held[PLAYER_SLOT] = { kind, count };
  };
  const debug = { chase, track, keys, select, touch, sound, startRace, toSelect, give, pipeline, hud };
  Object.defineProperty(debug, 'race', { get: () => session?.race });
  Object.assign(window, { rc: debug });
}
