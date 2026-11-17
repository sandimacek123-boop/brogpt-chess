import type { Machine } from '../machine';
import { insertionRange } from './elementary';
import { heapSortRange } from './heap';

/**
 * Recursion helper: recurse into the smaller side and loop on the larger one, bounding the stack
 * depth to O(log n) even for adversarial inputs.
 */
type Partitioner = (m: Machine, lo: number, hi: number) => [number, number, number, number];

function quickDriver(m: Machine, lo0: number, hi0: number, part: Partitioner) {
  const stack: number[] = [lo0, hi0];
  while (stack.length) {
    const hi = stack.pop()!;
    const lo = stack.pop()!;
    if (lo >= hi) {
      if (lo === hi) m.sorted(lo);
      continue;
    }
    m.range(lo, hi);
    const [l1, h1, l2, h2] = part(m, lo, hi);
    // push larger first so the smaller is processed first (keeps the explicit stack small)
    if (h1 - l1 > h2 - l2) {
      stack.push(l1, h1, l2, h2);
    } else {
      stack.push(l2, h2, l1, h1);
    }
  }
}

function lomutoPartition(m: Machine, lo: number, hi: number): number {
  m.pivot(hi);
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (m.cmp(j, hi) < 0) {
      if (i !== j) m.swap(i, j);
      i++;
    }
  }
  if (i !== hi) m.swap(i, hi);
  m.sorted(i);
  return i;
}

/** Quick Sort, Lomuto partition scheme with the last element as pivot. */
export function quickSortLomuto(m: Machine): void {
  quickDriver(m, 0, m.n - 1, (mm, lo, hi) => {
    const p = lomutoPartition(mm, lo, hi);
    return [lo, p - 1, p + 1, hi];
  });
  m.sortedRange(0, m.n - 1);
}

/** Quick Sort, Hoare partition scheme with the middle element as pivot value. */
export function quickSortHoare(m: Machine): void {
  quickDriver(m, 0, m.n - 1, (mm, lo, hi) => {
    const j = hoarePartition(mm, lo, hi, (lo + hi) >>> 1);
    return [lo, j, j + 1, hi];
  });
  m.sortedRange(0, m.n - 1);
}

function hoarePartition(m: Machine, lo: number, hi: number, pivotIndex: number): number {
  m.pivot(pivotIndex);
  const p = m.read(pivotIndex);
  let i = lo - 1;
  let j = hi + 1;
  for (;;) {
    do i++;
    while (m.cmpHI(p, i, pivotIndex) > 0);
    do j--;
    while (m.cmpHI(p, j, pivotIndex) < 0);
    if (i >= j) return j;
    m.swap(i, j);
  }
}

export function randomizedQuickSort(m: Machine): void {
  quickDriver(m, 0, m.n - 1, (mm, lo, hi) => {
    const r = lo + mm.rng.int(hi - lo + 1);
    if (r !== hi) mm.swap(r, hi);
    const p = lomutoPartition(mm, lo, hi);
    return [lo, p - 1, p + 1, hi];
  });
  m.sortedRange(0, m.n - 1);
}

/** Order main[lo], main[mid], main[hi]; the median ends at mid. */
function medianOfThree(m: Machine, lo: number, mid: number, hi: number): void {
  if (m.gt(lo, mid)) m.swap(lo, mid);
  if (m.gt(mid, hi)) m.swap(mid, hi);
  if (m.gt(lo, mid)) m.swap(lo, mid);
}

export function medianOfThreeQuickSort(m: Machine): void {
  quickDriver(m, 0, m.n - 1, (mm, lo, hi) => {
    const mid = (lo + hi) >>> 1;
    if (hi - lo >= 2) medianOfThree(mm, lo, mid, hi);
    const j = hoarePartition(mm, lo, hi, mid);
    return [lo, j, j + 1, hi];
  });
  m.sortedRange(0, m.n - 1);
}

/** Dijkstra's three-way partition (< pivot | = pivot | > pivot). Excellent with many duplicates. */
export function threeWayQuickSort(m: Machine): void {
  quickDriver(m, 0, m.n - 1, (mm, lo, hi) => {
    const mid = (lo + hi) >>> 1;
    mm.swap(lo, mid);
    mm.pivot(lo);
    const v = mm.read(lo);
    let lt = lo;
    let gt = hi;
    let i = lo + 1;
    while (i <= gt) {
      const c = mm.cmpHI(v, i, lt); // key(v) - key(a[i])
      if (c > 0) mm.swap(lt++, i++);
      else if (c < 0) mm.swap(i, gt--);
      else i++;
    }
    for (let k = lt; k <= gt; k++) mm.sorted(k);
    return [lo, lt - 1, gt + 1, hi];
  });
  m.sortedRange(0, m.n - 1);
}

/** Yaroslavskiy dual-pivot partitioning (the scheme behind Java 7+ Arrays.sort for primitives). */
export function dualPivotQuickSort(m: Machine): void {
  const rec = (lo: number, hi: number): void => {
    if (hi <= lo) {
      if (hi === lo) m.sorted(lo);
      return;
    }
    m.range(lo, hi);
    if (m.gt(lo, hi)) m.swap(lo, hi);
    m.pivot(lo);
    let l = lo + 1;
    let g = hi - 1;
    let k = l;
    while (k <= g) {
      if (m.lt(k, lo)) {
        if (k !== l) m.swap(k, l);
        l++;
      } else if (!m.lt(k, hi)) {
        while (m.gt(g, hi) && k < g) g--;
        if (k !== g) m.swap(k, g);
        g--;
        if (m.lt(k, lo)) {
          if (k !== l) m.swap(k, l);
          l++;
        }
      }
      k++;
    }
    l--;
    g++;
    if (lo !== l) m.swap(lo, l);
    if (hi !== g) m.swap(hi, g);
    m.sorted(l);
    m.sorted(g);
    rec(lo, l - 1);
    rec(l + 1, g - 1);
    rec(g + 1, hi);
  };
  rec(0, m.n - 1);
  m.sortedRange(0, m.n - 1);
}

/**
 * Stable quick sort: partition through auxiliary buffers, preserving relative order within
 * the <, = and > classes (one three-way comparison per element per level).
 */
export function stableQuickSort(m: Machine): void {
  if (m.n < 2) return;
  const lessBuf = m.alloc(m.n);
  const eqBuf = m.alloc(m.n);
  const gtBuf = m.alloc(m.n);
  quickDriver(m, 0, m.n - 1, (mm, lo, hi) => {
    const mid = (lo + hi) >>> 1;
    mm.pivot(mid);
    const p = mm.read(mid);
    let nl = 0;
    let ne = 0;
    let ng = 0;
    for (let i = lo; i <= hi; i++) {
      const c = mm.cmpHI(p, i, mid); // key(p) - key(a[i])
      if (c > 0) mm.toAux(lessBuf, nl++, i);
      else if (c < 0) mm.toAux(gtBuf, ng++, i);
      else mm.toAux(eqBuf, ne++, i);
    }
    let k = lo;
    for (let i = 0; i < nl; i++) mm.fromAux(k++, lessBuf, i);
    for (let i = 0; i < ne; i++) {
      mm.fromAux(k, eqBuf, i);
      mm.sorted(k++);
    }
    for (let i = 0; i < ng; i++) mm.fromAux(k++, gtBuf, i);
    return [lo, lo + nl - 1, lo + nl + ne, hi];
  });
  m.free(gtBuf);
  m.free(eqBuf);
  m.free(lessBuf);
  m.sortedRange(0, m.n - 1);
}

/** Musser's IntroSort: median-of-3 quicksort, heapsort fallback at depth 2·log2(n), insertion sort below 16. */
export function introSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const maxDepth = 2 * Math.floor(Math.log2(n));
  const rec = (lo: number, hi: number, depth: number): void => {
    while (hi - lo + 1 > 16) {
      m.range(lo, hi);
      if (depth === 0) {
        heapSortRange(m, lo, hi);
        return;
      }
      depth--;
      const mid = (lo + hi) >>> 1;
      medianOfThree(m, lo, mid, hi);
      const j = hoarePartition(m, lo, hi, mid);
      // recurse on smaller part
      if (j - lo < hi - j) {
        rec(lo, j, depth);
        lo = j + 1;
      } else {
        rec(j + 1, hi, depth);
        hi = j;
      }
    }
    m.range(lo, hi);
    insertionRange(m, lo, hi);
  };
  rec(0, n - 1, maxDepth);
  m.sortedRange(0, n - 1);
}
