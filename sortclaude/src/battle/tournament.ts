import { SortWorker } from '../workers/client';
import { generateKeys, type PatternId } from '../engine/generators';
import type { CountResult } from '../engine/runner';

export type TourMetric = 'operations' | 'comparisons' | 'writes' | 'runtime';
export type TourFormat = 'elimination' | 'round-robin' | 'championship';

export interface TourConfig {
  format: TourFormat;
  competitors: string[];
  metric: TourMetric;
  sizes: number[];
  patterns: PatternId[];
  seed: number;
}

export interface Match {
  id: string;
  round: number;
  a: string | null;
  b: string | null;
  n: number;
  pattern: PatternId;
  seed: number;
  scoreA: number | null;
  scoreB: number | null;
  winner: string | null;
  done: boolean;
  note?: string;
}

export interface Standing {
  id: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  total: number;
}

function metricOf(r: CountResult, m: TourMetric): number {
  if (r.error || !r.sorted) return Infinity;
  if (m === 'runtime') return r.ms;
  if (m === 'comparisons') return r.comparisons;
  if (m === 'writes') return r.writes;
  return r.operations;
}

/**
 * Tournament runner. Every match uses ONE dataset (generated from the match seed) for both
 * algorithms. Lower metric wins; equal counts are draws (runtime ties within 2% are draws).
 */
export class Tournament {
  matches: Match[] = [];
  rounds = 0;
  paused = false;
  running = false;
  cancelled = false;
  private worker = new SortWorker(true);
  private cache = new Map<string, number>();

  constructor(public cfg: TourConfig, private onUpdate: () => void) {
    this.build();
  }

  private build() {
    const { competitors, sizes, patterns, seed, format } = this.cfg;
    this.matches = [];
    if (format === 'elimination') {
      let size = 1;
      while (size < competitors.length) size *= 2;
      const slots: (string | null)[] = [...competitors];
      while (slots.length < size) slots.push(null);
      this.rounds = Math.log2(size);
      for (let r = 0; r < this.rounds; r++) {
        const count = size >> (r + 1);
        for (let k = 0; k < count; k++) {
          this.matches.push({
            id: `r${r}m${k}`, round: r,
            a: r === 0 ? slots[2 * k] : null, b: r === 0 ? slots[2 * k + 1] : null,
            n: sizes[r % sizes.length], pattern: patterns[r % patterns.length], seed: (seed + r * 7919) >>> 0,
            scoreA: null, scoreB: null, winner: null, done: false,
          });
        }
      }
    } else {
      // round robin (championship = round robin repeated over every size × pattern)
      const datasets = format === 'championship' ? sizes.flatMap((n) => patterns.map((p) => ({ n, p }))) : [{ n: sizes[0], p: patterns[0] }];
      this.rounds = datasets.length;
      datasets.forEach((d, r) => {
        for (let i = 0; i < competitors.length; i++)
          for (let j = i + 1; j < competitors.length; j++)
            this.matches.push({ id: `r${r}-${i}-${j}`, round: r, a: competitors[i], b: competitors[j], n: d.n, pattern: d.p, seed: (seed + r * 7919) >>> 0, scoreA: null, scoreB: null, winner: null, done: false });
      });
    }
  }

  private async score(id: string, m: Match): Promise<{ v: number; err?: string }> {
    const key = `${id}|${m.n}|${m.pattern}|${m.seed}|${this.cfg.metric}`;
    if (this.cache.has(key)) return { v: this.cache.get(key)! };
    const keys = generateKeys({ n: m.n, pattern: m.pattern, seed: m.seed });
    const runtime = this.cfg.metric === 'runtime';
    const res = await this.worker.count(id, keys, m.seed, runtime ? 3 : 1, runtime ? 1 : 0, 20_000);
    const vals = res.map((r) => metricOf(r, this.cfg.metric)).sort((a, b) => a - b);
    const v = vals[Math.floor(vals.length / 2)];
    const err = res.find((r) => r.error)?.error;
    this.cache.set(key, v);
    return { v, err };
  }

  async run() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.cancelled = false;
    try {
      for (const m of this.matches) {
        if (m.done) continue;
        while (this.paused && !this.cancelled) await new Promise((r) => setTimeout(r, 150));
        if (this.cancelled) break;
        if (this.cfg.format === 'elimination' && m.round > 0) {
          const prev = this.matches.filter((x) => x.round === m.round - 1);
          const idx = Number(m.id.split('m')[1]);
          m.a = prev[2 * idx]?.winner ?? null;
          m.b = prev[2 * idx + 1]?.winner ?? null;
        }
        if (!m.a || !m.b) {
          m.winner = m.a ?? m.b;
          m.note = 'bye';
          m.done = true;
          this.onUpdate();
          continue;
        }
        const sa = await this.score(m.a, m);
        const sb = await this.score(m.b, m);
        m.scoreA = sa.v;
        m.scoreB = sb.v;
        const tie = this.cfg.metric === 'runtime' ? Math.abs(sa.v - sb.v) <= 0.02 * Math.min(sa.v, sb.v) : sa.v === sb.v;
        if (tie) {
          // elimination needs a winner: fewer comparisons, then name order (documented tie-break)
          m.winner = this.cfg.format === 'elimination' ? (m.a < m.b ? m.a : m.b) : null;
          m.note = this.cfg.format === 'elimination' ? 'tie → alphabetical tie-break' : 'draw';
        } else m.winner = sa.v < sb.v ? m.a : m.b;
        if (sa.err || sb.err) m.note = (m.note ? m.note + '; ' : '') + (sa.err ?? sb.err);
        m.done = true;
        this.onUpdate();
      }
    } catch (e) {
      if ((e as Error).message !== 'Cancelled') throw e;
    } finally {
      this.running = false;
      this.onUpdate();
    }
  }

  pause() {
    this.paused = true;
    this.onUpdate();
  }
  resume() {
    this.paused = false;
    this.onUpdate();
  }
  cancel() {
    this.cancelled = true;
    this.worker.cancel();
  }

  standings(): Standing[] {
    const map = new Map<string, Standing>();
    for (const id of this.cfg.competitors) map.set(id, { id, points: 0, wins: 0, draws: 0, losses: 0, total: 0 });
    for (const m of this.matches) {
      if (!m.done || !m.a || !m.b || m.note === 'bye') continue;
      const A = map.get(m.a)!;
      const B = map.get(m.b)!;
      A.total += Number.isFinite(m.scoreA!) ? m.scoreA! : 0;
      B.total += Number.isFinite(m.scoreB!) ? m.scoreB! : 0;
      if (m.winner === null) {
        A.draws++;
        B.draws++;
        A.points += 1;
        B.points += 1;
      } else if (m.winner === m.a) {
        A.wins++;
        B.losses++;
        A.points += 3;
      } else {
        B.wins++;
        A.losses++;
        B.points += 3;
      }
    }
    return [...map.values()].sort((x, y) => y.points - x.points || x.total - y.total);
  }

  champion(): string | null {
    if (this.matches.some((m) => !m.done)) return null;
    if (this.cfg.format === 'elimination') return this.matches[this.matches.length - 1]?.winner ?? null;
    return this.standings()[0]?.id ?? null;
  }

  dispose() {
    this.cancel();
    this.worker.dispose();
  }
}
