export interface Fx {
  /** Buffer height in pixels. 0 renders at the screen's own resolution. */
  resolution: number;
  aspect: 'wide' | 'classic';
  wobble: 'off' | 'subtle' | 'ps1' | 'heavy';
  affine: boolean;
  colour: 'full' | 'reduced' | 'dithered';
  crt: 'off' | 'soft' | 'strong';
  pixelated: boolean;
  mipmaps: boolean;
  /** Mipmap leaves, flags, flames and clouds too, with mip levels that keep their shape. */
  cutoutMipmaps: boolean;
  fog: boolean;
  drawDistance: number;
}

export const DEFAULT_FX: Fx = {
  resolution: 240,
  aspect: 'wide',
  wobble: 'ps1',
  affine: true,
  colour: 'dithered',
  crt: 'soft',
  pixelated: true,
  mipmaps: true,
  cutoutMipmaps: true,
  fog: true,
  drawDistance: 300,
};

const KEY = 'rcriot.fx';

export function loadFx(): Fx {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_FX, ...(JSON.parse(raw) as Partial<Fx>) };
  } catch {
    // Storage can be blocked or hold junk. The defaults still work.
  }
  return { ...DEFAULT_FX };
}

export function saveFx(fx: Fx): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(fx));
  } catch {
    // Not saving is fine.
  }
}
