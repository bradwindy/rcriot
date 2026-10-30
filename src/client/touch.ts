import './touch.css';

export type TouchAction = 'reset' | 'camera' | 'menu';
type Hold = 'gas' | 'brake' | 'drift';
type Control = Hold | TouchAction;

const BUTTONS: [Control, string, string][] = [
  ['gas', 'GAS', 'touch-gas'],
  ['brake', 'BRAKE', 'touch-pedal touch-brake'],
  ['drift', 'DRIFT', 'touch-pedal touch-drift'],
  ['reset', 'RESET', 'touch-small touch-reset'],
  ['camera', 'CAM', 'touch-small touch-camera'],
  ['menu', 'MENU', 'touch-small touch-menu'],
];

/** Horizontal drag in CSS px that gives full lock, and the small drag at the start that is ignored. */
const STICK_RANGE = 60;
const DEAD_ZONE = 6;

interface Stick {
  id: number;
  x: number;
  y: number;
  dx: number;
}

const div = (className: string, text = ''): HTMLDivElement => {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
};

const isAction = (control: Control): control is TouchAction =>
  control === 'reset' || control === 'camera' || control === 'menu';

const steerFor = (dx: number): number => {
  const amount = Math.max(0, Math.abs(dx) - DEAD_ZONE) / (STICK_RANGE - DEAD_ZONE);
  return dx < 0 ? -amount : amount;
};

/**
 * On-screen controls for phones in landscape. A floating steering stick on the left half, Gas, Brake and Drift on the
 * right, and small Reset, Camera and Menu buttons. Every touch is tracked by its identifier, so they work together.
 */
export class TouchPad {
  private readonly root = div('touch-root');
  private readonly zone = div('touch-zone');
  private readonly ring = div('touch-stick');
  private readonly knob = div('touch-knob');
  private readonly controls = new Map<HTMLElement, Control>();
  private readonly pressed = new Map<number, Control>();
  private readonly coarse = matchMedia('(pointer: coarse)');
  private stick: Stick | null = null;
  private touched = false;
  private visible = true;

  constructor(
    host: HTMLElement,
    private readonly onAction: (action: TouchAction) => void,
  ) {
    this.root.style.setProperty('--touch-range', `${STICK_RANGE}px`);
    this.ring.append(this.knob);
    this.root.append(this.zone, this.ring);
    for (const [control, label, className] of BUTTONS) {
      const button = div(`touch-btn ${className}`, label);
      this.controls.set(button, control);
      this.root.append(button);
    }
    this.root.append(div('touch-turn', 'TURN YOUR PHONE SIDEWAYS'));
    host.append(this.root);

    const options = { passive: false };
    this.root.addEventListener('touchstart', (e) => this.onStart(e), options);
    this.root.addEventListener('touchmove', (e) => this.onMove(e), options);
    this.root.addEventListener('touchend', (e) => this.onEnd(e), options);
    addEventListener('touchcancel', () => this.clear());
    addEventListener('blur', () => this.clear());
    addEventListener(
      'touchstart',
      () => {
        this.touched = true;
        this.refresh();
      },
      { once: true, capture: true, passive: true },
    );
    this.coarse.addEventListener('change', () => this.refresh());
    matchMedia('(orientation: portrait)').addEventListener('change', () => this.clear());
    this.refresh();
  }

  get active(): boolean {
    return this.touched || this.coarse.matches;
  }

  sample(): { steer: number; throttle: number; drift: boolean } {
    const throttle = this.held('brake') ? -1 : this.held('gas') ? 1 : 0;
    return { steer: this.stick ? steerFor(this.stick.dx) : 0, throttle, drift: this.held('drift') };
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.refresh();
  }

  private refresh(): void {
    const shown = this.visible && this.active;
    this.root.hidden = !shown;
    if (!shown) this.clear();
  }

  private held(control: Control): boolean {
    for (const c of this.pressed.values()) if (c === control) return true;
    return false;
  }

  private onStart(e: TouchEvent): void {
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.target === this.zone) {
        this.stick ??= { id: t.identifier, x: t.clientX, y: t.clientY, dx: 0 };
      } else if (t.target instanceof HTMLElement) {
        const control = this.controls.get(t.target);
        if (control) this.pressed.set(t.identifier, control);
      }
    }
    this.render();
  }

  private onMove(e: TouchEvent): void {
    if (e.cancelable) e.preventDefault();
    const s = this.stick;
    if (!s) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== s.id) continue;
      // Past full lock the centre follows the thumb, so steering back never needs more than one range of drag.
      const over = Math.abs(t.clientX - s.x) - STICK_RANGE;
      if (over > 0) s.x += Math.sign(t.clientX - s.x) * over;
      s.dx = t.clientX - s.x;
    }
    this.render();
  }

  private onEnd(e: TouchEvent): void {
    if (e.cancelable) e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.stick?.id) this.stick = null;
      const control = this.pressed.get(t.identifier);
      if (control === undefined) continue;
      this.pressed.delete(t.identifier);
      if (isAction(control)) this.onAction(control);
    }
    this.render();
  }

  private clear(): void {
    this.stick = null;
    this.pressed.clear();
    this.render();
  }

  private render(): void {
    const s = this.stick;
    this.ring.classList.toggle('touch-stick-on', s !== null);
    if (s) {
      this.ring.style.transform = `translate(${s.x}px, ${s.y}px)`;
      this.knob.style.transform = `translateX(${s.dx}px)`;
    }
    for (const [el, control] of this.controls) el.classList.toggle('touch-down', this.held(control));
  }
}
