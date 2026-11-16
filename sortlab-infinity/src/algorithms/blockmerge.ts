import type { AlgoDef } from './types';
import type { SortContext } from '../core/context';

/* ==========================================================================
 * GrailSort — Andrey Astrelin (2013). Port of the reference C implementation
 * (grail_commonSort without an external buffer). Stable, in place, O(n log n).
 * All indices are absolute positions in the context array.
 * ======================================================================== */
function grailSort(ctx: SortContext) {
  const cmp = (i: number, j: number) => ctx.cmp(i, j);
  const swap1 = (i: number, j: number) => ctx.swap(i, j);
  const swapN = (a: number, b: number, n: number) => {
    for (let k = 0; k < n; k++) ctx.swap(a + k, b + k);
  };
  const rotate = (a: number, l1: number, l2: number) => {
    while (l1 && l2) {
      if (l1 <= l2) {
        swapN(a, a + l1, l1);
        a += l1;
        l2 -= l1;
      } else {
        swapN(a + (l1 - l2), a + l1, l2);
        l1 -= l2;
      }
    }
  };
  const binSearchLeft = (arr: number, len: number, key: number) => {
    let a = -1;
    let b = len;
    while (a < b - 1) {
      const c = a + ((b - a) >> 1);
      if (cmp(arr + c, key) >= 0) b = c;
      else a = c;
    }
    return b;
  };
  const binSearchRight = (arr: number, len: number, key: number) => {
    let a = -1;
    let b = len;
    while (a < b - 1) {
      const c = a + ((b - a) >> 1);
      if (cmp(arr + c, key) > 0) b = c;
      else a = c;
    }
    return b;
  };
  const sortIns = (arr: number, len: number) => {
    for (let i = 1; i < len; i++) for (let j = i - 1; j >= 0 && cmp(arr + j + 1, arr + j) < 0; j--) swap1(arr + j, arr + j + 1);
  };
  const findKeys = (arr: number, len: number, nkeys: number) => {
    let h = 1;
    let h0 = 0;
    let u = 1;
    while (u < len && h < nkeys) {
      const r = binSearchLeft(arr + h0, h, arr + u);
      if (r === h || cmp(arr + u, arr + h0 + r) !== 0) {
        rotate(arr + h0, h, u - (h0 + h));
        h0 = u - h;
        rotate(arr + h0 + r, h - r, 1);
        h++;
      }
      u++;
    }
    rotate(arr, h0, h);
    return h;
  };
  const mergeWithoutBuffer = (arr: number, len1: number, len2: number) => {
    if (len1 < len2) {
      while (len1) {
        const h = binSearchLeft(arr + len1, len2, arr);
        if (h !== 0) {
          rotate(arr, len1, h);
          arr += h;
          len2 -= h;
        }
        if (len2 === 0) break;
        do {
          arr++;
          len1--;
        } while (len1 && cmp(arr, arr + len1) <= 0);
      }
    } else {
      while (len2) {
        const h = binSearchRight(arr, len1, arr + (len1 + len2 - 1));
        if (h !== len1) {
          rotate(arr + h, len1 - h, len2);
          len1 = h;
        }
        if (len1 === 0) break;
        do {
          len2--;
        } while (len2 && cmp(arr + len1 - 1, arr + len1 + len2 - 1) <= 0);
      }
    }
  };
  // arr[M..-1] is the buffer; arr[0,L1) ++ arr[L1,L1+L2) -> arr[M, M+L1+L2)
  const mergeLeft = (arr: number, L1: number, L2: number, M: number) => {
    let p0 = 0;
    let p1 = L1;
    L2 += L1;
    while (p1 < L2) {
      if (p0 === L1 || cmp(arr + p0, arr + p1) > 0) swap1(arr + M++, arr + p1++);
      else swap1(arr + M++, arr + p0++);
    }
    if (M !== p0) swapN(arr + M, arr + p0, L1 - p0);
  };
  const mergeRight = (arr: number, L1: number, L2: number, M: number) => {
    let p0 = L1 + L2 + M - 1;
    let p2 = L1 + L2 - 1;
    let p1 = L1 - 1;
    while (p1 >= 0) {
      if (p2 < L1 || cmp(arr + p1, arr + p2) > 0) swap1(arr + p0--, arr + p1--);
      else swap1(arr + p0--, arr + p2--);
    }
    if (p2 !== p0) while (p2 >= L1) swap1(arr + p0--, arr + p2--);
  };
  const smartMergeWithBuffer = (arr: number, st: { len: number; type: number }, len2: number, lkeys: number) => {
    let p0 = -lkeys;
    let p1 = 0;
    let p2 = st.len;
    let q1 = p2;
    let q2 = p2 + len2;
    const ftype = 1 - st.type;
    while (p1 < q1 && p2 < q2) {
      if (cmp(arr + p1, arr + p2) - ftype < 0) swap1(arr + p0++, arr + p1++);
      else swap1(arr + p0++, arr + p2++);
    }
    if (p1 < q1) {
      st.len = q1 - p1;
      while (p1 < q1) swap1(arr + --q1, arr + --q2);
    } else {
      st.len = q2 - p2;
      st.type = ftype;
    }
  };
  const smartMergeWithoutBuffer = (arr: number, st: { len: number; type: number }, len2: number) => {
    if (!len2) return;
    let len1 = st.len;
    const ftype = 1 - st.type;
    if (len1 && cmp(arr + len1 - 1, arr + len1) - ftype >= 0) {
      while (len1) {
        const h = ftype ? binSearchLeft(arr + len1, len2, arr) : binSearchRight(arr + len1, len2, arr);
        if (h !== 0) {
          rotate(arr, len1, h);
          arr += h;
          len2 -= h;
        }
        if (len2 === 0) {
          st.len = len1;
          return;
        }
        do {
          arr++;
          len1--;
        } while (len1 && cmp(arr, arr + len1) - ftype < 0);
      }
    }
    st.len = len2;
    st.type = ftype;
  };
  const mergeBuffersLeft = (keys: number, midkey: number, arr: number, nblock: number, lblock: number, havebuf: boolean, nblock2: number, llast: number) => {
    if (nblock === 0) {
      const l = nblock2 * lblock;
      if (havebuf) mergeLeft(arr, l, llast, -lblock);
      else mergeWithoutBuffer(arr, l, llast);
      return;
    }
    const st = { len: lblock, type: cmp(keys, midkey) < 0 ? 0 : 1 };
    let pidx = lblock;
    let prest: number;
    for (let cidx = 1; cidx < nblock; cidx++, pidx += lblock) {
      prest = pidx - st.len;
      const fnext = cmp(keys + cidx, midkey) < 0 ? 0 : 1;
      if (fnext === st.type) {
        if (havebuf) swapN(arr + prest - lblock, arr + prest, st.len);
        st.len = lblock;
      } else if (havebuf) smartMergeWithBuffer(arr + prest, st, lblock, lblock);
      else smartMergeWithoutBuffer(arr + prest, st, lblock);
    }
    prest = pidx - st.len;
    if (llast) {
      if (st.type) {
        if (havebuf) swapN(arr + prest - lblock, arr + prest, st.len);
        prest = pidx;
        st.len = lblock * nblock2;
        st.type = 0;
      } else st.len += lblock * nblock2;
      if (havebuf) mergeLeft(arr + prest, st.len, llast, -lblock);
      else mergeWithoutBuffer(arr + prest, st.len, llast);
    } else if (havebuf) swapN(arr + prest, arr + prest - lblock, st.len);
  };
  const lazyStableSort = (arr: number, L: number) => {
    for (let m = 1; m < L; m += 2) if (cmp(arr + m - 1, arr + m) > 0) swap1(arr + m - 1, arr + m);
    for (let h = 2; h < L; h *= 2) {
      let p0 = 0;
      const p1 = L - 2 * h;
      while (p0 <= p1) {
        mergeWithoutBuffer(arr + p0, h, h);
        p0 += 2 * h;
      }
      const rest = L - p0;
      if (rest > h) mergeWithoutBuffer(arr + p0, h, rest - h);
    }
  };
  // arr[-K..-1] is a buffer of K elements; builds sorted runs of length 2K in arr[0, L)
  const buildBlocks = (arr: number, L: number, K: number) => {
    for (let m = 1; m < L; m += 2) {
      const u = cmp(arr + m - 1, arr + m) > 0 ? 1 : 0;
      swap1(arr + m - 3, arr + m - 1 + u);
      swap1(arr + m - 2, arr + m - u);
    }
    if (L % 2) swap1(arr + L - 1, arr + L - 3);
    arr -= 2;
    let h = 2;
    for (; h < K; h *= 2) {
      let p0 = 0;
      const p1 = L - 2 * h;
      while (p0 <= p1) {
        mergeLeft(arr + p0, h, h, -h);
        p0 += 2 * h;
      }
      const rest = L - p0;
      if (rest > h) mergeLeft(arr + p0, h, rest - h, -h);
      else rotate(arr + p0 - h, h, rest);
      arr -= h;
    }
    const restk = L % (2 * K);
    let p = L - restk;
    if (restk <= K) rotate(arr + p, restk, K);
    else mergeRight(arr + p, K, restk - K, K);
    while (p > 0) {
      p -= 2 * K;
      mergeRight(arr + p, K, K, K);
    }
  };
  const combineBlocks = (keys: number, arr: number, len: number, LL: number, lblock: number, havebuf: boolean) => {
    const M = Math.floor(len / (2 * LL));
    let lrest = len % (2 * LL);
    if (lrest <= LL) {
      len -= lrest;
      lrest = 0;
    }
    for (let b = 0; b <= M; b++) {
      if (b === M && lrest === 0) break;
      const arr1 = arr + b * 2 * LL;
      const NBlk = Math.floor((b === M ? lrest : 2 * LL) / lblock);
      sortIns(keys, NBlk + (b === M ? 1 : 0));
      let midkey = LL / lblock;
      for (let u = 1; u < NBlk; u++) {
        let p = u - 1;
        for (let v = u; v < NBlk; v++) {
          const kc = cmp(arr1 + p * lblock, arr1 + v * lblock);
          if (kc > 0 || (kc === 0 && cmp(keys + p, keys + v) > 0)) p = v;
        }
        if (p !== u - 1) {
          swapN(arr1 + (u - 1) * lblock, arr1 + p * lblock, lblock);
          swap1(keys + u - 1, keys + p);
          if (midkey === u - 1 || midkey === p) midkey ^= (u - 1) ^ p;
        }
      }
      let nbl2 = 0;
      let llast = 0;
      if (b === M) llast = lrest % lblock;
      if (llast !== 0) while (nbl2 < NBlk && cmp(arr1 + NBlk * lblock, arr1 + (NBlk - nbl2 - 1) * lblock) < 0) nbl2++;
      mergeBuffersLeft(keys, keys + midkey, arr1, NBlk - nbl2, lblock, havebuf, nbl2, llast);
    }
    if (havebuf) while (--len >= 0) swap1(arr + len, arr + len - lblock);
  };

  const Len = ctx.n;
  if (Len < 16) {
    sortIns(0, Len);
    return;
  }
  let lblock = 1;
  while (lblock * lblock < Len) lblock *= 2;
  let nkeys = Math.floor((Len - 1) / lblock) + 1;
  const findkeys = findKeys(0, Len, nkeys + lblock);
  let havebuf = true;
  if (findkeys < nkeys + lblock) {
    if (findkeys < 4) {
      lazyStableSort(0, Len);
      return;
    }
    nkeys = lblock;
    while (nkeys > findkeys) nkeys = Math.floor(nkeys / 2);
    havebuf = false;
    lblock = 0;
  }
  const ptr = lblock + nkeys;
  let cbuf = havebuf ? lblock : nkeys;
  buildBlocks(ptr, Len - ptr, cbuf);
  while (Len - ptr > (cbuf *= 2)) {
    let lb = lblock;
    let chavebuf = havebuf;
    if (!havebuf) {
      if (nkeys > 4 && Math.floor(nkeys / 8) * nkeys >= cbuf) {
        lb = Math.floor(nkeys / 2);
        chavebuf = true;
      } else {
        let nk = 1;
        let s = Math.floor((cbuf * findkeys) / 2);
        while (nk < nkeys && s !== 0) {
          nk *= 2;
          s = Math.floor(s / 8);
        }
        lb = Math.floor((2 * cbuf) / nk);
      }
    }
    combineBlocks(0, ptr, Len - ptr, cbuf, lb, chavebuf);
  }
  sortIns(0, ptr);
  mergeWithoutBuffer(0, ptr, Len - ptr);
}

/* ==========================================================================
 * WikiSort — BonzaiThePenguin (2014), block merge sort after Kim & Kutzner's
 * "Ratio based stable in-place merging" (2008). Port of the reference
 * WikiSort.c with the external cache size set to 0, so every merge uses the
 * two internal buffers (or the strictly in-place fallback).
 * ======================================================================== */
type Range = { start: number; end: number };
const R = (start: number, end: number): Range => ({ start, end });
const len = (r: Range) => r.end - r.start;

function floorPow2(v: number) {
  let x = 1;
  while (x * 2 <= v) x *= 2;
  return x;
}

class WikiIterator {
  size: number;
  powerOfTwo: number;
  numerator = 0;
  decimal = 0;
  denominator: number;
  decimalStep: number;
  numeratorStep: number;
  constructor(size: number, minLevel: number) {
    this.size = size;
    this.powerOfTwo = floorPow2(size);
    this.denominator = Math.floor(this.powerOfTwo / minLevel);
    this.numeratorStep = size % this.denominator;
    this.decimalStep = Math.floor(size / this.denominator);
    this.begin();
  }
  begin() {
    this.numerator = this.decimal = 0;
  }
  nextRange(): Range {
    const start = this.decimal;
    this.decimal += this.decimalStep;
    this.numerator += this.numeratorStep;
    if (this.numerator >= this.denominator) {
      this.numerator -= this.denominator;
      this.decimal++;
    }
    return R(start, this.decimal);
  }
  finished() {
    return this.decimal >= this.size;
  }
  nextLevel() {
    this.decimalStep += this.decimalStep;
    this.numeratorStep += this.numeratorStep;
    if (this.numeratorStep >= this.denominator) {
      this.numeratorStep -= this.denominator;
      this.decimalStep++;
    }
    return this.decimalStep < this.size;
  }
  length() {
    return this.decimalStep;
  }
}

function wikiSort(ctx: SortContext) {
  const size = ctx.n;
  /** array[i] < array[j] */
  const lt = (i: number, j: number) => ctx.cmp(i, j) < 0;
  const swap = (i: number, j: number) => ctx.swap(i, j);
  const blockSwap = (s1: number, s2: number, n: number) => {
    for (let k = 0; k < n; k++) swap(s1 + k, s2 + k);
  };
  const reverse = (r: Range) => ctx.reverse(r.start, r.end - 1);
  const rotate = (amount: number, r: Range) => {
    if (len(r) === 0) return;
    const r1 = R(r.start, r.start + amount);
    const r2 = R(r.start + amount, r.end);
    reverse(r1);
    reverse(r2);
    reverse(r);
  };
  // searches compare against the value currently at index v (searches never modify the array)
  const binaryFirst = (v: number, r: Range) => {
    let start = r.start;
    let end = r.end - 1;
    if (r.start >= r.end) return r.start;
    while (start < end) {
      const mid = start + Math.floor((end - start) / 2);
      if (lt(mid, v)) start = mid + 1;
      else end = mid;
    }
    if (start === r.end - 1 && lt(start, v)) start++;
    return start;
  };
  const binaryLast = (v: number, r: Range) => {
    let start = r.start;
    let end = r.end - 1;
    if (r.start >= r.end) return r.end;
    while (start < end) {
      const mid = start + Math.floor((end - start) / 2);
      if (!lt(v, mid)) start = mid + 1;
      else end = mid;
    }
    if (start === r.end - 1 && !lt(v, start)) start++;
    return start;
  };
  const findFirstForward = (v: number, r: Range, unique: number) => {
    if (len(r) === 0) return r.start;
    const skip = Math.max(Math.floor(len(r) / unique), 1);
    let index: number;
    for (index = r.start + skip; lt(index - 1, v); index += skip) if (index >= r.end - skip) return binaryFirst(v, R(index, r.end));
    return binaryFirst(v, R(index - skip, index));
  };
  const findLastForward = (v: number, r: Range, unique: number) => {
    if (len(r) === 0) return r.start;
    const skip = Math.max(Math.floor(len(r) / unique), 1);
    let index: number;
    for (index = r.start + skip; !lt(v, index - 1); index += skip) if (index >= r.end - skip) return binaryLast(v, R(index, r.end));
    return binaryLast(v, R(index - skip, index));
  };
  const findFirstBackward = (v: number, r: Range, unique: number) => {
    if (len(r) === 0) return r.start;
    const skip = Math.max(Math.floor(len(r) / unique), 1);
    let index: number;
    for (index = r.end - skip; index > r.start && !lt(index - 1, v); index -= skip) if (index < r.start + skip) return binaryFirst(v, R(r.start, index));
    return binaryFirst(v, R(index, index + skip));
  };
  const findLastBackward = (v: number, r: Range, unique: number) => {
    if (len(r) === 0) return r.start;
    const skip = Math.max(Math.floor(len(r) / unique), 1);
    let index: number;
    for (index = r.end - skip; index > r.start && lt(v, index - 1); index -= skip) if (index < r.start + skip) return binaryLast(v, R(r.start, index));
    return binaryLast(v, R(index, index + skip));
  };
  const insertionSort = (r: Range) => {
    for (let i = r.start + 1; i < r.end; i++) {
      const temp = ctx.get(i);
      let j = i;
      while (j > r.start && ctx.cmpi(j - 1, temp) > 0) {
        ctx.set(j, ctx.get(j - 1));
        j--;
      }
      if (j !== i) ctx.set(j, temp);
    }
  };
  /** A's contents must already sit in `buffer`; merges into A.start.. using swaps. */
  const mergeInternal = (A: Range, B: Range, buffer: Range) => {
    let aCount = 0;
    let bCount = 0;
    let insert = 0;
    if (len(B) > 0 && len(A) > 0) {
      for (;;) {
        if (!lt(B.start + bCount, buffer.start + aCount)) {
          swap(A.start + insert, buffer.start + aCount);
          aCount++;
          insert++;
          if (aCount >= len(A)) break;
        } else {
          swap(A.start + insert, B.start + bCount);
          bCount++;
          insert++;
          if (bCount >= len(B)) break;
        }
      }
    }
    blockSwap(buffer.start + aCount, A.start + insert, len(A) - aCount);
  };
  const mergeInPlace = (A: Range, B: Range) => {
    if (len(A) === 0 || len(B) === 0) return;
    for (;;) {
      const mid = binaryFirst(A.start, B);
      const amount = mid - A.end;
      rotate(len(A), R(A.start, mid));
      B = R(mid, B.end);
      A = R(A.start + amount, mid);
      if (len(A) === 0) break;
      A.start = binaryLast(A.start, A);
      if (len(A) === 0) break;
    }
  };

  if (size < 4) {
    if (size === 3) {
      if (lt(1, 0)) swap(0, 1);
      if (lt(2, 1)) {
        swap(1, 2);
        if (lt(1, 0)) swap(0, 1);
      }
    } else if (size === 2) {
      if (lt(1, 0)) swap(0, 1);
    }
    return;
  }

  // Sort groups of 4–8 items with sorting networks, tracking original order to stay stable.
  const it = new WikiIterator(size, 4);
  it.begin();
  while (!it.finished()) {
    const order = [0, 1, 2, 3, 4, 5, 6, 7];
    const range = it.nextRange();
    const S = (x: number, y: number) => {
      const c = ctx.cmp(range.start + y, range.start + x);
      if (c < 0 || (order[x] > order[y] && c === 0)) {
        swap(range.start + x, range.start + y);
        const t = order[x];
        order[x] = order[y];
        order[y] = t;
      }
    };
    const l = len(range);
    if (l === 8) {
      S(0, 1); S(2, 3); S(4, 5); S(6, 7);
      S(0, 2); S(1, 3); S(4, 6); S(5, 7);
      S(1, 2); S(5, 6); S(0, 4); S(3, 7);
      S(1, 5); S(2, 6);
      S(1, 4); S(3, 6);
      S(2, 4); S(3, 5);
      S(3, 4);
    } else if (l === 7) {
      S(1, 2); S(3, 4); S(5, 6);
      S(0, 2); S(3, 5); S(4, 6);
      S(0, 1); S(4, 5); S(2, 6);
      S(0, 4); S(1, 5);
      S(0, 3); S(2, 5);
      S(1, 3); S(2, 4);
      S(2, 3);
    } else if (l === 6) {
      S(1, 2); S(4, 5);
      S(0, 2); S(3, 5);
      S(0, 1); S(3, 4); S(2, 5);
      S(0, 3); S(1, 4);
      S(2, 4); S(1, 3);
      S(2, 3);
    } else if (l === 5) {
      S(0, 1); S(3, 4);
      S(2, 4);
      S(2, 3); S(1, 4);
      S(0, 3);
      S(0, 2); S(1, 3);
      S(1, 2);
    } else if (l === 4) {
      S(0, 1); S(2, 3);
      S(0, 2); S(1, 3);
      S(1, 2);
    }
  }
  if (size < 8) return;

  for (;;) {
    let blockSize = Math.floor(Math.sqrt(it.length()));
    let bufferSize = Math.floor(it.length() / blockSize) + 1;
    let index = 0;
    let last: number;
    let count: number;
    let pullIndex = 0;
    const pull = [
      { from: 0, to: 0, count: 0, range: R(0, 0) },
      { from: 0, to: 0, count: 0, range: R(0, 0) },
    ];
    let buffer1 = R(0, 0);
    let buffer2 = R(0, 0);
    let find = bufferSize + bufferSize;
    let findSeparately = false;
    if (find > it.length()) {
      find = bufferSize;
      findSeparately = true;
    }
    let A: Range;
    let B: Range;
    const PULL = (to: number) => {
      pull[pullIndex].range = R(A.start, B.end);
      pull[pullIndex].count = count;
      pull[pullIndex].from = index;
      pull[pullIndex].to = to;
    };

    it.begin();
    while (!it.finished()) {
      A = it.nextRange();
      B = it.nextRange();

      for (last = A.start, count = 1; count < find; last = index, count++) {
        index = findLastForward(last, R(last + 1, A.end), find - count);
        if (index === A.end) break;
      }
      index = last;
      if (count >= bufferSize) {
        PULL(A.start);
        pullIndex = 1;
        if (count === bufferSize + bufferSize) {
          buffer1 = R(A.start, A.start + bufferSize);
          buffer2 = R(A.start + bufferSize, A.start + count);
          break;
        } else if (find === bufferSize + bufferSize) {
          buffer1 = R(A.start, A.start + count);
          find = bufferSize;
        } else if (findSeparately) {
          buffer1 = R(A.start, A.start + count);
          findSeparately = false;
        } else {
          buffer2 = R(A.start, A.start + count);
          break;
        }
      } else if (pullIndex === 0 && count > len(buffer1)) {
        buffer1 = R(A.start, A.start + count);
        PULL(A.start);
      }

      for (last = B.end - 1, count = 1; count < find; last = index - 1, count++) {
        index = findFirstBackward(last, R(B.start, last), find - count);
        if (index === B.start) break;
      }
      index = last;
      if (count >= bufferSize) {
        PULL(B.end);
        pullIndex = 1;
        if (count === bufferSize + bufferSize) {
          buffer1 = R(B.end - count, B.end - bufferSize);
          buffer2 = R(B.end - bufferSize, B.end);
          break;
        } else if (find === bufferSize + bufferSize) {
          buffer1 = R(B.end - count, B.end);
          find = bufferSize;
        } else if (findSeparately) {
          buffer1 = R(B.end - count, B.end);
          findSeparately = false;
        } else {
          if (pull[0].range.start === A.start) pull[0].range.end -= pull[1].count;
          buffer2 = R(B.end - count, B.end);
          break;
        }
      } else if (pullIndex === 0 && count > len(buffer1)) {
        buffer1 = R(B.end - count, B.end);
        PULL(B.end);
      }
    }

    // pull out the two ranges so we can use them as internal buffers
    for (pullIndex = 0; pullIndex < 2; pullIndex++) {
      const p = pull[pullIndex];
      const length = p.count;
      if (p.to < p.from) {
        index = p.from;
        for (count = 1; count < length; count++) {
          index = findFirstBackward(index - 1, R(p.to, p.from - (count - 1)), length - count);
          const range = R(index + 1, p.from + 1);
          rotate(len(range) - count, range);
          p.from = index + count;
        }
      } else if (p.to > p.from) {
        index = p.from + 1;
        for (count = 1; count < length; count++) {
          index = findLastForward(index, R(index, p.to), length - count);
          const range = R(p.from, index - 1);
          rotate(count, range);
          p.from = index - 1 - count;
        }
      }
    }

    bufferSize = len(buffer1);
    blockSize = Math.floor(it.length() / bufferSize) + 1;

    it.begin();
    while (!it.finished()) {
      A = it.nextRange();
      B = it.nextRange();
      const start = A.start;
      if (start === pull[0].range.start) {
        if (pull[0].from > pull[0].to) {
          A.start += pull[0].count;
          if (len(A) === 0) continue;
        } else if (pull[0].from < pull[0].to) {
          B.end -= pull[0].count;
          if (len(B) === 0) continue;
        }
      }
      if (start === pull[1].range.start) {
        if (pull[1].from > pull[1].to) {
          A.start += pull[1].count;
          if (len(A) === 0) continue;
        } else if (pull[1].from < pull[1].to) {
          B.end -= pull[1].count;
          if (len(B) === 0) continue;
        }
      }

      if (lt(B.end - 1, A.start)) {
        rotate(len(A), R(A.start, B.end));
      } else if (lt(A.end, A.end - 1)) {
        const blockA = R(A.start, A.end);
        const firstA = R(A.start, A.start + (len(blockA) % blockSize));
        let indexA = buffer1.start;
        for (index = firstA.end; index < blockA.end; indexA++, index += blockSize) swap(indexA, index);

        let lastA = firstA;
        let lastB = R(0, 0);
        const blockB = R(B.start, B.start + Math.min(blockSize, len(B)));
        blockA.start += len(firstA);
        indexA = buffer1.start;

        if (len(lastA) > 0 && len(buffer2) > 0) blockSwap(lastA.start, buffer2.start, len(lastA));

        if (len(blockA) > 0) {
          for (;;) {
            if ((len(lastB) > 0 && !lt(lastB.end - 1, indexA)) || len(blockB) === 0) {
              const bSplit = binaryFirst(indexA, lastB);
              const bRemaining = lastB.end - bSplit;
              let minA = blockA.start;
              for (let findA = minA + blockSize; findA < blockA.end; findA += blockSize) if (lt(findA, minA)) minA = findA;
              blockSwap(blockA.start, minA, blockSize);
              swap(blockA.start, indexA);
              indexA++;

              if (len(lastA) > 0) {
                if (len(buffer2) > 0) mergeInternal(lastA, R(lastA.end, bSplit), buffer2);
                else mergeInPlace(lastA, R(lastA.end, bSplit));
              }

              if (len(buffer2) > 0) {
                blockSwap(blockA.start, buffer2.start, blockSize);
                blockSwap(bSplit, blockA.start + blockSize - bRemaining, bRemaining);
              } else {
                rotate(blockA.start - bSplit, R(bSplit, blockA.start + blockSize));
              }

              lastA = R(blockA.start - bRemaining, blockA.start - bRemaining + blockSize);
              lastB = R(lastA.end, lastA.end + bRemaining);

              blockA.start += blockSize;
              if (len(blockA) === 0) break;
            } else if (len(blockB) < blockSize) {
              rotate(blockB.start - blockA.start, R(blockA.start, blockB.end));
              lastB = R(blockA.start, blockA.start + len(blockB));
              blockA.start += len(blockB);
              blockA.end += len(blockB);
              blockB.end = blockB.start;
            } else {
              blockSwap(blockA.start, blockB.start, blockSize);
              lastB = R(blockA.start, blockA.start + blockSize);
              blockA.start += blockSize;
              blockA.end += blockSize;
              blockB.start += blockSize;
              if (blockB.end > B.end - blockSize) blockB.end = B.end;
              else blockB.end += blockSize;
            }
          }
        }

        if (len(lastA) > 0) {
          if (len(buffer2) > 0) mergeInternal(lastA, R(lastA.end, B.end), buffer2);
          else mergeInPlace(lastA, R(lastA.end, B.end));
        }
      }
    }

    // the second buffer is jumbled: insertion sort it, then redistribute both buffers
    insertionSort(buffer2);
    for (pullIndex = 0; pullIndex < 2; pullIndex++) {
      const p = pull[pullIndex];
      let unique = p.count * 2;
      if (p.from > p.to) {
        const buffer = R(p.range.start, p.range.start + p.count);
        while (len(buffer) > 0) {
          index = findFirstForward(buffer.start, R(buffer.end, p.range.end), unique);
          const amount = index - buffer.end;
          rotate(len(buffer), R(buffer.start, index));
          buffer.start += amount + 1;
          buffer.end += amount;
          unique -= 2;
        }
      } else if (p.from < p.to) {
        const buffer = R(p.range.end - p.count, p.range.end);
        while (len(buffer) > 0) {
          index = findLastBackward(buffer.end - 1, R(p.range.start, buffer.start), unique);
          const amount = buffer.start - index;
          rotate(amount, R(index, buffer.end));
          buffer.start -= amount;
          buffer.end -= amount + 1;
          unique -= 2;
        }
      }
    }

    if (!it.nextLevel()) break;
  }
}

export const blockMergeSorts: AlgoDef[] = [
  {
    id: 'grail',
    name: 'GrailSort',
    category: 'Merge',
    best: 'O(n log n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: true,
    inPlace: true,
    maxN: 32768,
    notes: 'Andrey Astrelin (2013), port of the reference grail_commonSort without external buffer. Block merge sort based on Huang & Langston.',
    description:
      'A stable, in-place, worst-case O(n log n) block merge sort. It first collects about 2√n unique "keys" to the front of the array: one part becomes a movable merge buffer, the other tags blocks so equal elements keep their order. Runs are built with the buffer, then pairs of runs are cut into √n-sized blocks, the blocks are selection-sorted by their first element, and neighbouring blocks are merged locally. Finally the keys are sorted and merged back in. If there are too few unique values it falls back to buffer-less rotation merging.',
    run(ctx) {
      grailSort(ctx);
    },
  },
  {
    id: 'wiki',
    name: 'WikiSort',
    category: 'Merge',
    best: 'O(n)',
    average: 'O(n log n)',
    worst: 'O(n log n)',
    space: 'O(1)',
    stable: true,
    inPlace: true,
    maxN: 32768,
    notes: 'BonzaiThePenguin (2014), port of the reference WikiSort.c with a cache size of 0. Based on Kim & Kutzner, "Ratio Based Stable In-Place Merging" (2008). Also known as Block Sort.',
    description:
      'A stable, in-place block merge sort. Groups of 4–8 items are sorted with sorting networks, then a bottom-up merge sort runs level by level. On each level two internal buffers of √A unique values are "pulled out": the first tags each A block, the second is a swap area for local merges. A blocks are rolled through the B blocks, each dropped behind as soon as its tagged first value fits, and merged with the B values that follow. Afterwards the buffers are sorted and redistributed.',
    run(ctx) {
      wikiSort(ctx);
    },
  },
];
