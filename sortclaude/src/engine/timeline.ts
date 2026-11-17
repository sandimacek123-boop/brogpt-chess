import { applyCounterDelta, COUNTER_SLOTS, Op, OP_STRIDE, countersFromArray, type Counters } from './ops';
import type { Recording } from './runner';

interface Checkpoint {
  pos: number;
  ids: Int32Array;
  sorted: Uint8Array;
  counters: Float64Array;
  pivot: number;
  rangeOp: number;
}

/**
 * Deterministic playback state for one recording.
 * - stepForward / stepBackward apply / undo one op in O(1) (every op is reversible).
 * - seek(p) restores the nearest checkpoint and replays, so any position is reachable quickly.
 * The same position always yields exactly the same array, identities, markers and counters.
 */
export class Timeline {
  readonly n: number;
  readonly keys: Int32Array;
  readonly ops: Int32Array;
  readonly total: number;
  readonly recording: Recording;
  readonly ids: Int32Array;
  readonly sorted: Uint8Array;
  readonly counters = new Float64Array(COUNTER_SLOTS);
  pos = 0;
  pivot = -1;
  /** Index of the op that set the current range (-1 = none). */
  rangeOp = -1;
  readonly checkpointInterval: number;
  private checkpoints: Checkpoint[] = [];
  /** Positions of final keys used for the "in final position" measure. */
  private finalKeys: Int32Array;
  /** Monotone counter so renderers can detect any state change. */
  version = 0;

  constructor(rec: Recording, memoryBudgetBytes = 96 * 1024 * 1024) {
    this.recording = rec;
    this.keys = rec.keys;
    this.n = rec.keys.length;
    this.ops = rec.ops;
    this.total = rec.opCount;
    this.ids = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) this.ids[i] = i;
    this.sorted = new Uint8Array(this.n);
    this.finalKeys = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) this.finalKeys[i] = rec.keys[rec.finalIds[i]];
    const perCheckpoint = this.n * 5 + 64;
    const maxCheckpoints = Math.max(2, Math.floor(memoryBudgetBytes / perCheckpoint));
    this.checkpointInterval = Math.max(512, Math.ceil(this.total / maxCheckpoints));
    this.buildCheckpoints();
  }

  private snapshot(): Checkpoint {
    return { pos: this.pos, ids: this.ids.slice(), sorted: this.sorted.slice(), counters: this.counters.slice(), pivot: this.pivot, rangeOp: this.rangeOp };
  }

  private restore(c: Checkpoint) {
    this.ids.set(c.ids);
    this.sorted.set(c.sorted);
    this.counters.set(c.counters);
    this.pivot = c.pivot;
    this.rangeOp = c.rangeOp;
    this.pos = c.pos;
  }

  private buildCheckpoints() {
    this.checkpoints = [this.snapshot()];
    while (this.pos < this.total) {
      this.applyForward();
      if (this.pos % this.checkpointInterval === 0) this.checkpoints.push(this.snapshot());
    }
    this.restore(this.checkpoints[0]);
    this.version++;
  }

  private applyForward() {
    const o = this.pos * OP_STRIDE;
    const ops = this.ops;
    const type = ops[o];
    const a = ops[o + 1];
    const b = ops[o + 2];
    switch (type) {
      case Op.SWAP: {
        const t = this.ids[a];
        this.ids[a] = this.ids[b];
        this.ids[b] = t;
        break;
      }
      case Op.WRITE:
      case Op.MOVE:
        this.ids[a] = b;
        break;
      case Op.PIVOT:
        this.pivot = a;
        break;
      case Op.RANGE:
        this.rangeOp = this.pos;
        break;
      case Op.SORTED:
        this.sorted[a] = 1;
        break;
    }
    applyCounterDelta(this.counters, type, a, 1);
    this.pos++;
  }

  private applyBackward() {
    this.pos--;
    const o = this.pos * OP_STRIDE;
    const ops = this.ops;
    const type = ops[o];
    const a = ops[o + 1];
    const b = ops[o + 2];
    const c = ops[o + 3];
    switch (type) {
      case Op.SWAP: {
        const t = this.ids[a];
        this.ids[a] = this.ids[b];
        this.ids[b] = t;
        break;
      }
      case Op.WRITE:
      case Op.MOVE:
        this.ids[a] = c;
        break;
      case Op.PIVOT:
        this.pivot = b;
        break;
      case Op.RANGE:
        this.rangeOp = c;
        break;
      case Op.SORTED:
        this.sorted[a] = b;
        break;
    }
    applyCounterDelta(this.counters, type, a, -1);
  }

  stepForward(count = 1): number {
    let k = 0;
    while (k < count && this.pos < this.total) {
      this.applyForward();
      k++;
    }
    if (k) this.version++;
    return k;
  }

  stepBackward(count = 1): number {
    let k = 0;
    while (k < count && this.pos > 0) {
      this.applyBackward();
      k++;
    }
    if (k) this.version++;
    return k;
  }

  /** Jump to an absolute op position. */
  seek(target: number): void {
    target = Math.max(0, Math.min(this.total, Math.floor(target)));
    if (target === this.pos) return;
    const dist = Math.abs(target - this.pos);
    if (dist <= this.checkpointInterval) {
      if (target > this.pos) this.stepForward(dist);
      else this.stepBackward(dist);
      return;
    }
    const ci = Math.min(this.checkpoints.length - 1, Math.floor(target / this.checkpointInterval));
    this.restore(this.checkpoints[ci]);
    while (this.pos < target) this.applyForward();
    this.version++;
  }

  /** Advance until the given counter slot reaches `value` (used by battle races). */
  advanceToMetric(slot: number, value: number): number {
    let k = 0;
    while (this.pos < this.total) {
      // peek: apply, and if it overshoots the budget on a counted metric, stop *after* it
      if (this.counters[slot] >= value) break;
      this.applyForward();
      k++;
    }
    if (k) this.version++;
    return k;
  }

  get done(): boolean {
    return this.pos >= this.total;
  }

  get range(): [number, number] | null {
    if (this.rangeOp < 0) return null;
    const o = this.rangeOp * OP_STRIDE;
    return [this.ops[o + 1], this.ops[o + 2]];
  }

  getCounters(): Counters {
    return countersFromArray(this.counters);
  }

  /** Key at index i. */
  key(i: number): number {
    return this.keys[this.ids[i]];
  }

  /** Op record at absolute index k: [type, a, b, c]. */
  opAt(k: number): [number, number, number, number] {
    const o = k * OP_STRIDE;
    return [this.ops[o], this.ops[o + 1], this.ops[o + 2], this.ops[o + 3]];
  }

  /** Fraction of positions that already hold their final key (0..1). */
  inPlaceFraction(): number {
    if (this.n === 0) return 1;
    let c = 0;
    for (let i = 0; i < this.n; i++) if (this.keys[this.ids[i]] === this.finalKeys[i]) c++;
    return c / this.n;
  }

  /** Number of data ops (non-annotation) before position p — for display of operations at a position. */
  get operationsSoFar(): number {
    return this.counters[6];
  }
}
