import type { TrackDef } from '../course';

/** A plain oval, standing in until the real layout is built. */
export function placeholder(radius: number): TrackDef {
  const points = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { x: Math.sin(a) * radius * 1.4, z: -Math.cos(a) * radius + radius, y: 1, width: 14, shoulder: 3, bank: 0, surface: 'dirt', cover: 'open' } as const;
  });
  return { points };
}
