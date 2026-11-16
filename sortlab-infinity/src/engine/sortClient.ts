import { executeSort, RunRequest, RunResult } from '../core/execute';

type Pending = { resolve: (r: RunResult) => void; reject: (e: Error) => void };

export class CancelledRunError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledRunError';
  }
}

/**
 * Runs sorting algorithms in a dedicated Web Worker so the UI stays responsive.
 * Cancellation terminates the worker (synchronous algorithms cannot be interrupted
 * otherwise) and transparently starts a fresh one.
 */
export class SortClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    try {
      this.worker = new Worker(new URL('../workers/sortWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<{ type: string; result: RunResult }>) => {
        const r = e.data.result;
        const p = this.pending.get(r.id);
        if (p) {
          this.pending.delete(r.id);
          p.resolve(r);
        }
      };
      this.worker.onerror = (e) => {
        const err = new Error(e.message || 'Worker error');
        this.pending.forEach((p) => p.reject(err));
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  run(req: Omit<RunRequest, 'id'>): Promise<RunResult> {
    const id = this.nextId++;
    const full: RunRequest = { ...req, id, values: Int32Array.from(req.values) };
    const w = this.ensureWorker();
    if (!w) {
      // Fallback: compute on the main thread.
      return new Promise((resolve) => setTimeout(() => resolve(executeSort(full)), 0));
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ type: 'run', req: full }, [full.values.buffer]);
    });
  }

  get busy() {
    return this.pending.size > 0;
  }

  cancelAll() {
    if (this.pending.size === 0) return;
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((p) => p.reject(new CancelledRunError()));
    this.pending.clear();
  }

  dispose() {
    this.cancelAll();
    this.worker?.terminate();
    this.worker = null;
  }
}
