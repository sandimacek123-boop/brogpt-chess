import { Timeline } from '../engine/timeline';
import { buildViewCache, makeView, type RenderView, type ViewCache } from '../render/view';
import { C_COMPARISONS, C_OPERATIONS, C_WRITES } from '../engine/ops';
import type { Recording, CountResult } from '../engine/runner';
import { SortWorker } from '../workers/client';
import { getAlgorithm } from '../engine/registry';

export type RaceMetric = 'operations' | 'comparisons' | 'writes';
export const METRIC_SLOT: Record<RaceMetric, number> = { operations: C_OPERATIONS, comparisons: C_COMPARISONS, writes: C_WRITES };
export const RACE_SECONDS = 15;

export interface Contestant {
  algorithmId: string;
  team: number;
  rec: Recording | null;
  tl: Timeline | null;
  cache: ViewCache | null;
  error: string | null;
  finished: boolean;
  finishOrder: number;
  rank: number;
  scratch: { compare: number[]; write: number[] };
  completionStart: number;
}

/**
 * Visualization race: every contestant receives a clone of ONE seeded dataset. A shared clock
 * advances in units of the chosen metric; each contestant replays its own recording until its
 * counter reaches the clock. Rankings are by the total of that metric (fewer = better).
 */
export class BattleEngine {
  contestants: Contestant[] = [];
  keys: Int32Array = new Int32Array(0);
  metric: RaceMetric = 'operations';
  clock = 0;
  playing = false;
  speed = 1;
  private worker = new SortWorker(true);
  private finishCounter = 0;
  private listeners = new Set<() => void>();
  private raf = 0;
  private last = 0;
  private frameHooks = new Set<(views: (RenderView | null)[]) => void>();
  private t0 = performance.now();
  seed = 0;

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onFrame(fn: (views: (RenderView | null)[]) => void) {
    this.frameHooks.add(fn);
    this.ensureLoop();
    return () => this.frameHooks.delete(fn);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Record every algorithm on an identical copy of `keys`. */
  async prepare(algorithmIds: string[], keys: Int32Array, seed: number, teams?: number[], onProgress?: (i: number) => void) {
    this.stop();
    this.keys = keys;
    this.seed = seed;
    this.clock = 0;
    this.finishCounter = 0;
    this.contestants = algorithmIds.map((id, i) => ({ algorithmId: id, team: teams?.[i] ?? i, rec: null, tl: null, cache: null, error: null, finished: false, finishOrder: -1, rank: 0, scratch: { compare: [], write: [] }, completionStart: -1 }));
    this.emit();
    for (let i = 0; i < this.contestants.length; i++) {
      const c = this.contestants[i];
      onProgress?.(i);
      try {
        const rec = await this.worker.record(c.algorithmId, keys.slice(), seed, 16_000_000, 25_000);
        if (rec.error && !rec.truncated) c.error = rec.error;
        else {
          c.rec = rec;
          c.tl = new Timeline(rec, 32 * 1024 * 1024);
          c.cache = buildViewCache(c.tl);
          if (rec.truncated) c.error = 'Stopped by safety limit — result is incomplete.';
        }
      } catch (e) {
        c.error = (e as Error).message;
      }
      this.emit();
    }
    this.computeRanks();
    this.ensureLoop();
  }

  cancel() {
    this.worker.cancel();
  }

  /** Total of the race metric for a finished recording. */
  total(c: Contestant): number {
    if (!c.tl) return Infinity;
    return c.rec ? endMetric(c, METRIC_SLOT[this.metric]) : Infinity;
  }

  maxTotal(): number {
    let m = 1;
    for (const c of this.contestants) if (c.tl && c.rec) m = Math.max(m, this.total(c));
    return m;
  }

  rate(): number {
    return (this.maxTotal() / RACE_SECONDS) * this.speed;
  }

  play() {
    if (this.contestants.every((c) => !c.tl || c.tl.done)) this.restart();
    this.playing = true;
    this.emit();
    this.ensureLoop();
  }

  pause() {
    this.playing = false;
    this.emit();
  }

  stop() {
    this.playing = false;
  }

  restart() {
    this.clock = 0;
    this.finishCounter = 0;
    for (const c of this.contestants) {
      c.tl?.seek(0);
      c.finished = false;
      c.finishOrder = -1;
      c.completionStart = -1;
    }
    this.emit();
  }

  /** Jump to the end of the race (every contestant finished). */
  finishAll() {
    this.clock = this.maxTotal() + 1;
    this.step(0);
    this.playing = false;
    this.emit();
  }

  private step(dt: number) {
    if (this.playing) this.clock += this.rate() * dt;
    const slot = METRIC_SLOT[this.metric];
    let changed = false;
    const finishedNow: Contestant[] = [];
    for (const c of this.contestants) {
      if (!c.tl || c.finished) continue;
      c.tl.advanceToMetric(slot, this.clock);
      if (c.tl.done) finishedNow.push(c);
    }
    if (finishedNow.length) {
      finishedNow.sort((a, b) => this.total(a) - this.total(b));
      for (const c of finishedNow) {
        c.finished = true;
        c.finishOrder = this.finishCounter++;
        c.completionStart = performance.now();
      }
      changed = true;
    }
    if (this.playing && this.contestants.every((c) => !c.tl || c.finished)) {
      this.playing = false;
      changed = true;
    }
    if (changed) this.emit();
  }

  computeRanks() {
    const scored = this.contestants.filter((c) => c.tl && !c.error).map((c) => ({ c, t: this.total(c) }));
    scored.sort((a, b) => a.t - b.t);
    let rank = 0;
    let prev = -1;
    scored.forEach((s, i) => {
      if (s.t !== prev) rank = i + 1;
      prev = s.t;
      s.c.rank = rank;
    });
    for (const c of this.contestants) if (!c.tl || c.error) c.rank = 0;
  }

  private ensureLoop() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      if (!this.frameHooks.size) return;
      const time = (now - this.t0) / 1000;
      const views = this.contestants.map((c) => {
        if (!c.tl || !c.cache) return null;
        const comp = c.completionStart >= 0 ? Math.min(1, (now - c.completionStart) / 1500) : -1;
        if (comp >= 1) c.completionStart = -1;
        const win = this.playing ? Math.max(1, Math.min(32, Math.round(this.rate() / 60))) : 1;
        return makeView(c.tl, c.cache, win, time, comp >= 1 ? -1 : comp, c.scratch);
      });
      for (const h of this.frameHooks) h(views);
    };
    this.raf = requestAnimationFrame(tick);
  }

  dispose() {
    this.stop();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.worker.dispose();
  }

  /** Performance race: measured runtimes (no rendering), same data for all. */
  async performanceRace(runs: number, warmup: number, onProgress?: (i: number) => void): Promise<PerfResult[]> {
    const out: PerfResult[] = [];
    for (let i = 0; i < this.contestants.length; i++) {
      onProgress?.(i);
      const c = this.contestants[i];
      try {
        const res = await this.worker.count(c.algorithmId, this.keys, this.seed, runs, warmup, 30_000);
        out.push(summarize(c.algorithmId, res));
      } catch (e) {
        out.push({ algorithmId: c.algorithmId, median: NaN, mean: NaN, min: NaN, max: NaN, std: NaN, runs: 0, comparisons: 0, writes: 0, swaps: 0, error: (e as Error).message });
      }
    }
    return out;
  }

  results() {
    return this.contestants.map((c) => {
      const a = getAlgorithm(c.algorithmId);
      const end = c.tl && c.rec ? endCounters(c) : null;
      return {
        algorithm: a.name,
        id: a.id,
        team: c.team,
        rank: c.rank,
        operations: end?.operations ?? null,
        comparisons: end?.comparisons ?? null,
        swaps: end?.swaps ?? null,
        writes: end?.writes ?? null,
        reads: end?.reads ?? null,
        executionMs: c.rec?.executionMs ?? null,
        simulatedSeconds: end ? (this.total(c) / Math.max(1e-9, this.rate() / this.speed)) : null,
        averageComplexity: a.average,
        worstComplexity: a.worst,
        verifiedSorted: c.rec?.sorted ?? false,
        error: c.error,
      };
    });
  }
}

const endCache = new WeakMap<Recording, { operations: number; comparisons: number; swaps: number; writes: number; reads: number }>();
function endCounters(c: Contestant) {
  const rec = c.rec!;
  let v = endCache.get(rec);
  if (!v) {
    const tl = new Timeline(rec, 1);
    tl.stepForward(tl.total);
    v = tl.getCounters();
    endCache.set(rec, v);
  }
  return v;
}

function endMetric(c: Contestant, slot: number): number {
  const e = endCounters(c);
  if (slot === C_COMPARISONS) return e.comparisons;
  if (slot === C_WRITES) return e.writes;
  return e.operations;
}

export interface PerfResult {
  algorithmId: string;
  median: number;
  mean: number;
  min: number;
  max: number;
  std: number;
  runs: number;
  comparisons: number;
  writes: number;
  swaps: number;
  error?: string;
}

export function summarize(algorithmId: string, res: CountResult[]): PerfResult {
  const ok = res.filter((r) => !r.error);
  const times = ok.map((r) => r.ms).sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const std = Math.sqrt(times.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, times.length));
  const median = times.length ? (times.length % 2 ? times[(times.length - 1) / 2] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2) : NaN;
  return {
    algorithmId,
    median,
    mean: times.length ? mean : NaN,
    min: times.length ? times[0] : NaN,
    max: times.length ? times[times.length - 1] : NaN,
    std: times.length ? std : NaN,
    runs: ok.length,
    comparisons: ok[0]?.comparisons ?? 0,
    writes: ok[0]?.writes ?? 0,
    swaps: ok[0]?.swaps ?? 0,
    error: res.find((r) => r.error)?.error,
  };
}

export const battle = new BattleEngine();
