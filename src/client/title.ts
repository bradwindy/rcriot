import {
  ACCENT,
  ArcadeScreen,
  bar,
  box,
  chevrons,
  chrome,
  DIM,
  easeBack,
  easeOut,
  every,
  FAINT,
  glint,
  glyph,
  PANEL,
  shine,
  slant,
  sparkle,
  text,
  textWidth,
} from './arcade';
import type { Panel } from './panel';
import { bake, CAP, GOLD, INK, sprite, WHITE } from './pixel';

export interface TitleActions {
  create(): void;
  join(code: string): void;
  practice(): void;
}

type Stage = 'press' | 'menu' | 'join';

const ITEMS = ['CREATE PARTY', 'JOIN PARTY', 'PRACTICE', 'EFFECTS'];
const CODE_LENGTH = 5;
const HINTS: Record<Stage, string[]> = {
  press: [],
  menu: ['ARROWS MOVE', 'ENTER PICK', 'ESC BACK'],
  join: ['TYPE THE CODE', 'ENTER JOIN', 'ESC BACK'],
};

/** The RC RIOT logo: chrome RIOT on a block, an RC plate stuck on its corner, speed streaks and a swaying aerial. */
class Logo {
  readonly width: number;
  readonly height: number;
  private readonly base: HTMLCanvasElement;
  private readonly glow: HTMLCanvasElement;
  /** The chrome face of RIOT where it shows, for the glint, and a canvas to build the glint on. */
  private readonly face: HTMLCanvasElement;
  private readonly scratch: HTMLCanvasElement;
  private readonly aerial: { x: number; y: number; length: number; ball: number };
  private readonly sparkles: { x: number; y: number }[];

  constructor(readonly size: number) {
    const s = size;
    const riot = chrome('RIOT', s);
    const cap = Math.round(s * CAP);
    const pad = Math.max(3, Math.round(s * 0.09));

    const rcSize = Math.max(8, Math.round(s * 0.36));
    const rcCap = Math.round(rcSize * CAP);
    const rc = glyph('RC', rcSize, WHITE);
    const plateH = rcCap + Math.max(5, Math.round(rcSize * 0.55));
    const lean = Math.round(plateH * 0.4);
    const plateW = Math.round(rc.width + lean + s * 0.3);
    const plateDepth = Math.max(2, Math.round(s * 0.05));

    const streak = Math.round(s * 0.8);
    const aerialLength = Math.round(s * 0.45);
    const ball = Math.max(1, Math.round(s * 0.045));
    const sway = Math.ceil(s * 0.13);

    // Find the T's top right corner on the chrome face, for the aerial to rise from.
    const face = (riot.face.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, riot.width, riot.height).data;
    const top = riot.originY - cap;
    let tip = 0;
    for (let y = top; y < top + Math.max(2, cap * 0.12); y++) {
      for (let x = 0; x < riot.width; x++) if (face[(y * riot.width + x) * 4 + 3]) tip = Math.max(tip, x);
    }

    const rx = pad + streak;
    // Small logos keep the plate higher, so it doesn't swallow the R.
    const overlap = Math.round(cap * (s < 40 ? 0.08 : 0.22));
    const ry = Math.max(pad + aerialLength + ball * 2 + 2 - top, pad + 1 + plateH - overlap - top);
    this.aerial = { x: rx + tip - Math.round(s * 0.1), y: ry + top, length: aerialLength, ball };
    this.width = Math.max(rx + riot.width, this.aerial.x + sway + ball * 2 + 2) + pad;
    this.height = ry + riot.height + pad;

    const [base, g] = sprite(this.width, this.height);
    g.lineJoin = 'round';

    // Speed streaks trailing off the R, tucked under its leaning left edge.
    [
      [0.4, 0.7],
      [0.62, 1],
      [0.84, 0.55],
    ].forEach(([at, length]) => {
      const y = ry + top + Math.round(cap * at);
      const right = rx + riot.originX + Math.round((1 - at) * cap * 0.21) + Math.round(s * 0.08);
      const left = right - Math.round(streak * length);
      const th = Math.max(3, Math.round(s * 0.1));
      const shape = (grow: number) => {
        g.beginPath();
        g.moveTo(left - grow, y);
        g.lineTo(right + grow, y - th / 2 - grow);
        g.lineTo(right + grow, y + th / 2 + grow);
        g.closePath();
      };
      g.fillStyle = INK;
      shape(1);
      g.fill();
      const heat = g.createLinearGradient(left, 0, right, 0);
      heat.addColorStop(0, '#d0300a');
      heat.addColorStop(0.6, '#ff9a1c');
      heat.addColorStop(1, '#fff0a0');
      g.fillStyle = heat;
      shape(0);
      g.fill();
    });

    g.drawImage(riot.canvas, rx, ry);

    // The RC plate, stuck over the top left of the R like a sticker, on its own little block.
    const px = rx + riot.originX - Math.round(s * (s < 40 ? 0.55 : 0.3));
    const py = ry + top + overlap - plateH;
    for (let d = plateDepth; d >= 1; d--) {
      g.fillStyle = INK;
      slant(g, px + d - 1, py + d - 1, plateW + 2, plateH + 2, lean);
      g.fill();
    }
    g.fillStyle = '#4a0a10';
    for (let d = plateDepth; d >= 1; d--) {
      slant(g, px + d, py + d, plateW, plateH, lean);
      g.fill();
    }
    g.fillStyle = INK;
    slant(g, px - 1, py - 1, plateW + 2, plateH + 2, lean);
    g.fill();
    const red = g.createLinearGradient(0, py, 0, py + plateH);
    red.addColorStop(0, '#ff7a52');
    red.addColorStop(0.45, '#e8261c');
    red.addColorStop(1, '#8a0c12');
    g.fillStyle = red;
    slant(g, px, py, plateW, plateH, lean);
    g.fill();
    g.fillStyle = '#ffd0b8';
    g.fillRect(px + lean, py, plateW - lean - 1, 1);
    const textX = px + Math.round((plateW - rc.width) / 2) + Math.round(lean * 0.15);
    const textY = py + Math.round((plateH + rcCap) / 2);
    g.drawImage(rc.canvas, textX - rc.originX, textY - rc.originY);
    bake(base, false);
    this.base = base;

    // The glint sweeps the chrome only, not the plate stuck over it.
    const [mask, mg] = sprite(this.width, this.height);
    mg.drawImage(riot.face, rx, ry);
    mg.globalCompositeOperation = 'destination-out';
    slant(mg, px - 2, py - 2, plateW + 4 + plateDepth, plateH + 4 + plateDepth, lean);
    mg.fill();
    this.face = mask;
    this.scratch = sprite(this.width, this.height)[0];
    this.sparkles = [
      { x: this.aerial.x + Math.round(s * 0.08), y: this.aerial.y + 1 },
      { x: px + lean + 1, y: py },
    ];

    // A warm glow round the whole thing, soft but in a few hard steps of strength.
    const r = Math.max(2, Math.round(s * 0.09));
    const alpha = g.getImageData(0, 0, this.width, this.height).data;
    let field = new Float32Array(this.width * this.height);
    for (let i = 0; i < field.length; i++) field[i] = alpha[i * 4 + 3] ? 1 : 0;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 0],
      [0, 1],
    ]) {
      const out = new Float32Array(field.length);
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const xx = x + dx * k;
            const yy = y + dy * k;
            if (xx >= 0 && yy >= 0 && xx < this.width && yy < this.height) sum += field[yy * this.width + xx];
          }
          out[y * this.width + x] = sum / (r * 2 + 1);
        }
      }
      field = out;
    }
    const [glow, gg] = sprite(this.width, this.height);
    const image = gg.createImageData(this.width, this.height);
    for (let i = 0; i < field.length; i++) {
      const a = Math.round(Math.min(1, field[i] * 1.6) * 5) / 5;
      image.data.set([255, 140, 40, Math.round(a * 150)], i * 4);
    }
    gg.putImageData(image, 0, 0);
    this.glow = glow;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 2.2);
    ctx.drawImage(this.glow, x, y);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.base, x, y);
    this.drawAerial(ctx, x, y, t);
    glint(ctx, this.face, this.scratch, x, y, every(t, 4.5, 0.75, 1));
    sparkle(ctx, x + this.sparkles[0].x, y + this.sparkles[0].y, Math.max(3, this.size * 0.12), every(t, 4.5, 0.5, 1.75));
    sparkle(ctx, x + this.sparkles[1].x, y + this.sparkles[1].y, Math.max(2, this.size * 0.09), every(t, 4.5, 0.45, 3.4));
  }

  /** An RC car's whip aerial off the T, swaying, with a red ball on the tip. */
  private drawAerial(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const { length, ball } = this.aerial;
    const ax = x + this.aerial.x;
    const ay = y + this.aerial.y;
    const s = this.size;
    const sway = Math.sin(t * 2.6) * s * 0.1 + Math.sin(t * 7.1) * s * 0.025;
    const at = (j: number) => ax + Math.round(sway * (j / length) ** 2);
    for (let j = 0; j <= length; j++) {
      ctx.fillStyle = INK;
      ctx.fillRect(at(j) - 1, ay - j, 2, 1);
      ctx.fillStyle = '#9aa2b4';
      ctx.fillRect(at(j), ay - j, 1, 1);
    }
    const bx = at(length);
    const by = ay - length - ball;
    const disc = (r: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx + 0.5, by + 0.5, r, 0, Math.PI * 2);
      ctx.fill();
    };
    disc(ball + 1.4, INK);
    disc(ball + 0.4, '#ff3a2a');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx - Math.floor(ball / 2), by - Math.floor(ball / 2), 1, 1);
  }
}

interface Layout {
  narrow: boolean;
  logoX: number;
  logoY: number;
  pressY: number;
  pressSize: number;
  itemSize: number;
  pitch: number;
  menuTop: number;
  barW: number;
  barH: number;
  codeTop: number;
  boxW: number;
  boxH: number;
  gap: number;
  letter: number;
  buttonsTop: number;
  buttonW: number;
  buttonH: number;
  hintTop: number;
}

/**
 * The start screen, drawn like a late-90s console front end over the attract race: the chrome logo drops in, PRESS
 * START blinks, and any key, click or tap slides in the menu. JOIN PARTY takes a five-letter code in a real text field,
 * so phones bring up their keyboard.
 */
export class Title extends ArcadeScreen {
  private stage: Stage = 'press';
  private index = 0;
  private stageAt = 0;
  private shownAt = 0;
  private barFrom = 0;
  private barAt = 0;
  private code = '';
  private logo: Logo | null = null;
  private L: Layout | null = null;
  private readonly items: HTMLButtonElement[];
  private readonly input: HTMLInputElement;
  private readonly back: HTMLButtonElement;
  private readonly go: HTMLButtonElement;

  constructor(
    host: HTMLElement,
    private readonly panel: Panel,
    private readonly actions: TitleActions,
    private readonly blip: () => void = () => undefined,
  ) {
    super(host, 'title');
    this.items = ITEMS.map((label, i) => this.button(label, () => this.choose(i)));
    // The mouse picks the row it moves onto. A menu sliding in under a still cursor doesn't count as a move.
    let mouse = '';
    addEventListener('pointermove', (e) => {
      const at = `${e.clientX},${e.clientY}`;
      const moved = at !== mouse;
      mouse = at;
      const i = this.items.indexOf(e.target as HTMLButtonElement);
      if (moved && e.pointerType === 'mouse' && this.stage === 'menu' && i >= 0 && i !== this.index) this.move(i - this.index);
    });
    this.input = document.createElement('input');
    this.input.className = 'arcade-input';
    Object.assign(this.input, { maxLength: CODE_LENGTH, autocomplete: 'off', spellcheck: false, enterKeyHint: 'go' });
    this.input.setAttribute('autocapitalize', 'characters');
    this.input.setAttribute('autocorrect', 'off');
    this.input.setAttribute('aria-label', 'Party code');
    this.input.addEventListener('input', () => this.setCode(this.input.value));
    this.input.addEventListener('keydown', (e) => {
      // Letters typed here must not reach the game's own keys, such as P for effects or M for mute.
      e.stopPropagation();
      if (e.key === 'Enter') this.submit();
      if (e.key === 'Escape') this.toMenu();
    });
    this.root.append(this.input);
    this.back = this.button('Back', () => this.toMenu());
    this.go = this.button('Join', () => this.submit());
    this.root.addEventListener('click', () => {
      if (this.stage === 'press') this.toMenu();
    });
  }

  show(): void {
    this.stage = 'press';
    this.shownAt = this.stageAt = performance.now() / 1000;
    this.reveal();
    this.sync();
  }

  hide(): void {
    super.hide();
    this.input.blur();
  }

  /** A key press from the game's keyboard handler. Typing in the code field is handled by the field itself. */
  key(code: string): void {
    if (this.stage === 'press') {
      this.toMenu();
    } else if (this.stage === 'menu') {
      if (code === 'ArrowUp' || code === 'KeyW') this.move(-1);
      if (code === 'ArrowDown' || code === 'KeyS') this.move(1);
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') this.choose(this.index);
      if (code === 'Escape') this.toStage('press');
    } else if (code === 'Escape') {
      this.toMenu();
    } else {
      if (code === 'Enter') this.submit();
      if (code === 'Backspace') this.setCode(this.code.slice(0, -1));
      if (/^Key[A-Z]$/.test(code)) this.setCode(this.code + code.slice(3));
      this.input.focus({ preventScroll: true });
    }
  }

  private toStage(stage: Stage): void {
    this.stage = stage;
    this.stageAt = performance.now() / 1000;
    this.sync();
  }

  private toMenu(): void {
    if (this.stage === 'press') this.blip();
    this.input.blur();
    this.toStage('menu');
    this.barAt = 0;
  }

  private move(dir: number): void {
    if (!this.L) return;
    this.barFrom = this.barY(performance.now() / 1000);
    this.barAt = performance.now() / 1000;
    this.index = (this.index + dir + ITEMS.length) % ITEMS.length;
    this.blip();
  }

  private choose(i: number): void {
    // The menu is still sliding in from the tap that opened it.
    if (this.stage !== 'menu' || performance.now() / 1000 - this.stageAt < 0.25) return;
    if (i !== this.index) {
      this.index = i;
      this.barAt = 0;
    }
    this.blip();
    if (i === 0) this.actions.create();
    if (i === 1) {
      this.code = '';
      this.input.value = '';
      this.toStage('join');
      // Focus inside the tap itself, or phones won't bring up the keyboard.
      this.input.focus({ preventScroll: true });
    }
    if (i === 2) this.actions.practice();
    if (i === 3) this.panel.toggle();
  }

  private setCode(value: string): void {
    const code = value
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, CODE_LENGTH);
    if (code.length > this.code.length) this.blip();
    this.code = code;
    if (this.input.value !== code) this.input.value = code;
  }

  private submit(): void {
    if (this.code.length !== CODE_LENGTH) return;
    this.blip();
    this.actions.join(this.code);
  }

  /** Shows only the controls of the current stage, over where they are drawn. */
  private sync(): void {
    const L = this.L;
    const menu = this.stage === 'menu';
    const join = this.stage === 'join';
    this.items.forEach((b) => (b.hidden = !menu));
    for (const el of [this.input, this.back, this.go]) el.hidden = !join;
    if (!L) return;
    const W = this.W;
    this.items.forEach((b, i) => this.place(b, Math.round(W / 2 - L.barW / 2) - 6, L.menuTop + i * L.pitch - 1, L.barW + 12, L.pitch));
    const codeW = CODE_LENGTH * L.boxW + (CODE_LENGTH - 1) * L.gap;
    this.place(this.input, Math.round(W / 2 - codeW / 2), L.codeTop, codeW, L.boxH);
    this.place(this.back, Math.round(W / 2) - L.buttonW - 4, L.buttonsTop, L.buttonW, L.buttonH);
    this.place(this.go, Math.round(W / 2) + 4, L.buttonsTop, L.buttonW, L.buttonH);
  }

  protected layout(): void {
    const { W, H } = this;
    const narrow = W < 200;
    const logo = this.fitLogo(Math.round(Math.max(18, Math.min(60, H * 0.22))), W - 6);
    const itemSize = narrow ? 9 : 10;
    const pitch = itemSize + 7;
    const barH = Math.round(itemSize * CAP + 7);
    const logoY = Math.round(Math.max(4, H * (narrow ? 0.1 : 0.06)));
    const below = logoY + logo.height;
    const menuTop = Math.round(below + Math.max(6, (H - below - pitch * ITEMS.length - 22) * 0.35));
    const boxW = narrow ? 15 : 18;
    const codeTop = menuTop + 16;
    this.L = {
      narrow,
      logoX: Math.round(W / 2 - logo.width / 2),
      logoY,
      pressY: Math.round(below + (H - below) * 0.48),
      pressSize: narrow ? 9 : 11,
      itemSize,
      pitch,
      menuTop,
      barW: Math.min(Math.max(...ITEMS.map((s) => textWidth(s, itemSize))) + 22, W - 2 * Math.round(barH * 0.7) - 8),
      barH,
      codeTop,
      boxW,
      boxH: boxW + 3,
      gap: narrow ? 2 : 3,
      letter: narrow ? 11 : 13,
      buttonsTop: codeTop + boxW + 3 + 9,
      buttonW: narrow ? 40 : 46,
      buttonH: 14,
      hintTop: H - 6,
    };
    this.sync();
  }

  /** The biggest logo up to `size` that fits `room` pixels across. */
  private fitLogo(size: number, room: number): Logo {
    let s = size;
    for (;;) {
      if (this.logo?.size !== s) this.logo = new Logo(s);
      if (this.logo.width <= room || s <= 14) return this.logo;
      s = Math.max(14, Math.min(s - 1, Math.floor((s * room) / this.logo.width)));
    }
  }

  private barY(t: number): number {
    const L = this.L as Layout;
    const to = L.menuTop + this.index * L.pitch;
    if (this.barAt === 0) return to;
    return Math.round(this.barFrom + (to - this.barFrom) * easeOut((t - this.barAt) / 0.12));
  }

  protected draw(t: number): void {
    const L = this.L;
    const logo = this.logo;
    if (!L || !logo) return;
    const ctx = this.ctx;
    const drop = easeBack((t - this.shownAt) / 0.7);
    logo.draw(ctx, L.logoX, Math.round(L.logoY - (1 - drop) * (L.logoY + logo.height)), t);
    const since = t - this.stageAt;
    if (this.stage === 'press' && t - this.shownAt > 0.5 && since % 1.1 < 0.75) {
      text(ctx, 'PRESS START', this.W / 2, L.pressY, L.pressSize, GOLD, 'center');
    }
    if (this.stage === 'menu') this.drawMenu(L, t, since);
    if (this.stage === 'join') this.drawJoin(L, t, since);
    if (!this.touch) this.drawHints(L);
  }

  private drawMenu(L: Layout, t: number, since: number): void {
    const ctx = this.ctx;
    const left = Math.round(this.W / 2 - L.barW / 2);
    const textY = (top: number) => top + Math.round((L.barH + L.itemSize * CAP) / 2);
    if (since > 0.2) {
      const y = this.barY(t);
      ctx.drawImage(bar(L.barW, L.barH), left, y);
      shine(ctx, left, y, L.barW, L.barH, every(t, 1.8, 0.45));
      chevrons(ctx, left, left + L.barW, y + L.barH / 2, Math.round(L.barH * 0.7), t);
    }
    ITEMS.forEach((label, i) => {
      const slide = easeOut((since - i * 0.05) / 0.28);
      const dx = Math.round((1 - slide) * this.W * 0.75);
      const top = L.menuTop + i * L.pitch;
      text(ctx, label, this.W / 2 + dx, textY(top), L.itemSize, i === this.index ? WHITE : DIM, 'center');
    });
  }

  private drawJoin(L: Layout, t: number, since: number): void {
    const ctx = this.ctx;
    const dx = Math.round((1 - easeOut(since / 0.28)) * this.W * 0.75);
    const mid = Math.round(this.W / 2) + dx;
    text(ctx, 'PARTY CODE', mid, L.menuTop + Math.round(L.itemSize * CAP), L.itemSize, GOLD, 'center');
    const codeW = CODE_LENGTH * L.boxW + (CODE_LENGTH - 1) * L.gap;
    const blink = Math.floor(t * 2.5) % 2 === 0;
    for (let i = 0; i < CODE_LENGTH; i++) {
      const x = Math.round(mid - codeW / 2) + i * (L.boxW + L.gap);
      const here = i === this.code.length;
      box(ctx, x, L.codeTop, L.boxW, L.boxH, PANEL, here && blink ? '#ffffff' : ACCENT);
      const ch = this.code[i];
      if (ch) text(ctx, ch, x + L.boxW / 2, L.codeTop + Math.round((L.boxH + L.letter * CAP) / 2), L.letter, WHITE, 'center');
      else if (here && blink) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 4, L.codeTop + L.boxH - 5, L.boxW - 8, 2);
      }
    }
    const size = 8;
    const label = (str: string, x: number, fill = WHITE) =>
      text(ctx, str, x + L.buttonW / 2, L.buttonsTop + Math.round((L.buttonH + size * CAP) / 2), size, fill, 'center');
    const backX = mid - L.buttonW - 4;
    box(ctx, backX, L.buttonsTop, L.buttonW, L.buttonH);
    label('BACK', backX, DIM);
    const goX = mid + 4;
    if (this.code.length === CODE_LENGTH) {
      ctx.drawImage(bar(L.buttonW, L.buttonH), goX, L.buttonsTop);
      shine(ctx, goX, L.buttonsTop, L.buttonW, L.buttonH, every(t, 1.4, 0.4));
      label('JOIN', goX);
    } else {
      box(ctx, goX, L.buttonsTop, L.buttonW, L.buttonH, PANEL, '#5a5070');
      label('JOIN', goX, FAINT);
    }
  }

  private drawHints(L: Layout): void {
    const hints = HINTS[this.stage];
    if (!hints.length) return;
    const line = hints.join('   ');
    const lines = textWidth(line, 7) <= this.W - 8 ? [line] : hints;
    lines.forEach((str, i) => {
      text(this.ctx, str, this.W / 2, L.hintTop - (lines.length - 1 - i) * 9, 7, FAINT, 'center');
    });
  }
}
