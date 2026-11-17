import { Timeline } from '../engine/timeline';
import { buildViewCache, makeView, type RenderView, type ViewCache } from '../render/view';
import { audio, notesForOps } from '../audio/engine';
import { useApp } from './store';
import type { Recording } from '../engine/runner';

export const SPEED_PRESETS: { label: string; value: number }[] = [
  { label: '0.1×', value: 0.1 },
  { label: '0.25×', value: 0.25 },
  { label: '0.5×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
  { label: '8×', value: 8 },
  { label: '16×', value: 16 },
  { label: '32×', value: 32 },
  { label: '64×', value: 64 },
  { label: '128×', value: 128 },
  { label: 'Max', value: 100000 },
];

/** Logical ops/second at 1× in "fixed" mode. */
export const FIXED_BASE_RATE = 240;
/** In "normalized" mode, 1× plays the whole recording in this many seconds. */
export const NORMALIZED_SECONDS = 12;
export const COMPLETION_SECONDS = 1.8;

export interface PlayerSnapshot {
  pos: number;
  total: number;
  playing: boolean;
  done: boolean;
  opsPerSec: number;
  playbackSeconds: number;
  completion: number;
}

type Listener = (s: PlayerSnapshot) => void;

/**
 * The playback scheduler. Owns the timeline and a single requestAnimationFrame loop.
 * Speed only changes how many recorded ops are applied per frame — never the result.
 * At high speeds many logical ops are folded into one frame; counters stay exact because
 * every op is still applied to the timeline.
 */
export class Player {
  tl: Timeline | null = null;
  cache: ViewCache | null = null;
  playing = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private listeners = new Set<Listener>();
  private frameHooks = new Set<(view: RenderView | null, dt: number) => void>();
  private lastEmit = 0;
  playbackSeconds = 0;
  private completionStart = -1;
  private completionValue = -1;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private scratch = { compare: [] as number[], write: [] as number[] };
  private time0 = performance.now();
  /** Measured fps (EMA) for adaptive quality */
  fps = 60;
  /** A/B loop range (op positions) */
  loopA = -1;
  loopB = -1;
  loop = false;

  load(rec: Recording, historyMB: number) {
    this.stop();
    this.loopA = -1;
    this.loopB = -1;
    this.loop = false;
    this.tl = new Timeline(rec, historyMB * 1024 * 1024);
    this.cache = buildViewCache(this.tl);
    this.playbackSeconds = 0;
    this.completionStart = -1;
    this.completionValue = -1;
    this.emit(true);
    this.ensureLoop();
  }

  clear() {
    this.stop();
    this.tl = null;
    this.cache = null;
    this.emit(true);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  onFrame(fn: (view: RenderView | null, dt: number) => void): () => void {
    this.frameHooks.add(fn);
    this.ensureLoop();
    return () => {
      this.frameHooks.delete(fn);
    };
  }

  snapshot(): PlayerSnapshot {
    return {
      pos: this.tl?.pos ?? 0,
      total: this.tl?.total ?? 0,
      playing: this.playing,
      done: this.tl?.done ?? false,
      opsPerSec: this.opsPerSec(),
      playbackSeconds: this.playbackSeconds,
      completion: this.completionValue,
    };
  }

  private emit(force = false) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 66) return;
    this.lastEmit = now;
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }

  opsPerSec(): number {
    const s = useApp.getState().settings.sorting;
    if (s.useCustomRate) return s.customOpsPerSec;
    if (s.speed >= 100000) return Infinity;
    const base = s.speedMode === 'normalized' ? Math.max(30, (this.tl?.total ?? 0) / NORMALIZED_SECONDS) : FIXED_BASE_RATE;
    return base * s.speed;
  }

  play() {
    if (!this.tl) return;
    if (this.tl.done) {
      this.tl.seek(0);
      this.playbackSeconds = 0;
    }
    this.completionStart = -1;
    this.completionValue = -1;
    this.playing = true;
    this.acc = 0;
    this.emit(true);
    this.ensureLoop();
  }

  pause() {
    this.playing = false;
    this.emit(true);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  stop() {
    this.playing = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  restart() {
    if (!this.tl) return;
    this.tl.seek(0);
    this.playbackSeconds = 0;
    this.completionStart = -1;
    this.completionValue = -1;
    this.emit(true);
  }

  stepForward(count = 1) {
    if (!this.tl) return;
    this.playing = false;
    const from = this.tl.pos;
    this.tl.stepForward(count);
    this.sound(from, this.tl.pos);
    if (this.tl.done) this.beginCompletion();
    this.emit(true);
  }

  stepBackward(count = 1) {
    if (!this.tl) return;
    this.playing = false;
    this.completionValue = -1;
    this.completionStart = -1;
    this.tl.stepBackward(count);
    if (this.tl.pos > 0) this.sound(this.tl.pos - 1, this.tl.pos);
    this.emit(true);
  }

  seek(pos: number) {
    if (!this.tl) return;
    this.completionValue = -1;
    this.completionStart = -1;
    this.tl.seek(pos);
    this.emit(true);
  }

  private sound(from: number, to: number) {
    const st = useApp.getState().settings;
    if (!st.audio.enabled || !this.tl || !this.cache) return;
    audio.play(notesForOps(this.tl, from, to, st.audio, this.cache.minKey, this.cache.maxKey), st.audio);
  }

  private beginCompletion() {
    const st = useApp.getState().settings;
    if (st.cinematic.completion === 'none') {
      this.completionValue = -1;
      return;
    }
    this.completionStart = performance.now();
    this.completionValue = 0;
    if (st.audio.enabled) audio.chord(st.audio);
  }

  private ensureLoop() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (dt > 0) this.fps = this.fps * 0.92 + (1 / dt) * 0.08;
      this.frame(dt, now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private frame(dt: number, now: number) {
    const tl = this.tl;
    const st = useApp.getState().settings;
    if (tl && this.playing) {
      const rate = this.opsPerSec();
      const maxPerFrame = st.performance.maxOpsPerFrame;
      let k: number;
      if (!Number.isFinite(rate)) k = maxPerFrame;
      else {
        this.acc += rate * dt;
        k = Math.floor(this.acc);
        if (k > maxPerFrame) {
          k = maxPerFrame;
          this.acc = 0;
        } else this.acc -= k;
      }
      if (k > 0) {
        const from = tl.pos;
        if (this.loop && this.loopB > this.loopA && this.loopA >= 0) {
          const room = this.loopB - tl.pos;
          if (room <= 0) {
            tl.seek(this.loopA);
          } else {
            tl.stepForward(Math.min(k, room));
            this.sound(from, tl.pos);
            if (tl.pos >= this.loopB) tl.seek(this.loopA);
          }
        } else {
          tl.stepForward(k);
          this.sound(from, tl.pos);
        }
      }
      this.playbackSeconds += dt;
      if (tl.done) {
        this.playing = false;
        this.beginCompletion();
        if (st.sorting.autoRestart) {
          this.restartTimer = setTimeout(() => {
            this.restart();
            this.play();
          }, (COMPLETION_SECONDS + 1.2) * 1000);
        }
        this.emit(true);
      }
      this.emit();
    }
    if (this.completionStart >= 0) {
      const dur = st.general.reducedMotion ? 0.6 : COMPLETION_SECONDS;
      this.completionValue = Math.min(1, (now - this.completionStart) / 1000 / dur);
      if (this.completionValue >= 1) {
        this.completionStart = -1;
        this.completionValue = -1;
        this.emit(true);
      }
    }
    let view: RenderView | null = null;
    if (tl && this.cache && this.frameHooks.size) {
      const rate = this.opsPerSec();
      const win = this.playing ? Math.max(1, Math.min(48, Math.round((Number.isFinite(rate) ? rate : 1e6) / 60))) : 1;
      view = makeView(tl, this.cache, win, (now - this.time0) / 1000, this.completionValue, this.scratch);
    }
    for (const h of this.frameHooks) h(view, dt);
  }

  dispose() {
    this.stop();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}

export const player = new Player();
