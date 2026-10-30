import type { CarInput } from '../shared/car';

const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const DRIVE = new Set([...UP, ...DOWN, ...LEFT, ...RIGHT, 'Space']);

/** Keyboard driving. Steering eases in and out, since keys are all-or-nothing. Tuned properly in the controls round. */
export class Keyboard {
  private readonly held = new Set<string>();
  private steer = 0;

  constructor(onPress: (code: string) => void) {
    addEventListener('keydown', (e) => {
      if (DRIVE.has(e.code)) e.preventDefault();
      if (!e.repeat) onPress(e.code);
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
  }

  private any(codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  sample(dt: number): CarInput {
    const want = (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0);
    const rate = want === 0 ? 8 : Math.sign(want) !== Math.sign(this.steer) ? 10 : 5;
    const delta = want - this.steer;
    this.steer += Math.sign(delta) * Math.min(Math.abs(delta), rate * dt);
    return { throttle: (this.any(UP) ? 1 : 0) - (this.any(DOWN) ? 1 : 0), steer: this.steer };
  }
}
