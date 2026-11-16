import { OP_COMPARE, OP_SWAP, OP_WRITE, SortStats, emptyStats } from './ops';
import { mulberry32 } from './rng';

export class OperationLimitError extends Error {
  constructor(public limit: number) {
    super(`Operation limit of ${limit.toLocaleString()} reached`);
    this.name = 'OperationLimitError';
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Sort cancelled');
    this.name = 'CancelledError';
  }
}

export interface ContextOptions {
  /** Record a replayable trace of visual operations. */
  record?: boolean;
  /** Maximum number of counted operations (comparisons + swaps + writes + aux writes). */
  opLimit?: number;
  /** Seed for algorithms that use randomness. */
  seed?: number;
  /** Polled periodically; return true to abort with CancelledError. */
  shouldAbort?: () => boolean;
}

/** Auxiliary scratch array whose writes are counted (but not visualized). */
export class AuxArray {
  readonly data: Int32Array;
  constructor(private ctx: SortContext, length: number) {
    this.data = new Int32Array(length);
  }
  get length() {
    return this.data.length;
  }
  get(i: number): number {
    return this.data[i];
  }
  set(i: number, v: number): void {
    this.ctx.countAuxWrite();
    this.data[i] = v;
  }
}

/**
 * The instrumented array every sorting algorithm operates on.
 * All mutations of the main array go through swap()/set(), so the trace is a
 * complete, replayable record of the algorithm's effect on the array.
 */
export class SortContext {
  readonly n: number;
  readonly a: Int32Array;
  readonly stats: SortStats = emptyStats();
  readonly random: () => number;
  private trace: Int32Array;
  private traceLen = 0;
  private readonly recording: boolean;
  private readonly opLimit: number;
  private readonly shouldAbort?: () => boolean;
  private ops = 0;
  private nextAbortCheck = 1 << 14;

  constructor(values: ArrayLike<number>, opts: ContextOptions = {}) {
    this.n = values.length;
    this.a = Int32Array.from(values);
    this.recording = opts.record ?? false;
    this.opLimit = opts.opLimit ?? Number.POSITIVE_INFINITY;
    this.shouldAbort = opts.shouldAbort;
    this.random = mulberry32(opts.seed ?? 12345);
    this.trace = new Int32Array(this.recording ? 3 * 4096 : 0);
  }

  get operationCount() {
    return this.ops;
  }

  private tick() {
    if (++this.ops > this.opLimit) {
      this.ops--;
      throw new OperationLimitError(this.opLimit);
    }
    if (this.ops >= this.nextAbortCheck) {
      this.nextAbortCheck = this.ops + (1 << 14);
      if (this.shouldAbort && this.shouldAbort()) throw new CancelledError();
    }
  }

  private push(op: number, x: number, y: number) {
    if (!this.recording) return;
    if (this.traceLen + 3 > this.trace.length) {
      const next = new Int32Array(Math.max(this.trace.length * 2, 3 * 4096));
      next.set(this.trace);
      this.trace = next;
    }
    const t = this.trace;
    const k = this.traceLen;
    t[k] = op;
    t[k + 1] = x;
    t[k + 2] = y;
    this.traceLen = k + 3;
  }

  /** Read a main-array value (counted as a read, not visualized). */
  get(i: number): number {
    this.stats.reads++;
    return this.a[i];
  }

  /** Write a value into the main array. */
  set(i: number, v: number): void {
    this.tick();
    this.stats.writes++;
    this.a[i] = v;
    this.push(OP_WRITE, i, v);
  }

  swap(i: number, j: number): void {
    if (i === j) return;
    this.tick();
    this.stats.swaps++;
    const t = this.a[i];
    this.a[i] = this.a[j];
    this.a[j] = t;
    this.push(OP_SWAP, i, j);
  }

  /** Compare a[i] with a[j]. Returns negative, zero, or positive. */
  cmp(i: number, j: number): number {
    this.tick();
    this.stats.comparisons++;
    this.push(OP_COMPARE, i, j);
    return this.a[i] - this.a[j];
  }

  /** Compare two values (e.g. a pivot held in a temporary). hi/hj are highlight indices (-1 = none). */
  cmpv(x: number, y: number, hi = -1, hj = -1): number {
    this.tick();
    this.stats.comparisons++;
    this.push(OP_COMPARE, hi, hj);
    return x - y;
  }

  /** Compare a[i] with a temporary value v. */
  cmpi(i: number, v: number): number {
    this.tick();
    this.stats.comparisons++;
    this.push(OP_COMPARE, i, -1);
    return this.a[i] - v;
  }

  lt(i: number, j: number) {
    return this.cmp(i, j) < 0;
  }
  gt(i: number, j: number) {
    return this.cmp(i, j) > 0;
  }

  /** Count a write into an auxiliary structure. */
  countAuxWrite(): void {
    this.tick();
    this.stats.auxWrites++;
  }

  aux(length: number): AuxArray {
    return new AuxArray(this, length);
  }

  /** Reverse a[lo..hi] inclusive using swaps. */
  reverse(lo: number, hi: number) {
    while (lo < hi) this.swap(lo++, hi--);
  }

  getTrace(): Int32Array {
    return this.trace.slice(0, this.traceLen);
  }

  get traceOps() {
    return this.traceLen / 3;
  }

  maxValue(): number {
    let m = 0;
    for (let i = 0; i < this.n; i++) if (this.a[i] > m) m = this.a[i];
    return m;
  }
}
