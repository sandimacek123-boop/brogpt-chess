import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';

const NET = { best: 'O(n log² n)', average: 'O(n log² n)', worst: 'O(n log² n)', space: 'O(1)' };

/** Compare-exchange: ensures a[i] <= a[j] (for i < j). */
function cx(ctx: SortContext, i: number, j: number) {
  if (ctx.cmp(i, j) > 0) ctx.swap(i, j);
}

export const networkSorts: AlgoDef[] = [
  {
    id: 'bitonic',
    name: 'Bitonic Sort',
    category: 'Network',
    ...NET,
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Batcher (1968). Arbitrary-n formulation (no padding needed).',
    description:
      'Sorting network that recursively builds bitonic sequences (first increasing then decreasing) and merges them with half-cleaner stages. The comparison pattern is fixed in advance, so every stage can run in parallel — popular on GPUs.',
    run(ctx) {
      const greatestPow2Less = (n: number) => {
        let k = 1;
        while (k < n) k <<= 1;
        return k >> 1;
      };
      const merge = (lo: number, n: number, up: boolean) => {
        if (n <= 1) return;
        const m = greatestPow2Less(n);
        for (let i = lo; i < lo + n - m; i++) {
          const c = ctx.cmp(i, i + m);
          if ((c > 0) === up && c !== 0) ctx.swap(i, i + m);
        }
        merge(lo, m, up);
        merge(lo + m, n - m, up);
      };
      const sort = (lo: number, n: number, up: boolean) => {
        if (n <= 1) return;
        const m = n >> 1;
        sort(lo, m, !up);
        sort(lo + m, n - m, up);
        merge(lo, n, up);
      };
      sort(0, ctx.n, true);
    },
  },
  {
    id: 'odd-even-merge',
    name: 'Odd–Even Merge Sort',
    category: 'Network',
    ...NET,
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: "Batcher (1968). Iterative form; for non-power-of-two n, comparators touching the virtual +∞ padding are omitted.",
    description:
      'Batcher’s other classic network: sort two halves, then merge them by recursively merging the odd- and even-indexed subsequences and fixing neighbours with one final layer of comparators.',
    run(ctx) {
      const n = ctx.n;
      for (let p = 1; p < n; p *= 2)
        for (let k = p; k >= 1; k = Math.floor(k / 2))
          for (let j = k % p; j <= n - 1 - k; j += 2 * k)
            for (let i = 0; i <= Math.min(k - 1, n - j - k - 1); i++)
              if (Math.floor((i + j) / (2 * p)) === Math.floor((i + j + k) / (2 * p))) cx(ctx, i + j, i + j + k);
    },
  },
  {
    id: 'merge-exchange',
    name: "Batcher's Merge-Exchange Sort",
    category: 'Network',
    ...NET,
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Knuth TAOCP vol. 3, Algorithm 5.2.2M. Works directly for any n.',
    description:
      'Knuth’s formulation of Batcher’s parallel sort as a sequence of passes with offsets p, q, r, d. Each pass compares elements i and i+d whenever i AND p = r — a different comparator schedule from the recursive odd–even merge network.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      let t = 0;
      while (1 << t < n) t++;
      let p = 1 << (t - 1);
      while (p > 0) {
        let q = 1 << (t - 1);
        let r = 0;
        let d = p;
        for (;;) {
          for (let i = 0; i < n - d; i++) if ((i & p) === r) cx(ctx, i, i + d);
          if (q === p) break;
          d = q - p;
          q >>= 1;
          r = p;
        }
        p >>= 1;
      }
    },
  },
  {
    id: 'bose-nelson',
    name: 'Bose–Nelson Sort',
    category: 'Network',
    best: 'O(n^1.585)',
    average: 'O(n^1.585)',
    worst: 'O(n^1.585)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 8192,
    notes: 'Bose & Nelson (1962), one of the earliest published sorting network constructions.',
    description:
      'Recursive sorting network: sort both halves, then merge them with a recursive "bracket" construction that splits the merge into three smaller merges. Optimal for very small n, but grows faster than Batcher’s networks.',
    run(ctx) {
      const bracket = (i: number, x: number, j: number, y: number) => {
        if (x === 1 && y === 1) cx(ctx, i, j);
        else if (x === 1 && y === 2) {
          cx(ctx, i, j + 1);
          cx(ctx, i, j);
        } else if (x === 2 && y === 1) {
          cx(ctx, i, j);
          cx(ctx, i + 1, j);
        } else {
          const a = x >> 1;
          const b = x & 1 ? y >> 1 : (y + 1) >> 1;
          bracket(i, a, j, b);
          bracket(i + a, x - a, j + b, y - b);
          bracket(i + a, x - a, j, b);
        }
      };
      const sort = (i: number, m: number) => {
        if (m < 2) return;
        const a = m >> 1;
        sort(i, a);
        sort(i + a, m - a);
        bracket(i, a, i + a, m - a);
      };
      sort(0, ctx.n);
    },
  },
  {
    id: 'pairwise',
    name: 'Pairwise Sorting Network',
    category: 'Network',
    ...NET,
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Parberry (1992). Iterative formulation.',
    description:
      'Parberry’s pairwise network has the same depth and size as odd–even merge sort but a different structure: first sort pairs, then pairs of pairs … and finally run a cascade of comparators that clean up the remaining disorder.',
    run(ctx) {
      const n = ctx.n;
      let a = 1;
      while (a < n) {
        let b = a;
        let c = 0;
        while (b < n) {
          cx(ctx, b - a, b);
          c = (c + 1) % a;
          b++;
          if (c === 0) b += a;
        }
        a *= 2;
      }
      a = Math.floor(a / 4);
      let e = 1;
      while (a > 0) {
        let d = e;
        while (d > 0) {
          let b = (d + 1) * a;
          let c = 0;
          while (b < n) {
            cx(ctx, b - d * a, b);
            c = (c + 1) % a;
            b++;
            if (c === 0) b += a;
          }
          d = Math.floor(d / 2);
        }
        a = Math.floor(a / 2);
        e = e * 2 + 1;
      }
    },
  },
  {
    id: 'periodic-balanced',
    name: 'Periodic Balanced Sorting Network',
    category: 'Network',
    best: 'O(n log² n)',
    average: 'O(n log² n)',
    worst: 'O(n log² n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Dowd, Perl, Rudolph & Saks (1989). Non-power-of-two n handled by omitting comparators against virtual +∞ padding.',
    description:
      'Applies the same "balanced merging block" log₂ n times. Each block compares mirrored pairs inside blocks of halving size. Its periodicity means a single hardware block can be reused for every round.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      let N = 1;
      let lg = 0;
      while (N < n) {
        N <<= 1;
        lg++;
      }
      for (let round = 0; round < lg; round++)
        for (let size = N; size >= 2; size >>= 1)
          for (let start = 0; start < N; start += size)
            for (let j = 0; j < size >> 1; j++) {
              const x = start + j;
              const y = start + size - 1 - j;
              if (y < n) cx(ctx, x, y);
            }
    },
  },
];
