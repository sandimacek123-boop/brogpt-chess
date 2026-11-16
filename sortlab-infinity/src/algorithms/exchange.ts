import type { AlgoDef } from './types';

const Q = { best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)' };

export const exchangeSorts: AlgoDef[] = [
  {
    id: 'bubble',
    name: 'Bubble Sort',
    category: 'Exchange',
    ...Q,
    best: 'O(n²)',
    stable: true,
    inPlace: true,
    maxN: 2048,
    description:
      'Repeatedly walks the array, swapping adjacent out-of-order pairs. After pass k the k largest values have "bubbled" to the end. This is the plain textbook version with no early exit.',
    run(ctx) {
      const n = ctx.n;
      for (let i = 0; i < n - 1; i++)
        for (let j = 0; j < n - 1 - i; j++) if (ctx.cmp(j, j + 1) > 0) ctx.swap(j, j + 1);
    },
  },
  {
    id: 'bubble-opt',
    name: 'Optimized Bubble Sort',
    category: 'Exchange',
    ...Q,
    stable: true,
    inPlace: true,
    maxN: 2048,
    description:
      'Bubble sort that remembers where the last swap happened: everything after it is already sorted, so the next pass stops there. Terminates immediately on sorted input.',
    run(ctx) {
      let end = ctx.n;
      while (end > 1) {
        let last = 0;
        for (let j = 1; j < end; j++)
          if (ctx.cmp(j - 1, j) > 0) {
            ctx.swap(j - 1, j);
            last = j;
          }
        end = last;
      }
    },
  },
  {
    id: 'cocktail',
    name: 'Cocktail Shaker Sort',
    category: 'Exchange',
    ...Q,
    stable: true,
    inPlace: true,
    maxN: 2048,
    description:
      'Bidirectional bubble sort. Alternates forward and backward passes, which moves small "turtles" at the end of the array to the front much faster than bubble sort.',
    run(ctx) {
      let lo = 0;
      let hi = ctx.n - 1;
      while (lo < hi) {
        let last = lo;
        for (let i = lo; i < hi; i++)
          if (ctx.cmp(i, i + 1) > 0) {
            ctx.swap(i, i + 1);
            last = i;
          }
        hi = last;
        if (lo >= hi) break;
        last = hi;
        for (let i = hi; i > lo; i--)
          if (ctx.cmp(i - 1, i) > 0) {
            ctx.swap(i - 1, i);
            last = i;
          }
        lo = last;
      }
    },
  },
  {
    id: 'odd-even',
    name: 'Odd–Even Sort',
    category: 'Exchange',
    ...Q,
    stable: true,
    inPlace: true,
    maxN: 2048,
    notes: 'Also called brick sort or odd–even transposition sort.',
    description:
      'Alternates between comparing all (odd, even) index pairs and all (even, odd) pairs. Each phase is fully parallel, which made it popular for processor arrays.',
    run(ctx) {
      let sorted = false;
      while (!sorted) {
        sorted = true;
        for (let start = 1; start >= 0; start--)
          for (let i = start; i + 1 < ctx.n; i += 2)
            if (ctx.cmp(i, i + 1) > 0) {
              ctx.swap(i, i + 1);
              sorted = false;
            }
      }
    },
  },
  {
    id: 'comb',
    name: 'Comb Sort',
    category: 'Exchange',
    best: 'O(n log n)',
    average: 'Ω(n²/2ᵖ)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 16384,
    description:
      'Bubble sort with a shrinking gap (factor 1.3). Large gaps eliminate turtles early; the final gap-1 passes finish the job.',
    run(ctx) {
      let gap = ctx.n;
      let sorted = false;
      while (!sorted) {
        gap = Math.floor(gap / 1.3);
        if (gap <= 1) {
          gap = 1;
          sorted = true;
        }
        for (let i = 0; i + gap < ctx.n; i++)
          if (ctx.cmp(i, i + gap) > 0) {
            ctx.swap(i, i + gap);
            sorted = false;
          }
      }
    },
  },
  {
    id: 'comb11',
    name: 'Combsort11',
    category: 'Exchange',
    best: 'O(n log n)',
    average: 'Ω(n²/2ᵖ)',
    worst: 'O(n²)',
    space: 'O(1)',
    stable: false,
    inPlace: true,
    maxN: 16384,
    notes: 'Comb sort variant: gaps of 9 or 10 are replaced by 11.',
    description:
      'Comb sort with the "rule of 11": whenever the shrinking gap would become 9 or 10 it is set to 11, which avoids a bad gap sequence and noticeably reduces work.',
    run(ctx) {
      let gap = ctx.n;
      let sorted = false;
      while (!sorted) {
        gap = Math.floor(gap / 1.3);
        if (gap === 9 || gap === 10) gap = 11;
        if (gap <= 1) {
          gap = 1;
          sorted = true;
        }
        for (let i = 0; i + gap < ctx.n; i++)
          if (ctx.cmp(i, i + gap) > 0) {
            ctx.swap(i, i + gap);
            sorted = false;
          }
      }
    },
  },
  {
    id: 'gnome',
    name: 'Gnome Sort',
    category: 'Exchange',
    ...Q,
    stable: true,
    inPlace: true,
    maxN: 2048,
    description:
      'A garden gnome sorting flower pots: if the pot in front is in order, step forward; otherwise swap and step back. A single loop with no nested structure.',
    run(ctx) {
      let i = 0;
      while (i < ctx.n) {
        if (i === 0 || ctx.cmp(i - 1, i) <= 0) i++;
        else {
          ctx.swap(i - 1, i);
          i--;
        }
      }
    },
  },
  {
    id: 'gnome-opt',
    name: 'Optimized Gnome Sort',
    category: 'Exchange',
    ...Q,
    stable: true,
    inPlace: true,
    maxN: 2048,
    notes: 'Gnome sort that "teleports" back to where it started stepping backwards.',
    description:
      'After walking a misplaced element back to its spot, the gnome jumps straight back to where it was instead of walking forward again, removing redundant comparisons.',
    run(ctx) {
      for (let upper = 1; upper < ctx.n; upper++) {
        let pos = upper;
        while (pos > 0 && ctx.cmp(pos - 1, pos) > 0) {
          ctx.swap(pos - 1, pos);
          pos--;
        }
      }
    },
  },
  {
    id: 'exchange',
    name: 'Exchange Sort',
    category: 'Exchange',
    ...Q,
    best: 'O(n²)',
    stable: false,
    inPlace: true,
    maxN: 2048,
    description:
      'Compares the element at each position with every element after it and swaps whenever they are out of order. Simple but always performs n(n−1)/2 comparisons.',
    run(ctx) {
      for (let i = 0; i < ctx.n - 1; i++)
        for (let j = i + 1; j < ctx.n; j++) if (ctx.cmp(i, j) > 0) ctx.swap(i, j);
    },
  },
  {
    id: 'circle',
    name: 'Circle Sort',
    category: 'Exchange',
    best: 'O(n log n)',
    average: 'O(n log² n)',
    worst: 'O(n log² n)',
    space: 'O(log n)',
    stable: false,
    inPlace: true,
    maxN: 8192,
    description:
      'Compares elements that are mirrored around the centre of a range ("circles"), then recurses on both halves. Whole passes repeat until no swap occurs.',
    run(ctx) {
      const rec = (lo: number, hi: number): number => {
        if (lo >= hi) return 0;
        let swaps = 0;
        let l = lo;
        let h = hi;
        const mid = (hi - lo) >> 1;
        while (l < h) {
          if (ctx.cmp(l, h) > 0) {
            ctx.swap(l, h);
            swaps++;
          }
          l++;
          h--;
        }
        if (l === h && h + 1 <= hi && ctx.cmp(l, h + 1) > 0) {
          ctx.swap(l, h + 1);
          swaps++;
        }
        swaps += rec(lo, lo + mid);
        swaps += rec(lo + mid + 1, hi);
        return swaps;
      };
      if (ctx.n < 2) return;
      while (rec(0, ctx.n - 1) > 0);
    },
  },
];
