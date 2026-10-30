import { pickAwards, raceTime, type Award } from '../shared/awards';
import type { RacerStats, ResultRow } from '../shared/results';
import { mulberry32 } from '../shared/rng';
import { ROSTER } from '../shared/roster';
import {
  ACCENT,
  ArcadeScreen,
  bar,
  box,
  BRONZE,
  chevrons,
  chrome,
  DIM,
  drawChrome,
  easeOut,
  every,
  FAINT,
  fit,
  PANEL,
  shine,
  SILVER,
  slant,
  text,
  textWidth,
  type Chrome,
} from './arcade';
import { bake, CAP, GOLD, INK, RED, sprite, WHITE, type Fill } from './pixel';

type Kind = 'results' | 'awards' | 'stats';

interface Page {
  kind: Kind;
  /** Rows (or awards) shown, as a range in display order. */
  from: number;
  to: number;
  /** Stat columns shown. */
  cols: number[];
}

interface Column {
  label: string;
  value: (s: RacerStats) => number;
  show: (v: number) => string;
}

const STATS: Column[] = [
  { label: 'TOP', value: (s) => Math.round(s.topSpeed * 3), show: String },
  { label: 'DRIFT', value: (s) => s.driftBoosts, show: String },
  { label: 'ORANGE', value: (s) => s.orangeBoosts, show: String },
  { label: 'ROCKET', value: (s) => (s.rocketStart ? 1 : 0), show: (v) => (v ? 'YES' : '-') },
  { label: 'ITEMS', value: (s) => s.itemsUsed, show: String },
  { label: 'HITS', value: (s) => s.hitsLanded, show: String },
  { label: 'TAKEN', value: (s) => s.hitsTaken, show: String },
  { label: 'AIR', value: (s) => s.airTime, show: (v) => v.toFixed(1) },
  { label: 'JUMP', value: (s) => s.bigAir, show: (v) => v.toFixed(1) },
  { label: 'WALLS', value: (s) => s.wallHits, show: String },
  { label: 'BUMPS', value: (s) => s.bumps, show: String },
  { label: 'PASSES', value: (s) => s.overtakes, show: String },
  { label: 'LED', value: (s) => s.lapsLed, show: String },
  { label: 'OFF-ROAD', value: (s) => s.offroad, show: (v) => v.toFixed(1) },
  { label: 'GAINED', value: (s) => s.comeback, show: (v) => (v > 0 ? `+${v}` : '0') },
];

const TITLES: Record<Kind, string> = { results: 'RESULTS', awards: 'AWARDS', stats: 'STATS' };
const ORDINAL = ['ST', 'ND', 'RD'];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : (ORDINAL[(n % 10) - 1] ?? 'TH')}`;
const PODIUM: Fill[] = [GOLD, SILVER, BRONZE];

const carOf = (id: string) => ROSTER.find((m) => m.id === id);

/** A gold medal on a red and blue ribbon, baked once. */
function medal(): HTMLCanvasElement {
  const [canvas, g] = sprite(13, 15);
  g.fillStyle = INK;
  g.fillRect(2, 0, 4, 7);
  g.fillRect(7, 0, 4, 7);
  g.fillStyle = '#e8261c';
  g.fillRect(3, 0, 2, 6);
  g.fillStyle = '#3a6ae8';
  g.fillRect(8, 0, 2, 6);
  g.fillStyle = INK;
  g.beginPath();
  g.arc(6.5, 9, 5.6, 0, Math.PI * 2);
  g.fill();
  const shade = g.createLinearGradient(0, 4, 0, 14);
  shade.addColorStop(0, '#fff6b0');
  shade.addColorStop(0.5, '#f2c12e');
  shade.addColorStop(1, '#c2740e');
  g.fillStyle = shade;
  g.beginPath();
  g.arc(6.5, 9, 4.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.fillRect(4, 6, 2, 1);
  g.fillRect(4, 7, 1, 1);
  return bake(canvas, false);
}

function swatch(ctx: CanvasRenderingContext2D, x: number, y: number, model: string): void {
  const car = carOf(model);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y - 1, 9, 7);
  ctx.fillStyle = car?.color ?? '#888888';
  ctx.fillRect(x + 1, y, 7, 5);
  ctx.fillStyle = car?.stripe ?? '#cccccc';
  ctx.fillRect(x + 1, y + 3, 7, 1);
}

interface Layout {
  narrow: boolean;
  m: number;
  /** The board's left edge and width, centred and capped so wide screens don't stretch it thin. */
  boardX: number;
  boardW: number;
  head: Chrome[];
  headTop: number;
  arrow: number;
  dotsY: number;
  top: number;
  bottom: number;
  footTop: number;
  nextW: number;
  /** Results columns, as x offsets inside the board. */
  pos: number;
  name: number;
  nameW: number;
  /** Room for the car's name on the second line of a narrow row. */
  carRoom: number;
  car: number;
  carW: number;
  time: number;
  best: number;
  rowPitch: number;
  statPitch: number;
  /** Where stat rows start below the board's top: lower when the labels take two lines. */
  statTop: number;
  cardH: number;
  statPos: number;
  statName: number;
  statNameW: number;
  /** Right edge of each stat column on its page. */
  statRight: Map<number, number>;
}

/**
 * The end of race board, in the title's arcade style: a chrome header, pages turned with < and >, and rows that slide in
 * one by one. RESULTS lists times, AWARDS hands out the five that stand out most, STATS shows everyone's numbers.
 */
export class ResultsBoard extends ArcadeScreen {
  /** The host pressed NEXT RACE. */
  onNext: () => void = () => undefined;
  private rows: ResultRow[] = [];
  private me = -1;
  private host = false;
  private awards: Award[] = [];
  private pages: Page[] = [];
  private page = 0;
  private pageAt = 0;
  private dir = 1;
  private L: Layout | null = null;
  private readonly medal = medal();
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly go: HTMLButtonElement;

  constructor(
    host: HTMLElement,
    private readonly blip: () => void = () => undefined,
  ) {
    super(host, 'results');
    this.prev = this.button('Previous page', () => this.step(-1));
    this.next = this.button('Next page', () => this.step(1));
    this.go = this.button('Next race', () => {
      if (this.host) this.onNext();
    });
  }

  /** `me` is the viewer's index in `rows`. Only the host gets the NEXT RACE button. */
  show(rows: ResultRow[], me: number, host: boolean): void {
    this.rows = [...rows].sort((a, b) => a.place - b.place);
    this.me = this.rows.indexOf(rows[me]);
    this.host = host;
    this.awards = pickAwards(this.rows);
    this.page = 0;
    this.dir = 1;
    this.pageAt = performance.now() / 1000;
    this.go.hidden = !host;
    this.reveal();
  }

  /** A key press from the game's keyboard handler. */
  key(code: string): void {
    if (code === 'ArrowLeft' || code === 'KeyA') this.step(-1);
    if (code === 'ArrowRight' || code === 'KeyD') this.step(1);
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.host) this.onNext();
  }

  step(dir: number): void {
    if (this.pages.length < 2) return;
    this.page = (this.page + dir + this.pages.length) % this.pages.length;
    this.dir = Math.sign(dir) || 1;
    this.pageAt = performance.now() / 1000;
    this.blip();
  }

  protected layout(): void {
    const { W, H } = this;
    const m = W < 200 ? 3 : 6;
    const arrow = W < 200 ? 13 : 16;
    const room = W - 2 * (m + arrow + 4);
    const head = (['results', 'awards', 'stats'] as Kind[]).map((k) => {
      let size = W < 200 ? 18 : 24;
      let c = chrome(TITLES[k], size);
      while (c.width > room && size > 10) c = chrome(TITLES[k], --size);
      return c;
    });
    const headTop = m - 1;
    const headH = Math.max(...head.map((c) => c.height));
    const dotsY = headTop + headH + 1;
    const top = dotsY + 7;
    const footTop = H - m - 15;
    const bottom = footTop - 6;
    const boardW = Math.min(W - 2 * m, 440);
    const inner = boardW - 10;

    // RESULTS columns: place, name, car, time and best lap. When a name won't fit, each row takes two lines: place,
    // name and time on top, the car and best lap under them.
    const time = Math.max(textWidth('00:00.00', 8), textWidth('TIME', 7));
    const best = Math.max(textWidth('0:00.00', 7), textWidth('BEST LAP', 7));
    const carW = Math.max(...ROSTER.map((c) => textWidth(c.name.toUpperCase(), 7))) + 11;
    const wide = textWidth('12TH', 8) + 6 + carW + 8 + time + 8 + best;
    const narrow = inner - wide < 48;
    const pos = narrow ? textWidth('12', 8) : textWidth('12TH', 8);
    const name = pos + (narrow ? 4 : 6);
    const nameW = narrow ? inner - name - time - 3 : inner - wide - 6;
    const carRoom = narrow ? inner - name - 10 - textWidth('0:00.00', 7) - 3 : carW;

    // STATS: place, the name (just the car's colour when narrow), then as many columns as fit, the rest on more pages.
    const statPos = textWidth('12', 7) + 2;
    const statNameW = narrow ? 9 : Math.min(64, Math.max(...this.rows.map((r) => textWidth(r.name.toUpperCase(), 7)), 30));
    const statName = statPos + (narrow ? 3 : 5);
    // Narrow boards stagger the column labels over two lines, so a column needs little more room than its figures.
    const gap = narrow ? 4 : 6;
    const labelW = STATS.map((c) => textWidth(c.label, 7));
    const valueW = STATS.map((c) => Math.max(...this.rows.map((r) => textWidth(c.show(c.value(r.stats)), 7))));
    const widthsOf = (group: number[]) =>
      group.reduce<number[]>((ws, i, k) => {
        const own = Math.max(valueW[i], narrow ? 0 : labelW[i]) + gap;
        ws.push(narrow ? Math.max(own, k ? labelW[i] + 3 - ws[k - 1] : labelW[i] + gap) : own);
        return ws;
      }, []);
    const colRoom = inner - statName - statNameW - 2;
    const fits = (group: number[]) => widthsOf(group).reduce((a, b) => a + b, 0) <= colRoom;
    let groups: number[][] = [[]];
    STATS.forEach((_, i) => {
      const group = groups[groups.length - 1];
      if (group.length && !fits([...group, i])) groups.push([i]);
      else group.push(i);
    });
    // Even the pages out, so the last isn't a lone column, as long as they still fit.
    const per = Math.ceil(STATS.length / groups.length);
    const even = groups.map((_, p) => STATS.map((_, i) => i).slice(p * per, (p + 1) * per)).filter((g) => g.length);
    if (even.every(fits)) groups = even;
    const statRight = new Map<number, number>();
    for (const group of groups) {
      const ws = widthsOf(group);
      const spare = colRoom - ws.reduce((a, b) => a + b, 0);
      const pad = Math.max(0, Math.min(16, Math.floor(spare / group.length)));
      let x = inner;
      for (let k = group.length - 1; k >= 0; k--) {
        statRight.set(group[k], x);
        x -= ws[k] + pad;
      }
    }

    // Rows split over pages when they don't fit, then spread out to fill the board.
    const room15 = bottom - top - 16;
    const statTop = narrow ? 23 : 14;
    const statRoom = bottom - top - statTop - 2;
    const pitch = (min: number, max: number, space: number) => {
      const pages = Math.ceil(this.rows.length / Math.max(1, Math.floor(space / min)));
      return Math.max(min, Math.min(max, Math.floor(space / Math.ceil(this.rows.length / pages))));
    };
    const rowPitch = narrow ? pitch(19, 24, room15) : pitch(11, 14, room15);
    const statPitch = pitch(10, 13, statRoom);
    const fitRows = Math.max(1, Math.floor(room15 / rowPitch));
    const statRows = Math.max(1, Math.floor(statRoom / statPitch));
    const cardH = narrow ? 32 : 26;
    const cards = Math.max(1, Math.floor((bottom - top + 4) / (cardH + 4)));
    const pages: Page[] = [];
    const split = (kind: Kind, count: number, per: number, colsFor: number[] = []) => {
      const n = Math.max(1, Math.ceil(count / per));
      const size = Math.ceil(count / n);
      for (let p = 0; p < n; p++) pages.push({ kind, from: p * size, to: Math.min(count, (p + 1) * size), cols: colsFor });
    };
    split('results', this.rows.length, fitRows);
    if (this.awards.length) split('awards', this.awards.length, cards);
    for (const group of groups) split('stats', this.rows.length, statRows, group);
    this.pages = pages;
    this.page = Math.min(this.page, pages.length - 1);

    this.L = {
      narrow,
      m,
      boardX: Math.round(W / 2 - boardW / 2),
      boardW,
      head,
      headTop,
      arrow,
      dotsY,
      top,
      bottom,
      footTop,
      nextW: textWidth('NEXT RACE', 9) + 26,
      pos,
      name,
      nameW,
      carRoom,
      car: narrow ? 0 : inner - best - 8 - time - 8 - carW,
      carW,
      time: narrow ? inner : inner - best - 8,
      best: inner,
      rowPitch,
      statPitch,
      statTop,
      cardH,
      statPos,
      statName,
      statNameW,
      statRight,
    };
    const arrowY = headTop + Math.round(headH / 2 - arrow / 2);
    this.place(this.prev, 0, arrowY - 6, m + arrow + 6, arrow + 12);
    this.place(this.next, W - m - arrow - 6, arrowY - 6, m + arrow + 6, arrow + 12);
    this.place(this.go, Math.round(W / 2 - this.L.nextW / 2) - 4, footTop - 3, this.L.nextW + 8, 21);
    this.prev.hidden = this.next.hidden = pages.length < 2;
  }

  protected draw(t: number): void {
    const L = this.L;
    if (!L) return;
    const ctx = this.ctx;
    const page = this.pages[this.page];
    const since = t - this.pageAt;
    const kinds: Kind[] = ['results', 'awards', 'stats'];
    const head = L.head[kinds.indexOf(page.kind)];
    const glint = since < 0.6 ? since / 0.6 : every(t, 3.5, 0.6);
    drawChrome(ctx, head, Math.round(this.W / 2 - head.width / 2 + 2), L.headTop, glint);

    if (this.pages.length > 1) {
      this.drawArrow(L, L.m, '<', t);
      this.drawArrow(L, this.W - L.m - L.arrow, '>', t);
      const gap = 6;
      const left = Math.round(this.W / 2 - ((this.pages.length - 1) * gap) / 2);
      if (this.pages.length > 8) text(ctx, `${this.page + 1}/${this.pages.length}`, this.W / 2, L.dotsY + 5, 7, DIM, 'center');
      else {
        this.pages.forEach((_, i) => {
          const x = left + i * gap;
          ctx.fillStyle = INK;
          ctx.fillRect(x - 2, L.dotsY - 1, 5, 5);
          ctx.fillStyle = i === this.page ? ACCENT : '#4a4260';
          ctx.fillRect(x - 1, L.dotsY, 3, 3);
        });
      }
    }

    const x = L.boardX;
    const w = L.boardW;
    if (page.kind === 'awards') {
      const cardW = Math.min(w, 360);
      this.drawAwards(L, page, Math.round(this.W / 2 - cardW / 2), cardW, t, since);
    } else {
      box(ctx, x, L.top, w, L.bottom - L.top);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, L.top + 1, w - 2, L.bottom - L.top - 2);
      ctx.clip();
      if (page.kind === 'results') this.drawResults(L, page, x + 5, t, since);
      else this.drawStats(L, page, x + 5, t, since);
      ctx.restore();
    }
    this.drawFoot(L, t);
  }

  private drawArrow(L: Layout, x: number, label: string, t: number): void {
    const y = L.headTop + Math.round(L.head[0].height / 2 - L.arrow / 2);
    box(this.ctx, x, y, L.arrow, L.arrow);
    const nudge = every(t, 2.4, 0.3, label === '<' ? 0 : 1.2) >= 0 ? (label === '<' ? -1 : 1) : 0;
    const size = L.arrow < 16 ? 10 : 12;
    text(this.ctx, label, x + L.arrow / 2 + nudge, y + Math.round((L.arrow + size * CAP) / 2), size, GOLD, 'center');
  }

  /** How far a row still has to slide in, staggered down the page. */
  private slide(i: number, since: number): number {
    return Math.round((1 - easeOut((since - 0.05 - i * 0.04) / 0.26)) * this.dir * this.W);
  }

  /** The viewer's own row: the orange bar, a soft pulse and a shine every so often. */
  private mine(x: number, y: number, w: number, h: number, t: number): void {
    const ctx = this.ctx;
    ctx.drawImage(bar(w, h), x, y);
    ctx.globalAlpha = 0.1 + 0.1 * Math.sin(t * 4);
    ctx.fillStyle = '#ffffff';
    slant(ctx, x + 1, y + 1, w - 2, h - 2, Math.round(h * 0.4));
    ctx.fill();
    ctx.globalAlpha = 1;
    shine(ctx, x, y, w, h, every(t, 2.6, 0.5));
  }

  private labels(L: Layout, entries: [string, number, CanvasTextAlign][]): void {
    for (const [label, x, align] of entries) text(this.ctx, label, x, L.top + 9, 7, GOLD, align);
  }

  private drawResults(L: Layout, page: Page, ix: number, t: number, since: number): void {
    const ctx = this.ctx;
    if (L.narrow) this.labels(L, [['RACER', ix + L.name, 'left'], ['TIME', ix + L.time, 'right']]);
    else {
      this.labels(L, [
        ['RACER', ix + L.name, 'left'],
        ['CAR', ix + L.car, 'left'],
        ['TIME', ix + L.time, 'right'],
        ['BEST LAP', ix + L.best, 'right'],
      ]);
    }
    for (let i = page.from; i < page.to; i++) {
      const r = this.rows[i];
      const k = i - page.from;
      const y = L.top + 14 + k * L.rowPitch;
      const x = ix + this.slide(k, since);
      const mine = i === this.me;
      const base = L.narrow ? y + 8 + Math.floor((L.rowPitch - 19) / 2) : y + Math.round((L.rowPitch - 1 + 8 * CAP) / 2);
      if (mine) this.mine(x - 4, y, L.best + 7, L.rowPitch - 1, t);
      else if (k % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x - 4, y, L.best + 7, L.rowPitch - 1);
      }
      const dim = mine ? WHITE : DIM;
      text(ctx, L.narrow ? String(r.place) : ordinal(r.place), x + L.pos, base, 8, PODIUM[r.place - 1] ?? WHITE, 'right');
      const name = fit(r.name.toUpperCase(), 8, L.nameW - (r.bot && !L.narrow ? 20 : 0));
      const advance = text(ctx, name, x + L.name, base, 8, r.bot && !mine ? DIM : WHITE);
      if (r.bot && !L.narrow) text(ctx, 'BOT', x + L.name + advance + 4, base, 7, mine ? DIM : FAINT);
      text(ctx, r.time === null ? 'DNF' : raceTime(r.time), x + L.time, base, 8, r.time === null ? RED : WHITE, 'right');
      const best = r.bestLap === null ? '-' : raceTime(r.bestLap);
      const carName = (carOf(r.model)?.name ?? r.model).toUpperCase();
      if (L.narrow) {
        const line = base + 9;
        swatch(ctx, x + L.name, line - 5, r.model);
        text(ctx, fit(carName, 7, L.carRoom), x + L.name + 10, line, 7, dim);
        text(ctx, best, x + L.time, line, 7, dim, 'right');
      } else {
        swatch(ctx, x + L.car, base - 5, r.model);
        text(ctx, carName, x + L.car + 11, base, 7, dim);
        text(ctx, best, x + L.best, base, 7, dim, 'right');
      }
    }
  }

  private drawStats(L: Layout, page: Page, ix: number, t: number, since: number): void {
    const ctx = this.ctx;
    if (L.narrow) {
      page.cols.forEach((c, k) => text(ctx, STATS[c].label, ix + (L.statRight.get(c) ?? 0), L.top + 9 + (k % 2) * 9, 7, GOLD, 'right'));
    } else {
      this.labels(L, [['RACER', ix + L.statName, 'left'], ...page.cols.map((c): [string, number, CanvasTextAlign] => [STATS[c].label, ix + (L.statRight.get(c) ?? 0), 'right'])]);
    }
    // The best figure in each column shows in gold.
    const top = new Map(page.cols.map((c) => [c, Math.max(...this.rows.map((r) => STATS[c].value(r.stats)))]));
    const right = Math.max(...page.cols.map((c) => L.statRight.get(c) ?? 0));
    for (let i = page.from; i < page.to; i++) {
      const r = this.rows[i];
      const k = i - page.from;
      const y = L.top + L.statTop + k * L.statPitch;
      const x = ix + this.slide(k, since);
      const mine = i === this.me;
      if (mine) this.mine(x - 4, y, right + 7, L.statPitch - 1, t);
      else if (k % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x - 4, y, right + 7, L.statPitch - 1);
      }
      const base = y + Math.round((L.statPitch - 1 + 7 * CAP) / 2);
      text(ctx, String(r.place), x + L.statPos, base, 7, PODIUM[r.place - 1] ?? WHITE, 'right');
      if (L.narrow) swatch(ctx, x + L.statName, base - 5, r.model);
      else text(ctx, fit(r.name.toUpperCase(), 7, L.statNameW), x + L.statName, base, 7, r.bot && !mine ? DIM : WHITE);
      for (const c of page.cols) {
        const col = STATS[c];
        const v = col.value(r.stats);
        const best = v === top.get(c) && v > 0;
        text(ctx, col.show(v), x + (L.statRight.get(c) ?? 0), base, 7, best && !mine ? GOLD : WHITE, 'right');
      }
    }
  }

  private drawAwards(L: Layout, page: Page, x: number, w: number, t: number, since: number): void {
    const ctx = this.ctx;
    const gap = 4;
    const total = (page.to - page.from) * (L.cardH + gap) - gap;
    const top = L.top + Math.max(0, Math.floor((L.bottom - L.top - total) / 2));
    for (let i = page.from; i < page.to; i++) {
      const a = this.awards[i];
      const r = this.rows[a.winner];
      const k = i - page.from;
      const y = top + k * (L.cardH + gap);
      const cx = x + this.slide(k, since * 0.8);
      const mine = a.winner === this.me;
      const pulse = mine && Math.sin(t * 5) > 0;
      box(ctx, cx, y, w, L.cardH, PANEL, pulse ? '#ffffff' : ACCENT);
      ctx.drawImage(this.medal, cx + 5, y + Math.round((L.cardH - 15) / 2));
      const tx = cx + 23;
      const carName = (carOf(r.model)?.name ?? r.model).toUpperCase();
      if (L.narrow) {
        text(ctx, a.name, tx, y + 10, 9, GOLD);
        text(ctx, fit(r.name.toUpperCase(), 8, w - 30), tx, y + 19, 8, mine ? GOLD : WHITE);
        text(ctx, fit(a.reason, 7, w - 26), tx, y + 28, 7, DIM);
      } else {
        const right = cx + w - 7;
        text(ctx, a.name, tx, y + 12, 10, GOLD);
        text(ctx, a.reason, tx, y + 21, 7, DIM);
        const room = w - 30 - Math.max(textWidth(a.name, 10), textWidth(a.reason, 7)) - 12;
        text(ctx, fit(r.name.toUpperCase(), 9, room), right, y + 12, 9, mine ? GOLD : WHITE, 'right');
        const carW = textWidth(carName, 7);
        text(ctx, carName, right, y + 21, 7, DIM, 'right');
        swatch(ctx, right - carW - 11, y + 16, r.model);
      }
    }
  }

  private drawFoot(L: Layout, t: number): void {
    const ctx = this.ctx;
    if (this.host) {
      const x = Math.round(this.W / 2 - L.nextW / 2);
      ctx.drawImage(bar(L.nextW, 15), x, L.footTop);
      shine(ctx, x, L.footTop, L.nextW, 15, every(t, 1.8, 0.45));
      chevrons(ctx, x, x + L.nextW, L.footTop + 7.5, 10, t);
      text(ctx, 'NEXT RACE', this.W / 2 + 1, L.footTop + Math.round((15 + 9 * CAP) / 2), 9, WHITE, 'center');
    } else {
      text(ctx, 'WAITING FOR HOST', this.W / 2, L.footTop + 10, 7, FAINT, 'center');
    }
  }
}

/** Twelve made-up racers with plausible numbers, for seeing the board without a real race. */
export function mockResults(count = 12, seed = 7): ResultRow[] {
  const rng = mulberry32(seed);
  const people = ['BRADLEY', 'KIRI', 'SUPERSONICSAM', 'MOANA', 'TAMA'];
  const cars = [...ROSTER].sort(() => rng() - 0.5);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  let clock = 92 + rng() * 4;
  return Array.from({ length: count }, (_, i) => {
    const model = cars[i % cars.length];
    const human = i % 3 === 0 && people.length > 0;
    const dnf = i >= count - 1;
    clock += 0.4 + rng() * 2.5;
    const stats: RacerStats = {
      topSpeed: 31 + rng() * 5 + (i === 4 ? 5 : 0),
      driftBoosts: human ? int(3, 14) : int(0, 2),
      orangeBoosts: human ? int(0, 6) : 0,
      rocketStart: rng() < 0.25,
      itemsUsed: int(2, 9),
      hitsLanded: int(0, 4) + (i === 7 ? 5 : 0),
      hitsTaken: int(0, 5),
      airTime: 2 + rng() * 4,
      bigAir: 0.5 + rng() * 0.8 + (i === 2 ? 1.2 : 0),
      wallHits: int(2, 12),
      bumps: int(3, 15),
      overtakes: int(1, 8),
      lapsLed: i === 0 ? 2 : i === 1 ? 1 : 0,
      offroad: rng() * 6,
      comeback: i === 3 ? 7 : int(0, 3),
    };
    return {
      name: human ? (people.shift() as string) : model.name.toUpperCase(),
      bot: !human,
      model: model.id,
      place: i + 1,
      time: dnf ? null : clock,
      bestLap: 29.5 + rng() * 2.5,
      stats,
    };
  });
}
