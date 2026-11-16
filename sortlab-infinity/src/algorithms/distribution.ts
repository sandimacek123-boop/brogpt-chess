import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';
import { insertionRange, minMax } from './helpers';

function digitCount(max: number, base: number) {
  let d = 1;
  while (base ** d <= max) d++;
  return d;
}
const digitOf = (v: number, base: number, pos: number) => Math.floor(v / base ** pos) % base;

function lsdRadix(ctx: SortContext, base: number) {
  const n = ctx.n;
  if (n < 2) return;
  const [, max] = minMax(ctx);
  const digits = digitCount(max, base);
  const out = ctx.aux(n);
  const count = new Int32Array(base);
  for (let d = 0; d < digits; d++) {
    count.fill(0);
    for (let i = 0; i < n; i++) count[digitOf(ctx.get(i), base, d)]++;
    for (let b = 1; b < base; b++) count[b] += count[b - 1];
    for (let i = n - 1; i >= 0; i--) {
      const v = ctx.get(i);
      out.set(--count[digitOf(v, base, d)], v);
    }
    for (let i = 0; i < n; i++) ctx.set(i, out.data[i]);
  }
}

function msdRadix(ctx: SortContext, base: number) {
  const n = ctx.n;
  if (n < 2) return;
  const [, max] = minMax(ctx);
  const out = ctx.aux(n);
  const rec = (lo: number, hi: number, d: number) => {
    if (hi - lo < 2 || d < 0) return;
    const count = new Int32Array(base + 1);
    for (let i = lo; i < hi; i++) count[digitOf(ctx.get(i), base, d) + 1]++;
    for (let b = 1; b <= base; b++) count[b] += count[b - 1];
    const starts = count.slice();
    for (let i = lo; i < hi; i++) {
      const v = ctx.get(i);
      out.set(lo + count[digitOf(v, base, d)]++, v);
    }
    for (let i = lo; i < hi; i++) ctx.set(i, out.data[i]);
    for (let b = 0; b < base; b++) rec(lo + starts[b], lo + starts[b + 1], d - 1);
  };
  rec(0, n, digitCount(max, base) - 1);
}

const RADIX = (base: number, kind: 'LSD' | 'MSD'): AlgoDef => ({
  id: `radix-${kind.toLowerCase()}-${base}`,
  name: `${kind} Radix Sort (Base ${base})`,
  category: 'Distribution',
  best: 'O(w·n)',
  average: 'O(w·n)',
  worst: 'O(w·n)',
  space: `O(n + ${base})`,
  stable: true,
  inPlace: false,
  maxN: 65536,
  notes: `w = number of base-${base} digits of the largest key. Non-comparison sort.`,
  description:
    kind === 'LSD'
      ? `Least-significant-digit radix sort in base ${base}: a stable counting sort on the lowest digit, then the next digit, and so on. After the final (most significant) pass the array is sorted. Uses no comparisons at all.`
      : `Most-significant-digit radix sort in base ${base}: distributes elements into ${base} buckets by their top digit, then recursively sorts each bucket by the next digit. Uses no comparisons.`,
  run(ctx) {
    if (kind === 'LSD') lsdRadix(ctx, base);
    else msdRadix(ctx, base);
  },
});

export const distributionSorts: AlgoDef[] = [
  {
    id: 'counting',
    name: 'Counting Sort',
    category: 'Distribution',
    best: 'O(n+k)',
    average: 'O(n+k)',
    worst: 'O(n+k)',
    space: 'O(n+k)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: 'k = range of key values. Stable prefix-sum version.',
    description:
      'Counts how many times each key occurs, turns the counts into starting positions with a prefix sum, then places every element directly into its final slot (scanning right to left to keep it stable).',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const [min, max] = minMax(ctx);
      const count = ctx.aux(max - min + 2);
      for (let i = 0; i < n; i++) {
        const v = ctx.get(i) - min + 1;
        count.set(v, count.data[v] + 1);
      }
      for (let k = 1; k < count.length; k++) count.set(k, count.data[k] + count.data[k - 1]);
      const out = ctx.aux(n);
      for (let i = n - 1; i >= 0; i--) {
        const v = ctx.get(i);
        const pos = count.data[v - min + 1] - 1;
        count.set(v - min + 1, pos);
        out.set(pos, v);
      }
      for (let i = 0; i < n; i++) ctx.set(i, out.data[i]);
    },
  },
  {
    id: 'pigeonhole',
    name: 'Pigeonhole Sort',
    category: 'Distribution',
    best: 'O(n+k)',
    average: 'O(n+k)',
    worst: 'O(n+k)',
    space: 'O(k)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    description:
      'Creates one "pigeonhole" per possible key value, drops every element into its hole, then walks the holes in order writing the elements back. Ideal when the key range is about the same as n.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const [min, max] = minMax(ctx);
      const holes = ctx.aux(max - min + 1);
      for (let i = 0; i < n; i++) {
        const h = ctx.get(i) - min;
        holes.set(h, holes.data[h] + 1);
      }
      let k = 0;
      for (let h = 0; h < holes.length; h++) for (let c = holes.data[h]; c > 0; c--) ctx.set(k++, h + min);
    },
  },
  {
    id: 'bucket',
    name: 'Bucket Sort',
    category: 'Distribution',
    best: 'O(n+k)',
    average: 'O(n + n²/k + k)',
    worst: 'O(n²)',
    space: 'O(n+k)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: '√n buckets, each finished with insertion sort.',
    description:
      'Scatters elements into √n equal-width value buckets, writes the buckets back in order, then insertion-sorts each bucket. Very fast when keys are uniformly distributed.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const [min, max] = minMax(ctx);
      const k = Math.max(1, Math.ceil(Math.sqrt(n)));
      const range = max - min + 1;
      const bucketOf = (v: number) => Math.floor(((v - min) * k) / range);
      const count = new Int32Array(k + 1);
      for (let i = 0; i < n; i++) count[bucketOf(ctx.get(i)) + 1]++;
      for (let b = 1; b <= k; b++) count[b] += count[b - 1];
      const starts = count.slice();
      const out = ctx.aux(n);
      for (let i = 0; i < n; i++) {
        const v = ctx.get(i);
        out.set(count[bucketOf(v)]++, v);
      }
      for (let i = 0; i < n; i++) ctx.set(i, out.data[i]);
      for (let b = 0; b < k; b++) insertionRange(ctx, starts[b], starts[b + 1]);
    },
  },
  RADIX(2, 'LSD'),
  RADIX(4, 'LSD'),
  RADIX(10, 'LSD'),
  RADIX(16, 'LSD'),
  RADIX(4, 'MSD'),
  RADIX(10, 'MSD'),
  {
    id: 'american-flag',
    name: 'American Flag Sort',
    category: 'Distribution',
    best: 'O(w·n)',
    average: 'O(w·n)',
    worst: 'O(w·n)',
    space: 'O(base)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: 'McIlroy, Bostic & McIlroy (1993). In-place MSD radix sort, base 16.',
    description:
      'An in-place MSD radix sort. After counting digit frequencies it permutes elements directly into their bucket with cycle-leader swaps (no output buffer), then recurses into each of the 16 buckets on the next digit.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const base = 16;
      const [, max] = minMax(ctx);
      const rec = (lo: number, hi: number, d: number) => {
        if (hi - lo < 2 || d < 0) return;
        const count = new Int32Array(base);
        for (let i = lo; i < hi; i++) count[digitOf(ctx.get(i), base, d)]++;
        const start = new Int32Array(base + 1);
        for (let b = 0; b < base; b++) start[b + 1] = start[b] + count[b];
        const next = start.slice(0, base);
        for (let b = 0; b < base; b++) {
          while (next[b] < start[b + 1]) {
            const dg = digitOf(ctx.get(lo + next[b]), base, d);
            if (dg === b) next[b]++;
            else {
              ctx.swap(lo + next[b], lo + next[dg]);
              next[dg]++;
            }
          }
        }
        for (let b = 0; b < base; b++) rec(lo + start[b], lo + start[b + 1], d - 1);
      };
      rec(0, n, digitCount(max, base) - 1);
    },
  },
  {
    id: 'radix-exchange',
    name: 'Binary Radix Exchange Sort',
    category: 'Distribution',
    best: 'O(w·n)',
    average: 'O(w·n)',
    worst: 'O(w·n)',
    space: 'O(w)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: 'Also called binary quicksort (Knuth §5.2.2).',
    description:
      'Quicksort-like partitioning on bits instead of comparisons: keys whose top bit is 0 are swapped to the left, 1s to the right, then each side is recursively split on the next bit.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const [, max] = minMax(ctx);
      const rec = (lo: number, hi: number, bit: number) => {
        if (hi <= lo || bit < 0) return;
        let i = lo;
        let j = hi;
        while (i <= j) {
          while (i <= j && ((ctx.get(i) >> bit) & 1) === 0) i++;
          while (i <= j && ((ctx.get(j) >> bit) & 1) === 1) j--;
          if (i < j) ctx.swap(i, j);
        }
        rec(lo, j, bit - 1);
        rec(i, hi, bit - 1);
      };
      rec(0, n - 1, 31 - Math.clz32(Math.max(1, max)));
    },
  },
  {
    id: 'flash',
    name: 'Flashsort',
    category: 'Distribution',
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n²)',
    space: 'O(m)',
    stable: false,
    inPlace: true,
    maxN: 65536,
    notes: 'Neubert (1998), m = 0.43n classes.',
    description:
      'Estimates each element’s final position by linear interpolation between min and max, sorts elements into m ≈ 0.43n classes in place by following permutation cycles, and finishes with insertion sort.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const m = Math.max(2, Math.floor(0.43 * n));
      let minV = ctx.get(0);
      let maxI = 0;
      for (let i = 1; i < n; i++) {
        if (ctx.cmpi(i, minV) < 0) minV = ctx.get(i);
        if (ctx.cmp(i, maxI) > 0) maxI = i;
      }
      const maxV = ctx.get(maxI);
      if (maxV === minV) return;
      const K = (v: number) => Math.floor(((m - 1) * (v - minV)) / (maxV - minV));
      const L = ctx.aux(m);
      for (let i = 0; i < n; i++) {
        const k = K(ctx.get(i));
        L.set(k, L.data[k] + 1);
      }
      for (let k = 1; k < m; k++) L.set(k, L.data[k] + L.data[k - 1]);
      ctx.swap(maxI, 0);
      let moves = 0;
      let j = 0;
      let k = m - 1;
      while (moves < n - 1) {
        while (j > L.data[k] - 1) {
          j++;
          k = K(ctx.get(j));
        }
        let flash = ctx.get(j);
        while (j !== L.data[k]) {
          k = K(flash);
          const pos = L.data[k] - 1;
          const hold = ctx.get(pos);
          ctx.set(pos, flash);
          flash = hold;
          L.set(k, L.data[k] - 1);
          moves++;
        }
      }
      insertionRange(ctx, 0, n);
    },
  },
  {
    id: 'proxmap',
    name: 'Proxmap Sort',
    category: 'Distribution',
    best: 'O(n)',
    average: 'O(n)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: 'Standish & Jacobson. Also called address-calculation sort.',
    description:
      'Computes a "proximity map" from a map key: each key range gets a reserved subarray sized by its hit count. Every element is then insertion-sorted into its own small subarray of the output.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const [min, max] = minMax(ctx);
      const range = max - min + 1;
      const mapKey = (v: number) => Math.floor(((v - min) * n) / range);
      const H = new Int32Array(n);
      for (let i = 0; i < n; i++) H[mapKey(ctx.get(i))]++;
      const P = new Int32Array(n);
      for (let k = 1; k < n; k++) P[k] = P[k - 1] + H[k - 1];
      const out = ctx.aux(n); // 0 = empty (keys are >= 1)
      for (let i = 0; i < n; i++) {
        const v = ctx.get(i);
        const mk = mapKey(v);
        const start = P[mk];
        const end = start + H[mk];
        let pos = start;
        while (pos < end && out.data[pos] !== 0 && ctx.cmpv(out.data[pos], v, -1, i) <= 0) pos++;
        let e = pos;
        while (out.data[e] !== 0) e++;
        for (let q = e; q > pos; q--) out.set(q, out.data[q - 1]);
        out.set(pos, v);
      }
      for (let i = 0; i < n; i++) ctx.set(i, out.data[i]);
    },
  },
  {
    id: 'interpolation',
    name: 'Interpolation Sort',
    category: 'Distribution',
    best: 'O(n)',
    average: 'O(n log log n)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: 'Recursive bucket sort with one bucket per element (interpolation formula).',
    description:
      'A recursive bucket sort: each range is split into as many buckets as it has elements, with the bucket chosen by interpolating the key between the range minimum and maximum. Buckets are recursively processed until each holds one value.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const stack: [number, number][] = [[0, n]];
      const out = ctx.aux(n);
      while (stack.length) {
        const [start, size] = stack.pop()!;
        if (size < 2) continue;
        const end = start + size;
        let min = ctx.get(start);
        let max = min;
        for (let i = start + 1; i < end; i++) {
          if (ctx.cmpi(i, min) < 0) min = ctx.get(i);
          else if (ctx.cmpi(i, max) > 0) max = ctx.get(i);
        }
        if (min === max) continue;
        const idx = (v: number) => Math.floor(((v - min) * (size - 1)) / (max - min));
        const count = new Int32Array(size + 1);
        for (let i = start; i < end; i++) count[idx(ctx.get(i)) + 1]++;
        for (let b = 1; b <= size; b++) count[b] += count[b - 1];
        const starts = count.slice();
        for (let i = start; i < end; i++) {
          const v = ctx.get(i);
          out.set(start + count[idx(v)]++, v);
        }
        for (let i = start; i < end; i++) ctx.set(i, out.data[i]);
        for (let b = size - 1; b >= 0; b--) {
          const s = starts[b + 1] - starts[b];
          if (s > 1) stack.push([start + starts[b], s]);
        }
      }
    },
  },
  {
    id: 'gravity',
    name: 'Gravity (Bead) Sort',
    category: 'Distribution',
    best: 'O(n·k)',
    average: 'O(n·k)',
    worst: 'O(n·k)',
    space: 'O(k)',
    stable: false,
    inPlace: false,
    maxN: 4096,
    notes: 'Arulanandham, Calude & Dinneen (2002). Simulated in software; k = maximum key. Positive integers only.',
    description:
      'Models each number as a row of beads on vertical rods. Letting the beads fall under "gravity" stacks them so each rod’s count is fixed; reading the rows back from the bottom yields the sorted order. Each bead drop is counted as an auxiliary write.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const [, max] = minMax(ctx);
      const rods = ctx.aux(max);
      for (let i = 0; i < n; i++) {
        const v = ctx.get(i);
        for (let c = 0; c < v; c++) rods.set(c, rods.data[c] + 1);
      }
      for (let r = 0; r < n; r++) {
        let beads = 0;
        while (beads < max && rods.data[beads] > r) beads++;
        ctx.set(n - 1 - r, beads);
      }
    },
  },
];
