import '@fontsource/press-start-2p/400.css';
import './style.css';
import * as THREE from 'three';
import { driftLevel, grounded, TICK, type CarInput } from '../shared/car';
import { PIRATE_COVE } from '../shared/circuit';
import { COUNTDOWN, gridFor, gridSlot, Race, type Racer } from '../shared/race';
import { ROSTER } from '../shared/roster';
import { buildTrack, sampleAt, surfaceY } from '../shared/track';
import { Sound, type Nearby } from './audio';
import { ChaseCamera } from './camera';
import { Hud } from './hud';
import { Keyboard } from './input';
import { Panel } from './panel';
import { CarView, type Pose } from './render/cars';
import { Dust } from './render/particles';
import { Pipeline } from './render/post';
import { globals } from './render/ps1';
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
world.scene.add(dust.mesh);

const canvas = el('stage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const pipeline = new Pipeline(renderer);
const chase = new ChaseCamera(track);
const sound = new Sound();

let fx = loadFx();
const applyFx = () => {
  pipeline.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2), fx, chase.camera);
  pipeline.apply(fx);
  setFiltering(fx.pixelated, fx.mipmaps, fx.cutoutMipmaps);
  sound.muted = !fx.sound;
  sound.engineVolume = ENGINE_VOLUME[fx.engine];
};
applyFx();
addEventListener('resize', applyFx);

const panel = new Panel(el('ui'), fx, (next) => {
  fx = next;
  saveFx(fx);
  applyFx();
});
const hud = new Hud(el('hud'), GRID);

/** Everything about the race in progress. Null on the car select screen. */
interface Session {
  race: Race;
  views: CarView[];
  poses: Pose[];
  air: number[];
  /** Ages of the player's car events already turned into sounds. */
  heard: { hop: number; boost: number; bump: number; land: number };
  count: string;
  acc: number;
}
let session: Session | null = null;

const showroom = (() => {
  const p = sampleAt(track, 14);
  return { at: new THREE.Vector3(p.x, surfaceY(p, 0), p.z), heading: Math.atan2(-p.tx, -p.tz) };
})();

function toSelect(): void {
  session = null;
  for (const v of views.values()) v.visible = false;
  select.show();
  hud.show(false);
  touch.setVisible(false);
  sound.idle();
}

function startRace(): void {
  const seed = Math.floor(Math.random() * 1e9);
  const race = new Race(track, gridFor(ROSTER, select.car, GRID, PLAYER_SLOT, seed), PLAYER_SLOT, seed);
  for (const v of views.values()) v.visible = false;
  const raceViews = race.racers.map((r) => views.get(r.model.id) as CarView);
  for (const v of raceViews) v.visible = true;
  session = {
    race,
    views: raceViews,
    poses: race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading })),
    air: race.racers.map(() => 0),
    heard: { hop: -1, boost: -1, bump: -1, land: -1 },
    count: '',
    acc: 0,
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
  };
}

function kickUp(r: Racer, view: CarView, i: number, s: Session, dt: number): void {
  const car = r.car;
  const speed = Math.hypot(car.vx, car.vz);
  const landed = grounded(car) && s.air[i] > 0.25;
  s.air[i] = car.air;
  if (!grounded(car)) return;
  const wheels = view.rearWheels();
  const level = driftLevel(car);
  if (level) {
    for (const w of wheels) {
      for (let n = 0; n < 2; n++) {
        const out = (Math.random() - 0.5) * 6;
        const up = 1.5 + Math.random() * 2.5;
        dust.spawn(w.x, w.y + 0.1, w.z, out, up, out, 0.08 + Math.random() * 0.07, 0.18 + Math.random() * 0.15, SPARK[level]);
      }
    }
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

function countdown(s: Session): void {
  const { race } = s;
  let text = '';
  if (!race.started) text = String(Math.ceil(COUNTDOWN - race.clock));
  else if (race.clock < COUNTDOWN + 0.8) text = 'GO!';
  if (text !== s.count) {
    if (text) sound.beep(text === 'GO!');
    if (text === 'GO!') {
      const car = race.player.car;
      if (car.boost > 0) hud.flash('ROCKET START!');
      else if (car.stall > 0) hud.flash('WHEELSPIN!');
    }
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
    hearPlayer(s);
    countdown(s);
    hud.update(player.lap, s.race.standings().indexOf(player) + 1);
  } else {
    const view = views.get(select.car.id) as CarView;
    for (const v of views.values()) v.visible = v === view;
    view.showcase(showroom.at, showroom.heading + time * 0.6);
    chase.orbit(showroom.at, time);
  }

  globals.uTime.value = time;
  world.update(chase.camera, time);
  dust.update(dt, chase.camera);
  pipeline.render(world.scene, chase.camera);
  panel.tick(dt);
  requestAnimationFrame(frame);
}

toSelect();
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  const debug = { chase, track, keys, select, touch, sound, startRace, toSelect };
  Object.defineProperty(debug, 'race', { get: () => session?.race });
  Object.assign(window, { rc: debug });
}
