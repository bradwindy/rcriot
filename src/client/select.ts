import { ROSTER, type CarModel, type Stats } from '../shared/roster';

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
    this.root.className = 'select';
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
    const pips = (n: number) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    this.root.innerHTML = `
      <div class="select-title">CHOOSE YOUR CAR</div>
      <div class="select-bottom">
        <div class="select-pick">
          <button class="select-arrow" data-step="-1" aria-label="Previous car">&lt;</button>
          <div class="select-name"><span>${car.name.toUpperCase()}</span><small>${this.index + 1}/${ROSTER.length}</small></div>
          <button class="select-arrow" data-step="1" aria-label="Next car">&gt;</button>
        </div>
        <button class="select-go">RACE!</button>
        <div class="select-help">ARROWS CHOOSE &nbsp; ENTER RACE</div>
      </div>
      <div class="select-stats">
        ${STATS.map(([k, label]) => `<div class="select-stat"><span>${label}</span><b>${pips(car.stats[k])}</b></div>`).join('')}
      </div>`;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-step]')) {
      b.addEventListener('click', () => this.step(Number(b.dataset.step)));
    }
    this.root.querySelector('.select-go')?.addEventListener('click', () => this.go());
  }
}
