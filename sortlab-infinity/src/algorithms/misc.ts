import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';
import { insertionRange } from './helpers';

function isSortedCounted(ctx: SortContext) {
  for (let i = 1; i < ctx.n; i++) if (ctx.cmp(i - 1, i) > 0) return false;
  return true;
}

export const miscSorts: AlgoDef[] = [
  {
    id: 'samplesort',
    name: 'Samplesort',
    category: 'Quick',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: false,
    inPlace: false,
    maxN: 65536,
    notes: 'Frazer & McKellar (1970). 16 buckets, 3× oversampling, separate equality buckets.',
    description:
      'Generalises quicksort to many pivots: a random sample is sorted to pick 15 splitters, every element is classified by binary search into a bucket, buckets are written out contiguously, and each bucket is sorted recursively.',
    run(ctx) {
      const buf = ctx.aux(ctx.n);
      const rec = (lo: number, hi: number) => {
        const len = hi - lo;
        if (len <= 32) {
          insertionRange(ctx, lo, hi);
          return;
        }
        const k = 16;
        const s = k * 3;
        const sample: number[] = [];
        for (let i = 0; i < s; i++) sample.push(ctx.get(lo + Math.floor(ctx.random() * len)));
        for (let i = 1; i < s; i++) {
          const v = sample[i];
          let j = i - 1;
          while (j >= 0 && ctx.cmpv(sample[j], v) > 0) {
            sample[j + 1] = sample[j];
            j--;
          }
          sample[j + 1] = v;
        }
        const spl: number[] = [];
        for (let i = 1; i < k; i++) spl.push(sample[i * 3]);
        // bucket ids: 2*i = strictly between spl[i-1] and spl[i]; 2*i+1 = equal to spl[i]
        const nb = 2 * spl.length + 1;
        const cls = new Int32Array(len);
        const count = new Int32Array(nb + 1);
        for (let i = lo; i < hi; i++) {
          let l = 0;
          let r = spl.length;
          while (l < r) {
            const m = (l + r) >>> 1;
            if (ctx.cmpi(i, spl[m]) > 0) l = m + 1;
            else r = m;
          }
          let b = 2 * l;
          if (l < spl.length && ctx.cmpi(i, spl[l]) === 0) b = 2 * l + 1;
          cls[i - lo] = b;
          count[b + 1]++;
        }
        for (let b = 1; b <= nb; b++) count[b] += count[b - 1];
        const starts = count.slice();
        for (let i = lo; i < hi; i++) buf.set(lo + count[cls[i - lo]]++, ctx.get(i));
        for (let i = lo; i < hi; i++) ctx.set(i, buf.data[i]);
        for (let b = 0; b < nb; b += 2) rec(lo + starts[b], lo + starts[b + 1]);
      };
      rec(0, ctx.n);
    },
  },
  {
    id: 'cycle',
    name: 'Cycle Sort',
    category: 'Selection',
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 2048,
    notes: 'Haddon (1990). Write-optimal.',
    description:
      'Decomposes the permutation into cycles and rotates each cycle into place. Every element is written at most once — the theoretical minimum number of writes — which matters for media like flash memory.',
    run(ctx) {
      const n = ctx.n;
      for (let start = 0; start < n - 1; start++) {
        let item = ctx.get(start);
        let pos = start;
        for (let i = start + 1; i < n; i++) if (ctx.cmpi(i, item) < 0) pos++;
        if (pos === start) continue;
        while (ctx.cmpi(pos, item) === 0) pos++;
        let t = ctx.get(pos);
        ctx.set(pos, item);
        item = t;
        while (pos !== start) {
          pos = start;
          for (let i = start + 1; i < n; i++) if (ctx.cmpi(i, item) < 0) pos++;
          while (ctx.cmpi(pos, item) === 0) pos++;
          t = ctx.get(pos);
          ctx.set(pos, item);
          item = t;
        }
      }
    },
  },
  {
    id: 'pancake',
    name: 'Pancake Sort',
    category: 'Selection',
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 2048,
    notes: 'Uses at most 2n − 3 prefix reversals ("flips").',
    description:
      'The only allowed move is flipping a prefix of the stack, like a spatula under a pile of pancakes. Find the largest unsorted pancake, flip it to the top, then flip it down into place.',
    run(ctx) {
      for (let size = ctx.n; size > 1; size--) {
        let m = 0;
        for (let i = 1; i < size; i++) if (ctx.cmp(i, m) > 0) m = i;
        if (m === size - 1) continue;
        if (m > 0) ctx.reverse(0, m);
        ctx.reverse(0, size - 1);
      }
    },
  },
  {
    id: 'stooge',
    name: 'Stooge Sort',
    category: 'Impractical',
    best: 'O(n^2.71)',
    average: 'O(n^2.71)',
    worst: 'O(n^2.71)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 256,
    slow: true,
    description:
      'Swap the ends if needed, then recursively sort the first 2/3, the last 2/3, and the first 2/3 again. Correct but famously inefficient: O(n^(log 3 / log 1.5)) ≈ O(n^2.71).',
    run(ctx) {
      const rec = (i: number, j: number) => {
        if (ctx.cmp(i, j) > 0) ctx.swap(i, j);
        if (j - i + 1 > 2) {
          const t = Math.floor((j - i + 1) / 3);
          rec(i, j - t);
          rec(i + t, j);
          rec(i, j - t);
        }
      };
      if (ctx.n > 1) rec(0, ctx.n - 1);
    },
  },
  {
    id: 'slow',
    name: 'Slowsort',
    category: 'Impractical',
    best: 'Ω(n^(log n / (2+ε)))',
    average: 'Ω(n^(log n / (2+ε)))',
    worst: 'Ω(n^(log n / (2+ε)))',
    space: 'O(n)',
    stable: false,
    inPlace: true,
    maxN: 64,
    slow: true,
    notes: 'Broder & Stolfi, "Pessimal Algorithms and Simplexity Analysis" (1984).',
    description:
      'A "multiply and surrender" parody of divide and conquer: recursively sort both halves, move the larger of the two maxima to the end, then recursively slowsort everything except that last element. Not even polynomial.',
    run(ctx) {
      const rec = (i: number, j: number) => {
        if (i >= j) return;
        const m = (i + j) >> 1;
        rec(i, m);
        rec(m + 1, j);
        if (ctx.cmp(j, m) < 0) ctx.swap(j, m);
        rec(i, j - 1);
      };
      rec(0, ctx.n - 1);
    },
  },
  {
    id: 'bogo',
    name: 'Bogo Sort',
    category: 'Impractical',
    best: 'O(n)',
    average: 'O(n·n!)',
    worst: 'unbounded',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 9,
    slow: true,
    notes: 'Random shuffles until sorted. Seeded, so runs are reproducible.',
    description:
      'Checks whether the array is sorted; if not, shuffles it completely at random and tries again. Expected n! shuffles — only practical for single-digit sizes.',
    run(ctx) {
      while (!isSortedCounted(ctx)) {
        for (let i = ctx.n - 1; i > 0; i--) ctx.swap(i, Math.floor(ctx.random() * (i + 1)));
      }
    },
  },
  {
    id: 'bozo',
    name: 'Bozo Sort',
    category: 'Impractical',
    best: 'O(n)',
    average: 'O(n·n!)',
    worst: 'unbounded',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 8,
    slow: true,
    description:
      'Even lazier than bogosort: swap two random elements, check whether the array is sorted, repeat. Each step can also undo progress.',
    run(ctx) {
      while (!isSortedCounted(ctx)) {
        const i = Math.floor(ctx.random() * ctx.n);
        const j = Math.floor(ctx.random() * ctx.n);
        ctx.swap(i, j);
      }
    },
  },
  {
    id: 'permutation',
    name: 'Permutation Sort',
    category: 'Impractical',
    best: 'O(n)',
    average: 'O(n·n!)',
    worst: 'O(n·n!)',
    space: 'O(n)',
    stable: false,
    inPlace: true,
    maxN: 9,
    slow: true,
    notes: 'Deterministic bogosort: enumerates permutations with Heap’s algorithm.',
    description:
      'Tries every permutation of the input in a systematic order (Heap’s algorithm, one swap per step) and stops at the first sorted one. Guaranteed to finish, but after up to n! permutations.',
    run(ctx) {
      const n = ctx.n;
      if (isSortedCounted(ctx)) return;
      const c = new Int32Array(n);
      let i = 1;
      while (i < n) {
        if (c[i] < i) {
          if (i % 2 === 0) ctx.swap(0, i);
          else ctx.swap(c[i], i);
          if (isSortedCounted(ctx)) return;
          c[i]++;
          i = 1;
        } else {
          c[i] = 0;
          i++;
        }
      }
    },
  },
];
