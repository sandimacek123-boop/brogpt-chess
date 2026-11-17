import { Op, OP_STRIDE } from '../engine/ops';
import type { Timeline } from '../engine/timeline';

/** Everything a renderer needs to draw one sorting state. */
export interface RenderView {
  n: number;
  keys: Int32Array;
  ids: Int32Array;
  sorted: Uint8Array;
  pivot: number;
  range: [number, number] | null;
  minKey: number;
  maxKey: number;
  /** finalPos[id] = index the element occupies when sorted (for displacement views). */
  finalPos: Int32Array;
  compare: number[];
  write: number[];
  done: boolean;
  /** seconds, for ambient animation */
  time: number;
  /** -1 when inactive, else completion effect progress 0..1 */
  completion: number;
}

export interface ViewCache {
  minKey: number;
  maxKey: number;
  finalPos: Int32Array;
}

export function buildViewCache(tl: Timeline): ViewCache {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < tl.n; i++) {
    const k = tl.keys[i];
    if (k < min) min = k;
    if (k > max) max = k;
  }
  if (!Number.isFinite(min)) {
    min = 0;
    max = 1;
  }
  const finalPos = new Int32Array(tl.n);
  const f = tl.recording.finalIds;
  for (let i = 0; i < f.length; i++) finalPos[f[i]] = i;
  return { minKey: min, maxKey: max, finalPos };
}

/**
 * Indices touched by the most recent `window` ops before the playhead. The same playhead and
 * window always produce the same highlights, so rewinding reproduces the exact frame.
 */
export function collectHighlights(tl: Timeline, window: number, out: { compare: number[]; write: number[] }) {
  out.compare.length = 0;
  out.write.length = 0;
  const start = Math.max(0, tl.pos - window);
  const ops = tl.ops;
  const cap = 512;
  for (let k = tl.pos - 1; k >= start && out.compare.length + out.write.length < cap; k--) {
    const o = k * OP_STRIDE;
    const t = ops[o];
    const a = ops[o + 1];
    const b = ops[o + 2];
    switch (t) {
      case Op.COMPARE:
        out.compare.push(a, b);
        break;
      case Op.COMPARE_AUX:
        if (a >= 0) out.compare.push(a);
        if (b >= 0) out.compare.push(b);
        break;
      case Op.COMPARE_HELD:
        out.compare.push(a);
        if (b >= 0) out.compare.push(b);
        break;
      case Op.SWAP:
        out.write.push(a, b);
        break;
      case Op.WRITE:
      case Op.MOVE:
        out.write.push(a);
        break;
      case Op.READ:
      case Op.TO_AUX:
        out.compare.push(a);
        break;
      case Op.AUX_STORE:
        if (a >= 0) out.compare.push(a);
        break;
    }
  }
}

export function makeView(tl: Timeline, cache: ViewCache, window: number, time: number, completion: number, scratch?: { compare: number[]; write: number[] }): RenderView {
  const h = scratch ?? { compare: [], write: [] };
  collectHighlights(tl, window, h);
  return {
    n: tl.n,
    keys: tl.keys,
    ids: tl.ids,
    sorted: tl.sorted,
    pivot: tl.pivot,
    range: tl.range,
    minKey: cache.minKey,
    maxKey: cache.maxKey,
    finalPos: cache.finalPos,
    compare: h.compare,
    write: h.write,
    done: tl.done,
    time,
    completion,
  };
}
