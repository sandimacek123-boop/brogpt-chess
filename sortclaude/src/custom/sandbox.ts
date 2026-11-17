import type { Recording } from '../engine/runner';

export interface SandboxResult {
  rec: Recording | null;
  error: string | null;
  errorLine: number | null;
  sorted: boolean;
  multisetOk: boolean;
  counts: { comparisons: number; swaps: number; writes: number; reads: number; operations: number } | null;
  logs: string[];
}

export const CUSTOM_API_DOC = [
  ['getLength()', 'Number of elements n.'],
  ['compare(i, j)', 'Compare a[i] with a[j]; returns -1, 0 or 1. Counted as 1 comparison.'],
  ['less(i, j)', 'true if a[i] < a[j]. Counted as 1 comparison.'],
  ['swap(i, j)', 'Exchange a[i] and a[j]. Counted as 1 swap (2 writes).'],
  ['read(i)', 'Return the value at a[i]. Counted as 1 read.'],
  ['write(i, v)', 'Store value v (must be a value from the array) at a[i]. Counted as 1 write.'],
  ['mark(i)', 'Highlight index i as the pivot (annotation, not an operation).'],
  ['range(lo, hi)', 'Highlight the active sub-array (annotation).'],
  ['log(...values)', 'Print to the console panel (max 50 lines).'],
] as const;

/** Run user code in an isolated worker with operation and wall-clock limits. */
export function runSandboxed(code: string, keys: Int32Array, opts: { opLimit: number; timeLimitMs: number; seed: number }, signal?: { cancel?: () => void }): Promise<SandboxResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./sandbox.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      resolve({ rec: null, error: `Could not start the sandbox: ${(e as Error).message}`, errorLine: null, sorted: false, multisetOk: false, counts: null, logs: [] });
      return;
    }
    const logs: string[] = [];
    let settled = false;
    const finish = (r: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ rec: null, error: `Stopped: exceeded the ${opts.timeLimitMs / 1000}s time limit (infinite loop?).`, errorLine: null, sorted: false, multisetOk: false, counts: null, logs }), opts.timeLimitMs);
    if (signal) signal.cancel = () => finish({ rec: null, error: 'Cancelled.', errorLine: null, sorted: false, multisetOk: false, counts: null, logs });
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'log') {
        logs.push(d.text);
        return;
      }
      if (d.type === 'done') finish({ rec: d.rec, error: d.error, errorLine: d.errorLine, sorted: d.sorted, multisetOk: d.multisetOk, counts: d.counts, logs });
    };
    worker.onerror = (e) => {
      e.preventDefault();
      finish({ rec: null, error: `Sandbox crashed: ${e.message || 'out of memory or syntax error'}`, errorLine: e.lineno ? e.lineno - 3 : null, sorted: false, multisetOk: false, counts: null, logs });
    };
    const copy = keys.slice();
    worker.postMessage({ code, keys: copy, opLimit: opts.opLimit, seed: opts.seed }, [copy.buffer]);
  });
}

export const EXAMPLES: { name: string; code: string }[] = [
  {
    name: 'Bubble Sort',
    code: `// Bubble sort using the instrumented API.
function sort(n) {
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      if (compare(j, j + 1) > 0) { swap(j, j + 1); swapped = true; }
    }
    if (!swapped) break;
  }
}`,
  },
  {
    name: 'Insertion Sort (read/write)',
    code: `// Insertion sort that shifts with read/write instead of swaps.
function sort(n) {
  for (let i = 1; i < n; i++) {
    const t = read(i);
    let j = i - 1;
    while (j >= 0 && read(j) > t) {
      write(j + 1, read(j));
      j--;
    }
    write(j + 1, t);
  }
}`,
  },
  {
    name: 'Quick Sort (Lomuto)',
    code: `// Recursive quicksort with the last element as pivot.
function sort(n) {
  qs(0, n - 1);
}
function qs(lo, hi) {
  if (lo >= hi) return;
  range(lo, hi);
  mark(hi);
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (less(j, hi)) { swap(i, j); i++; }
  }
  swap(i, hi);
  qs(lo, i - 1);
  qs(i + 1, hi);
}`,
  },
  {
    name: 'Broken example (loses data)',
    code: `// This "algorithm" overwrites values — the checker will catch it.
function sort(n) {
  for (let i = 1; i < n; i++) write(i, read(0));
}`,
  },
];
