import type { CarInput } from '../shared/car';

const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const DRIFT = ['Space', 'ShiftLeft', 'ShiftRight'];
const LOOK_BACK = ['KeyB'];
const ITEM = ['KeyE'];
const ITEM_BACK = ['KeyQ'];
const CAPTURED = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, ...DRIFT, ...ITEM, ...ITEM_BACK]);

/** Keyboard driving. Steering eases in and out, since keys are all-or-nothing. */
export class Keyboard {
  private readonly held = new Set<string>();
  private steer = 0;

  constructor(onPress: (code: string) => void) {
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (!e.repeat) onPress(e.code);
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  get lookingBack(): boolean {
    return this.any(LOOK_BACK);
  }

  sample(dt: number): CarInput {
    const want = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    const rate = want === 0 ? 8 : Math.sign(want) !== Math.sign(this.steer) ? 10 : 5;
    const delta = want - this.steer;
    this.steer += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
    return {
      throttle: (this.any(UP) ? 1 : 0) - (this.any(DOWN) ? 1 : 0),
      steer: this.steer,
      drift: this.any(DRIFT),
      item: this.any(ITEM),
      itemBack: this.any(ITEM_BACK),
    };
  }
}
