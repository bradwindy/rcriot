const ORDINAL = ['TH', 'ST', 'ND', 'RD'];

function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'TH' : (ORDINAL[n % 10] ?? 'TH');
  return `${n}${tail}`;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly lap: HTMLElement;
  private readonly place: HTMLElement;
  private readonly help: HTMLElement;
  private readonly big: HTMLElement;
  private readonly note: HTMLElement;
  private last = '';
  private noteTimer = 0;

  constructor(root: HTMLElement, total: number) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-lap"><span class="hud-label">LAP</span> <span class="hud-value" data-lap>1</span></div>
      <div class="hud-place"><span data-place>1ST</span><span class="hud-of">/${total}</span></div>
      <div class="hud-big" data-big></div>
      <div class="hud-note" data-note></div>
      <div class="hud-help" data-help>ARROWS/WASD DRIVE &nbsp; SPACE DRIFT &nbsp; B LOOK BACK &nbsp; R RESET<br />
        C CAMERA &nbsp; M MUTE &nbsp; ESC CARS &nbsp; P EFFECTS</div>`;
    this.lap = root.querySelector('[data-lap]') as HTMLElement;
    this.place = root.querySelector('[data-place]') as HTMLElement;
    this.help = root.querySelector('[data-help]') as HTMLElement;
    this.big = root.querySelector('[data-big]') as HTMLElement;
    this.note = root.querySelector('[data-note]') as HTMLElement;
  }

  show(visible: boolean): void {
    this.root.hidden = !visible;
    if (visible) {
      this.help.classList.remove('faded');
      setTimeout(() => this.help.classList.add('faded'), 12000);
    }
  }

  update(lap: number, place: number): void {
    const key = `${lap}:${place}`;
    if (key === this.last) return;
    this.last = key;
    this.lap.textContent = String(Math.max(1, lap));
    this.place.textContent = ordinal(place);
  }

  /** The big countdown in the middle of the screen. Empty text hides it. */
  countdown(text: string): void {
    if (this.big.textContent !== text) this.big.textContent = text;
  }

  /** A short message under the countdown, like ROCKET START! */
  flash(text: string): void {
    this.note.textContent = text;
    this.note.classList.add('on');
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => this.note.classList.remove('on'), 1400);
  }
}
