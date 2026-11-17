import { getAlgorithm } from '../algorithms';
import { generatePattern } from '../core/patterns';
import type { RunResult } from '../core/execute';
import type { SortStats } from '../core/ops';
import { SortAudio } from '../audio/audio';
import { effectiveSpeed, prefersReducedMotion, Settings } from '../state/settings';
import { Player, traceActivity } from './player';
import { CancelledRunError, SortClient } from './sortClient';
import { Stage } from './stage';

export type Phase = 'idle' | 'computing' | 'ready' | 'playing' | 'paused' | 'done';

export interface VisualizerStatus {
  phase: Phase;
  algorithmId: string;
  n: number;
  seed: number;
  progress: number;
  played: SortStats;
  totalOps: number;
  playedOps: number;
  result: Pick<RunResult, 'status' | 'stats' | 'computeMs' | 'timedMs' | 'operations' | 'error'> | null;
  playbackMs: number;
  fps: number;
  drawMs: number;
  quality: number;
  sorted: boolean | null;
  message: string | null;
  /** Increments whenever a new trace is loaded (for the timeline waveform). */
  traceVersion: number;
}

/** Drives the single-algorithm visualizer: data, worker computation, playback loop, audio. */
export class VisualizerController {
  readonly player = new Player();
  readonly client = new SortClient();
  stage: Stage | null = null;
  settings: Settings;
  audio: SortAudio;
  phase: Phase = 'idle';
  private result: RunResult | null = null;
  private seedUsed = 0;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private playbackMs = 0;
  private fps = 60;
  private sweep = -1;
  private sweepFail = -1;
  private sweepHold = 0;
  private sortedFlag: boolean | null = null;
  private message: string | null = null;
  private listeners = new Set<(s: VisualizerStatus) => void>();
  private lastEmit = 0;
  /** Called when a run's playback finishes (used by the recorder). */
  onFinished: (() => void) | null = null;
  private stepOnce = false;
  private visible = true;
  /** UI-occupied margins (CSS px). The stage eases toward `insetTarget` for a smooth reframe. */
  inset = { top: 0, right: 0, bottom: 0, left: 0 };
  insetTarget = { top: 0, right: 0, bottom: 0, left: 0 };
  private insetInit = false;
  private rise = 1;
  traceVersion = 0;
  activity: { compares: Float32Array; moves: Float32Array } | null = null;

  constructor(settings: Settings, audio: SortAudio) {
    this.settings = settings;
    this.audio = audio;
    this.regenerate();
  }

  attach(canvas: HTMLCanvasElement) {
    this.stage = new Stage(canvas);
    this.startLoop();
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stage = null;
  }

  dispose() {
    this.detach();
    this.client.dispose();
  }

  setVisible(v: boolean) {
    this.visible = v;
  }

  subscribe(fn: (s: VisualizerStatus) => void) {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  /** Apply new settings. Returns true if the data was regenerated. */
  updateSettings(next: Settings) {
    const prev = this.settings;
    this.settings = next;
    const dataChanged =
      prev.n !== next.n || prev.pattern !== next.pattern || (next.lockSeed && (prev.seed !== next.seed || !prev.lockSeed));
    const algoChanged = prev.algorithmId !== next.algorithmId || prev.opLimit !== next.opLimit;
    if (dataChanged) this.regenerate();
    else if (algoChanged) this.invalidate();
    this.emit(true);
  }

  private invalidate() {
    if (this.phase === 'computing') this.client.cancelAll();
    this.result = null;
    this.activity = null;
    this.traceVersion++;
    this.player.load(this.player.initial);
    this.resetSweep();
    this.playbackMs = 0;
    this.sortedFlag = null;
    this.message = null;
    this.phase = 'idle';
  }

  /** Create fresh starting data (new random seed unless the seed is locked). */
  regenerate() {
    const s = this.settings;
    this.seedUsed = s.lockSeed ? s.seed : (Math.random() * 2 ** 31) >>> 0;
    const data = generatePattern(s.pattern, s.n, this.seedUsed);
    if (this.phase === 'computing') this.client.cancelAll();
    this.player.load(data);
    this.result = null;
    this.activity = null;
    this.traceVersion++;
    this.resetSweep();
    this.playbackMs = 0;
    this.sortedFlag = null;
    this.message = null;
    this.phase = 'idle';
    this.emit(true);
  }

  private resetSweep() {
    this.sweep = -1;
    this.sweepFail = -1;
    this.sweepHold = 0;
  }

  get seed() {
    return this.seedUsed;
  }

  canRun(): { ok: boolean; reason?: string } {
    const algo = getAlgorithm(this.settings.algorithmId);
    if (this.player.n > algo.maxN)
      return {
        ok: false,
        reason: `${algo.name} is limited to ${algo.maxN.toLocaleString()} elements (worst case ${algo.worst}). Reduce the element count to run it.`,
      };
    return { ok: true };
  }

  private async compute(): Promise<boolean> {
    const check = this.canRun();
    if (!check.ok) {
      this.message = check.reason ?? null;
      this.emit(true);
      return false;
    }
    this.phase = 'computing';
    this.message = null;
    this.emit(true);
    try {
      const res = await this.client.run({
        algorithmId: this.settings.algorithmId,
        values: this.player.initial,
        opLimit: this.settings.opLimit,
        seed: this.seedUsed,
        record: true,
        timing: true,
        deadlineMs: 30_000,
      });
      this.result = res;
      this.player.setTrace(res.trace);
      this.activity = traceActivity(res.trace, 480);
      this.traceVersion++;
      this.playbackMs = 0;
      if (res.status === 'limit')
        this.message = `Operation limit reached after ${res.operations.toLocaleString()} operations — playback shows the partial run; the array will not be fully sorted.`;
      else if (res.status === 'cancelled') this.message = 'Computation exceeded the 30 s safety deadline and was stopped; showing the partial run.';
      else if (res.status === 'error') this.message = `Algorithm error: ${res.error}`;
      this.phase = 'ready';
      return true;
    } catch (e) {
      if (!(e instanceof CancelledRunError)) this.message = `Worker error: ${(e as Error).message}`;
      this.phase = 'idle';
      this.emit(true);
      return false;
    }
  }

  async start() {
    this.audio.unlock();
    if (this.phase === 'computing') return;
    if (this.phase === 'done') this.restart();
    if (!this.result) {
      const ok = await this.compute();
      if (!ok) return;
    }
    this.phase = 'playing';
    this.last = 0;
    this.emit(true);
  }

  pause() {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.emit(true);
    }
  }

  togglePlay() {
    if (this.phase === 'playing') this.pause();
    else void this.start();
  }

  cancelCompute() {
    if (this.phase === 'computing') {
      this.client.cancelAll();
      this.phase = 'idle';
      this.message = 'Computation cancelled.';
      this.emit(true);
    }
  }

  /** Rewind to the initial array of the current run (keeps the computed trace). */
  restart() {
    if (this.phase === 'computing') return;
    this.player.load(this.player.initial, this.result?.trace);
    this.resetSweep();
    this.playbackMs = 0;
    this.sortedFlag = null;
    this.phase = this.result ? 'ready' : 'idle';
    this.emit(true);
  }

  async step() {
    this.audio.unlock();
    if (this.phase === 'computing') return;
    if (!this.result) {
      const ok = await this.compute();
      if (!ok) return;
    }
    if (this.phase === 'done') return;
    this.phase = 'paused';
    this.stepOnce = true;
    this.emit(true);
  }

  /** Recording framing in CSS px of the on-screen canvas (scaled to the video by the stage). */
  private recordInset() {
    const c = this.stage!.canvas;
    const h = c.clientHeight || 600;
    return { top: h * 0.2, right: h * 0.05, bottom: h * 0.1, left: h * 0.05 };
  }

  private caption() {
    const a = getAlgorithm(this.settings.algorithmId);
    const p = this.player;
    return {
      title: a.name,
      sub: `${p.n.toLocaleString('en-US')} elements · ${a.average} average`,
      stat: `${p.stats.comparisons.toLocaleString('en-US')} cmp · ${(p.stats.swaps + p.stats.writes).toLocaleString('en-US')} moves`,
    };
  }

  /** Cinematic entrance: bars grow up from the baseline. */
  playIntro() {
    this.rise = 0;
  }

  /** Scrub to an absolute operation index (timeline). */
  seek(pos: number) {
    if (!this.result || this.phase === 'computing') return;
    this.player.seek(pos);
    this.resetSweep();
    this.sortedFlag = null;
    if (this.player.done) {
      this.phase = 'done';
      this.sortedFlag = this.player.firstInversion() < 0;
    } else if (this.phase !== 'playing') this.phase = 'paused';
    this.emit(true);
  }

  stepBack() {
    if (!this.result) return;
    if (this.phase === 'playing') this.phase = 'paused';
    this.seek(this.player.pos - 1);
  }

  skipToEnd() {
    if (!this.result) return;
    this.player.finish();
    this.finishPlayback();
  }

  private finishPlayback() {
    this.phase = 'done';
    const inv = this.player.firstInversion();
    this.sortedFlag = inv < 0;
    if (this.settings.autoVerify) {
      this.sweep = 0;
      this.sweepFail = inv;
      this.sweepHold = 0;
    }
    this.emit(true);
    this.onFinished?.();
  }

  private startLoop() {
    cancelAnimationFrame(this.raf);
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(ts);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(ts: number) {
    const dt = this.last ? Math.min(0.1, (ts - this.last) / 1000) : 1 / 60;
    this.last = ts;
    if (dt > 0) this.fps = this.fps * 0.92 + (1 / dt) * 0.08;
    const s = this.settings;
    const reduced = prefersReducedMotion(s);
    if (!reduced) this.clock += dt;
    const speed = effectiveSpeed(s);
    const p = this.player;
    if (this.phase === 'playing') {
      p.tick(dt, speed);
      this.playbackMs += dt * 1000;
      if (p.events.length) this.audio.playEvents(p.events, p.maxValue, s, speed);
      if (p.done) this.finishPlayback();
    } else if (this.stepOnce) {
      this.stepOnce = false;
      p.advance(1);
      if (p.events.length) this.audio.playEvents(p.events, p.maxValue, s, 1);
      if (p.done) this.finishPlayback();
    }
    // Highlights fade faster at high speed so they stay readable.
    const decay = this.phase === 'playing' ? Math.max(4, Math.min(30, speed / 20)) : 1.5;
    p.animate(dt, s.smoothing, decay);
    if (this.rise < 1) this.rise = reduced ? 1 : Math.min(1, this.rise + dt / 1.6);
    const k = !this.insetInit || reduced ? 1 : 1 - Math.pow(0.9, dt * 60);
    this.insetInit = true;
    const recording = !!this.stage?.fixedSize;
    const target = recording ? this.recordInset() : this.insetTarget;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const d = target[side] - this.inset[side];
      this.inset[side] = recording || Math.abs(d) < 0.3 ? target[side] : this.inset[side] + d * k;
    }
    if (this.sweep >= 0) {
      const target = this.sweepFail >= 0 ? this.sweepFail + 1 : p.n;
      if (this.sweep < target) {
        this.sweep = Math.min(target, this.sweep + Math.max(1, p.n * dt * 1.6));
        if (this.sweep >= target && p.n > 0) {
          const i = Math.min(p.n - 1, Math.floor(this.sweep) - 1);
          this.audio.playEvents([{ kind: 3, value: p.arr[Math.max(0, i)] }], p.maxValue, s, 60);
        } else {
          const i = Math.min(p.n - 1, Math.floor(this.sweep));
          if (i >= 0) this.audio.playEvents([{ kind: 3, value: p.arr[i] }], p.maxValue, s, 60);
        }
      } else if (this.sweepFail < 0) {
        this.sweepHold += dt;
        if (this.sweepHold > 0.9) this.resetSweep();
      }
    }
    if (this.stage && this.visible) this.stage.draw(p, s, {
        sweep: Math.floor(this.sweep),
        sweepFail: this.sweepFail,
        time: this.clock,
        reducedMotion: reduced,
        inset: this.inset,
        rise: easeOutCubic(this.rise),
        caption: recording ? this.caption() : undefined,
      });
    this.emit(false, ts);
  }

  status(): VisualizerStatus {
    const p = this.player;
    return {
      phase: this.phase,
      algorithmId: this.settings.algorithmId,
      n: p.n,
      seed: this.seedUsed,
      progress: this.result ? p.progress : 0,
      played: { ...p.stats, auxWrites: 0, reads: 0 },
      totalOps: p.totalOps,
      playedOps: p.pos,
      result: this.result
        ? {
            status: this.result.status,
            stats: this.result.stats,
            computeMs: this.result.computeMs,
            timedMs: this.result.timedMs,
            operations: this.result.operations,
            error: this.result.error,
          }
        : null,
      playbackMs: this.playbackMs,
      fps: this.fps,
      drawMs: this.stage?.drawMs ?? 0,
      quality: this.stage?.quality ?? 0,
      sorted: this.sortedFlag,
      message: this.message,
      traceVersion: this.traceVersion,
    };
  }

  private emit(force: boolean, ts = performance.now()) {
    if (!force && ts - this.lastEmit < 50) return;
    this.lastEmit = ts;
    const st = this.status();
    this.listeners.forEach((fn) => fn(st));
  }
}


function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
