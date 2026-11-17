import { getAlgorithm } from '../algorithms';
import type { RunResult } from '../core/execute';
import { generatePattern, PatternId } from '../core/patterns';
import { SortAudio } from '../audio/audio';
import { prefersReducedMotion, Settings } from '../state/settings';
import { Player } from './player';
import { CancelledRunError, SortClient } from './sortClient';
import { Stage } from './stage';

export type Pacing = 'ops' | 'time';
export type BattlePhase = 'setup' | 'computing' | 'ready' | 'racing' | 'paused' | 'done';

export interface Lane {
  key: number;
  algorithmId: string;
  player: Player;
  stage: Stage | null;
  result: RunResult | null;
  /** Race clock (seconds) when this lane finished playback. */
  finishedAt: number | null;
  opsPerSec: number;
}

export interface BattleStatus {
  phase: BattlePhase;
  computed: number;
  lanes: {
    key: number;
    algorithmId: string;
    progress: number;
    finishedAt: number | null;
    result: Pick<RunResult, 'status' | 'stats' | 'operations' | 'computeMs' | 'timedMs'> | null;
    sorted: boolean | null;
  }[];
  raceTime: number;
  n: number;
  seed: number;
  message: string | null;
}

/**
 * Runs several algorithms on identical data. Each algorithm is computed (and timed)
 * sequentially in the worker so timings do not compete for the CPU; playback then
 * starts for all lanes on the same frame.
 */
export class BattleController {
  lanes: Lane[] = [];
  phase: BattlePhase = 'setup';
  readonly client = new SortClient();
  private raf = 0;
  private last = 0;
  private clock = 0;
  raceTime = 0;
  private computed = 0;
  private seed = 0;
  private n = 0;
  private message: string | null = null;
  private listeners = new Set<(s: BattleStatus) => void>();
  private lastEmit = 0;
  private nextKey = 1;
  pacing: Pacing = 'ops';
  /** Target playback duration (seconds) for the slowest lane. */
  duration = 20;

  constructor(
    public settings: Settings,
    private audio: SortAudio,
  ) {}

  setAlgorithms(ids: string[]) {
    if (this.phase === 'computing') this.client.cancelAll();
    const old = new Map(this.lanes.map((l) => [l.key, l]));
    this.lanes = ids.map((id, i) => {
      const prev = this.lanes[i];
      if (prev && prev.algorithmId === id) return prev;
      return { key: this.nextKey++, algorithmId: id, player: new Player(), stage: null, result: null, finishedAt: null, opsPerSec: 0 };
    });
    old.clear();
    this.phase = 'setup';
    this.emit(true);
  }

  attachCanvas(key: number, canvas: HTMLCanvasElement | null) {
    const lane = this.lanes.find((l) => l.key === key);
    if (!lane) return;
    if (canvas && (!lane.stage || lane.stage.canvas !== canvas)) {
      lane.stage = new Stage(canvas);
      lane.stage.maxDpr = 1.5;
    }
    if (!canvas) lane.stage = null;
  }

  subscribe(fn: (s: BattleStatus) => void) {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  start() {
    cancelAnimationFrame(this.raf);
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(ts);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.client.dispose();
  }

  maxAllowedN() {
    return Math.min(...this.lanes.map((l) => getAlgorithm(l.algorithmId).maxN));
  }

  async prepare(n: number, pattern: PatternId, seed: number) {
    this.audio.unlock();
    if (this.phase === 'computing') return;
    this.n = n;
    this.seed = seed;
    const data = generatePattern(pattern, n, seed);
    for (const l of this.lanes) {
      l.player.load(data);
      l.result = null;
      l.finishedAt = null;
    }
    this.phase = 'computing';
    this.computed = 0;
    this.message = null;
    this.raceTime = 0;
    this.emit(true);
    try {
      for (const l of this.lanes) {
        const res = await this.client.run({
          algorithmId: l.algorithmId,
          values: data,
          opLimit: this.settings.opLimit,
          seed,
          record: true,
          timing: true,
          deadlineMs: 30_000,
        });
        l.result = res;
        l.player.setTrace(res.trace);
        this.computed++;
        this.emit(true);
      }
    } catch (e) {
      this.phase = 'setup';
      this.message = e instanceof CancelledRunError ? 'Battle cancelled.' : `Worker error: ${(e as Error).message}`;
      this.emit(true);
      return;
    }
    const limited = this.lanes.filter((l) => l.result && l.result.status !== 'sorted');
    if (limited.length)
      this.message = `${limited.map((l) => getAlgorithm(l.algorithmId).name).join(', ')} stopped at the operation limit or deadline and will not finish sorting.`;
    this.applyPacing();
    this.phase = 'ready';
    this.emit(true);
  }

  /** Compute per-lane playback speed from the pacing mode and target duration. */
  applyPacing() {
    const ops = this.lanes.map((l) => Math.max(1, l.player.totalOps));
    const maxOps = Math.max(...ops);
    if (this.pacing === 'ops') {
      const rate = maxOps / Math.max(1, this.duration);
      this.lanes.forEach((l) => (l.opsPerSec = rate));
    } else {
      const times = this.lanes.map((l) => Math.max(1e-6, l.result?.timedMs ?? l.result?.computeMs ?? 1));
      const maxT = Math.max(...times);
      this.lanes.forEach((l, i) => {
        const laneDuration = Math.max(0.05, (times[i] / maxT) * this.duration);
        l.opsPerSec = ops[i] / laneDuration;
      });
    }
  }

  cancel() {
    this.client.cancelAll();
  }

  play() {
    if (this.phase === 'ready' || this.phase === 'paused') {
      this.phase = 'racing';
      this.last = 0;
      this.emit(true);
    } else if (this.phase === 'done') {
      this.restart();
      this.play();
    }
  }

  pause() {
    if (this.phase === 'racing') {
      this.phase = 'paused';
      this.emit(true);
    }
  }

  restart() {
    for (const l of this.lanes) {
      l.player.load(l.player.initial, l.result?.trace);
      l.finishedAt = null;
    }
    this.raceTime = 0;
    if (this.phase !== 'setup' && this.phase !== 'computing') this.phase = 'ready';
    this.emit(true);
  }

  private frame(ts: number) {
    const dt = this.last ? Math.min(0.1, (ts - this.last) / 1000) : 1 / 60;
    this.last = ts;
    const reduced = prefersReducedMotion(this.settings);
    if (!reduced) this.clock += dt;
    if (this.phase === 'racing') {
      this.raceTime += dt;
      let allDone = true;
      for (const l of this.lanes) {
        if (l.finishedAt === null) {
          l.player.tick(dt, l.opsPerSec);
          if (l.player.done) l.finishedAt = this.raceTime;
          else allDone = false;
        }
      }
      const lead = this.lanes.find((l) => l.finishedAt === null && l.player.events.length);
      if (lead) this.audio.playEvents(lead.player.events, lead.player.maxValue, this.settings, lead.opsPerSec);
      if (allDone) {
        this.phase = 'done';
        this.emit(true);
      }
    }
    for (const l of this.lanes) {
      l.player.animate(dt, this.settings.smoothing, this.phase === 'racing' ? Math.max(4, Math.min(30, l.opsPerSec / 20)) : 2);
      if (l.stage) {
        const done = l.finishedAt !== null;
        const inv = done ? l.player.firstInversion() : -1;
        l.stage.draw(l.player, { ...this.settings, glow: Math.min(this.settings.glow, 0.25) }, {
          sweep: done && inv >= 0 ? l.player.n : -1,
          sweepFail: inv,
          time: this.clock,
          reducedMotion: reduced,
          inset: { top: 58, right: 14, bottom: 16, left: 14 },
        });
      }
    }
    this.emit(false, ts);
  }

  status(): BattleStatus {
    return {
      phase: this.phase,
      computed: this.computed,
      raceTime: this.raceTime,
      n: this.n,
      seed: this.seed,
      message: this.message,
      lanes: this.lanes.map((l) => ({
        key: l.key,
        algorithmId: l.algorithmId,
        progress: l.result ? l.player.progress : 0,
        finishedAt: l.finishedAt,
        result: l.result
          ? { status: l.result.status, stats: l.result.stats, operations: l.result.operations, computeMs: l.result.computeMs, timedMs: l.result.timedMs }
          : null,
        sorted: l.finishedAt === null ? null : l.player.firstInversion() < 0,
      })),
    };
  }

  private emit(force: boolean, ts = performance.now()) {
    if (!force && ts - this.lastEmit < 100) return;
    this.lastEmit = ts;
    const s = this.status();
    this.listeners.forEach((f) => f(s));
  }
}
