import type { AuxBuffer, Machine } from '../machine';
import { binaryInsertionRange } from './elementary';

/**
 * Merge main[lo..mid] and main[mid+1..hi] (inclusive) through auxiliary buffer `buf` (size >= hi-lo+1).
 * Both runs are copied out, then merged back into main. Ties take the left run -> stable.
 */
export function mergeViaAux(m: Machine, buf: AuxBuffer, lo: number, mid: number, hi: number): void {
  const len = hi - lo + 1;
  for (let k = 0; k < len; k++) m.toAux(buf, k, lo + k);
  const leftEnd = mid - lo; // inclusive index in buf
  let i = 0;
  let j = leftEnd + 1;
  let k = lo;
  while (i <= leftEnd && j < len) {
    if (m.cmpH(buf.ids[i], buf.ids[j], lo + i, lo + j) <= 0) m.fromAux(k++, buf, i++);
    else m.fromAux(k++, buf, j++);
  }
  while (i <= leftEnd) m.fromAux(k++, buf, i++);
  while (j < len) m.fromAux(k++, buf, j++);
}

export function mergeSort(m: Machine): void {
  if (m.n < 2) return;
  const buf = m.alloc(m.n);
  const rec = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const mid = (lo + hi) >>> 1;
    rec(lo, mid);
    rec(mid + 1, hi);
    m.range(lo, hi);
    mergeViaAux(m, buf, lo, mid, hi);
  };
  rec(0, m.n - 1);
  m.free(buf);
  m.sortedRange(0, m.n - 1);
}

export function bottomUpMergeSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const buf = m.alloc(n);
  for (let width = 1; width < n; width *= 2) {
    for (let lo = 0; lo < n - width; lo += 2 * width) {
      const mid = lo + width - 1;
      const hi = Math.min(lo + 2 * width - 1, n - 1);
      m.range(lo, hi);
      mergeViaAux(m, buf, lo, mid, hi);
    }
  }
  m.free(buf);
  m.sortedRange(0, n - 1);
}

/** Natural merge sort: detect existing ascending runs, then merge adjacent runs pairwise. */
export function naturalMergeSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const buf = m.alloc(n);
  for (;;) {
    const starts: number[] = [0];
    for (let i = 1; i < n; i++) if (m.gt(i - 1, i)) starts.push(i);
    if (starts.length === 1) break;
    starts.push(n);
    for (let r = 0; r + 2 < starts.length; r += 2) {
      const lo = starts[r];
      const mid = starts[r + 1] - 1;
      const hi = starts[r + 2] - 1;
      m.range(lo, hi);
      mergeViaAux(m, buf, lo, mid, hi);
    }
  }
  m.free(buf);
  m.sortedRange(0, n - 1);
}

/** Merge sort whose merge step needs no buffer: out-of-place elements are inserted by shifting. O(n²) worst case. */
export function inPlaceMergeSort(m: Machine): void {
  const rec = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const mid0 = (lo + hi) >>> 1;
    rec(lo, mid0);
    rec(mid0 + 1, hi);
    m.range(lo, hi);
    let i = lo;
    let mid = mid0;
    let j = mid0 + 1;
    if (!m.gt(mid, j)) return; // already ordered
    while (i <= mid && j <= hi) {
      if (m.cmp(i, j) <= 0) i++;
      else {
        const t = m.read(j);
        for (let k = j; k > i; k--) m.move(k, k - 1);
        m.write(i, t);
        i++;
        mid++;
        j++;
      }
    }
  };
  rec(0, m.n - 1);
  m.sortedRange(0, m.n - 1);
}

// ---------------------------------------------------------------------------- SymMerge (Kim & Kutzner 2004)
function swapRange(m: Machine, a: number, b: number, n: number) {
  for (let i = 0; i < n; i++) m.swap(a + i, b + i);
}

function rotate(m: Machine, a: number, mid: number, b: number) {
  let i = mid - a;
  let j = b - mid;
  while (i !== j) {
    if (i > j) {
      swapRange(m, mid - i, mid, j);
      i -= j;
    } else {
      swapRange(m, mid - i, mid + j - i, i);
      j -= i;
    }
  }
  swapRange(m, mid - i, mid, i);
}

function symMerge(m: Machine, a: number, mid: number, b: number): void {
  if (mid - a === 1) {
    let i = mid;
    let j = b;
    while (i < j) {
      const h = (i + j) >>> 1;
      if (m.lt(h, a)) i = h + 1;
      else j = h;
    }
    for (let k = a; k < i - 1; k++) m.swap(k, k + 1);
    return;
  }
  if (b - mid === 1) {
    let i = a;
    let j = mid;
    while (i < j) {
      const h = (i + j) >>> 1;
      if (!m.lt(mid, h)) i = h + 1;
      else j = h;
    }
    for (let k = mid; k > i; k--) m.swap(k, k - 1);
    return;
  }
  const half = (a + b) >>> 1;
  const n = half + mid;
  let start: number;
  let r: number;
  if (mid > half) {
    start = n - b;
    r = half;
  } else {
    start = a;
    r = mid;
  }
  const p = n - 1;
  while (start < r) {
    const c = (start + r) >>> 1;
    if (!m.lt(p - c, c)) start = c + 1;
    else r = c;
  }
  const end = n - start;
  if (start < mid && mid < end) rotate(m, start, mid, end);
  if (a < start && start < half) symMerge(m, a, start, half);
  if (half < end && end < b) symMerge(m, half, end, b);
}

/** Stable in-place merge sort: insertion-sorted blocks of 20 merged with SymMerge + rotations. */
export function symMergeSort(m: Machine): void {
  const n = m.n;
  let block = 20;
  const ins = (a: number, b: number) => {
    for (let i = a + 1; i < b; i++) for (let j = i; j > a && m.lt(j, j - 1); j--) m.swap(j, j - 1);
  };
  let a = 0;
  let b = block;
  while (b <= n) {
    ins(a, b);
    a = b;
    b += block;
  }
  ins(a, n);
  while (block < n) {
    a = 0;
    b = 2 * block;
    while (b <= n) {
      m.range(a, b - 1);
      symMerge(m, a, a + block, b);
      a = b;
      b += 2 * block;
    }
    const mid = a + block;
    if (mid < n) {
      m.range(a, n - 1);
      symMerge(m, a, mid, n);
    }
    block *= 2;
  }
  m.sortedRange(0, n - 1);
}

// ---------------------------------------------------------------------------- TimSort
/**
 * TimSort (Peters 2002) as in CPython/Java: minrun computation, natural runs (strictly
 * descending runs reversed), binary-insertion extension to minrun, a run stack maintaining the
 * corrected invariants (de Gouw et al. 2015), gallop-based trimming before each merge, and
 * merge_lo / merge_hi using a temporary buffer the size of the smaller run.
 * Simplification: the adaptive in-merge galloping mode (min_gallop) is not used; merges are linear.
 */
export function timSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  if (n < 64) {
    const runEnd = countRunAndMakeAscending(m, 0, n);
    binaryInsertionRange(m, 0, n - 1, runEnd);
    m.sortedRange(0, n - 1);
    return;
  }
  const minRun = computeMinRun(n);
  const runBase: number[] = [];
  const runLen: number[] = [];
  let lo = 0;
  let remaining = n;
  do {
    let rl = countRunAndMakeAscending(m, lo, lo + remaining);
    if (rl < minRun) {
      const force = remaining <= minRun ? remaining : minRun;
      binaryInsertionRange(m, lo, lo + force - 1, rl);
      rl = force;
    }
    m.range(lo, lo + rl - 1);
    runBase.push(lo);
    runLen.push(rl);
    mergeCollapse(m, runBase, runLen);
    lo += rl;
    remaining -= rl;
  } while (remaining !== 0);
  while (runBase.length > 1) {
    let k = runBase.length - 2;
    if (k > 0 && runLen[k - 1] < runLen[k + 1]) k--;
    mergeAt(m, runBase, runLen, k);
  }
  m.sortedRange(0, n - 1);
}

function computeMinRun(n: number): number {
  let r = 0;
  while (n >= 64) {
    r |= n & 1;
    n >>= 1;
  }
  return n + r;
}

/** Returns run length starting at lo (hi exclusive); strictly descending runs are reversed in place. */
function countRunAndMakeAscending(m: Machine, lo: number, hi: number): number {
  let runHi = lo + 1;
  if (runHi === hi) return 1;
  if (m.lt(runHi++, lo)) {
    while (runHi < hi && m.lt(runHi, runHi - 1)) runHi++;
    let a = lo;
    let b = runHi - 1;
    while (a < b) m.swap(a++, b--);
  } else {
    while (runHi < hi && !m.lt(runHi, runHi - 1)) runHi++;
  }
  return runHi - lo;
}

function mergeCollapse(m: Machine, base: number[], len: number[]): void {
  while (base.length > 1) {
    let k = base.length - 2;
    if (
      (k > 0 && len[k - 1] <= len[k] + len[k + 1]) ||
      (k > 1 && len[k - 2] <= len[k - 1] + len[k])
    ) {
      if (len[k - 1] < len[k + 1]) k--;
    } else if (len[k] > len[k + 1]) {
      break;
    }
    mergeAt(m, base, len, k);
  }
}

/** Leftmost position in [base, base+len) where key may be inserted (all before are < key). */
function gallopLeft(m: Machine, key: number, base: number, len: number): number {
  let lo = 0;
  let hi = len;
  // exponential search then binary search
  let ofs = 1;
  while (ofs < len && m.cmpHI(key, base + ofs - 1) > 0) {
    lo = ofs;
    ofs = ofs * 2 + 1;
  }
  hi = Math.min(ofs, len);
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (m.cmpHI(key, base + mid) > 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Rightmost position: all before are <= key. */
function gallopRight(m: Machine, key: number, base: number, len: number): number {
  let lo = 0;
  let hi = len;
  let ofs = 1;
  while (ofs < len && m.cmpHI(key, base + ofs - 1) >= 0) {
    lo = ofs;
    ofs = ofs * 2 + 1;
  }
  hi = Math.min(ofs, len);
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (m.cmpHI(key, base + mid) >= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function mergeAt(m: Machine, base: number[], len: number[], i: number): void {
  let base1 = base[i];
  let len1 = len[i];
  const base2 = base[i + 1];
  let len2 = len[i + 1];
  len[i] = len1 + len2;
  base.splice(i + 1, 1);
  len.splice(i + 1, 1);
  m.range(base1, base2 + len2 - 1);
  // Where does run2[0] go in run1? Elements before it are already in place.
  const k = gallopRight(m, m.read(base2), base1, len1);
  base1 += k;
  len1 -= k;
  if (len1 === 0) return;
  // Where does run1[last] go in run2? Elements after it are already in place.
  len2 = gallopLeft(m, m.read(base1 + len1 - 1), base2, len2);
  if (len2 === 0) return;
  if (len1 <= len2) mergeLo(m, base1, len1, base2, len2);
  else mergeHi(m, base1, len1, base2, len2);
}

function mergeLo(m: Machine, base1: number, len1: number, base2: number, len2: number) {
  const tmp = m.alloc(len1);
  for (let k = 0; k < len1; k++) m.toAux(tmp, k, base1 + k);
  let c1 = 0;
  let c2 = base2;
  let dest = base1;
  const end2 = base2 + len2;
  while (c1 < len1 && c2 < end2) {
    if (m.cmpHI(tmp.ids[c1], c2, base1 + c1) > 0) m.move(dest++, c2++);
    else m.fromAux(dest++, tmp, c1++);
  }
  while (c1 < len1) m.fromAux(dest++, tmp, c1++);
  m.free(tmp);
}

function mergeHi(m: Machine, base1: number, len1: number, base2: number, len2: number) {
  const tmp = m.alloc(len2);
  for (let k = 0; k < len2; k++) m.toAux(tmp, k, base2 + k);
  let c1 = base1 + len1 - 1;
  let c2 = len2 - 1;
  let dest = base2 + len2 - 1;
  while (c1 >= base1 && c2 >= 0) {
    if (m.cmpHI(tmp.ids[c2], c1, base2 + c2) < 0) m.move(dest--, c1--);
    else m.fromAux(dest--, tmp, c2--);
  }
  while (c2 >= 0) m.fromAux(dest--, tmp, c2--);
  m.free(tmp);
}

// ---------------------------------------------------------------------------- Strand, Patience, Library
/** Strand sort, array variant: after each strand merge, main = merged result followed by the remaining elements. */
export function strandSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  m.allocRaw(2 * n);
  let rest: number[] = [];
  for (let i = 0; i < n; i++) {
    rest.push(m.read(i));
    m.auxTouch(i);
  }
  let result: number[] = [];
  while (rest.length) {
    const strand = [rest[0]];
    const left: number[] = [];
    for (let i = 1; i < rest.length; i++) {
      if (m.cmpH(rest[i], strand[strand.length - 1], result.length + i, -1) >= 0) strand.push(rest[i]);
      else left.push(rest[i]);
      m.auxTouch();
    }
    // merge result + strand (stable: result elements came earlier in the original order? not
    // guaranteed, so strand sort is classified as not stable here)
    const merged: number[] = [];
    let i = 0;
    let j = 0;
    while (i < result.length && j < strand.length) {
      if (m.cmpH(result[i], strand[j], merged.length, -1) <= 0) merged.push(result[i++]);
      else merged.push(strand[j++]);
      m.auxTouch();
    }
    while (i < result.length) merged.push(result[i++]);
    while (j < strand.length) merged.push(strand[j++]);
    result = merged;
    rest = left;
    let k = 0;
    for (const h of result) m.write(k++, h);
    for (const h of rest) m.write(k++, h);
  }
  m.freeRaw(2 * n);
  m.sortedRange(0, n - 1);
}

/** Patience sort: deal into piles (binary search on pile tops), then k-way merge with a min-heap. */
export function patienceSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  m.allocRaw(2 * n);
  const piles: number[][] = [];
  const pileIdx: number[][] = [];
  for (let i = 0; i < n; i++) {
    const h = m.read(i);
    let lo = 0;
    let hi = piles.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const top = piles[mid][piles[mid].length - 1];
      if (m.cmpH(top, h, -1, i) > 0) hi = mid; // top > h -> h can go on this pile
      else lo = mid + 1;
    }
    if (lo === piles.length) {
      piles.push([]);
      pileIdx.push([]);
    }
    piles[lo].push(h);
    pileIdx[lo].push(i);
    m.auxTouch(i);
  }
  // heap of pile indices keyed by their top (smallest at end of each pile)
  const heap: number[] = [];
  const top = (p: number) => piles[p][piles[p].length - 1];
  const less = (x: number, y: number) => {
    const c = m.cmpH(top(x), top(y));
    return c < 0 || (c === 0 && x < y);
  };
  const up = (k: number) => {
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (less(heap[k], heap[p])) {
        [heap[k], heap[p]] = [heap[p], heap[k]];
        m.auxTouch();
        k = p;
      } else break;
    }
  };
  const down = (k: number) => {
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let s = k;
      if (l < heap.length && less(heap[l], heap[s])) s = l;
      if (r < heap.length && less(heap[r], heap[s])) s = r;
      if (s === k) break;
      [heap[k], heap[s]] = [heap[s], heap[k]];
      m.auxTouch();
      k = s;
    }
  };
  for (let p = 0; p < piles.length; p++) {
    heap.push(p);
    up(heap.length - 1);
  }
  for (let k = 0; k < n; k++) {
    const p = heap[0];
    m.write(k, piles[p].pop()!);
    m.sorted(k);
    if (piles[p].length === 0) {
      heap[0] = heap[heap.length - 1];
      heap.pop();
    }
    if (heap.length) down(0);
  }
  m.freeRaw(2 * n);
}

/**
 * Library sort (gapped insertion sort, Bender/Farach-Colton/Mosteiro 2006) with ε = 1.
 * Elements are inserted in index order in rounds of doubling size; after each round the gapped
 * array is rebalanced. The sorted prefix of inserted elements is written back to main after each
 * round (the uninserted suffix of main is untouched), so the main array stays a permutation.
 */
export function librarySort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const cap = 2 * n + 2;
  m.allocRaw(cap);
  let S = new Int32Array(cap).fill(-1);
  S[0] = m.read(0);
  m.auxTouch(0);
  let inserted = 1;
  let used = 1; // S occupies [0, used) with gaps
  const rebalance = () => {
    const items: number[] = [];
    for (let i = 0; i < used; i++) if (S[i] >= 0) items.push(S[i]);
    const next = new Int32Array(cap).fill(-1);
    // spread with one gap after each element
    for (let i = 0; i < items.length; i++) {
      next[2 * i + 1] = items[i];
      m.auxTouch();
    }
    S = next;
    used = 2 * items.length + 1;
    return items;
  };
  let round = 1;
  while (inserted < n) {
    const items = rebalance();
    for (let k = 0; k < items.length; k++) m.write(k, items[k]);
    const target = Math.min(n, inserted + round);
    for (let i = inserted; i < target; i++) {
      const h = m.read(i);
      // binary search among occupied slots of S[0, used)
      let lo = 0;
      let hi = used - 1;
      while (lo <= hi) {
        let mid = (lo + hi) >>> 1;
        let probe = mid;
        while (probe <= hi && S[probe] < 0) probe++;
        if (probe > hi) {
          probe = mid;
          while (probe >= lo && S[probe] < 0) probe--;
          if (probe < lo) break;
        }
        mid = probe;
        if (m.cmpH(h, S[mid], i, -1) < 0) hi = mid - 1;
        else lo = mid + 1;
      }
      // insert at lo: shift right until a gap is found
      let pos = lo;
      let carry = h;
      while (pos < cap && S[pos] >= 0) {
        const t = S[pos];
        S[pos] = carry;
        m.auxTouch();
        carry = t;
        pos++;
      }
      S[pos] = carry;
      m.auxTouch();
      if (pos + 1 > used) used = pos + 1;
    }
    inserted = target;
    round *= 2;
  }
  const items = rebalance();
  for (let k = 0; k < items.length; k++) {
    m.write(k, items[k]);
    m.sorted(k);
  }
  m.freeRaw(cap);
}
