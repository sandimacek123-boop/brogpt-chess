import type { SortContext } from '../core/context';

/** Insertion sort of a[lo, hi) using shifts (writes). */
export function insertionRange(ctx: SortContext, lo: number, hi: number) {
  for (let i = lo + 1; i < hi; i++) {
    const v = ctx.get(i);
    let j = i - 1;
    while (j >= lo && ctx.cmpi(j, v) > 0) {
      ctx.set(j + 1, ctx.get(j));
      j--;
    }
    if (j + 1 !== i) ctx.set(j + 1, v);
  }
}

/** Binary insertion sort of a[lo, hi). */
export function binaryInsertionRange(ctx: SortContext, lo: number, hi: number) {
  for (let i = lo + 1; i < hi; i++) {
    const v = ctx.get(i);
    let l = lo;
    let r = i;
    while (l < r) {
      const m = (l + r) >>> 1;
      if (ctx.cmpi(m, v) > 0) r = m;
      else l = m + 1;
    }
    for (let j = i; j > l; j--) ctx.set(j, ctx.get(j - 1));
    if (l !== i) ctx.set(l, v);
  }
}

function siftDown(ctx: SortContext, lo: number, root: number, size: number) {
  for (;;) {
    let child = 2 * root + 1;
    if (child >= size) return;
    if (child + 1 < size && ctx.cmp(lo + child, lo + child + 1) < 0) child++;
    if (ctx.cmp(lo + root, lo + child) < 0) {
      ctx.swap(lo + root, lo + child);
      root = child;
    } else return;
  }
}

/** Heapsort of a[lo, hi). */
export function heapSortRange(ctx: SortContext, lo: number, hi: number) {
  const n = hi - lo;
  for (let i = (n >> 1) - 1; i >= 0; i--) siftDown(ctx, lo, i, n);
  for (let end = n - 1; end > 0; end--) {
    ctx.swap(lo, lo + end);
    siftDown(ctx, lo, 0, end);
  }
}

/** Rotate a[lo, hi) so that a[mid] becomes first, via three reversals. */
export function rotate(ctx: SortContext, lo: number, mid: number, hi: number) {
  if (lo >= mid || mid >= hi) return;
  ctx.reverse(lo, mid - 1);
  ctx.reverse(mid, hi - 1);
  ctx.reverse(lo, hi - 1);
}

/** Sort a[i], a[j], a[k] by swaps so that a[i] <= a[j] <= a[k]. */
export function sort3(ctx: SortContext, i: number, j: number, k: number) {
  if (ctx.cmp(j, i) < 0) ctx.swap(i, j);
  if (ctx.cmp(k, j) < 0) {
    ctx.swap(j, k);
    if (ctx.cmp(j, i) < 0) ctx.swap(i, j);
  }
}

export function minMax(ctx: SortContext): [number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < ctx.n; i++) {
    const v = ctx.get(i);
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return [mn, mx];
}

export function log2floor(n: number) {
  return 31 - Math.clz32(n);
}
