import type { ResultRow } from './results';

export interface Award {
  name: string;
  /** One line on why, with the number. */
  reason: string;
  /** Index of the winner in the rows given to pickAwards. */
  winner: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds as m:ss.cc. */
export function raceTime(seconds: number): string {
  const cs = Math.round(Math.max(0, seconds) * 100);
  return `${Math.floor(cs / 6000)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

const count = (n: number, one: string, many = `${one}S`) => `${n} ${n === 1 ? one : many}`;
const secs = (v: number) => `${v.toFixed(1)}S`;

interface Rule {
  name: string;
  /** The figure the award is judged on, or null when this racer can't win it. Higher wins unless `low` is set. */
  value: (r: ResultRow) => number | null;
  low?: boolean;
  /** A lead of this much counts as clear even when everyone else scored the same. */
  unit: number;
  /** The least a winner needs, or the most for a `low` award. */
  need: number;
  reason: (v: number) => string;
}

const RULES: Rule[] = [
  { name: 'SPEED DEMON', value: (r) => Math.round(r.stats.topSpeed * 3), unit: 3, need: 0, reason: (v) => `TOP SPEED ${v}` },
  { name: 'DRIFT KING', value: (r) => r.stats.driftBoosts, unit: 1, need: 3, reason: (v) => count(v, 'DRIFT BOOST') },
  { name: 'SPARK PLUG', value: (r) => r.stats.orangeBoosts, unit: 1, need: 2, reason: (v) => count(v, 'ORANGE BOOST') },
  { name: 'ROCKET MAN', value: (r) => (r.stats.rocketStart ? 1 : 0), unit: 1, need: 1, reason: () => 'ROCKET START OFF THE LINE' },
  { name: 'TRIGGER HAPPY', value: (r) => r.stats.itemsUsed, unit: 1, need: 4, reason: (v) => `${count(v, 'PICK-UP')} USED` },
  { name: 'SHARPSHOOTER', value: (r) => r.stats.hitsLanded, unit: 1, need: 2, reason: (v) => `${count(v, 'HIT')} LANDED` },
  { name: 'PUNCHING BAG', value: (r) => r.stats.hitsTaken, unit: 1, need: 3, reason: (v) => `HIT ${count(v, 'TIME')}` },
  { name: 'UNTOUCHABLE', value: (r) => r.stats.hitsTaken, low: true, unit: 1, need: 0, reason: () => 'NOT HIT ONCE' },
  { name: 'FREQUENT FLYER', value: (r) => r.stats.airTime, unit: 1, need: 3, reason: (v) => `${secs(v)} IN THE AIR` },
  { name: 'BIG AIR', value: (r) => r.stats.bigAir, unit: 0.25, need: 0.8, reason: (v) => `${secs(v)} IN ONE JUMP` },
  { name: 'PINBALL', value: (r) => r.stats.wallHits, unit: 2, need: 5, reason: (v) => count(v, 'WALL HIT') },
  { name: 'BUMPER CARS', value: (r) => r.stats.bumps, unit: 2, need: 5, reason: (v) => count(v, 'BUMP') },
  { name: 'OVERTAKER', value: (r) => r.stats.overtakes, unit: 1, need: 3, reason: (v) => count(v, 'OVERTAKE') },
  { name: 'FRONT RUNNER', value: (r) => r.stats.lapsLed, unit: 1, need: 1, reason: (v) => `LED ${count(v, 'LAP')}` },
  { name: 'COMEBACK KID', value: (r) => r.stats.comeback, unit: 1, need: 2, reason: (v) => `UP ${count(v, 'PLACE')}` },
  { name: 'OFF-ROADER', value: (r) => r.stats.offroad, unit: 2, need: 4, reason: (v) => `${secs(v)} OFF THE ROAD` },
  { name: 'HOT LAP', value: (r) => r.bestLap, low: true, unit: 0.5, need: Infinity, reason: (v) => `BEST LAP ${raceTime(v)}` },
];

interface Lead {
  winner: number;
  value: number;
  /** How far the winner stands clear of everyone else, in spreads of the rest. */
  score: number;
}

function lead(rule: Rule, rows: ResultRow[]): Lead | null {
  const sign = rule.low ? -1 : 1;
  const entries = rows
    .map((r, i) => ({ i, v: rule.value(r), place: r.place }))
    .filter((e): e is { i: number; v: number; place: number } => e.v !== null)
    .sort((a, b) => sign * (b.v - a.v) || a.place - b.place);
  if (entries.length < 2) return null;
  const [best, ...rest] = entries;
  if (sign * (best.v - rule.need) < 0) return null;
  const mean = rest.reduce((sum, e) => sum + e.v, 0) / rest.length;
  const spread = Math.sqrt(rest.reduce((sum, e) => sum + (e.v - mean) ** 2, 0) / rest.length);
  // A shared lead goes to the better finisher, but counts for less.
  const shared = rest[0].v === best.v ? 0.5 : 1;
  return { winner: best.i, value: best.v, score: (shared * sign * (best.v - mean)) / (spread + rule.unit) };
}

/** The awards whose winners stand out most, at most `limit` of them, and no more than two for anyone. */
export function pickAwards(rows: ResultRow[], limit = 5): Award[] {
  const leads = RULES.flatMap((rule) => {
    const l = lead(rule, rows);
    return l && l.score > 0 ? [{ rule, ...l }] : [];
  }).sort((a, b) => b.score - a.score);
  const won = new Map<number, number>();
  const out: Award[] = [];
  for (const l of leads) {
    if (out.length === limit) break;
    const n = won.get(l.winner) ?? 0;
    if (n >= 2) continue;
    won.set(l.winner, n + 1);
    out.push({ name: l.rule.name, reason: l.rule.reason(l.value), winner: l.winner });
  }
  return out;
}
