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
  const cutout = (map: THREE.Texture, lit = true) =>
    ps1Material({ map, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, lit });
  const glow = (map: THREE.Texture) => ps1Material({ map, vertexColors: true, lit: false });
  return {
    sand: lit(tex.sand()),
    dirt: lit(tex.dirt()),
    planks: wired(lit(tex.planks()), WIRE.wood),
    planksIndoor: lit(tex.planks(), INDOOR),
    hull: lit(tex.hull()),
    hullIndoor: lit(tex.hull(), INDOOR),
    rock: lit(tex.rock()),
    cave: lit(tex.cave(), INDOOR),
    bark: lit(tex.bark()),
    barkIndoor: lit(tex.bark(), INDOOR),
    frond: cutout(tex.frond()),
    grass: cutout(tex.grass()),
    barrel: lit(tex.barrel()),
    crate: lit(tex.crate()),
    rope: wired(lit(tex.rope()), WIRE.rope),
    sail: cutout(tex.sail()),
    flag: cutout(tex.flag()),
    checker: lit(tex.checker()),
    banner: lit(tex.banner()),
    sign: lit(tex.sign()),
    billboard: lit(tex.billboard()),
    metal: wired(lit(tex.metal()), WIRE.metal),
    metalIndoor: lit(tex.metal(), INDOOR),
    plastic: lit(tex.plastic()),
    white: lit(tex.white()),
    wire: lit(tex.white()),
    chest: lit(tex.chest()),
    gold: lit(tex.gold()),
    lens: glow(tex.lens()),
    lantern: glow(tex.lantern()),
    flame: cutout(tex.flame(), false),
    water: ps1Material({
      map: tex.water(),
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      wave: 0.16,
      scroll: [0.01, 0.006],
    }),
    sky: ps1Material({ map: tex.white(), vertexColors: true, lit: false, fog: 0, side: THREE.BackSide, depthWrite: false }),
    sun: ps1Material({ map: tex.sun(), lit: false, fog: 0, alphaTest: 0.5, depthWrite: false }),
    cloud: ps1Material({ map: tex.cloud(), lit: false, fog: 0, alphaTest: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    isles: ps1Material({ map: tex.rock(), vertexColors: true, fog: 0.72 }),
  };
}

export type Materials = ReturnType<typeof createMaterials>;
