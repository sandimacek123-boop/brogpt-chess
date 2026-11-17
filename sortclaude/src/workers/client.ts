import type { WorkerRequest, WorkerResponse } from './sort.worker';
import { recordRun, countRun, type Recording, type CountResult } from '../engine/runner';

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };

/**
 * A cancellable wrapper around one sort worker. Cancel = terminate + respawn, which is the only
 * way to stop a runaway synchronous algorithm. Falls back to the main thread if Workers fail.
 */
export class SortWorker {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private failed = false;

  constructor(private readonly useWorker = true) {}

  private ensure(): Worker | null {
    if (!this.useWorker || this.failed || typeof Worker === 'undefined') return null;
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('./sort.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        p.resolve(e.data);
      };
      this.worker.onerror = (e) => {
        const err = new Error(`Worker crashed: ${e.message || 'unknown error'}`);
        for (const p of this.pending.values()) p.reject(err);
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
      };
      return this.worker;
    } catch {
      this.failed = true;
      return null;
    }
  }

  private send(req: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = []): Promise<WorkerResponse> {
    const w = this.ensure();
    const id = this.nextId++;
    if (!w) {
      // main-thread fallback
      return new Promise((resolve) => {
        setTimeout(() => {
          const r = req as WorkerRequest;
          if (r.type === 'record') resolve({ id, type: 'record', rec: recordRun(r.algorithmId, r.keys, { seed: r.seed, opLimit: r.opLimit, timeLimitMs: r.timeLimitMs }) });
          else {
            const results: CountResult[] = [];
            for (let k = 0; k < r.warmup; k++) countRun(r.algorithmId, r.keys.slice(), { seed: r.seed });
            for (let k = 0; k < r.runs; k++) results.push(countRun(r.algorithmId, r.keys.slice(), { seed: r.seed, timeLimitMs: r.timeLimitMs }));
            resolve({ id, type: 'count', results });
          }
        }, 0);
      });
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ ...req, id }, transfer);
    });
  }

  async record(algorithmId: string, keys: Int32Array, seed: number, opLimit?: number, timeLimitMs?: number): Promise<Recording> {
    const copy = keys.slice();
    const res = await this.send({ type: 'record', algorithmId, keys: copy, seed, opLimit, timeLimitMs }, this.useWorker ? [copy.buffer] : []);
    if (res.type === 'error') throw new Error(res.error);
    if (res.type !== 'record') throw new Error('Unexpected worker response');
    return res.rec;
  }

  async count(algorithmId: string, keys: Int32Array, seed: number, runs: number, warmup: number, timeLimitMs?: number): Promise<CountResult[]> {
    const res = await this.send({ type: 'count', algorithmId, keys: keys.slice(), seed, runs, warmup, timeLimitMs });
    if (res.type === 'error') throw new Error(res.error);
    if (res.type !== 'count') throw new Error('Unexpected worker response');
    return res.results;
  }

  /** Abort everything in flight. */
  cancel() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    const err = new Error('Cancelled');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  dispose() {
    this.cancel();
  }
}
