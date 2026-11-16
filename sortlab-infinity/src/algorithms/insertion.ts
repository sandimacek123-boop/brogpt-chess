import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';
import { binaryInsertionRange, insertionRange } from './helpers';

function shellSort(ctx: SortContext, gaps: number[]) {
  for (const gap of gaps) {
    for (let i = gap; i < ctx.n; i++) {
      const v = ctx.get(i);
      let j = i;
      while (j >= gap && ctx.cmpi(j - gap, v) > 0) {
        ctx.set(j, ctx.get(j - gap));
        j -= gap;
      }
      if (j !== i) ctx.set(j, v);
    }
  }
}

/** Ascending list of increments < n, returned in descending order (always ends with 1). */
function finish(seq: number[], n: number): number[] {
  const s = Array.from(new Set(seq.filter((g) => g >= 1 && g < Math.max(2, n)))).sort((a, b) => b - a);
  if (s[s.length - 1] !== 1) s.push(1);
  return s;
}

export const gapSequences: Record<string, { name: string; formula: string; worst: string; gaps(n: number): number[] }> = {
  shell: {
    name: 'Shell (1959)',
    formula: '⌊n/2ᵏ⌋',
    worst: 'Θ(n²)',
    gaps(n) {
      const g: number[] = [];
      for (let h = n >> 1; h >= 1; h >>= 1) g.push(h);
      return finish(g, n);
    },
  },
  franklazarus: {
    name: 'Frank & Lazarus (1960)',
    formula: '2⌊n/2ᵏ⁺¹⌋+1',
    worst: 'Θ(n^{3/2})',
    gaps(n) {
      const g: number[] = [];
      for (let k = 1; 2 ** k <= 2 * n; k++) g.push(2 * Math.floor(n / 2 ** (k + 1)) + 1);
      return finish(g, n);
    },
  },
  hibbard: {
    name: 'Hibbard (1963)',
    formula: '2ᵏ−1',
    worst: 'Θ(n^{3/2})',
    gaps(n) {
      const g: number[] = [];
      for (let k = 1; 2 ** k - 1 < n; k++) g.push(2 ** k - 1);
      return finish(g, n);
    },
  },
  papernov: {
    name: 'Papernov & Stasevich (1965)',
    formula: '2ᵏ+1, prefixed with 1',
    worst: 'Θ(n^{3/2})',
    gaps(n) {
      const g = [1];
      for (let k = 1; 2 ** k + 1 < n; k++) g.push(2 ** k + 1);
      return finish(g, n);
    },
  },
  pratt: {
    name: 'Pratt (1971)',
    formula: '2ᵖ3ᵠ (3-smooth numbers)',
    worst: 'Θ(n log² n)',
    gaps(n) {
      const g: number[] = [];
      for (let p = 1; p < n; p *= 2) for (let q = p; q < n; q *= 3) g.push(q);
      return finish(g, n);
    },
  },
  knuth: {
    name: 'Knuth (1973)',
    formula: '(3ᵏ−1)/2, not greater than ⌈n/3⌉',
    worst: 'Θ(n^{3/2})',
    gaps(n) {
      const g: number[] = [];
      for (let h = 1; h <= Math.max(1, Math.ceil(n / 3)); h = 3 * h + 1) g.push(h);
      return finish(g, n);
    },
  },
  sedgewick82: {
    name: 'Sedgewick (1982)',
    formula: '4ᵏ+3·2ᵏ⁻¹+1, prefixed with 1',
    worst: 'O(n^{4/3})',
    gaps(n) {
      const g = [1];
      for (let k = 1; 4 ** k + 3 * 2 ** (k - 1) + 1 < n; k++) g.push(4 ** k + 3 * 2 ** (k - 1) + 1);
      return finish(g, n);
    },
  },
  sedgewick86: {
    name: 'Sedgewick (1986)',
    formula: '9·4ᵏ−9·2ᵏ+1 and 4ᵏ−3·2ᵏ+1 interleaved',
    worst: 'O(n^{4/3})',
    gaps(n) {
      const g: number[] = [];
      for (let k = 0; k < 20; k++) {
        g.push(9 * 4 ** k - 9 * 2 ** k + 1);
        if (k >= 2) g.push(4 ** k - 3 * 2 ** k + 1);
      }
      return finish(g, n);
    },
  },
  gonnet: {
    name: 'Gonnet & Baeza-Yates (1991)',
    formula: 'h ← max(⌊5h/11⌋, 1)',
    worst: 'unknown',
    gaps(n) {
      const g: number[] = [];
      let h = n;
      while (h > 1) {
        h = Math.max(1, Math.floor((5 * h) / 11));
        g.push(h);
      }
      return finish(g, n);
    },
  },
  tokuda: {
    name: 'Tokuda (1992)',
    formula: '⌈(9ᵏ−4ᵏ)/(5·4ᵏ⁻¹)⌉',
    worst: 'unknown',
    gaps(n) {
      const g: number[] = [];
      for (let k = 1; k < 40; k++) {
        const h = Math.ceil((9 ** k - 4 ** k) / (5 * 4 ** (k - 1)));
        if (h >= n) break;
        g.push(h);
      }
      return finish(g, n);
    },
  },
  incerpi: {
    name: 'Incerpi & Sedgewick (1985)',
    formula: '1, 3, 7, 21, 48, 112, 336, 861, 1968, 4592, 13776, …',
    worst: 'O(n^{1+ε}) for ε = √(8 ln 2.5 / ln n)',
    gaps(n) {
      return finish([1, 3, 7, 21, 48, 112, 336, 861, 1968, 4592, 13776, 33936, 86961, 198768, 463792], n);
    },
  },
  ciura: {
    name: 'Ciura (2001)',
    formula: '1, 4, 10, 23, 57, 132, 301, 701, 1750, then ×2.25',
    worst: 'unknown',
    gaps(n) {
      const g = [1, 4, 10, 23, 57, 132, 301, 701, 1750];
      while (g[g.length - 1] < n) g.push(Math.floor(g[g.length - 1] * 2.25));
      return finish(g, n);
    },
  },
  lee: {
    name: 'Lee (2021)',
    formula: '⌈(γᵏ−1)/(γ−1)⌉, γ = 2.243609061420001',
    worst: 'unknown',
    gaps(n) {
      const gamma = 2.243609061420001;
      const g: number[] = [];
      for (let k = 1; k < 60; k++) {
        const h = Math.ceil((gamma ** k - 1) / (gamma - 1));
        if (h >= n) break;
        g.push(h);
      }
      return finish(g, n);
    },
  },
};

const shellVariants: AlgoDef[] = Object.entries(gapSequences).map(([key, seq]) => ({
  id: key === 'shell' ? 'shell' : `shell-${key}`,
  name: key === 'shell' ? 'Shell Sort' : `Shell Sort — ${seq.name}`,
  category: 'Insertion' as const,
  best: 'O(n log n)',
  average: 'depends on gaps',
  worst: seq.worst,
  space: 'O(1)',
  stable: false,
  inPlace: true,
  maxN: 16384,
  notes: `Gap sequence: ${seq.name}, ${seq.formula}.`,
  description:
    key === 'shell'
      ? "Donald Shell's generalisation of insertion sort: elements far apart are insertion-sorted first (h-sorting), then the gap shrinks until a final ordinary insertion sort. Uses Shell's original halving gaps."
      : `Shellsort using the ${seq.name} gap sequence (${seq.formula}). The choice of gaps decides how quickly far-away inversions disappear.`,
  run(ctx) {
    shellSort(ctx, seq.gaps(ctx.n));
  },
}));

export const insertionSorts: AlgoDef[] = [
  {
    id: 'insertion',
    name: 'Insertion Sort',
    category: 'Insertion',
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: true,
    inPlace: true,
    maxN: 2048,
    description:
      'Builds the sorted prefix one element at a time: the next element is lifted out and larger elements are shifted right until its slot is found. Excellent on small or nearly sorted data.',
    run(ctx) {
      insertionRange(ctx, 0, ctx.n);
    },
  },
  {
    id: 'binary-insertion',
    name: 'Binary Insertion Sort',
    category: 'Insertion',
    best: 'O(n log n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: true,
    inPlace: true,
    maxN: 4096,
    description:
      'Insertion sort that finds each insertion point with binary search, cutting comparisons to O(n log n). The number of element moves is unchanged.',
    run(ctx) {
      binaryInsertionRange(ctx, 0, ctx.n);
    },
  },
  {
    id: 'two-way-insertion',
    name: 'Two-Way Insertion Sort',
    category: 'Insertion',
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 4096,
    notes: 'Knuth, TAOCP vol. 3 §5.2.1.',
    description:
      'Insertion into an output area of size 2n that grows in both directions from the middle: each new element shifts whichever side requires fewer moves. Roughly halves the data movement of plain insertion sort.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const out = ctx.aux(2 * n + 1);
      let left = n;
      let right = n; // occupied [left, right]
      out.set(n, ctx.get(0));
      for (let i = 1; i < n; i++) {
        const v = ctx.get(i);
        // binary search in out[left..right] for upper bound (stable)
        let lo = left;
        let hi = right + 1;
        while (lo < hi) {
          const m = (lo + hi) >>> 1;
          if (ctx.cmpv(out.get(m), v, -1, i) > 0) hi = m;
          else lo = m + 1;
        }
        if (lo - left < right + 1 - lo) {
          for (let k = left; k < lo; k++) out.set(k - 1, out.get(k));
          left--;
          out.set(lo - 1, v);
        } else {
          for (let k = right; k >= lo; k--) out.set(k + 1, out.get(k));
          right++;
          out.set(lo, v);
        }
      }
      for (let i = 0; i < n; i++) ctx.set(i, out.get(left + i));
    },
  },
  {
    id: 'library',
    name: 'Library Sort',
    category: 'Insertion',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 8192,
    notes: 'Bender, Farach-Colton & Mosteiro (2004). Also called gapped insertion sort.',
    description:
      'Insertion sort that leaves gaps between elements, like a librarian leaving room on shelves. Elements are inserted in doubling rounds; before each round the array is re-spread so insertions rarely need long shifts.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const cap = 2 * n + 2;
      const g = ctx.aux(cap); // 0 = empty slot (values are >= 1)
      let end = 0; // one past the last occupied slot
      const rebalance = () => {
        const items: number[] = [];
        for (let k = 0; k < end; k++) if (g.data[k] !== 0) items.push(g.data[k]);
        for (let k = 0; k < end; k++) if (g.data[k] !== 0) g.set(k, 0);
        for (let k = 0; k < items.length; k++) g.set(2 * k + 1, items[k]);
        end = 2 * items.length + 1;
      };
      const insert = (v: number, srcIdx: number) => {
        let lo = 0;
        let hi = end;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          let m = mid;
          while (m < hi && g.data[m] === 0) m++;
          if (m === hi) {
            hi = mid;
            continue;
          }
          if (ctx.cmpv(g.data[m], v, -1, srcIdx) <= 0) lo = m + 1;
          else hi = mid;
        }
        let target = lo;
        if (target < cap && g.data[target] === 0) {
          g.set(target, v);
        } else {
          let e = target;
          while (e < cap && g.data[e] !== 0) e++;
          if (e < cap) {
            for (let k = e; k > target; k--) g.set(k, g.data[k - 1]);
            g.set(target, v);
          } else {
            let s = target - 1;
            while (g.data[s] !== 0) s--;
            for (let k = s; k < target - 1; k++) g.set(k, g.data[k + 1]);
            target = target - 1;
            g.set(target, v);
          }
        }
        if (target + 1 > end) end = target + 1;
        while (end < cap && g.data[end] !== 0) end++;
      };
      g.set(0, ctx.get(0));
      end = 1;
      let inserted = 1;
      let round = 1;
      while (inserted < n) {
        rebalance();
        const stop = Math.min(n, inserted + round);
        for (; inserted < stop; inserted++) insert(ctx.get(inserted), inserted);
        round *= 2;
      }
      let w = 0;
      for (let k = 0; k < cap && w < n; k++) if (g.data[k] !== 0) ctx.set(w++, g.data[k]);
    },
  },
  ...shellVariants,
];
