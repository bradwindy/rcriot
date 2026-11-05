import * as THREE from 'three';
import { ps1Material } from './ps1';
import { tex } from './textures';

/** How much sun reaches inside the cave and the wreck. */
export const INDOOR = 0.14;

/** Tones for the 1-pixel lines that keep thin posts and ropes from breaking up in the distance. */
const WIRE = {
  wood: [0.5, 0.33, 0.2],
  rope: [0.74, 0.63, 0.43],
  metal: [0.42, 0.43, 0.46],
};

export function createMaterials() {
  const lit = (map: THREE.Texture, shade = 1) => ps1Material({ map, vertexColors: true, shade });
  const wired = (m: THREE.ShaderMaterial, tone: number[]) => {
    m.userData.wire = tone;
    return m;
  };
  const cutout = (map: THREE.Texture, lit = true, sway = 0, swayWeight: [number, number, number] = [0, 1, 0]) =>
    ps1Material({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, lit, sway, swayWeight });
  const glow = (map: THREE.Texture, glow: number) => ps1Material({ map, vertexColors: true, lit: false, glow });
  return {
    sand: lit(tex.sand()),
    dirt: lit(tex.dirt()),
    planks: wired(lit(tex.planks()), WIRE.wood),
    planksIndoor: lit(tex.planks(), INDOOR),
    hull: lit(tex.hull()),
    hullIndoor: lit(tex.hull(), INDOOR),
    rock: lit(tex.rock()),
    cave: ps1Material({ map: tex.cave(), vertexColors: true, shade: INDOOR, side: THREE.DoubleSide }),
    bark: lit(tex.bark()),
    barkIndoor: lit(tex.bark(), INDOOR),
    frond: cutout(tex.frond(), true, 0.35),
    grass: cutout(tex.grass(), true, 0.15),
    barrel: lit(tex.barrel()),
    crate: lit(tex.crate()),
    rope: wired(lit(tex.rope()), WIRE.rope),
    sail: cutout(tex.sail(), true, 0.4, [0, -1, 1]),
    flag: cutout(tex.flag(), true, 0.3, [1, 0, 0]),
    checker: lit(tex.checker()),
    // The start banner scrolls slowly like a stadium sign.
    banner: ps1Material({ map: tex.banner(), vertexColors: true, scroll: [0.05, 0] }),
    sign: lit(tex.sign()),
    billboard: lit(tex.billboard()),
    metal: wired(lit(tex.metal()), WIRE.metal),
    metalIndoor: lit(tex.metal(), INDOOR),
    plastic: lit(tex.plastic()),
    white: lit(tex.white()),
    wire: lit(tex.white()),
    chest: lit(tex.chest()),
    gold: lit(tex.gold()),
    lens: glow(tex.lens(), 0.45),
    lantern: glow(tex.lantern(), 0.6),
    flame: ps1Material({ map: tex.flame(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, lit: false, sway: 0.12, glow: 0.9 }),
    water: ps1Material({
      map: tex.water(),
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      wave: 0.16,
      scroll: [0.01, 0.006],
    }),
    sky: ps1Material({ map: tex.white(), vertexColors: true, lit: false, fog: 0, side: THREE.BackSide, depthWrite: false }),
    stars: ps1Material({ map: tex.white(), vertexColors: true, lit: false, fog: 0, side: THREE.DoubleSide, depthWrite: false }),
    sun: ps1Material({ map: tex.sun(), lit: false, fog: 0, alphaTest: 0.5, depthWrite: false }),
    cloud: ps1Material({ map: tex.cloud(), lit: false, fog: 0, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: false, scroll: [0.003, 0] }),
    isles: ps1Material({ map: tex.rock(), vertexColors: true, fog: 0.72 }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;
