import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';
import { heapSortRange, insertionRange, log2floor, sort3 } from './helpers';

const QS = { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)' };

/** Lomuto partition of [lo, hi] with pivot at hi. Returns final pivot index. */
function lomuto(ctx: SortContext, lo: number, hi: number): number {
  let i = lo;
  for (let j = lo; j < hi; j++)
    if (ctx.cmp(j, hi) < 0) {
      ctx.swap(i, j);
      i++;
    }
  ctx.swap(i, hi);
  return i;
}

/** Generic quicksort driver that recurses into the smaller side (O(log n) stack). */
function quickLoop(
  ctx: SortContext,
  lo: number,
  hi: number,
  partition: (lo: number, hi: number) => [number, number],
  cutoff = 0,
) {
  while (hi - lo >= Math.max(1, cutoff)) {
    const [l, r] = partition(lo, hi); // left part [lo, l], right part [r, hi]
    if (l - lo < hi - r) {
      quickLoop(ctx, lo, l, partition, cutoff);
      lo = r;
    } else {
      quickLoop(ctx, r, hi, partition, cutoff);
      hi = l;
    }
  }
}

/** Hoare partition using the value at index p as pivot. Returns j such that [lo..j] <= pivot <= [j+1..hi]. */
function hoare(ctx: SortContext, lo: number, hi: number, p: number): number {
  // Moving the pivot to lo guarantees the returned index is < hi (termination).
  ctx.swap(lo, p);
  const pivot = ctx.get(lo);
  let i = lo - 1;
  let j = hi + 1;
  for (;;) {
    do i++;
    while (ctx.cmpi(i, pivot) < 0);
    do j--;
    while (ctx.cmpi(j, pivot) > 0);
    if (i >= j) return j;
    ctx.swap(i, j);
  }
}

function medianOf3Index(ctx: SortContext, a: number, b: number, c: number): number {
  if (ctx.cmp(a, b) < 0) {
    if (ctx.cmp(b, c) < 0) return b;
    return ctx.cmp(a, c) < 0 ? c : a;
  }
  if (ctx.cmp(a, c) < 0) return a;
  return ctx.cmp(b, c) < 0 ? c : b;
}

function ninther(ctx: SortContext, lo: number, hi: number): number {
  const n = hi - lo + 1;
  if (n < 40) return medianOf3Index(ctx, lo, lo + (n >> 1), hi);
  const e = Math.floor(n / 8);
  const mid = lo + (n >> 1);
  return medianOf3Index(
    ctx,
    medianOf3Index(ctx, lo, lo + e, lo + 2 * e),
    medianOf3Index(ctx, mid - e, mid, mid + e),
    medianOf3Index(ctx, hi - 2 * e, hi - e, hi),
  );
}

/** Median of medians (groups of 5) pivot selection — returns index of a pivot with guaranteed balance. */
function medianOfMedians(ctx: SortContext, lo: number, hi: number): number {
  const n = hi - lo + 1;
  if (n <= 5) {
    insertionRange(ctx, lo, hi + 1);
    return lo + ((n - 1) >> 1);
  }
  let m = lo;
  for (let i = lo; i <= hi; i += 5) {
    const end = Math.min(i + 4, hi);
    insertionRange(ctx, i, end + 1);
    ctx.swap(m++, i + ((end - i) >> 1));
  }
  // select the median of the collected medians recursively
  return select(ctx, lo, m - 1, lo + ((m - 1 - lo) >> 1));
}

/** Quickselect using median-of-medians; places k-th element at index k and returns k. */
function select(ctx: SortContext, lo: number, hi: number, k: number): number {
  while (lo < hi) {
    const p = medianOfMedians(ctx, lo, hi);
    ctx.swap(p, hi);
    const q = lomutoStable3(ctx, lo, hi);
    if (k < q[0]) hi = q[0] - 1;
    else if (k > q[1]) lo = q[1] + 1;
    else return k;
  }
  return lo;
}

/** Three-way partition around the pivot at hi. Returns [lt, gt]: equal block bounds. */
function lomutoStable3(ctx: SortContext, lo: number, hi: number): [number, number] {
  const v = ctx.get(hi);
  let lt = lo;
  let i = lo;
  let gt = hi;
  while (i <= gt) {
    const c = ctx.cmpi(i, v);
    if (c < 0) ctx.swap(lt++, i++);
    else if (c > 0) ctx.swap(i, gt--);
    else i++;
  }
  return [lt, gt];
}

// ---------- pdqsort (branchful) -------------------------------------------------
const INSERTION_THRESHOLD = 24;
const NINTHER_THRESHOLD = 128;
const PARTIAL_INSERTION_LIMIT = 8;

function partialInsertion(ctx: SortContext, begin: number, end: number): boolean {
  if (begin === end) return true;
  let limit = 0;
  for (let cur = begin + 1; cur < end; cur++) {
    if (ctx.cmp(cur, cur - 1) < 0) {
      const tmp = ctx.get(cur);
      let sift = cur;
      do {
        ctx.set(sift, ctx.get(sift - 1));
        sift--;
      } while (sift !== begin && ctx.cmpi(sift - 1, tmp) > 0);
      ctx.set(sift, tmp);
      limit += cur - sift;
    }
    if (limit > PARTIAL_INSERTION_LIMIT) return false;
  }
  return true;
}

function partitionRight(ctx: SortContext, begin: number, end: number): [number, boolean] {
  const pivot = ctx.get(begin);
  let first = begin;
  let last = end;
  while (ctx.cmpi(++first, pivot) < 0);
  if (first - 1 === begin) while (first < last && !(ctx.cmpi(--last, pivot) < 0));
  else while (!(ctx.cmpi(--last, pivot) < 0));
  const already = first >= last;
  while (first < last) {
    ctx.swap(first, last);
    while (ctx.cmpi(++first, pivot) < 0);
    while (!(ctx.cmpi(--last, pivot) < 0));
  }
  const pivotPos = first - 1;
  ctx.swap(begin, pivotPos);
  return [pivotPos, already];
}

function partitionLeft(ctx: SortContext, begin: number, end: number): number {
  const pivot = ctx.get(begin);
  let first = begin;
  let last = end;
  while (ctx.cmpi(--last, pivot) > 0);
  if (last + 1 === end) while (first < last && !(ctx.cmpi(++first, pivot) > 0));
  else while (!(ctx.cmpi(++first, pivot) > 0));
  while (first < last) {
    ctx.swap(first, last);
    while (ctx.cmpi(--last, pivot) > 0);
    while (!(ctx.cmpi(++first, pivot) > 0));
  }
  ctx.swap(begin, last);
  return last;
}

function pdqLoop(ctx: SortContext, begin: number, end: number, badAllowed: number, leftmost: boolean) {
  for (;;) {
    const size = end - begin;
    if (size < INSERTION_THRESHOLD) {
      insertionRange(ctx, begin, end);
      return;
    }
    const s2 = size >> 1;
    if (size > NINTHER_THRESHOLD) {
      sort3(ctx, begin, begin + s2, end - 1);
      sort3(ctx, begin + 1, begin + s2 - 1, end - 2);
      sort3(ctx, begin + 2, begin + s2 + 1, end - 3);
      sort3(ctx, begin + s2 - 1, begin + s2, begin + s2 + 1);
      ctx.swap(begin, begin + s2);
    } else sort3(ctx, begin + s2, begin, end - 1);

    if (!leftmost && !(ctx.cmp(begin - 1, begin) < 0)) {
      begin = partitionLeft(ctx, begin, end) + 1;
      continue;
    }
    const [pivotPos, already] = partitionRight(ctx, begin, end);
    const lSize = pivotPos - begin;
    const rSize = end - (pivotPos + 1);
    const unbalanced = lSize < (size >> 3) || rSize < (size >> 3);
    if (unbalanced) {
      if (--badAllowed === 0) {
        heapSortRange(ctx, begin, end);
        return;
      }
      if (lSize >= INSERTION_THRESHOLD) {
        ctx.swap(begin, begin + (lSize >> 2));
        ctx.swap(pivotPos - 1, pivotPos - (lSize >> 2));
        if (lSize > NINTHER_THRESHOLD) {
          ctx.swap(begin + 1, begin + ((lSize >> 2) + 1));
          ctx.swap(begin + 2, begin + ((lSize >> 2) + 2));
          ctx.swap(pivotPos - 2, pivotPos - ((lSize >> 2) + 1));
          ctx.swap(pivotPos - 3, pivotPos - ((lSize >> 2) + 2));
        }
      }
      if (rSize >= INSERTION_THRESHOLD) {
        ctx.swap(pivotPos + 1, pivotPos + 1 + (rSize >> 2));
        ctx.swap(end - 1, end - (rSize >> 2));
        if (rSize > NINTHER_THRESHOLD) {
          ctx.swap(pivotPos + 2, pivotPos + 2 + (rSize >> 2));
          ctx.swap(pivotPos + 3, pivotPos + 3 + (rSize >> 2));
          ctx.swap(end - 2, end - (1 + (rSize >> 2)));
          ctx.swap(end - 3, end - (2 + (rSize >> 2)));
        }
      }
    } else if (already && partialInsertion(ctx, begin, pivotPos) && partialInsertion(ctx, pivotPos + 1, end)) return;

    pdqLoop(ctx, begin, pivotPos, badAllowed, leftmost);
    begin = pivotPos + 1;
    leftmost = false;
  }
}

// ---------- Introsort ---------------------------------------------------------
function introLoop(ctx: SortContext, lo: number, hi: number, depth: number) {
  while (hi - lo > 16) {
    if (depth === 0) {
      heapSortRange(ctx, lo, hi);
      return;
    }
    depth--;
    const m = medianOf3Index(ctx, lo, lo + ((hi - lo) >> 1), hi - 1);
    const p = hoare(ctx, lo, hi - 1, m);
    if (p + 1 - lo < hi - (p + 1)) {
      introLoop(ctx, lo, p + 1, depth);
      lo = p + 1;
    } else {
      introLoop(ctx, p + 1, hi, depth);
      hi = p + 1;
    }
  }
  insertionRange(ctx, lo, hi);
}

// ---------- Dual pivot ----------------------------------------------------------
function dualPivot(ctx: SortContext, lo: number, hi: number) {
  while (hi > lo) {
    const len = hi - lo + 1;
    if (len < 17) {
      insertionRange(ctx, lo, hi + 1);
      return;
    }
    const third = Math.floor(len / 3);
    ctx.swap(lo, lo + third);
    ctx.swap(hi, hi - third);
    if (ctx.cmp(lo, hi) > 0) ctx.swap(lo, hi);
    const p = ctx.get(lo);
    const q = ctx.get(hi);
    let l = lo + 1;
    let g = hi - 1;
    let k = l;
    while (k <= g) {
      if (ctx.cmpi(k, p) < 0) {
        ctx.swap(k, l);
        l++;
      } else if (ctx.cmpi(k, q) >= 0) {
        while (ctx.cmpi(g, q) > 0 && k < g) g--;
        ctx.swap(k, g);
        g--;
        if (ctx.cmpi(k, p) < 0) {
          ctx.swap(k, l);
          l++;
        }
      }
      k++;
    }
    l--;
    g++;
    ctx.swap(lo, l);
    ctx.swap(hi, g);
    // recurse on two smaller parts, loop on the largest
    const parts: [number, number][] = [
      [lo, l - 1],
      [l + 1, g - 1],
      [g + 1, hi],
    ];
    parts.sort((x, y) => x[1] - x[0] - (y[1] - y[0]));
    dualPivot(ctx, parts[0][0], parts[0][1]);
    dualPivot(ctx, parts[1][0], parts[1][1]);
    [lo, hi] = parts[2];
  }
}

export const quickSorts: AlgoDef[] = [
  {
    id: 'quick-lomuto',
    name: 'Quick Sort (Lomuto)',
    category: 'Quick',
    ...QS,
    stable: false,
    inPlace: true,
    maxN: 16384,
    notes: 'Last element as pivot; quadratic on sorted input.',
    description:
      'Classic quicksort with the Lomuto partition scheme: the last element is the pivot and a single left-to-right scan moves smaller elements to the front. Simple, but sorted or reversed input triggers the O(n²) worst case.',
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        const p = lomuto(ctx, lo, hi);
        return [p - 1, p + 1];
      });
    },
  },
  {
    id: 'quick',
    name: 'Quick Sort',
    category: 'Quick',
    ...QS,
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: "Hoare's partition scheme with the middle element as pivot.",
    description:
      "Tony Hoare's original two-pointer partitioning: pointers move inward from both ends and swap pairs that sit on the wrong side of the pivot. Picks the middle element, so sorted input is handled well.",
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        const j = hoare(ctx, lo, hi, lo + ((hi - lo) >> 1));
        return [j, j + 1];
      });
    },
  },
  {
    id: 'quick-median3',
    name: 'Quick Sort (Median of 3)',
    category: 'Quick',
    ...QS,
    stable: false,
    inPlace: true,
    maxN: 65536,
    description:
      'Hoare quicksort whose pivot is the median of the first, middle and last elements. Makes the quadratic case much less likely on structured inputs.',
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        const m = medianOf3Index(ctx, lo, lo + ((hi - lo) >> 1), hi);
        const j = hoare(ctx, lo, hi, m);
        return [j, j + 1];
      });
    },
  },
  {
    id: 'quick-ninther',
    name: 'Quick Sort (Tukey Ninther)',
    category: 'Quick',
    ...QS,
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: "Pivot = median of three medians-of-three (Tukey's ninther).",
    description:
      'Uses Tukey’s ninther — the median of three medians of three samples — as the pivot for large partitions, giving a better pivot estimate for only ~12 comparisons.',
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        const j = hoare(ctx, lo, hi, ninther(ctx, lo, hi));
        return [j, j + 1];
      });
    },
  },
  {
    id: 'quick-random',
    name: 'Randomized Quick Sort',
    category: 'Quick',
    ...QS,
    worst: 'O(n²) (unlikely)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    description:
      'Chooses a uniformly random pivot, so no fixed input can force bad behaviour: the expected running time is O(n log n) for every input. Uses the run seed for reproducibility.',
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        const r = lo + Math.floor(ctx.random() * (hi - lo + 1));
        ctx.swap(r, hi);
        const p = lomuto(ctx, lo, hi);
        return [p - 1, p + 1];
      });
    },
  },
  {
    id: 'quick-3way',
    name: '3-Way Quick Sort (Dijkstra)',
    category: 'Quick',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: 'Dutch national flag partitioning.',
    description:
      'Partitions into three regions — less than, equal to, and greater than the pivot — using Dijkstra’s Dutch national flag scheme. Equal keys are finished in one pass, so arrays with many duplicates sort in near-linear time.',
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        ctx.swap(medianOf3Index(ctx, lo, lo + ((hi - lo) >> 1), hi), hi);
        const [lt, gt] = lomutoStable3(ctx, lo, hi);
        return [lt - 1, gt + 1];
      });
    },
  },
  {
    id: 'quick-bm',
    name: '3-Way Quick Sort (Bentley–McIlroy)',
    category: 'Quick',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: '"Fat pivot" partitioning from "Engineering a Sort Function" (1993).',
    description:
      'Hoare-style scan that parks keys equal to the pivot at both ends of the range, then swaps them into the middle afterwards. Fewer swaps than Dijkstra’s scheme when duplicates are rare.',
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        ctx.swap(lo, medianOf3Index(ctx, lo, lo + ((hi - lo) >> 1), hi));
        const v = ctx.get(lo);
        let i = lo;
        let j = hi + 1;
        let p = lo;
        let q = hi + 1;
        for (;;) {
          while (ctx.cmpi(++i, v) < 0) if (i === hi) break;
          while (ctx.cmpi(--j, v) > 0) if (j === lo) break;
          if (i === j && ctx.cmpi(i, v) === 0) ctx.swap(++p, i);
          if (i >= j) break;
          ctx.swap(i, j);
          if (ctx.cmpi(i, v) === 0) ctx.swap(++p, i);
          if (ctx.cmpi(j, v) === 0) ctx.swap(--q, j);
        }
        i = j + 1;
        for (let k = lo; k <= p; k++) ctx.swap(k, j--);
        for (let k = hi; k >= q; k--) ctx.swap(k, i++);
        return [j, i];
      });
    },
  },
  {
    id: 'quick-dual',
    name: 'Dual-Pivot Quick Sort',
    category: 'Quick',
    ...QS,
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: "Yaroslavskiy's scheme (Java 7 Arrays.sort for primitives), with tertile pivots and insertion sort for tiny ranges.",
    description:
      'Partitions around two pivots p ≤ q into three parts (< p, between, > q) in a single pass. Fewer cache misses than single-pivot quicksort in practice.',
    run(ctx) {
      dualPivot(ctx, 0, ctx.n - 1);
    },
  },
  {
    id: 'quick-cutoff',
    name: 'Quick Sort + Insertion Cutoff',
    category: 'Quick',
    ...QS,
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: 'Sedgewick: leave ranges ≤ 16 unsorted, finish with one insertion sort pass.',
    description:
      'Median-of-3 quicksort that stops recursing on small ranges, leaving the array "almost sorted"; a single final insertion sort then cleans up in linear time.',
    run(ctx) {
      quickLoop(
        ctx,
        0,
        ctx.n - 1,
        (lo, hi) => {
          const j = hoare(ctx, lo, hi, medianOf3Index(ctx, lo, lo + ((hi - lo) >> 1), hi));
          return [j, j + 1];
        },
        16,
      );
      insertionRange(ctx, 0, ctx.n);
    },
  },
  {
    id: 'quick-stable',
    name: 'Stable Quick Sort',
    category: 'Quick',
    ...QS,
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    description:
      'Out-of-place quicksort: each range is partitioned into a scratch buffer (less / equal / greater, in original order) and copied back, which preserves the order of equal keys.',
    run(ctx) {
      const buf = ctx.aux(ctx.n);
      const rec = (lo: number, hi: number) => {
        while (hi - lo >= 1) {
          const pv = ctx.get(lo + ((hi - lo) >> 1));
          const cls = new Int8Array(hi - lo + 1);
          for (let i = lo; i <= hi; i++) cls[i - lo] = Math.sign(ctx.cmpi(i, pv));
          let k = lo;
          for (let c = -1; c <= 1; c++) for (let i = lo; i <= hi; i++) if (cls[i - lo] === c) buf.set(k++, ctx.get(i));
          let eqStart = lo;
          let gtStart = lo;
          for (let i = 0; i < cls.length; i++) {
            if (cls[i] < 0) eqStart++;
            if (cls[i] <= 0) gtStart++;
          }
          for (let i = lo; i <= hi; i++) ctx.set(i, buf.get(i));
          if (eqStart - lo < hi - gtStart) {
            rec(lo, eqStart - 1);
            lo = gtStart;
          } else {
            rec(gtStart, hi);
            hi = eqStart - 1;
          }
        }
      };
      rec(0, ctx.n - 1);
    },
  },
  {
    id: 'quick-mom',
    name: 'Quick Sort (Median of Medians)',
    category: 'Quick',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 16384,
    notes: 'Pivot from the BFPRT linear-time selection algorithm (Blum, Floyd, Pratt, Rivest, Tarjan 1973).',
    description:
      'Uses the true median, found with the median-of-medians selection algorithm, as the pivot. This guarantees O(n log n) in the worst case, at the price of a large constant factor.',
    run(ctx) {
      quickLoop(ctx, 0, ctx.n - 1, (lo, hi) => {
        const k = lo + ((hi - lo) >> 1);
        select(ctx, lo, hi, k);
        return [k - 1, k + 1];
      });
    },
  },
  {
    id: 'intro',
    name: 'IntroSort',
    category: 'Hybrid',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: 'Musser (1997). The basis of C++ std::sort.',
    description:
      'Introspective sort: median-of-3 quicksort that monitors its recursion depth. If depth exceeds 2·log₂ n it switches that range to heapsort, and small ranges are finished with insertion sort.',
    run(ctx) {
      if (ctx.n < 2) return;
      introLoop(ctx, 0, ctx.n, 2 * log2floor(ctx.n));
    },
  },
  {
    id: 'pdq',
    name: 'Pattern-Defeating Quicksort',
    category: 'Hybrid',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: 'Orson Peters (2016), branchful variant (no block partitioning). Used by Rust and Go.',
    description:
      'pdqsort: introsort extended with pattern detection. Detects already-partitioned ranges and finishes them with a bounded insertion sort (linear on sorted input), handles many equal keys with a left partition, and breaks adversarial patterns with deterministic swaps before falling back to heapsort.',
    run(ctx) {
      if (ctx.n < 2) return;
      pdqLoop(ctx, 0, ctx.n, log2floor(ctx.n), true);
    },
  },
];
