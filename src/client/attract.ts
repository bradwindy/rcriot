import * as THREE from 'three';
import { NO_INPUT, TICK } from '../shared/car';
import { COUNTDOWN, Race, type Racer } from '../shared/race';
import { ROSTER, type CarModel } from '../shared/roster';
import { routeTrack } from '../shared/course';
import { limitOf, roofed, sampleAt, surfaceY, type Track } from '../shared/track';
import type { ChaseCamera } from './camera';
import type { CarView, Pose } from './render/cars';
import { ItemView } from './render/items';
import type { Dust } from './render/particles';
import type { World } from './render/world';

const GRID = 8;
/** Seconds of race before a fresh one starts, at the next cut. */
const RESTART = 75;

type Shot = 'arch' | 'crane' | 'trackside' | 'chase';

const indoor = (track: Track, s: number) => roofed(sampleAt(track, s).cover);
/** Whether the racer will be under a roof `d` ahead on its own route. */
const roofAhead = (track: Track, r: Racer, d: number) => indoor(routeTrack(track, r.car.route), r.car.rs + d);

/**
 * The race behind the title screen and the level select: eight bots on a track, filmed like a game's attract mode. The camera cuts every
 * few seconds between a crane on the leader, low shots from the trackside as the pack goes by, a chase shot on a car
 * further back, and a slow orbit round the start arch as cars come through it. A fresh race starts now and then.
 */
export class Attract {
  /** What the game's dust and spark code tracks per car: air time last frame, and the last bump and boost shown. */
  air: number[] = [];
  bumps: number[] = [];
  flares: number[] = [];
  sinks: number[] = [];
  private race: Race | null = null;
  private views: CarView[] = [];
  private poses: Pose[] = [];
  private items: ItemView | null = null;
  private acc = 0;
  private age = 0;
  private lastArch = 0;
  private shot: Shot = 'arch';
  private shotAge = 0;
  private shotLength = 0;
  private subject = 0;
  private side = 1;
  private front = false;
  private spin = 0;
  private placed = false;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly want = new THREE.Vector3();

  private track: Track | null = null;

  /** `restart` is called when the race has run long enough, to start the next one, on whichever track. */
  constructor(
    private readonly restart: () => void,
    private readonly cars: { viewFor(model: CarModel, slot: number): CarView; hideAll(): void },
    private readonly world: World,
    private readonly dust: Dust,
    private readonly embers: Dust,
    private readonly chase: ChaseCamera,
  ) {}

  /** The flyover race's clock, which the track's hazards run off. */
  get clock(): number | undefined {
    return this.race?.clock;
  }

  get running(): boolean {
    return this.race !== null;
  }

  start(track: Track): void {
    this.stop();
    this.track = track;
    const seed = Math.floor(Math.random() * 1e9);
    const models = [...ROSTER].sort(() => Math.random() - 0.5).slice(0, GRID);
    const race = new Race(track, models, -1, seed, true);
    // Skip most of the countdown: the first shot opens on the grid just before GO.
    while (race.clock < COUNTDOWN - 1.2) race.step(NO_INPUT);
    this.race = race;
    this.cars.hideAll();
    this.views = race.racers.map((r, i) => this.cars.viewFor(r.model, i));
    for (const v of this.views) v.visible = true;
    this.poses = race.racers.map((r) => ({ x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
    this.air = race.racers.map(() => 0);
    this.bumps = race.racers.map(() => -1);
    this.flares = race.racers.map(() => -1);
    this.sinks = race.racers.map(() => -1);
    this.items = new ItemView(race.items, this.views, this.dust, this.embers, track);
    this.world.scene.add(this.items.group);
    this.acc = 0;
    this.age = 0;
    this.lastArch = 0;
    this.cut('arch', 4.6);
  }

  stop(): void {
    this.items?.dispose();
    this.items = null;
    this.race = null;
    for (const v of this.views) v.visible = false;
    this.views = [];
  }

  /** Runs the race and the camera. `kick` throws up each car's dust and sparks. */
  update(dt: number, time: number, kick: (r: Racer, view: CarView, i: number) => void): void {
    const race = this.race;
    const track = this.track;
    if (!race || !track) return;
    this.acc += dt;
    while (this.acc >= TICK) {
      race.racers.forEach((r, i) => Object.assign(this.poses[i], { x: r.car.x, y: r.car.y, z: r.car.z, heading: r.car.heading }));
      race.step(NO_INPUT);
      this.acc -= TICK;
    }
    const alpha = this.acc / TICK;
    race.racers.forEach((r, i) => {
      this.views[i].update(r.car, this.poses[i], alpha, track, dt, r.input.steer, time);
      kick(r, this.views[i], i);
    });
    this.age += dt;
    this.shotAge += dt;
    if (this.shotAge >= this.shotLength) {
      if (this.age > RESTART) return this.restart();
      this.next();
    }
    this.film(dt);
    this.items?.update(race, dt, time, this.chase.camera.position, (e) => {
      if (e.type === 'thunder') this.world.darken(3.5);
    });
  }

  private cut(shot: Shot, length: number): void {
    this.shot = shot;
    this.shotAge = 0;
    this.shotLength = length;
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.placed = false;
    if (shot === 'arch') this.lastArch = this.age;
    if (shot === 'chase') this.chase.snap();
    if (shot === 'trackside') this.setTrackside();
    this.spin = (Math.random() - 0.5) * 0.4;
  }

  private standings(): Racer[] {
    return (this.race as Race).standings();
  }

  private indexOf(r: Racer): number {
    return (this.race as Race).racers.indexOf(r);
  }

  private speedOf(r: Racer): number {
    return Math.max(12, Math.hypot(r.car.vx, r.car.vz));
  }

  /** Picks the next shot from where the race is, never the same kind twice running. */
  private next(): void {
    const order = this.standings();
    const leader = order[0];
    const speed = this.speedOf(leader);
    const track = this.track as Track;
    const toLine = leader.car.s > track.length / 2 ? (track.length - leader.car.s) / speed : Infinity;
    if (this.shot !== 'arch' && this.age - this.lastArch > 25 && toLine > 1.5 && toLine < 4.5) {
      this.subject = this.indexOf(leader);
      this.cut('arch', toLine + 3);
      return;
    }
    const options: Shot[] = (['crane', 'trackside', 'chase'] as Shot[]).filter((s) => s !== this.shot);
    let shot = options[Math.floor(Math.random() * options.length)];
    const pick = shot === 'chase' ? order[Math.min(order.length - 1, Math.floor(Math.random() * 4))] : leader;
    // A crane above the cave or the wreck would only film the roof.
    if (shot === 'crane') {
      for (let d = 0; d < speed * 6; d += 4) if (roofAhead(track, pick, d)) shot = 'chase';
    }
    this.subject = this.indexOf(pick);
    this.front = Math.random() < 0.5;
    this.cut(shot, 4.5 + Math.random() * 1.5);
  }

  /** A spot at the barrier a couple of seconds ahead of the leader, in the open, with the camera low to the road. */
  private setTrackside(): void {
    const leader = this.standings()[0];
    const track = routeTrack(this.track as Track, leader.car.route);
    let s = leader.car.rs + this.speedOf(leader) * 1.8;
    for (let k = 0; k < 40 && indoor(track, s); k++) s += 5;
    const p = sampleAt(track, s);
    const offset = this.side * (limitOf(p) - 0.4);
    this.pos.set(p.x - p.tz * offset, surfaceY(p, offset) + 0.7, p.z + p.tx * offset);
    const back = sampleAt(track, s - 25);
    this.look.set(back.x, back.y + 1, back.z);
  }

  private film(dt: number): void {
    const race = this.race as Race;
    const track = this.track as Track;
    const camera = this.chase.camera;
    const r = race.racers[this.subject] ?? race.racers[0];
    const view = this.views[this.indexOf(r)];
    const ease = (rate: number) => 1 - Math.exp(-dt * rate);
    const t = this.shotAge;
    let fov = 55;
    switch (this.shot) {
      case 'arch': {
        const p = sampleAt(track, 0);
        const a = this.side * (0.75 - t * 0.09) + this.spin;
        const radius = 26;
        const h = Math.min(11, 6 + t * 0.7);
        this.pos.set(p.x + (p.tx * Math.cos(a) - p.tz * Math.sin(a)) * radius, p.y + h, p.z + (p.tz * Math.cos(a) + p.tx * Math.sin(a)) * radius);
        this.look.set(p.x - p.tx * 6, p.y + 3, p.z - p.tz * 6);
        break;
      }
      case 'crane': {
        // The subject heading into the cave or wreck ends the shot early.
        if (roofAhead(track, r, this.speedOf(r) * 1.2)) {
          this.cut('chase', 3.5);
          return this.film(dt);
        }
        const fx = -Math.sin(r.car.heading);
        const fz = -Math.cos(r.car.heading);
        const at = view.root.position;
        const reach = this.front ? 9 : -8;
        this.want.set(at.x + fx * reach + fz * -this.side * 6, at.y + 4.5 + t * 0.9, at.z + fz * reach + fx * this.side * 6);
        if (this.placed) this.pos.lerp(this.want, ease(2.5));
        else this.pos.copy(this.want);
        this.look.set(at.x + fx * 2, at.y + 0.6, at.z + fz * 2);
        fov = 50;
        break;
      }
      case 'trackside': {
        let best = Infinity;
        for (const v of this.views) {
          const d = v.root.position.distanceTo(this.pos);
          if (d < best && d < 80) {
            best = d;
            this.want.copy(v.root.position);
            this.want.y += 0.5;
          }
        }
        if (best < Infinity) this.look.lerp(this.want, this.placed ? ease(6) : 1);
        fov = 44;
        break;
      }
      case 'chase': {
        this.chase.update(view.root.position, view.root.rotation.y, dt, {
          drift: r.car.drift,
          boosting: r.car.boost > 0,
          lookBack: false,
          route: r.car.route,
          index: r.car.index,
        });
        this.placed = true;
        return;
      }
    }
    this.placed = true;
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}
