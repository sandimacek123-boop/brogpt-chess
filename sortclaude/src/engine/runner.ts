import { Machine, OpLimitError } from './machine';
import { getAlgorithm, validateRun } from './registry';

export interface Recording {
  algorithmId: string;
  keys: Int32Array;
  ops: Int32Array;
  opCount: number;
  finalIds: Int32Array;
  /** Wall-clock time of the instrumented run that produced this recording (includes recording overhead). */
  executionMs: number;
  auxPeak: number;
  sorted: boolean;
  /** True if the run was stopped by the operation/time limit; the recording then ends mid-sort. */
  truncated: boolean;
  error?: string;
}

export interface RunOptions {
  seed: number;
  opLimit?: number;
  timeLimitMs?: number;
  skipValidation?: boolean;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Run an algorithm in record mode and return its reversible op log. */
export function recordRun(algorithmId: string, keys: Int32Array, opts: RunOptions): Recording {
  const algo = getAlgorithm(algorithmId);
  const base = { algorithmId: algo.id, keys };
  if (!opts.skipValidation) {
    const err = validateRun(algo, keys, 'record');
    if (err) {
      return { ...base, ops: new Int32Array(0), opCount: 0, finalIds: identity(keys.length), executionMs: 0, auxPeak: 0, sorted: false, truncated: false, error: err };
    }
  }
  const m = new Machine(keys, { record: true, seed: opts.seed, opLimit: opts.opLimit, timeLimitMs: opts.timeLimitMs ?? 20000 });
  const t0 = now();
  let truncated = false;
  let error: string | undefined;
  try {
    algo.run(m);
  } catch (e) {
    if (e instanceof OpLimitError) {
      truncated = true;
      error = `${algo.name} exceeded the safety limit (${(opts.opLimit ?? 16_000_000).toLocaleString()} operations or ${((opts.timeLimitMs ?? 20000) / 1000).toFixed(0)} s). The recording stops where the algorithm was halted.`;
    } else {
      error = `${algo.name} crashed: ${(e as Error).message}`;
    }
  }
  const executionMs = now() - t0;
  return {
    ...base,
    ops: m.takeOps(),
    opCount: m.opCount,
    finalIds: m.a.slice(),
    executionMs,
    auxPeak: m.auxPeak,
    sorted: m.isSorted(),
    truncated,
    error,
  };
}

export interface CountResult {
  algorithmId: string;
  ms: number;
  comparisons: number;
  swaps: number;
  writes: number;
  reads: number;
  auxWrites: number;
  auxPeak: number;
  operations: number;
  sorted: boolean;
  error?: string;
}

/** Run an algorithm in count-only mode (no op log). Used for benchmarks and performance races. */
export function countRun(algorithmId: string, keys: Int32Array, opts: RunOptions): CountResult {
  const algo = getAlgorithm(algorithmId);
  const err = opts.skipValidation ? null : validateRun(algo, keys, 'bench');
  if (err) return { algorithmId, ms: 0, comparisons: 0, swaps: 0, writes: 0, reads: 0, auxWrites: 0, auxPeak: 0, operations: 0, sorted: false, error: err };
  const m = new Machine(keys, { record: false, seed: opts.seed, opLimit: opts.opLimit ?? 2_000_000_000, timeLimitMs: opts.timeLimitMs ?? 30000 });
  const t0 = now();
  let error: string | undefined;
  try {
    algo.run(m);
  } catch (e) {
    error = e instanceof OpLimitError ? 'Stopped by the safety limit' : (e as Error).message;
  }
  const ms = now() - t0;
  return {
    algorithmId, ms, comparisons: m.comparisons, swaps: m.swaps, writes: m.writes, reads: m.reads,
    auxWrites: m.auxWrites, auxPeak: m.auxPeak, operations: m.operations, sorted: !error && m.isSorted(), error,
  };
}

export function identity(n: number): Int32Array {
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  return a;
}
