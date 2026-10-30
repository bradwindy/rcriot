const ORDINAL = ['TH', 'ST', 'ND', 'RD'];

function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'TH' : (ORDINAL[n % 10] ?? 'TH');
  return `${n}${tail}`;
}

export class Hud {
  private readonly lap: HTMLElement;
  private readonly place: HTMLElement;
  private readonly help: HTMLElement;
  private last = '';

  constructor(root: HTMLElement, total: number) {
    root.innerHTML = `
      <div class="hud-lap"><span class="hud-label">LAP</span> <span class="hud-value" data-lap>1</span></div>
      <div class="hud-place"><span data-place>1ST</span><span class="hud-of">/${total}</span></div>
      <div class="hud-help" data-help>ARROWS/WASD DRIVE &nbsp; C CAMERA &nbsp; R RESET &nbsp; P EFFECTS</div>`;
    this.lap = root.querySelector('[data-lap]') as HTMLElement;
    this.place = root.querySelector('[data-place]') as HTMLElement;
    this.help = root.querySelector('[data-help]') as HTMLElement;
    setTimeout(() => this.help.classList.add('faded'), 12000);
  }

  update(lap: number, place: number): void {
    const key = `${lap}:${place}`;
    if (key === this.last) return;
    this.last = key;
    this.lap.textContent = String(Math.max(1, lap));
    this.place.textContent = ordinal(place);
  }
}
