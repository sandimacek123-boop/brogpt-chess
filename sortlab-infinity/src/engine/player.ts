import { OP_COMPARE, OP_STRIDE, OP_SWAP, OP_WRITE, SortStats, emptyStats } from '../core/ops';

export const HL_NONE = 0;
export const HL_COMPARE = 1;
export const HL_SWAP = 2;
export const HL_WRITE = 3;

export interface SoundEvent {
  kind: 1 | 2 | 3; // compare / swap / write
  value: number;
}

/**
 * Replays a precomputed operation trace onto a display array.
 * Correctness never depends on frame rate: the trace is computed up front, and the
 * player only decides how many trace operations to apply per frame.
 */
export class Player {
  n = 0;
  initial = new Int32Array(0);
  arr = new Int32Array(0);
  trace = new Int32Array(0);
  totalOps = 0;
  pos = 0;
  maxValue = 1;
  /** Smoothed bar heights (for interpolation). */
  heights = new Float32Array(0);
  /** Horizontal slide offsets in index units (for swap motion). */
  offsets = new Float32Array(0);
  hlType = new Uint8Array(0);
  hlAge = new Float32Array(0);
  stats: SortStats = emptyStats();
  private acc = 0;
  /** Sound events produced by the most recent advance() call (bounded). */
  events: SoundEvent[] = [];
  maxEvents = 64;

  load(initial: Int32Array, trace?: Int32Array) {
    this.n = initial.length;
    this.initial = Int32Array.from(initial);
    this.arr = Int32Array.from(initial);
    this.trace = trace ?? new Int32Array(0);
    this.totalOps = this.trace.length / OP_STRIDE;
    this.pos = 0;
    this.acc = 0;
    let m = 1;
    for (let i = 0; i < this.n; i++) if (initial[i] > m) m = initial[i];
    this.maxValue = m;
    if (this.heights.length !== this.n) {
      this.heights = new Float32Array(this.n);
      this.offsets = new Float32Array(this.n);
      this.hlType = new Uint8Array(this.n);
      this.hlAge = new Float32Array(this.n);
    }
    for (let i = 0; i < this.n; i++) this.heights[i] = initial[i];
    this.offsets.fill(0);
    this.hlType.fill(0);
    this.hlAge.fill(0);
    this.stats = emptyStats();
    this.events = [];
  }

  /** Attach a trace computed for the currently loaded initial array, rewinding playback. */
  setTrace(trace: Int32Array) {
    this.load(this.initial, trace);
  }

  get done() {
    return this.pos >= this.totalOps;
  }

  get progress() {
    return this.totalOps === 0 ? 1 : this.pos / this.totalOps;
  }

  private mark(i: number, t: number) {
    if (i < 0 || i >= this.n) return;
    this.hlType[i] = t;
    this.hlAge[i] = 1;
  }

  private emit(kind: 1 | 2 | 3, i: number) {
    if (i < 0 || i >= this.n) return;
    if (this.events.length >= this.maxEvents) this.events.shift();
    this.events.push({ kind, value: this.arr[i] });
  }

  /** Apply up to `count` operations. Returns how many were applied. */
  advance(count: number): number {
    this.events = [];
    const t = this.trace;
    const end = Math.min(this.totalOps, this.pos + Math.max(0, Math.floor(count)));
    const applied = end - this.pos;
    let k = this.pos * OP_STRIDE;
    // Only the last `budget` ops of a big batch get highlight/sound bookkeeping; earlier ones are
    // still applied exactly but would be invisible anyway.
    const markFrom = end - Math.min(applied, Math.max(256, this.n));
    for (let p = this.pos; p < end; p++, k += OP_STRIDE) {
      const op = t[k];
      const a = t[k + 1];
      const b = t[k + 2];
      const vis = p >= markFrom;
      if (op === OP_COMPARE) {
        this.stats.comparisons++;
        if (vis) {
          this.mark(a, HL_COMPARE);
          this.mark(b, HL_COMPARE);
          this.emit(1, a >= 0 ? a : b);
        }
      } else if (op === OP_SWAP) {
        this.stats.swaps++;
        const tmp = this.arr[a];
        this.arr[a] = this.arr[b];
        this.arr[b] = tmp;
        // swap smoothed heights too so the bars visibly travel instead of morphing
        const th = this.heights[a];
        this.heights[a] = this.heights[b];
        this.heights[b] = th;
        const to = this.offsets[a];
        this.offsets[a] = this.offsets[b] + (b - a);
        this.offsets[b] = to + (a - b);
        if (vis) {
          this.mark(a, HL_SWAP);
          this.mark(b, HL_SWAP);
          this.emit(2, a);
        }
      } else if (op === OP_WRITE) {
        this.stats.writes++;
        this.arr[a] = b;
        if (vis) {
          this.mark(a, HL_WRITE);
          this.emit(3, a);
        }
      }
    }
    this.pos = end;
    return applied;
  }

  /** Advance by time: opsPerSecond × dt operations, with fractional accumulation. */
  tick(dt: number, opsPerSecond: number): number {
    if (this.done) return 0;
    this.acc += opsPerSecond * dt;
    const whole = Math.floor(this.acc);
    if (whole <= 0) {
      this.events = [];
      return 0;
    }
    this.acc -= whole;
    return this.advance(whole);
  }

  /**
   * Seek to an absolute operation index. Forward seeks continue from the current
   * position; backward seeks replay from the initial array (traces are deterministic).
   */
  seek(target: number) {
    target = Math.max(0, Math.min(this.totalOps, Math.floor(target)));
    if (target < this.pos) {
      const trace = this.trace;
      const keep = this.heights.slice();
      const keepOff = this.offsets.slice();
      this.load(this.initial, trace);
      this.heights.set(keep);
      this.offsets.set(keepOff);
    }
    this.advance(target - this.pos);
    this.events = [];
  }

  /** Jump straight to the end of the trace. */
  finish() {
    this.advance(this.totalOps - this.pos);
    this.settle();
  }

  /** Snap smoothed state to the exact array. */
  settle() {
    for (let i = 0; i < this.n; i++) this.heights[i] = this.arr[i];
    this.offsets.fill(0);
  }

  /**
   * Interpolate the smoothed state toward the exact state.
   * smoothing ∈ [0, 0.98]: 0 = instant transitions.
   */
  animate(dt: number, smoothing: number, highlightDecayPerSecond: number) {
    const n = this.n;
    if (smoothing <= 0) this.settle();
    else {
      const keep = Math.pow(smoothing, dt * 60);
      for (let i = 0; i < n; i++) {
        const target = this.arr[i];
        const h = this.heights[i];
        this.heights[i] = target + (h - target) * keep;
        const o = this.offsets[i];
        this.offsets[i] = Math.abs(o) < 0.01 ? 0 : o * keep;
      }
    }
    const decay = dt * highlightDecayPerSecond;
    for (let i = 0; i < n; i++) {
      if (this.hlAge[i] > 0) {
        const a = this.hlAge[i] - decay;
        if (a <= 0) {
          this.hlAge[i] = 0;
          this.hlType[i] = 0;
        } else this.hlAge[i] = a;
      }
    }
  }

  clearHighlights() {
    this.hlType.fill(0);
    this.hlAge.fill(0);
  }

  /** Index of the first adjacent inversion in the current array, or -1 if sorted. */
  firstInversion(): number {
    for (let i = 1; i < this.n; i++) if (this.arr[i - 1] > this.arr[i]) return i;
    return -1;
  }
}

/**
 * Summarise a trace into `buckets` columns for the timeline waveform:
 * for each slice of the run, the share of comparisons and of moves (swaps + writes).
 */
export function traceActivity(trace: Int32Array, buckets: number): { compares: Float32Array; moves: Float32Array } {
  const total = trace.length / OP_STRIDE;
  const compares = new Float32Array(buckets);
  const moves = new Float32Array(buckets);
  if (total === 0) return { compares, moves };
  const per = total / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * per);
    const to = Math.max(from + 1, Math.floor((b + 1) * per));
    let c = 0;
    let m = 0;
    for (let p = from; p < to && p < total; p++) {
      if (trace[p * OP_STRIDE] === OP_COMPARE) c++;
      else m++;
    }
    const n = Math.max(1, to - from);
    compares[b] = c / n;
    moves[b] = m / n;
  }
  return { compares, moves };
}
