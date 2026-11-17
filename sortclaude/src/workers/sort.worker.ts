/// <reference lib="webworker" />
import { recordRun, countRun, type Recording } from '../engine/runner';

export type WorkerRequest =
  | { id: number; type: 'record'; algorithmId: string; keys: Int32Array; seed: number; opLimit?: number; timeLimitMs?: number }
  | { id: number; type: 'count'; algorithmId: string; keys: Int32Array; seed: number; runs: number; warmup: number; timeLimitMs?: number };

export type WorkerResponse =
  | { id: number; type: 'record'; rec: Recording }
  | { id: number; type: 'count'; results: ReturnType<typeof countRun>[] }
  | { id: number; type: 'error'; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'record') {
      const rec = recordRun(msg.algorithmId, msg.keys, { seed: msg.seed, opLimit: msg.opLimit, timeLimitMs: msg.timeLimitMs });
      ctx.postMessage({ id: msg.id, type: 'record', rec } satisfies WorkerResponse, [rec.ops.buffer, rec.finalIds.buffer]);
    } else if (msg.type === 'count') {
      for (let w = 0; w < msg.warmup; w++) countRun(msg.algorithmId, msg.keys.slice(), { seed: msg.seed, timeLimitMs: msg.timeLimitMs });
      const results = [];
      for (let r = 0; r < msg.runs; r++) {
        const res = countRun(msg.algorithmId, msg.keys.slice(), { seed: msg.seed, timeLimitMs: msg.timeLimitMs });
        results.push(res);
        if (res.error) break;
      }
      ctx.postMessage({ id: msg.id, type: 'count', results } satisfies WorkerResponse);
    }
  } catch (err) {
    ctx.postMessage({ id: msg.id, type: 'error', error: (err as Error).message || String(err) } satisfies WorkerResponse);
  }
};
