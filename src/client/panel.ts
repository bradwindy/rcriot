import { DEFAULT_FX, type Fx } from './settings';
import { pixelLabel } from './pixel';

type Choice<K extends keyof Fx> = { key: K; label: string; options: [Fx[K], string][] };

const CHOICES = [
  { key: 'resolution', label: 'Resolution', options: [[180, '180p'], [240, '240p (PS1)'], [360, '360p'], [480, '480p'], [0, 'Native']] },
  { key: 'aspect', label: 'Screen', options: [['wide', 'Widescreen'], ['classic', '4:3']] },
  { key: 'wobble', label: 'Vertex wobble', options: [['off', 'Off'], ['subtle', 'Subtle'], ['ps1', 'PS1'], ['heavy', 'Heavy']] },
  { key: 'affine', label: 'Texture warp', options: [[true, 'On'], [false, 'Off']] },
  { key: 'colour', label: 'Colour', options: [['dithered', '15-bit dithered'], ['reduced', '15-bit'], ['full', '24-bit']] },
  { key: 'crt', label: 'CRT', options: [['soft', 'Soft'], ['strong', 'Strong'], ['off', 'Off']] },
  { key: 'bloom', label: 'Bloom', options: [['soft', 'Soft'], ['strong', 'Strong'], ['off', 'Off']] },
  { key: 'pixelated', label: 'Textures', options: [[true, 'Pixelated'], [false, 'Smooth']] },
  { key: 'mipmaps', label: 'Far textures', options: [[true, 'Mipmapped'], [false, 'Raw (PS1)']] },
  { key: 'cutoutMipmaps', label: 'Far cut-outs', options: [[true, 'Mipmapped'], [false, 'Raw']] },
  { key: 'fog', label: 'Fog', options: [[true, 'On'], [false, 'Off']] },
  { key: 'items', label: 'Items', options: [[true, 'On'], [false, 'Off']] },
  { key: 'sound', label: 'Sound', options: [[true, 'On'], [false, 'Off']] },
  { key: 'engine', label: 'Engine', options: [['quiet', 'Quiet'], ['normal', 'Normal'], ['off', 'Off']] },
] satisfies Choice<keyof Fx>[];

/** The effects panel: every PS1 effect can be switched or tuned live, so feedback can name exactly what to change. */
export class Panel {
  private readonly root: HTMLElement;
  private readonly fps: HTMLElement;
  private frames = 0;
  private elapsed = 0;

  constructor(
    host: HTMLElement,
    private fx: Fx,
    private readonly onChange: (fx: Fx) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'panel';
    this.root.hidden = true;
    host.append(this.root);
    const button = document.createElement('button');
    button.className = 'panel-toggle pixel-ghost';
    button.dataset.pixel = '';
    pixelLabel(button, 'EFFECTS', 7);
    button.addEventListener('click', () => this.toggle());
    host.append(button);
    this.fps = document.createElement('div');
    this.fps.className = 'panel-fps';
    this.render();
  }

  /** Shows settings changed from outside the panel, such as the mute key. */
  sync(fx: Fx): void {
    this.fx = fx;
    this.render();
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  tick(dt: number): void {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.elapsed)} FPS`;
      this.frames = 0;
      this.elapsed = 0;
    }
  }

  private set(next: Fx, rebuild = true): void {
    this.fx = next;
    this.onChange(next);
    if (rebuild) this.render();
  }

  private render(): void {
    this.root.replaceChildren();
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'EFFECTS';
    this.root.append(title);
    for (const c of CHOICES) {
      const row = document.createElement('label');
      row.className = 'panel-row';
      row.append(c.label);
      const select = document.createElement('select');
      c.options.forEach(([value, text], i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = text;
        o.selected = value === this.fx[c.key];
        select.append(o);
      });
      select.addEventListener('change', () => this.set({ ...this.fx, [c.key]: c.options[Number(select.value)][0] }));
      row.append(select);
      this.root.append(row);
    }
    const range = document.createElement('label');
    range.className = 'panel-row';
    range.append('Draw distance');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '120';
    input.max = '700';
    input.step = '20';
    input.value = String(this.fx.drawDistance);
    input.addEventListener('input', () => this.set({ ...this.fx, drawDistance: Number(input.value) }, false));
    range.append(input);
    this.root.append(range);
    const reset = document.createElement('button');
    reset.textContent = 'Reset to PS1';
    reset.addEventListener('click', () => this.set({ ...DEFAULT_FX }));
    this.root.append(reset, this.fps);
  }
}
