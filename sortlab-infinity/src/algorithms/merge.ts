import type { AlgoDef } from './types';
import type { AuxArray, SortContext } from '../core/context';
import { insertionRange, rotate } from './helpers';

const MS = { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)' };

/** Stable merge of a[lo, mid) and a[mid, hi) using buf for the left run. */
function mergeRuns(ctx: SortContext, buf: AuxArray, lo: number, mid: number, hi: number) {
  if (lo >= mid || mid >= hi) return;
  // Already in order? (one comparison)
  if (ctx.cmp(mid - 1, mid) <= 0) return;
  const len1 = mid - lo;
  for (let i = 0; i < len1; i++) buf.set(i, ctx.get(lo + i));
  let i = 0;
  let j = mid;
  let k = lo;
  while (i < len1 && j < hi) {
    if (ctx.cmpi(j, buf.data[i]) >= 0) ctx.set(k++, buf.data[i++]);
    else ctx.set(k++, ctx.get(j++));
  }
  while (i < len1) ctx.set(k++, buf.data[i++]);
}

// ---- in-place merging -----------------------------------------------------
function lowerBound(ctx: SortContext, lo: number, hi: number, v: number) {
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (ctx.cmpi(m, v) < 0) lo = m + 1;
    else hi = m;
  }
  return lo;
}
function upperBound(ctx: SortContext, lo: number, hi: number, v: number) {
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (ctx.cmpi(m, v) <= 0) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Dudziński–Dydek style recursive rotation merge (like std::__merge_without_buffer). */
function mergeWithoutBuffer(ctx: SortContext, first: number, middle: number, last: number) {
  const len1 = middle - first;
  const len2 = last - middle;
  if (len1 === 0 || len2 === 0) return;
  if (len1 + len2 === 2) {
    if (ctx.cmp(middle, first) < 0) ctx.swap(first, middle);
    return;
  }
  let firstCut: number;
  let secondCut: number;
  if (len1 > len2) {
    firstCut = first + (len1 >> 1);
    secondCut = lowerBound(ctx, middle, last, ctx.get(firstCut));
  } else {
    secondCut = middle + (len2 >> 1);
    firstCut = upperBound(ctx, first, middle, ctx.get(secondCut));
  }
  rotate(ctx, firstCut, middle, secondCut);
  const newMiddle = firstCut + (secondCut - middle);
  mergeWithoutBuffer(ctx, first, firstCut, newMiddle);
  mergeWithoutBuffer(ctx, newMiddle, secondCut, last);
}

/** SymMerge (Kim & Kutzner 2004) as used by Go's sort.Stable. Merges [a, m) and [m, b). */
function symMerge(ctx: SortContext, a: number, m: number, b: number) {
  if (m - a === 1) {
    let i = m;
    let j = b;
    while (i < j) {
      const h = (i + j) >>> 1;
      if (ctx.cmp(h, a) < 0) i = h + 1;
      else j = h;
    }
    for (let k = a; k < i - 1; k++) ctx.swap(k, k + 1);
    return;
  }
  if (b - m === 1) {
    let i = a;
    let j = m;
    while (i < j) {
      const h = (i + j) >>> 1;
      if (!(ctx.cmp(m, h) < 0)) i = h + 1;
      else j = h;
    }
    for (let k = m; k > i; k--) ctx.swap(k, k - 1);
    return;
  }
  const mid = (a + b) >>> 1;
  const n = mid + m;
  let start: number;
  let r: number;
  if (m > mid) {
    start = n - b;
    r = mid;
  } else {
    start = a;
    r = m;
  }
  const p = n - 1;
  while (start < r) {
    const c = (start + r) >>> 1;
    if (!(ctx.cmp(p - c, c) < 0)) start = c + 1;
    else r = c;
  }
  const end = n - start;
  if (start < m && m < end) rotate(ctx, start, m, end);
  if (a < start && start < mid) symMerge(ctx, a, start, mid);
  if (mid < end && end < b) symMerge(ctx, mid, end, b);
}

// ---- TimSort / Powersort shared machinery -----------------------------------
function minRunLength(n: number) {
  let r = 0;
  while (n >= 64) {
    r |= n & 1;
    n >>= 1;
  }
  return n + r;
}

/** Find the run starting at lo; reverses strictly descending runs. Returns its length. */
function countRun(ctx: SortContext, lo: number, hi: number): number {
  let runHi = lo + 1;
  if (runHi === hi) return 1;
  if (ctx.cmp(runHi++, lo) < 0) {
    while (runHi < hi && ctx.cmp(runHi, runHi - 1) < 0) runHi++;
    ctx.reverse(lo, runHi - 1);
  } else {
    while (runHi < hi && ctx.cmp(runHi, runHi - 1) >= 0) runHi++;
  }
  return runHi - lo;
}

/** Extend a natural run to at least minRun with binary insertion sort. */
function nextRun(ctx: SortContext, lo: number, n: number, minRun: number): number {
  let len = countRun(ctx, lo, n);
  if (len < minRun) {
    const force = Math.min(minRun, n - lo);
    // binary insertion of elements [lo+len, lo+force) into sorted prefix
    for (let i = lo + len; i < lo + force; i++) {
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
    len = force;
  }
  return len;
}

const MIN_GALLOP = 7;

/** Sign of (source[pos] - key) for the main array or a scratch buffer, counted as a comparison. */
type KeyCmp = (pos: number, key: number) => number;

/**
 * gallopLeft: returns k with src[base+k-1] < key <= src[base+k], starting the
 * exponential search at base+hint (Java/CPython TimSort).
 */
function gallopLeft(cmp: KeyCmp, key: number, base: number, len: number, hint: number): number {
  let lastOfs = 0;
  let ofs = 1;
  if (cmp(base + hint, key) < 0) {
    const maxOfs = len - hint;
    while (ofs < maxOfs && cmp(base + hint + ofs, key) < 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    lastOfs += hint;
    ofs += hint;
  } else {
    const maxOfs = hint + 1;
    while (ofs < maxOfs && cmp(base + hint - ofs, key) >= 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    const tmp = lastOfs;
    lastOfs = hint - ofs;
    ofs = hint - tmp;
  }
  lastOfs++;
  while (lastOfs < ofs) {
    const m = lastOfs + ((ofs - lastOfs) >>> 1);
    if (cmp(base + m, key) < 0) lastOfs = m + 1;
    else ofs = m;
  }
  return ofs;
}

/** gallopRight: returns k with src[base+k-1] <= key < src[base+k]. */
function gallopRight(cmp: KeyCmp, key: number, base: number, len: number, hint: number): number {
  let ofs = 1;
  let lastOfs = 0;
  if (cmp(base + hint, key) > 0) {
    const maxOfs = hint + 1;
    while (ofs < maxOfs && cmp(base + hint - ofs, key) > 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    const tmp = lastOfs;
    lastOfs = hint - ofs;
    ofs = hint - tmp;
  } else {
    const maxOfs = len - hint;
    while (ofs < maxOfs && cmp(base + hint + ofs, key) <= 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    lastOfs += hint;
    ofs += hint;
  }
  lastOfs++;
  while (lastOfs < ofs) {
    const m = lastOfs + ((ofs - lastOfs) >>> 1);
    if (cmp(base + m, key) > 0) ofs = m;
    else lastOfs = m + 1;
  }
  return ofs;
}

/**
 * TimSort's merge machinery with adaptive galloping (minGallop), following
 * java.util.TimSort / CPython listobject.c merge_lo / merge_hi.
 */
class TimMerger {
  minGallop = MIN_GALLOP;
  private readonly mainCmp: KeyCmp;
  private readonly tmpCmp: KeyCmp;
  constructor(
    private ctx: SortContext,
    private tmp: AuxArray,
  ) {
    this.mainCmp = (pos, key) => ctx.cmpi(pos, key);
    this.tmpCmp = (pos, key) => ctx.cmpv(tmp.data[pos], key);
  }

  /** Merge adjacent runs [base1, base1+len1) and [base2, base2+len2). */
  mergeAt(base1: number, len1: number, base2: number, len2: number) {
    const ctx = this.ctx;
    const k = gallopRight(this.mainCmp, ctx.get(base2), base1, len1, 0);
    base1 += k;
    len1 -= k;
    if (len1 === 0) return;
    len2 = gallopLeft(this.mainCmp, ctx.get(base1 + len1 - 1), base2, len2, len2 - 1);
    if (len2 === 0) return;
    if (len1 <= len2) this.mergeLo(base1, len1, base2, len2);
    else this.mergeHi(base1, len1, base2, len2);
  }

  private mergeLo(base1: number, len1: number, base2: number, len2: number) {
    const ctx = this.ctx;
    const tmp = this.tmp;
    for (let i = 0; i < len1; i++) tmp.set(i, ctx.get(base1 + i));
    const T = tmp.data;
    let cursor1 = 0;
    let cursor2 = base2;
    let dest = base1;
    ctx.set(dest++, ctx.get(cursor2++));
    if (--len2 === 0) {
      for (let i = 0; i < len1; i++) ctx.set(dest + i, T[cursor1 + i]);
      return;
    }
    if (len1 === 1) {
      for (let i = 0; i < len2; i++) ctx.set(dest + i, ctx.get(cursor2 + i));
      ctx.set(dest + len2, T[cursor1]);
      return;
    }
    let minGallop = this.minGallop;
    outer: for (;;) {
      let count1 = 0;
      let count2 = 0;
      do {
        if (ctx.cmpi(cursor2, T[cursor1]) < 0) {
          ctx.set(dest++, ctx.get(cursor2++));
          count2++;
          count1 = 0;
          if (--len2 === 0) break outer;
        } else {
          ctx.set(dest++, T[cursor1++]);
          count1++;
          count2 = 0;
          if (--len1 === 1) break outer;
        }
      } while ((count1 | count2) < minGallop);
      do {
        count1 = gallopRight(this.tmpCmp, ctx.get(cursor2), cursor1, len1, 0);
        if (count1 !== 0) {
          for (let i = 0; i < count1; i++) ctx.set(dest + i, T[cursor1 + i]);
          dest += count1;
          cursor1 += count1;
          len1 -= count1;
          if (len1 <= 1) break outer;
        }
        ctx.set(dest++, ctx.get(cursor2++));
        if (--len2 === 0) break outer;
        count2 = gallopLeft(this.mainCmp, T[cursor1], cursor2, len2, 0);
        if (count2 !== 0) {
          for (let i = 0; i < count2; i++) ctx.set(dest + i, ctx.get(cursor2 + i));
          dest += count2;
          cursor2 += count2;
          len2 -= count2;
          if (len2 === 0) break outer;
        }
        ctx.set(dest++, T[cursor1++]);
        if (--len1 === 1) break outer;
        minGallop--;
      } while (count1 >= MIN_GALLOP || count2 >= MIN_GALLOP);
      if (minGallop < 0) minGallop = 0;
      minGallop += 2;
    }
    this.minGallop = minGallop < 1 ? 1 : minGallop;
    if (len1 === 1) {
      for (let i = 0; i < len2; i++) ctx.set(dest + i, ctx.get(cursor2 + i));
      ctx.set(dest + len2, T[cursor1]);
    } else if (len1 === 0) {
      throw new Error('Comparison method violates its general contract');
    } else {
      for (let i = 0; i < len1; i++) ctx.set(dest + i, T[cursor1 + i]);
    }
  }

  private mergeHi(base1: number, len1: number, base2: number, len2: number) {
    const ctx = this.ctx;
    const tmp = this.tmp;
    for (let i = 0; i < len2; i++) tmp.set(i, ctx.get(base2 + i));
    const T = tmp.data;
    let cursor1 = base1 + len1 - 1;
    let cursor2 = len2 - 1;
    let dest = base2 + len2 - 1;
    ctx.set(dest--, ctx.get(cursor1--));
    if (--len1 === 0) {
      for (let i = 0; i < len2; i++) ctx.set(dest - (len2 - 1) + i, T[i]);
      return;
    }
    if (len2 === 1) {
      dest -= len1;
      cursor1 -= len1;
      for (let i = len1 - 1; i >= 0; i--) ctx.set(dest + 1 + i, ctx.get(cursor1 + 1 + i));
      ctx.set(dest, T[cursor2]);
      return;
    }
    let minGallop = this.minGallop;
    outer: for (;;) {
      let count1 = 0;
      let count2 = 0;
      do {
        if (ctx.cmpi(cursor1, T[cursor2]) > 0) {
          ctx.set(dest--, ctx.get(cursor1--));
          count1++;
          count2 = 0;
          if (--len1 === 0) break outer;
        } else {
          ctx.set(dest--, T[cursor2--]);
          count2++;
          count1 = 0;
          if (--len2 === 1) break outer;
        }
      } while ((count1 | count2) < minGallop);
      do {
        count1 = len1 - gallopRight(this.mainCmp, T[cursor2], base1, len1, len1 - 1);
        if (count1 !== 0) {
          dest -= count1;
          cursor1 -= count1;
          len1 -= count1;
          for (let i = count1 - 1; i >= 0; i--) ctx.set(dest + 1 + i, ctx.get(cursor1 + 1 + i));
          if (len1 === 0) break outer;
        }
        ctx.set(dest--, T[cursor2--]);
        if (--len2 === 1) break outer;
        count2 = len2 - gallopLeft(this.tmpCmp, ctx.get(cursor1), 0, len2, len2 - 1);
        if (count2 !== 0) {
          dest -= count2;
          cursor2 -= count2;
          len2 -= count2;
          for (let i = 0; i < count2; i++) ctx.set(dest + 1 + i, T[cursor2 + 1 + i]);
          if (len2 <= 1) break outer;
        }
        ctx.set(dest--, ctx.get(cursor1--));
        if (--len1 === 0) break outer;
        minGallop--;
      } while (count1 >= MIN_GALLOP || count2 >= MIN_GALLOP);
      if (minGallop < 0) minGallop = 0;
      minGallop += 2;
    }
    this.minGallop = minGallop < 1 ? 1 : minGallop;
    if (len2 === 1) {
      dest -= len1;
      cursor1 -= len1;
      for (let i = len1 - 1; i >= 0; i--) ctx.set(dest + 1 + i, ctx.get(cursor1 + 1 + i));
      ctx.set(dest, T[cursor2]);
    } else if (len2 === 0) {
      throw new Error('Comparison method violates its general contract');
    } else {
      for (let i = 0; i < len2; i++) ctx.set(dest - (len2 - 1) + i, T[i]);
    }
  }
}

function timSort(ctx: SortContext) {
  const n = ctx.n;
  if (n < 2) return;
  const merger = new TimMerger(ctx, ctx.aux(Math.ceil(n / 2) + 1));
  const minRun = minRunLength(n);
  const base: number[] = [];
  const len: number[] = [];
  const mergeAt = (i: number) => {
    merger.mergeAt(base[i], len[i], base[i + 1], len[i + 1]);
    len[i] += len[i + 1];
    base.splice(i + 1, 1);
    len.splice(i + 1, 1);
  };
  let lo = 0;
  while (lo < n) {
    const runLen = nextRun(ctx, lo, n, minRun);
    base.push(lo);
    len.push(runLen);
    // merge_collapse with the 2015 invariant fix (de Gouw et al.)
    while (len.length > 1) {
      let k = len.length - 2;
      if ((k > 0 && len[k - 1] <= len[k] + len[k + 1]) || (k > 1 && len[k - 2] <= len[k - 1] + len[k])) {
        if (len[k - 1] < len[k + 1]) k--;
      } else if (len[k] > len[k + 1]) break;
      mergeAt(k);
    }
    lo += runLen;
  }
  while (len.length > 1) {
    let k = len.length - 2;
    if (k > 0 && len[k - 1] < len[k + 1]) k--;
    mergeAt(k);
  }
}

function powerSort(ctx: SortContext) {
  const n = ctx.n;
  if (n < 2) return;
  const merger = new TimMerger(ctx, ctx.aux(Math.ceil(n / 2) + 1));
  const minRun = Math.min(32, n);
  const power = (s1: number, n1: number, n2: number) => {
    let a = (2 * s1 + n1) / (2 * n);
    let b = (2 * s1 + 2 * n1 + n2) / (2 * n);
    let l = 0;
    for (;;) {
      l++;
      a *= 2;
      b *= 2;
      if (Math.floor(a) !== Math.floor(b)) return l;
      a -= Math.floor(a);
      b -= Math.floor(b);
    }
  };
  const stack: { s: number; l: number; p: number }[] = [];
  let s1 = 0;
  let n1 = nextRun(ctx, 0, n, minRun);
  while (s1 + n1 < n) {
    const s2 = s1 + n1;
    const n2 = nextRun(ctx, s2, n, minRun);
    const p = power(s1, n1, n2);
    while (stack.length && stack[stack.length - 1].p > p) {
      const top = stack.pop()!;
      merger.mergeAt(top.s, top.l, top.s + top.l, n1);
      s1 = top.s;
      n1 = top.l + n1;
    }
    stack.push({ s: s1, l: n1, p });
    s1 = s2;
    n1 = n2;
  }
  while (stack.length) {
    const top = stack.pop()!;
    merger.mergeAt(top.s, top.l, top.s + top.l, n1);
    s1 = top.s;
    n1 = top.l + n1;
  }
}

export const mergeSorts: AlgoDef[] = [
  {
    id: 'merge',
    name: 'Merge Sort',
    category: 'Merge',
    ...MS,
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: 'Top-down recursion; skips the merge when the halves are already in order.',
    description:
      'Divide and conquer: split the array in half, sort each half recursively, then merge the two sorted halves through a scratch buffer. Stable and always O(n log n).',
    run(ctx) {
      const buf = ctx.aux(ctx.n);
      const rec = (lo: number, hi: number) => {
        if (hi - lo < 2) return;
        const mid = (lo + hi) >>> 1;
        rec(lo, mid);
        rec(mid, hi);
        mergeRuns(ctx, buf, lo, mid, hi);
      };
      rec(0, ctx.n);
    },
  },
  {
    id: 'merge-bottomup',
    name: 'Bottom-Up Merge Sort',
    category: 'Merge',
    ...MS,
    stable: true,
    inPlace: false,
    maxN: 65536,
    description:
      'Iterative merge sort with no recursion: merge pairs of width-1 runs, then width-2, width-4 … until a single run covers the array.',
    run(ctx) {
      const buf = ctx.aux(ctx.n);
      for (let w = 1; w < ctx.n; w *= 2)
        for (let lo = 0; lo + w < ctx.n; lo += 2 * w) mergeRuns(ctx, buf, lo, lo + w, Math.min(lo + 2 * w, ctx.n));
    },
  },
  {
    id: 'merge-natural',
    name: 'Natural Merge Sort',
    category: 'Merge',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    description:
      'Bottom-up merge sort that starts from the runs already present in the input instead of single elements. Sorted input is recognised as one run and finishes in one linear scan.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const buf = ctx.aux(n);
      for (;;) {
        const starts: number[] = [0];
        for (let i = 1; i < n; i++) if (ctx.cmp(i - 1, i) > 0) starts.push(i);
        if (starts.length === 1) return;
        starts.push(n);
        for (let r = 0; r + 2 < starts.length; r += 2) mergeRuns(ctx, buf, starts[r], starts[r + 1], starts[r + 2]);
      }
    },
  },
  {
    id: 'merge-3way',
    name: '3-Way Merge Sort',
    category: 'Merge',
    ...MS,
    worst: 'O(n log₃ n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    description:
      'Splits each range into thirds instead of halves and merges three sorted runs at once. Fewer levels of recursion (log₃ n) but more comparisons per merge step.',
    run(ctx) {
      const buf = ctx.aux(ctx.n);
      const rec = (lo: number, hi: number) => {
        const len = hi - lo;
        if (len < 2) return;
        if (len === 2) {
          if (ctx.cmp(lo, lo + 1) > 0) ctx.swap(lo, lo + 1);
          return;
        }
        const m1 = lo + Math.floor(len / 3);
        const m2 = lo + Math.floor((2 * len) / 3);
        rec(lo, m1);
        rec(m1, m2);
        rec(m2, hi);
        for (let i = lo; i < hi; i++) buf.set(i, ctx.get(i));
        const B = buf.data;
        let i = lo;
        let j = m1;
        let k = m2;
        let o = lo;
        while (o < hi) {
          let pick = -1;
          let src = 0;
          if (i < m1) {
            pick = i;
            src = 1;
          }
          if (j < m2 && (pick < 0 || ctx.cmpv(B[j], B[pick], j, pick) < 0)) {
            pick = j;
            src = 2;
          }
          if (k < hi && (pick < 0 || ctx.cmpv(B[k], B[pick], k, pick) < 0)) {
            pick = k;
            src = 3;
          }
          ctx.set(o++, B[pick]);
          if (src === 1) i++;
          else if (src === 2) j++;
          else k++;
        }
      };
      rec(0, ctx.n);
    },
  },
  {
    id: 'merge-hybrid',
    name: 'Merge Sort + Insertion Cutoff',
    category: 'Hybrid',
    ...MS,
    best: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: 'Ranges of ≤ 16 elements are insertion sorted.',
    description:
      'Top-down merge sort that hands small subarrays to insertion sort, which is faster on tiny inputs than recursing further. A standard optimisation in production merge sorts.',
    run(ctx) {
      const buf = ctx.aux(ctx.n);
      const rec = (lo: number, hi: number) => {
        if (hi - lo <= 16) {
          insertionRange(ctx, lo, hi);
          return;
        }
        const mid = (lo + hi) >>> 1;
        rec(lo, mid);
        rec(mid, hi);
        mergeRuns(ctx, buf, lo, mid, hi);
      };
      rec(0, ctx.n);
    },
  },
  {
    id: 'merge-inplace',
    name: 'In-Place Merge Sort (Rotations)',
    category: 'Merge',
    best: 'O(n log n)',
    average: 'O(n log² n)',
    worst: 'O(n log² n)',
    space: 'O(log n)',
    stable: true,
    inPlace: true,
    maxN: 16384,
    notes: 'Recursive rotation-based merge without buffer (Dudziński & Dydek 1981; as in std::inplace_merge without memory).',
    description:
      'Merge sort that needs no scratch buffer. Each merge cuts both runs with binary search, rotates the middle blocks into place with reversals, and recurses on the two smaller merges.',
    run(ctx) {
      const rec = (lo: number, hi: number) => {
        if (hi - lo < 2) return;
        const mid = (lo + hi) >>> 1;
        rec(lo, mid);
        rec(mid, hi);
        if (ctx.cmp(mid - 1, mid) > 0) mergeWithoutBuffer(ctx, lo, mid, hi);
      };
      rec(0, ctx.n);
    },
  },
  {
    id: 'symmerge',
    name: 'SymMerge Sort',
    category: 'Merge',
    best: 'O(n)',
    average: 'O(n log² n)',
    worst: 'O(n log² n)',
    space: 'O(log n)',
    stable: true,
    inPlace: true,
    maxN: 16384,
    notes: "Kim & Kutzner (2004). Same structure as Go's sort.Stable: insertion-sorted blocks of 20, then SymMerge.",
    description:
      'Stable in-place sort: blocks of 20 are insertion sorted, then merged pairwise with the SymMerge algorithm, which finds a symmetric split point by binary search and uses a single rotation per level.',
    run(ctx) {
      const n = ctx.n;
      let block = 20;
      let a = 0;
      let b = block;
      while (b <= n) {
        insertionRange(ctx, a, b);
        a = b;
        b += block;
      }
      insertionRange(ctx, a, n);
      while (block < n) {
        a = 0;
        b = 2 * block;
        while (b <= n) {
          symMerge(ctx, a, a + block, b);
          a = b;
          b += 2 * block;
        }
        const m = a + block;
        if (m < n) symMerge(ctx, a, m, n);
        block *= 2;
      }
    },
  },
  {
    id: 'tim',
    name: 'TimSort',
    category: 'Hybrid',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: 'Tim Peters (2002). Full algorithm as in CPython / java.util.TimSort: run detection, minrun, binary insertion, the corrected run-stack invariants (de Gouw et al. 2015), galloping merge-boundary trimming, merge_lo / merge_hi with adaptive galloping mode (MIN_GALLOP = 7).',
    description:
      'The hybrid behind Python and Java object sorting. It scans for natural runs (reversing strictly descending ones), extends short runs to minrun with binary insertion, and keeps a stack of runs whose lengths obey Fibonacci-like invariants so merges stay balanced. Each merge copies only the smaller run to a buffer. When one side keeps winning, it switches into galloping mode: exponential search copies whole stretches at once, and the minGallop threshold adapts to how often galloping pays off.',
    run(ctx) {
      timSort(ctx);
    },
  },
  {
    id: 'powersort',
    name: 'Powersort',
    category: 'Hybrid',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 65536,
    notes: 'Munro & Wild (2018). Merge policy adopted by CPython 3.11; uses the same galloping merges as TimSort.',
    description:
      'A TimSort-style natural merge sort with a provably near-optimal merge policy: each run boundary gets a "power" from its position in a virtual binary tree, and runs are merged when a boundary of higher power is seen.',
    run(ctx) {
      powerSort(ctx);
    },
  },
  {
    id: 'strand',
    name: 'Strand Sort',
    category: 'Merge',
    best: 'O(n)',
    average: 'O(n²)',
    worst: 'O(n²)',
    space: 'O(n)',
    stable: true,
    inPlace: false,
    maxN: 2048,
    description:
      'Repeatedly pulls an increasing "strand" out of the remaining elements and merges it into the result. The array is shown as [result | remaining] after every round.',
    run(ctx) {
      const n = ctx.n;
      let rem: number[] = [];
      for (let i = 0; i < n; i++) rem.push(ctx.get(i));
      let result: number[] = [];
      while (rem.length) {
        const r0 = result.length;
        const strand = [rem[0]];
        const rest: number[] = [];
        ctx.countAuxWrite();
        for (let i = 1; i < rem.length; i++) {
          if (ctx.cmpv(rem[i], strand[strand.length - 1], r0 + i, -1) >= 0) strand.push(rem[i]);
          else rest.push(rem[i]);
          ctx.countAuxWrite();
        }
        const merged: number[] = [];
        let i = 0;
        let j = 0;
        while (i < result.length && j < strand.length) {
          if (ctx.cmpv(strand[j], result[i], -1, i) < 0) merged.push(strand[j++]);
          else merged.push(result[i++]);
          ctx.countAuxWrite();
        }
        while (i < result.length) {
          merged.push(result[i++]);
          ctx.countAuxWrite();
        }
        while (j < strand.length) {
          merged.push(strand[j++]);
          ctx.countAuxWrite();
        }
        result = merged;
        rem = rest;
        let k = 0;
        for (const v of result) if (ctx.a[k++] !== v) ctx.set(k - 1, v);
        for (const v of rem) if (ctx.a[k++] !== v) ctx.set(k - 1, v);
      }
    },
  },
  {
    id: 'patience',
    name: 'Patience Sort',
    category: 'Merge',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: false,
    inPlace: false,
    maxN: 32768,
    notes: 'Named after the solitaire card game. Pile count = longest increasing subsequence.',
    description:
      'Deals elements onto piles: each goes onto the leftmost pile whose top is ≥ it (found by binary search), or starts a new pile. Pile tops are then merged with a priority queue.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const piles: number[][] = [];
      for (let i = 0; i < n; i++) {
        const v = ctx.get(i);
        let lo = 0;
        let hi = piles.length;
        while (lo < hi) {
          const m = (lo + hi) >>> 1;
          if (ctx.cmpv(piles[m][piles[m].length - 1], v, -1, i) >= 0) hi = m;
          else lo = m + 1;
        }
        if (lo === piles.length) piles.push([v]);
        else piles[lo].push(v);
        ctx.countAuxWrite();
      }
      // min-heap of pile indices keyed by pile top
      const heap: number[] = piles.map((_, i) => i);
      const top = (p: number) => piles[p][piles[p].length - 1];
      const less = (x: number, y: number) => ctx.cmpv(top(heap[x]), top(heap[y])) < 0;
      const down = (p: number) => {
        for (;;) {
          let c = 2 * p + 1;
          if (c >= heap.length) return;
          if (c + 1 < heap.length && less(c + 1, c)) c++;
          if (!less(c, p)) return;
          [heap[c], heap[p]] = [heap[p], heap[c]];
          ctx.countAuxWrite();
          p = c;
        }
      };
      for (let i = (heap.length >> 1) - 1; i >= 0; i--) down(i);
      for (let k = 0; k < n; k++) {
        const p = heap[0];
        ctx.set(k, piles[p].pop()!);
        if (piles[p].length === 0) {
          heap[0] = heap[heap.length - 1];
          heap.pop();
        }
        if (heap.length) down(0);
      }
    },
  },
  {
    id: 'merge-insertion',
    name: 'Merge-Insertion Sort (Ford–Johnson)',
    category: 'Merge',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(n)',
    stable: false,
    inPlace: false,
    maxN: 4096,
    notes: 'Ford & Johnson (1959). Comparison counts are close to the information-theoretic minimum ⌈log₂ n!⌉; data movement is ignored by design.',
    description:
      'Optimised for the fewest comparisons: pair up elements, recursively sort the larger of each pair, then binary-insert the smaller ones in Jacobsthal order so every search covers at most 2ᵏ−1 elements. The sorted result is written back at the end.',
    run(ctx) {
      const n = ctx.n;
      if (n < 2) return;
      const vals = ctx.aux(n);
      for (let i = 0; i < n; i++) vals.set(i, ctx.get(i));
      const V = vals.data;
      const cmpIdx = (x: number, y: number) => ctx.cmpv(V[x], V[y], x, y);
      const jac = (k: number) => Math.round((2 ** (k + 1) + (k % 2 === 0 ? 1 : -1)) / 3);
      const fj = (items: number[]): number[] => {
        const m = items.length;
        if (m <= 1) return items.slice();
        const partner = new Map<number, number>();
        const bigs: number[] = [];
        for (let i = 0; i + 1 < m; i += 2) {
          const x = items[i];
          const y = items[i + 1];
          if (cmpIdx(x, y) > 0) {
            bigs.push(x);
            partner.set(x, y);
          } else {
            bigs.push(y);
            partner.set(y, x);
          }
        }
        const straggler = m % 2 === 1 ? items[m - 1] : -1;
        const sortedBigs = fj(bigs);
        const chain = [partner.get(sortedBigs[0])!, ...sortedBigs];
        const pend: { item: number; bound: number }[] = [{ item: -1, bound: -1 }, { item: -1, bound: -1 }]; // 1-indexed, b1 done
        for (let j = 2; j <= sortedBigs.length; j++) pend.push({ item: partner.get(sortedBigs[j - 1])!, bound: sortedBigs[j - 1] });
        if (straggler >= 0) pend.push({ item: straggler, bound: -1 });
        const total = pend.length - 1;
        let prev = 1;
        for (let k = 2; prev < total; k++) {
          const t = Math.min(jac(k), total);
          for (let j = t; j > prev; j--) {
            const { item, bound } = pend[j];
            let hi = bound >= 0 ? chain.indexOf(bound) : chain.length;
            let lo = 0;
            while (lo < hi) {
              const mid = (lo + hi) >>> 1;
              if (cmpIdx(chain[mid], item) > 0) hi = mid;
              else lo = mid + 1;
            }
            chain.splice(lo, 0, item);
            ctx.countAuxWrite();
          }
          prev = t;
        }
        return chain;
      };
      const order = fj(Array.from({ length: n }, (_, i) => i));
      for (let k = 0; k < n; k++) ctx.set(k, V[order[k]]);
    },
  },
];

