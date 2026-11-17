/// <reference lib="webworker" />
/**
 * Isolated execution of user-written sorting code.
 * - Runs in a dedicated Worker: no DOM, no access to the app window, no Electron/Node APIs.
 * - Network, storage and nested-worker globals are removed before user code runs.
 * - The only way to touch the data is the instrumented API below; every call is recorded.
 * - Operation budget enforced here; wall-clock limit enforced by the parent (terminate()).
 */
import { Machine, OpLimitError } from '../engine/machine';

const g = self as any;
const BLOCKED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'WebTransport', 'RTCPeerConnection', 'Request', 'Response', 'Headers', 'navigator', 'location', 'FileReader', 'Blob', 'OffscreenCanvas', 'Notification', 'close'];

export interface SandboxRequest {
  code: string;
  keys: Int32Array;
  opLimit: number;
  seed: number;
}

const post = g.postMessage.bind(g);

g.onmessage = (e: MessageEvent<SandboxRequest>) => {
  const { code, keys, opLimit, seed } = e.data;
  for (const k of BLOCKED) {
    try {
      Object.defineProperty(g, k, { value: undefined, configurable: false, writable: false });
    } catch {
      try {
        g[k] = undefined;
      } catch {
        /* ignore */
      }
    }
  }
  const n = keys.length;
  const m = new Machine(keys, { record: true, seed, opLimit });
  // value -> ids with that key (for mapping written values back to element identities)
  const byValue = new Map<number, number[]>();
  for (let id = 0; id < n; id++) {
    const list = byValue.get(keys[id]);
    if (list) list.push(id);
    else byValue.set(keys[id], [id]);
  }
  const recentlyRead = new Map<number, number[]>(); // value -> stack of ids read with that value
  const idx = (i: unknown, name: string): number => {
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= n) throw new RangeError(`${name}: index ${String(i)} is out of bounds (0..${n - 1})`);
    return i;
  };
  let messages = 0;
  const api = Object.freeze({
    getLength: () => n,
    compare: (i: number, j: number) => Math.sign(m.cmp(idx(i, 'compare'), idx(j, 'compare'))),
    less: (i: number, j: number) => m.cmp(idx(i, 'less'), idx(j, 'less')) < 0,
    swap: (i: number, j: number) => {
      if (idx(i, 'swap') !== idx(j, 'swap')) m.swap(i, j);
    },
    read: (i: number) => {
      const h = m.read(idx(i, 'read'));
      const v = m.key(h);
      const s = recentlyRead.get(v);
      if (s) {
        s.push(h);
        if (s.length > 64) s.shift();
      } else recentlyRead.set(v, [h]);
      return v;
    },
    write: (i: number, v: number) => {
      idx(i, 'write');
      if (typeof v !== 'number' || !byValue.has(v)) throw new TypeError(`write: ${String(v)} is not a value from the original array — algorithms may only rearrange existing values`);
      const s = recentlyRead.get(v);
      const id = s && s.length ? s.pop()! : byValue.get(v)![0];
      m.write(i, id);
    },
    mark: (i: number) => m.pivot(idx(i, 'mark')),
    range: (lo: number, hi: number) => m.range(idx(lo, 'range'), idx(hi, 'range')),
    log: (...args: unknown[]) => {
      if (messages++ < 50) post({ type: 'log', text: args.map((a) => String(a)).join(' ').slice(0, 300) });
    },
  });
  const t0 = performance.now();
  let error: string | null = null;
  let errorLine: number | null = null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('api', `"use strict";\nconst { getLength, compare, less, swap, read, write, mark, range, log } = api;\n${code}\n;if (typeof sort !== 'function') throw new Error('Define a function named sort(n).');\nsort(getLength());`);
    fn(api);
  } catch (err) {
    if (err instanceof OpLimitError) error = `Stopped: more than ${opLimit.toLocaleString()} operations (possible infinite loop).`;
    else {
      error = `${(err as Error).name}: ${(err as Error).message}`;
      const m2 = String((err as Error).stack ?? '').match(/<anonymous>:(\d+):\d+/);
      if (m2) errorLine = Number(m2[1]) - 3;
    }
  }
  const ms = performance.now() - t0;
  const finalKeys = m.finalKeys();
  const sorted = m.isSorted();
  const a = Array.from(keys).sort((x, y) => x - y);
  const b = Array.from(finalKeys).sort((x, y) => x - y);
  const multisetOk = a.length === b.length && a.every((v, i) => v === b[i]);
  const ops = m.takeOps();
  post(
    {
      type: 'done',
      rec: { algorithmId: 'custom', keys, ops, opCount: m.opCount, finalIds: m.a.slice(), executionMs: ms, auxPeak: m.auxPeak, sorted, truncated: !!error, error: error ?? undefined },
      error,
      errorLine,
      sorted,
      multisetOk,
      counts: { comparisons: m.comparisons, swaps: m.swaps, writes: m.writes, reads: m.reads, operations: m.operations },
    },
    [ops.buffer],
  );
};
