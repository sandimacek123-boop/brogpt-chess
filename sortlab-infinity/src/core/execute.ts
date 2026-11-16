import { getAlgorithm } from '../algorithms';
import { CancelledError, OperationLimitError, SortContext } from './context';
import { SortStats } from './ops';

export interface RunRequest {
  id: number;
  algorithmId: string;
  values: Int32Array;
  opLimit: number;
  seed: number;
  /** Record a replayable trace (needed for visualization). */
  record: boolean;
  /** Also measure uninstrumented-trace compute time with repeated runs. */
  timing?: boolean;
  /** Abort after this many milliseconds of computation. */
  deadlineMs?: number;
}

export type RunStatus = 'sorted' | 'limit' | 'cancelled' | 'error';

export interface RunResult {
  id: number;
  algorithmId: string;
  status: RunStatus;
  error?: string;
  trace: Int32Array;
  stats: SortStats;
  operations: number;
  final: Int32Array;
  /** Wall time of the recorded (instrumented + trace-building) run, in ms. */
  computeMs: number;
  /** Mean wall time over repeated runs that only count operations (no trace), in ms. Present when timing was requested. */
  timedMs?: number;
  timingRuns?: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function executeSort(req: RunRequest, externalAbort?: () => boolean): RunResult {
  const algo = getAlgorithm(req.algorithmId);
  const start = now();
  const deadline = req.deadlineMs ? start + req.deadlineMs : Infinity;
  const shouldAbort = () => (externalAbort?.() ?? false) || now() > deadline;
  const ctx = new SortContext(req.values, {
    record: req.record,
    opLimit: req.opLimit,
    seed: req.seed,
    shouldAbort,
  });
  let status: RunStatus = 'sorted';
  let error: string | undefined;
  try {
    algo.run(ctx);
  } catch (e) {
    if (e instanceof OperationLimitError) status = 'limit';
    else if (e instanceof CancelledError) status = 'cancelled';
    else {
      status = 'error';
      error = e instanceof Error ? e.message : String(e);
    }
  }
  const computeMs = now() - start;
  const result: RunResult = {
    id: req.id,
    algorithmId: algo.id,
    status,
    error,
    trace: ctx.getTrace(),
    stats: { ...ctx.stats },
    operations: ctx.operationCount,
    final: Int32Array.from(ctx.a),
    computeMs,
  };
  if (req.timing && status === 'sorted') {
    // Browsers coarsen timers (often to 100 µs), so time a batch of repeated runs and
    // report the mean. Slow algorithms get a single run.
    const budget = 60;
    let reps = 0;
    const t0 = now();
    let elapsed = 0;
    do {
      const c = new SortContext(req.values, { record: false, opLimit: req.opLimit, seed: req.seed, shouldAbort });
      try {
        algo.run(c);
      } catch {
        break;
      }
      reps++;
      elapsed = now() - t0;
    } while (elapsed < budget && reps < 20000);
    if (reps > 0) {
      result.timedMs = elapsed / reps;
      result.timingRuns = reps;
    }
  }
  return result;
}
