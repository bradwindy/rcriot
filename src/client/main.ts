import '@fontsource/press-start-2p/400.css';
import './style.css';
import * as THREE from 'three';
import { grounded, TICK, type Car } from '../shared/car';
import { PIRATE_COVE } from '../shared/circuit';
import { Race } from '../shared/race';
import { buildTrack } from '../shared/track';
import { ChaseCamera } from './camera';
import { Hud } from './hud';
import { Keyboard } from './input';
import { Panel } from './panel';
import { CarView, type Look, type Pose } from './render/cars';
import { Dust } from './render/particles';
import { Pipeline } from './render/post';
import { globals } from './render/ps1';
import { setFiltering } from './render/textures';
import { World } from './render/world';
import { loadFx, saveFx } from './settings';

// Colours are written as the screen should show them, the way the PS1 did. No linear-light conversions anywhere.
THREE.ColorManagement.enabled = false;

const PLAYER_LOOK: Look = { kind: 'buggy', color: '#d8322a', stripe: '#f4f0e0', number: 1 };
const BOT_LOOKS: Look[] = [
  { kind: 'truck', color: '#2a62d8', stripe: '#f2d36b', number: 2 },
  { kind: 'sport', color: '#f2c12e', stripe: '#1a1a1a', number: 3 },
  { kind: 'buggy', color: '#34a83a', stripe: '#f4f0e0', number: 4 },
  { kind: 'sport', color: '#e86a1c', stripe: '#2a2a2a', number: 5 },
  { kind: 'truck', color: '#8a3ac8', stripe: '#f4f0e0', number: 6 },
  { kind: 'buggy', color: '#22b8c8', stripe: '#1a1a1a', number: 7 },
  { kind: 'sport', color: '#e8e4dc', stripe: '#d8322a', number: 8 },
];
const PLAYER_SLOT = 5;
const SAND = new THREE.Color(0.86, 0.74, 0.55);
const STONE = new THREE.Color(0.55, 0.52, 0.48);

const track = buildTrack(PIRATE_COVE);
const race = new Race(track, 8, PLAYER_SLOT);
const world = new World(
  track,
  race.racers.map((r) => ({ s: r.car.s, offset: r.car.offset })),
);
let nextBot = 0;
const views = race.racers.map((r) => new CarView(r.brain ? BOT_LOOKS[nextBot++ % BOT_LOOKS.length] : PLAYER_LOOK));
for (const v of views) world.scene.add(v.root, v.shadow);
const dust = new Dust();
world.scene.add(dust.mesh);

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const pipeline = new Pipeline(renderer);
const chase = new ChaseCamera(track);

let fx = loadFx();
const applyFx = () => {
  pipeline.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2), fx, chase.camera);
  pipeline.apply(fx);
  setFiltering(fx.pixelated, fx.mipmaps, fx.cutoutMipmaps);
};
applyFx();
addEventListener('resize', applyFx);

const panel = new Panel(document.getElementById('ui') as HTMLElement, fx, (next) => {
  fx = next;
  saveFx(fx);
  applyFx();
});
const hud = new Hud(document.getElementById('hud') as HTMLElement, race.racers.length);
const keys = new Keyboard((code) => {
  if (code === 'KeyC') chase.cycle();
  if (code === 'KeyP') panel.toggle();
  if (code === 'KeyR') {
    race.reset(race.player);
    chase.snap();
  }
});

const pose = (c: Car): Pose => ({ x: c.x, y: c.y, z: c.z, heading: c.heading });
const poses = race.racers.map((r) => pose(r.car));
const airborne = race.racers.map(() => 0);

function kickUpDust(car: Car, i: number, dt: number): void {
  const fx = -Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  const speed = Math.hypot(car.vx, car.vz);
  const landed = grounded(car) && airborne[i] > 0.25;
  airborne[i] = car.air;
  if (!grounded(car) || car.surface === 'wood' || car.cover === 'ship') return;
  const color = car.surface === 'rock' ? STONE : SAND;
  const rate = landed ? 1 : speed < 7 ? 0 : (speed / 32) * (car.offroad ? 34 : 9) * dt;
  for (let n = landed ? 8 : 1; n > 0; n--) {
    if (Math.random() > rate) continue;
    const side = Math.random() < 0.5 ? -0.7 : 0.7;
    dust.spawn(
      car.x - fx * 0.9 - fz * side,
      car.y + 0.25,
      car.z - fz * 0.9 + fx * side,
      -fx * 2 + (Math.random() - 0.5) * 3,
      0.6 + Math.random() * 1.2,
      -fz * 2 + (Math.random() - 0.5) * 3,
      0.22 + Math.random() * 0.18,
      0.5 + Math.random() * 0.5,
      color,
    );
  }
}

let acc = 0;
let last = performance.now();
let time = 0;
const target = new THREE.Vector3();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  const input = keys.sample(dt);
  acc += dt;
  while (acc >= TICK) {
    race.racers.forEach((r, i) => Object.assign(poses[i], pose(r.car)));
    race.step(input);
    acc -= TICK;
  }
  const alpha = acc / TICK;
  race.racers.forEach((r, i) => {
    views[i].update(r.car, poses[i], alpha, track, dt, r.input.steer);
    kickUpDust(r.car, i, dt);
  });

  const me = views[PLAYER_SLOT].root;
  target.copy(me.position);
  chase.update(target, me.rotation.y, dt);
  globals.uTime.value = time;
  world.update(chase.camera, time);
  dust.update(dt, chase.camera);
  pipeline.render(world.scene, chase.camera);

  const standings = race.standings();
  hud.update(race.player.lap, standings.indexOf(race.player) + 1);
  panel.tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV) Object.assign(window, { rc: { race, chase, track, keys } });
