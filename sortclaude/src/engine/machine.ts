import { Op, OP_STRIDE } from './ops';
import { Rng } from './rng';

/** An element handle held "in a register": it is simply the element's ID. */
export type Handle = number;

export class AuxBuffer {
  readonly ids: Int32Array;
  constructor(readonly size: number) {
    this.ids = new Int32Array(Math.max(0, size));
  }
}

export class OpLimitError extends Error {
  constructor(public readonly limit: number) {
    super(`Operation limit of ${limit.toLocaleString()} exceeded. The algorithm was stopped to keep the app responsive.`);
    this.name = 'OpLimitError';
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/**
 * The instrumented machine every sorting algorithm runs on.
 *
 * In "record" mode every primitive is appended to a reversible op log (see ops.ts).
 * In "count" mode (benchmarks) only scalar counters are updated, so the measured runtime
 * contains no recording or rendering work.
 */
export class Machine {
  readonly n: number;
  /** Working array of element IDs. */
  readonly a: Int32Array;
  /** keys[id] = sort key of element id. Immutable. */
  readonly keys: Int32Array;
  readonly rng: Rng;
  readonly record: boolean;

  // Op log (record mode only).
  ops: Int32Array;
  opCount = 0;
  readonly opLimit: number;

  // Scalar counters (both modes).
  comparisons = 0;
  swaps = 0;
  writes = 0;
  reads = 0;
  auxWrites = 0;
  auxMemory = 0;
  auxPeak = 0;
  operations = 0;

  private pivotIdx = -1;
  private lastRangeOp = -1;
  private sortedFlags: Uint8Array;
  private deadline = Infinity;
  private checkCounter = 0;

  constructor(keys: Int32Array, opts: { record: boolean; seed: number; opLimit?: number; timeLimitMs?: number }) {
    this.n = keys.length;
    this.keys = keys;
    this.a = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) this.a[i] = i;
    this.rng = new Rng((opts.seed ^ 0x5bd1e995) >>> 0);
    this.record = opts.record;
    this.opLimit = opts.opLimit ?? 16_000_000;
    this.ops = new Int32Array(opts.record ? Math.min(1 << 16, this.opLimit * OP_STRIDE) : 0);
    this.sortedFlags = new Uint8Array(this.n);
    if (opts.timeLimitMs && opts.timeLimitMs > 0) this.deadline = now() + opts.timeLimitMs;
  }

  // ------------------------------------------------------------------ recording core
  private push(type: number, a: number, b: number, c: number): void {
    this.operations++;
    if (this.record) {
      if (this.opCount >= this.opLimit) throw new OpLimitError(this.opLimit);
      let o = this.opCount * OP_STRIDE;
      if (o + OP_STRIDE > this.ops.length) {
        const next = new Int32Array(Math.min(this.ops.length * 2, this.opLimit * OP_STRIDE + OP_STRIDE));
        next.set(this.ops);
        this.ops = next;
      }
      this.ops[o++] = type;
      this.ops[o++] = a;
      this.ops[o++] = b;
      this.ops[o] = c;
      this.opCount++;
    } else if (this.operations > this.opLimit) {
      throw new OpLimitError(this.opLimit);
    }
    if ((++this.checkCounter & 0x3fff) === 0 && this.deadline !== Infinity && now() > this.deadline) {
      throw new OpLimitError(this.opLimit);
    }
  }

  private annotate(type: number, a: number, b: number, c: number): void {
    if (!this.record) return;
    if (this.opCount >= this.opLimit) throw new OpLimitError(this.opLimit);
    this.operations--; // annotations are not data operations
    this.push(type, a, b, c);
  }

  // ------------------------------------------------------------------ primitives
  /** Compare main[i] with main[j]; returns negative, 0 or positive. */
  cmp(i: number, j: number): number {
    const r = this.keys[this.a[i]] - this.keys[this.a[j]];
    this.comparisons++;
    this.reads += 2;
    this.push(Op.COMPARE, i, j, r < 0 ? -1 : r > 0 ? 1 : 0);
    return r;
  }

  /** Compare main[i] > main[j]. */
  gt(i: number, j: number): boolean {
    return this.cmp(i, j) > 0;
  }

  lt(i: number, j: number): boolean {
    return this.cmp(i, j) < 0;
  }

  swap(i: number, j: number): void {
    const t = this.a[i];
    this.a[i] = this.a[j];
    this.a[j] = t;
    this.swaps++;
    this.reads += 2;
    this.writes += 2;
    this.push(Op.SWAP, i, j, 0);
  }

  /** Load main[i] into a register. */
  read(i: number): Handle {
    this.reads++;
    this.push(Op.READ, i, 0, 0);
    return this.a[i];
  }

  /** Key of a held element (free: it is already in a register). */
  key(h: Handle): number {
    return this.keys[h];
  }

  /** Compare two held elements. hintA/hintB are only used for highlighting. */
  cmpH(h1: Handle, h2: Handle, hintA = -1, hintB = -1): number {
    const r = this.keys[h1] - this.keys[h2];
    this.comparisons++;
    this.push(Op.COMPARE_AUX, hintA, hintB, r < 0 ? -1 : r > 0 ? 1 : 0);
    return r;
  }

  /** Compare a held element with main[i]: key(h) - key(main[i]). */
  cmpHI(h: Handle, i: number, hint = -1): number {
    const r = this.keys[h] - this.keys[this.a[i]];
    this.comparisons++;
    this.reads++;
    this.push(Op.COMPARE_HELD, i, hint, r < 0 ? -1 : r > 0 ? 1 : 0);
    return r;
  }

  /** Store a held element into main[i]. */
  write(i: number, h: Handle): void {
    const old = this.a[i];
    this.a[i] = h;
    this.writes++;
    this.push(Op.WRITE, i, h, old);
  }

  /** main[dst] = main[src]. */
  move(dst: number, src: number): void {
    const old = this.a[dst];
    const h = this.a[src];
    this.a[dst] = h;
    this.reads++;
    this.writes++;
    this.push(Op.MOVE, dst, h, old);
  }

  // ------------------------------------------------------------------ auxiliary memory
  alloc(size: number): AuxBuffer {
    this.auxMemory += size;
    if (this.auxMemory > this.auxPeak) this.auxPeak = this.auxMemory;
    this.annotate(Op.ALLOC, size, 0, 0);
    return new AuxBuffer(size);
  }

  free(buf: AuxBuffer): void {
    this.auxMemory -= buf.size;
    this.annotate(Op.FREE, buf.size, 0, 0);
  }

  /** Account for auxiliary memory that is not an AuxBuffer (e.g. a tree or a heap of handles). */
  allocRaw(size: number): void {
    this.auxMemory += size;
    if (this.auxMemory > this.auxPeak) this.auxPeak = this.auxMemory;
    this.annotate(Op.ALLOC, size, 0, 0);
  }

  freeRaw(size: number): void {
    this.auxMemory -= size;
    this.annotate(Op.FREE, size, 0, 0);
  }

  /** buf[k] = main[i]. */
  toAux(buf: AuxBuffer, k: number, i: number): void {
    buf.ids[k] = this.a[i];
    this.reads++;
    this.auxWrites++;
    this.push(Op.TO_AUX, i, 0, 0);
  }

  /** buf[k] = held h. hint = main index used for highlighting. */
  auxStore(buf: AuxBuffer | null, k: number, h: Handle, hint = -1): void {
    if (buf) buf.ids[k] = h;
    this.auxWrites++;
    this.push(Op.AUX_STORE, hint, 0, 0);
  }

  /** Record an aux store for structures that are not AuxBuffers. */
  auxTouch(hint = -1): void {
    this.auxWrites++;
    this.push(Op.AUX_STORE, hint, 0, 0);
  }

  /** main[i] = buf[k]. */
  fromAux(i: number, buf: AuxBuffer, k: number): void {
    this.write(i, buf.ids[k]);
  }

  // ------------------------------------------------------------------ annotations
  pivot(i: number): void {
    const prev = this.pivotIdx;
    this.pivotIdx = i;
    this.annotate(Op.PIVOT, i, prev, 0);
  }

  range(lo: number, hi: number): void {
    const prevOp = this.lastRangeOp;
    if (this.record) this.lastRangeOp = this.opCount;
    this.annotate(Op.RANGE, lo, hi, prevOp);
  }

  sorted(i: number): void {
    if (i < 0 || i >= this.n) return;
    const prev = this.sortedFlags[i];
    if (prev) return;
    this.sortedFlags[i] = 1;
    this.annotate(Op.SORTED, i, prev, 0);
  }

  sortedRange(lo: number, hi: number): void {
    for (let i = lo; i <= hi; i++) this.sorted(i);
  }

  flag(i: number, v = 1): void {
    this.annotate(Op.FLAG, i, v, 0);
  }

  // ------------------------------------------------------------------ helpers
  /** Shrink the op log to its exact size. */
  takeOps(): Int32Array {
    return this.ops.slice(0, this.opCount * OP_STRIDE);
  }

  isSorted(): boolean {
    for (let i = 1; i < this.n; i++) if (this.keys[this.a[i - 1]] > this.keys[this.a[i]]) return false;
    return true;
  }

  /** Final key sequence (no instrumentation). */
  finalKeys(): Int32Array {
    const out = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) out[i] = this.keys[this.a[i]];
    return out;
  }

  /** Minimum / maximum key — distribution sorts must obtain these through reads, see scanMinMax. */
  scanMinMax(lo = 0, hi = this.n - 1): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (let i = lo; i <= hi; i++) {
      const k = this.key(this.read(i));
      if (k < min) min = k;
      if (k > max) max = k;
    }
    return { min, max };
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
