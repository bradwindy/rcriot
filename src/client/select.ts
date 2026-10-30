import { ROSTER, type CarModel, type Stats } from '../shared/roster';
import { GOLD, pixelLabel } from './pixel';

const STATS: [keyof Stats, string][] = [
  ['speed', 'SPEED'],
  ['accel', 'ACCEL'],
  ['handling', 'HANDLING'],
  ['grip', 'GRIP'],
  ['weight', 'WEIGHT'],
];
const KEY = 'rcriot.car';

function saved(): number {
  try {
    const i = ROSTER.findIndex((m) => m.id === localStorage.getItem(KEY));
    return Math.max(0, i);
  } catch {
    return 0;
  }
}

/** The car select screen: name, stat bars and arrows over a spinning preview drawn by the game. */
export class CarSelect {
  index = saved();
  private readonly root: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly onChange: (car: CarModel) => void,
    private readonly onGo: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'select pixel-ghost';
    host.append(this.root);
    this.render();
  }

  get car(): CarModel {
    return ROSTER[this.index];
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.render();
  }

  hide(): void {
    this.root.hidden = true;
  }

  step(dir: number): void {
    this.index = (this.index + dir + ROSTER.length) % ROSTER.length;
    try {
      localStorage.setItem(KEY, this.car.id);
    } catch {
      // The choice just won't be remembered.
    }
    this.onChange(this.car);
    this.render();
  }

  go(): void {
    this.onGo();
  }

  private render(): void {
    const car = this.car;
    const pips = (n: number) => Array.from({ length: 5 }, (_, i) => `<i data-pixel class="${i < n ? 'on' : ''}"></i>`).join('');
    this.root.innerHTML = `
      <div class="select-title"></div>
      <div class="select-bottom">
        <div class="select-pick">
          <button class="select-arrow" data-pixel data-step="-1" aria-label="Previous car"></button>
          <div class="select-name"><span></span><small></small></div>
          <button class="select-arrow" data-pixel data-step="1" aria-label="Next car"></button>
        </div>
        <button class="select-go" data-pixel></button>
        <div class="select-help"></div>
      </div>
      <div class="select-stats" data-pixel>
        ${STATS.map(([k]) => `<div class="select-stat"><span></span><b>${pips(car.stats[k])}</b></div>`).join('')}
      </div>`;
    const at = (selector: string) => this.root.querySelector(selector) as HTMLElement;
    pixelLabel(at('.select-title'), 'CHOOSE YOUR CAR', 14, GOLD);
    pixelLabel(at('.select-name span'), car.name.toUpperCase(), 13);
    pixelLabel(at('.select-name small'), `${this.index + 1}/${ROSTER.length}`, 7);
    const [back, next] = this.root.querySelectorAll<HTMLElement>('.select-arrow');
    pixelLabel(back, '<', 12, GOLD);
    pixelLabel(next, '>', 12, GOLD);
    pixelLabel(at('.select-go'), 'RACE!', 11);
    pixelLabel(at('.select-help'), 'ARROWS CHOOSE   ENTER RACE', 7);
    this.root.querySelectorAll<HTMLElement>('.select-stat span').forEach((el, i) => pixelLabel(el, STATS[i][1], 7));
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-step]')) {
      b.addEventListener('click', () => this.step(Number(b.dataset.step)));
    }
    this.root.querySelector('.select-go')?.addEventListener('click', () => this.go());
  }
}
