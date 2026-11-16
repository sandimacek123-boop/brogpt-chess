import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';
import { heapSortRange } from './helpers';

function siftDownBottomUp(ctx: SortContext, i: number, end: number) {
  // Leaf search: follow the larger child to a leaf (one comparison per level).
  let j = i;
  while (2 * j + 2 < end) j = ctx.cmp(2 * j + 1, 2 * j + 2) > 0 ? 2 * j + 1 : 2 * j + 2;
  if (2 * j + 1 < end) j = 2 * j + 1;
  // Climb back up until a node not smaller than the root value is found.
  while (j > i && ctx.cmp(i, j) > 0) j = (j - 1) >> 1;
  if (j === i) return;
  // Rotate values along the path i → j.
  let x = ctx.get(i);
  while (j > i) {
    const t = ctx.get(j);
    ctx.set(j, x);
    x = t;
    j = (j - 1) >> 1;
  }
  ctx.set(i, x);
}

function siftDownD(ctx: SortContext, d: number, root: number, size: number) {
  for (;;) {
    const first = d * root + 1;
    if (first >= size) return;
    let best = first;
    for (let c = first + 1; c < Math.min(first + d, size); c++) if (ctx.cmp(c, best) > 0) best = c;
    if (ctx.cmp(root, best) < 0) {
      ctx.swap(root, best);
      root = best;
    } else return;
  }
}

export const selectionSorts: AlgoDef[] = [
  {
    id: 'selection',
    name: 'Selection Sort',
    category: 'Selection',
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 2048,
    description:
      'Finds the minimum of the unsorted suffix and swaps it into place, growing the sorted prefix by one each pass. Never more than n−1 swaps, but always ~n²/2 comparisons.',
    run(ctx) {
      for (let i = 0; i < ctx.n - 1; i++) {
        let m = i;
        for (let j = i + 1; j < ctx.n; j++) if (ctx.cmp(j, m) < 0) m = j;
        ctx.swap(i, m);
      }
    },
  },
  {
    id: 'double-selection',
    name: 'Double Selection Sort',
    category: 'Selection',
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 2048,
    notes: 'Also known as min–max selection sort or cocktail selection.',
    description:
      'Selection sort that finds both the minimum and the maximum of the unsorted middle in each pass, placing one at each end and halving the number of passes.',
    run(ctx) {
      let lo = 0;
      let hi = ctx.n - 1;
      while (lo < hi) {
        let mn = lo;
        let mx = lo;
        for (let j = lo + 1; j <= hi; j++) {
          if (ctx.cmp(j, mn) < 0) mn = j;
          else if (ctx.cmp(j, mx) > 0) mx = j;
        }
        ctx.swap(lo, mn);
        if (mx === lo) mx = mn;
        ctx.swap(hi, mx);
        lo++;
        hi--;
      }
    },
  },
  {
    id: 'bingo',
    name: 'Bingo Sort',
    category: 'Selection',
    best: 'O(n+m²)',
    average: 'O(n·m)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 2048,
    notes: 'm = number of distinct values.',
    description:
      'A selection sort tuned for many duplicates: every pass moves all copies of the current maximum value to the end at once, so the number of passes equals the number of distinct values.',
    run(ctx) {
      let max = ctx.n - 1;
      if (max < 1) return;
      let nextMax = ctx.get(max);
      for (let i = max - 1; i >= 0; i--) if (ctx.cmpi(i, nextMax) > 0) nextMax = ctx.get(i);
      while (max > 0 && ctx.cmpi(max, nextMax) === 0) max--;
      while (max > 0) {
        const value = nextMax;
        nextMax = ctx.get(max);
        for (let i = max - 1; i >= 0; i--) {
          const c = ctx.cmpi(i, value);
          if (c === 0) {
            ctx.swap(i, max);
            max--;
          } else if (ctx.cmpi(i, nextMax) > 0) nextMax = ctx.get(i);
        }
        while (max > 0 && ctx.cmpi(max, nextMax) === 0) max--;
      }
    },
  },
  {
    id: 'heap',
    name: 'Heap Sort',
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: "Floyd's bottom-up O(n) heap construction.",
    description:
      'Builds a binary max-heap inside the array, then repeatedly swaps the root (the maximum) to the end and sifts the new root down. Guaranteed O(n log n) with O(1) extra memory.',
    run(ctx) {
      heapSortRange(ctx, 0, ctx.n);
    },
  },
  {
    id: 'heap-williams',
    name: "Heap Sort — Williams' Construction",
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: "J. W. J. Williams' original 1964 heapsort: the heap is built by repeated sift-up insertion.",
    description:
      'The original heapsort. Instead of Floyd’s bottom-up heapify, each element is appended to the heap and sifted up toward the root, giving an O(n log n) construction phase.',
    run(ctx) {
      const n = ctx.n;
      for (let i = 1; i < n; i++) {
        let c = i;
        while (c > 0) {
          const p = (c - 1) >> 1;
          if (ctx.cmp(p, c) < 0) {
            ctx.swap(p, c);
            c = p;
          } else break;
        }
      }
      for (let end = n - 1; end > 0; end--) {
        ctx.swap(0, end);
        siftDownD(ctx, 2, 0, end);
      }
    },
  },
  {
    id: 'heap-bottomup',
    name: 'Bottom-Up Heap Sort',
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Wegener (1993). Leaf-search sift-down.',
    description:
      'Heapsort variant that first descends to a leaf along the path of larger children, then climbs back up to find where the sifted element belongs. Needs about n log n + O(n) comparisons instead of ~2n log n.',
    run(ctx) {
      const n = ctx.n;
      for (let i = (n >> 1) - 1; i >= 0; i--) siftDownBottomUp(ctx, i, n);
      for (let end = n - 1; end > 0; end--) {
        ctx.swap(0, end);
        siftDownBottomUp(ctx, 0, end);
      }
    },
  },
  {
    id: 'heap-ternary',
    name: 'Ternary Heap Sort',
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'd-ary heap with d = 3.',
    description:
      'Heapsort on a 3-ary heap: each node has three children, making the tree shallower (log₃ n levels) at the cost of more comparisons per level.',
    run(ctx) {
      const n = ctx.n;
      for (let i = Math.floor((n - 2) / 3); i >= 0; i--) siftDownD(ctx, 3, i, n);
      for (let end = n - 1; end > 0; end--) {
        ctx.swap(0, end);
        siftDownD(ctx, 3, 0, end);
      }
    },
  },
  {
    id: 'weak-heap',
    name: 'Weak Heap Sort',
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n) bits',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Dutton (1993). Uses one "reverse" bit per element.',
    description:
      'Uses a weak heap, a relaxed heap where each node only dominates its right subtree. Child order is flipped with a bit instead of moving data, giving at most n log n + 0.1n comparisons.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const r = ctx.aux(n);
      const gparent = (j: number) => {
        while ((j & 1) === r.data[j >> 1]) j >>= 1;
        return j >> 1;
      };
      const merge = (i: number, j: number) => {
        if (ctx.cmp(i, j) < 0) {
          r.set(j, r.data[j] ^ 1);
          ctx.swap(i, j);
        }
      };
      for (let j = n - 1; j > 0; j--) merge(gparent(j), j);
      for (let m = n - 1; m >= 2; m--) {
        ctx.swap(0, m);
        let x = 1;
        let y: number;
        while ((y = 2 * x + r.data[x]) < m) x = y;
        while (x > 0) {
          merge(0, x);
          x >>= 1;
        }
      }
      ctx.swap(0, 1);
    },
  },
  {
    id: 'smooth',
    name: 'Smoothsort',
    category: 'Selection',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Dijkstra (1981). Leonardo heaps.',
    description:
      'Dijkstra’s adaptive heapsort. The array is covered by a forest of Leonardo-number-sized heaps whose roots stay sorted, so nearly sorted input approaches O(n) while the worst case remains O(n log n).',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const L: number[] = [1, 1];
      while (L[L.length - 1] < n) L.push(L[L.length - 1] + L[L.length - 2] + 1);
      const orders: number[] = [];

      const siftInTree = (root: number, order: number) => {
        let i = root;
        let k = order;
        while (k >= 2) {
          const right = i - 1;
          const left = i - 1 - L[k - 2];
          let big = left;
          let bigK = k - 1;
          if (ctx.cmp(right, left) > 0) {
            big = right;
            bigK = k - 2;
          }
          if (ctx.cmp(big, i) > 0) {
            ctx.swap(big, i);
            i = big;
            k = bigK;
          } else break;
        }
      };

      const trinkle = (root: number, idx: number) => {
        let i = root;
        let cur = idx;
        while (cur > 0) {
          const j = i - L[orders[cur]];
          if (ctx.cmp(j, i) <= 0) break;
          const k = orders[cur];
          if (k >= 2) {
            const right = i - 1;
            const left = i - 1 - L[k - 2];
            if (ctx.cmp(j, right) <= 0 || ctx.cmp(j, left) <= 0) break;
          }
          ctx.swap(i, j);
          i = j;
          cur--;
        }
        siftInTree(i, orders[cur]);
      };

      for (let i = 0; i < n; i++) {
        const m = orders.length;
        if (m >= 2 && orders[m - 2] === orders[m - 1] + 1) {
          orders.pop();
          orders[m - 2]++;
        } else if (m >= 1 && orders[m - 1] === 1) orders.push(0);
        else orders.push(1);
        trinkle(i, orders.length - 1);
      }
      for (let i = n - 1; i > 0; i--) {
        const k = orders.pop()!;
        if (k >= 2) {
          orders.push(k - 1);
          trinkle(i - 1 - L[k - 2], orders.length - 1);
          orders.push(k - 2);
          trinkle(i - 1, orders.length - 1);
        }
      }
    },
  },
  {
    id: 'tournament',
    name: 'Tournament Sort',
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: false,
    inPlace: false,
    maxN: 32768,
    description:
      'Plays a knockout tournament (winner tree) over all elements. The champion is the minimum; it is output, replaced by +∞, and only the matches along its path are replayed.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      let size = 1;
      while (size < n) size <<= 1;
      const vals = ctx.aux(n);
      for (let i = 0; i < n; i++) vals.set(i, ctx.get(i));
      const INF = 0x7fffffff;
      const tree = ctx.aux(2 * size); // stores leaf index (or -1)
      const valOf = (leaf: number) => (leaf < 0 ? INF : vals.data[leaf]);
      const play = (a: number, b: number) => {
        if (a < 0) return b;
        if (b < 0) return a;
        const va = valOf(a);
        const vb = valOf(b);
        if (va === INF) return b;
        if (vb === INF) return a;
        return ctx.cmpv(va, vb, a, b) <= 0 ? a : b;
      };
      for (let i = 0; i < size; i++) tree.set(size + i, i < n ? i : -1);
      for (let i = size - 1; i >= 1; i--) tree.set(i, play(tree.data[2 * i], tree.data[2 * i + 1]));
      for (let k = 0; k < n; k++) {
        const w = tree.data[1];
        ctx.set(k, vals.data[w]);
        vals.set(w, INF);
        let p = (size + w) >> 1;
        while (p >= 1) {
          tree.set(p, play(tree.data[2 * p], tree.data[2 * p + 1]));
          p >>= 1;
        }
      }
    },
  },
  {
    id: 'selection-stable',
    name: 'Stable Selection Sort',
    category: 'Selection',
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: true,
    inPlace: true,
    maxN: 2048,
    notes: 'Inserts the minimum by shifting instead of swapping.',
    description:
      'Selection sort made stable: rather than swapping the minimum into place (which can jump an element past its equals), the minimum is lifted out and the elements before it are shifted right by one.',
    run(ctx) {
      for (let i = 0; i < ctx.n - 1; i++) {
        let m = i;
        for (let j = i + 1; j < ctx.n; j++) if (ctx.cmp(j, m) < 0) m = j;
        if (m === i) continue;
        const v = ctx.get(m);
        for (let k = m; k > i; k--) ctx.set(k, ctx.get(k - 1));
        ctx.set(i, v);
      }
    },
  },
  {
    id: 'quadratic-selection',
    name: 'Quadratic Selection Sort',
    category: 'Selection',
    best: 'O(n√n)',
    average: 'O(n√n)',
    worst: 'O(n√n)',
    space: 'O(n)',
    stable: false,
    inPlace: false,
    maxN: 8192,
    notes: 'Friend (1956); Knuth TAOCP vol. 3 §5.2.3.',
    description:
      'Splits the input into √n groups and remembers the maximum of each. The overall maximum is the largest group maximum; after outputting it only that one group has to be rescanned, giving O(n√n) comparisons — a stepping stone between selection sort and tournament sort.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const vals = ctx.aux(n);
      for (let i = 0; i < n; i++) vals.set(i, ctx.get(i));
      const V = vals.data;
      const g = Math.ceil(Math.sqrt(n));
      const groups = Math.ceil(n / g);
      const alive = new Uint8Array(n).fill(1);
      const best = new Int32Array(groups).fill(-1);
      const rescan = (grp: number) => {
        let b = -1;
        for (let i = grp * g; i < Math.min(n, (grp + 1) * g); i++)
          if (alive[i] && (b < 0 || ctx.cmpv(V[i], V[b], i, b) > 0)) b = i;
        best[grp] = b;
      };
      for (let grp = 0; grp < groups; grp++) rescan(grp);
      for (let out = n - 1; out >= 0; out--) {
        let bg = -1;
        for (let grp = 0; grp < groups; grp++)
          if (best[grp] >= 0 && (bg < 0 || ctx.cmpv(V[best[grp]], V[best[bg]], best[grp], best[bg]) > 0)) bg = grp;
        const idx = best[bg];
        ctx.set(out, V[idx]);
        alive[idx] = 0;
        rescan(bg);
      }
    },
  },
  {
    id: 'comparison-counting',
    name: 'Comparison Counting Sort',
    category: 'Selection',
    best: 'O(n²)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 2048,
    notes: 'Knuth TAOCP vol. 3, Algorithm 5.2C.',
    description:
      'Compares every pair of elements once and counts, for each element, how many others are smaller. That count is exactly its final position, so each element is then written straight into place.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const count = ctx.aux(n);
      for (let i = n - 1; i > 0; i--)
        for (let j = i - 1; j >= 0; j--) {
          if (ctx.cmp(i, j) < 0) count.set(j, count.data[j] + 1);
          else count.set(i, count.data[i] + 1);
        }
      const out = ctx.aux(n);
      for (let i = 0; i < n; i++) out.set(count.data[i], ctx.get(i));
      for (let i = 0; i < n; i++) ctx.set(i, out.data[i]);
    },
  },
  {
    id: 'heap-quaternary',
    name: 'Quaternary Heap Sort',
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'd-ary heap with d = 4.',
    description:
      'Heapsort on a 4-ary heap. Half as many levels as a binary heap; each sift step compares four children, which tends to be cache friendly.',
    run(ctx) {
      const n = ctx.n;
      for (let i = Math.floor((n - 2) / 4); i >= 0; i--) siftDownD(ctx, 4, i, n);
      for (let end = n - 1; end > 0; end--) {
        ctx.swap(0, end);
        siftDownD(ctx, 4, 0, end);
      }
    },
  },
  {
    id: 'poplar',
    name: 'Poplar Sort',
    category: 'Selection',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 32768,
    notes: 'Bron & Hesselink (1991). A simpler relative of smoothsort.',
    description:
      'Keeps a forest of perfect binary heaps ("poplars") of size 2ᵏ−1 laid out left to right with roots at their right ends. Each step finds the largest root, swaps it to the end and restores that poplar, then splits the last poplar into its two children.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const sift = (root: number, size: number) => {
        while (size > 1) {
          const half = (size - 1) >> 1;
          const right = root - 1;
          const left = root - 1 - half;
          const big = ctx.cmp(left, right) > 0 ? left : right;
          if (ctx.cmp(big, root) > 0) {
            ctx.swap(big, root);
            root = big;
            size = half;
          } else return;
        }
      };
      const sizes: number[] = [];
      for (let i = 0; i < n; i++) {
        const m = sizes.length;
        if (m >= 2 && sizes[m - 1] === sizes[m - 2]) {
          const s = sizes.pop()! * 2 + 1;
          sizes[m - 2] = s;
          sift(i, s);
        } else sizes.push(1);
      }
      for (let i = n - 1; i > 0; i--) {
        // locate roots
        let root = -1;
        let bestK = -1;
        let pos = -1;
        for (let k = 0; k < sizes.length; k++) {
          pos += sizes[k];
          if (root < 0 || ctx.cmp(pos, root) > 0) {
            root = pos;
            bestK = k;
          }
        }
        if (root !== i) {
          ctx.swap(root, i);
          sift(root, sizes[bestK]);
        }
        const s = sizes.pop()!;
        if (s > 1) sizes.push((s - 1) >> 1, (s - 1) >> 1);
      }
    },
  },
];
