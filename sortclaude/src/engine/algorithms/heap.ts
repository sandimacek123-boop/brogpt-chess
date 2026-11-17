import type { Machine } from '../machine';

// ---------------------------------------------------------------------------- binary max-heap
function siftDown(m: Machine, base: number, root: number, size: number): void {
  for (;;) {
    let child = 2 * root + 1;
    if (child >= size) return;
    if (child + 1 < size && m.lt(base + child, base + child + 1)) child++;
    if (m.lt(base + root, base + child)) {
      m.swap(base + root, base + child);
      root = child;
    } else return;
  }
}

/** Heap sort of main[lo..hi] (inclusive). Exposed for IntroSort. */
export function heapSortRange(m: Machine, lo: number, hi: number): void {
  const size = hi - lo + 1;
  for (let i = (size >> 1) - 1; i >= 0; i--) siftDown(m, lo, i, size);
  for (let end = size - 1; end > 0; end--) {
    m.swap(lo, lo + end);
    m.sorted(lo + end);
    siftDown(m, lo, 0, end);
  }
  m.sorted(lo);
}

export function heapSort(m: Machine): void {
  if (m.n < 2) return;
  heapSortRange(m, 0, m.n - 1);
}

// ---------------------------------------------------------------------------- bottom-up heapsort (Wegener)
export function bottomUpHeapSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const leafSearch = (i: number, end: number): number => {
    let j = i;
    while (2 * j + 2 < end) j = m.gt(2 * j + 2, 2 * j + 1) ? 2 * j + 2 : 2 * j + 1;
    if (2 * j + 1 < end) j = 2 * j + 1;
    return j;
  };
  const sift = (i: number, end: number) => {
    let j = leafSearch(i, end);
    while (j > i && m.gt(i, j)) j = (j - 1) >> 1;
    if (j === i) return;
    let x = m.read(j);
    m.move(j, i);
    while (j > i) {
      const p = (j - 1) >> 1;
      const t = m.read(p);
      m.write(p, x);
      x = t;
      j = p;
    }
  };
  for (let i = (n >> 1) - 1; i >= 0; i--) sift(i, n);
  for (let end = n - 1; end > 0; end--) {
    m.swap(0, end);
    m.sorted(end);
    sift(0, end);
  }
  m.sorted(0);
}

// ---------------------------------------------------------------------------- ternary heap
export function ternaryHeapSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const sift = (root: number, size: number) => {
    for (;;) {
      let best = root;
      for (let c = 3 * root + 1; c <= 3 * root + 3 && c < size; c++) if (m.lt(best, c)) best = c;
      if (best === root) return;
      m.swap(root, best);
      root = best;
    }
  };
  for (let i = Math.floor((n - 2) / 3); i >= 0; i--) sift(i, n);
  for (let end = n - 1; end > 0; end--) {
    m.swap(0, end);
    m.sorted(end);
    sift(0, end);
  }
  m.sorted(0);
}

// ---------------------------------------------------------------------------- weak heap (Dutton 1993)
export function weakHeapSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  m.allocRaw(Math.ceil(n / 32));
  const r = new Uint8Array(n);
  const gparent = (j: number): number => {
    while ((j & 1) === r[j >> 1]) j >>= 1;
    return j >> 1;
  };
  const merge = (i: number, j: number) => {
    if (m.lt(i, j)) {
      m.swap(i, j);
      r[j] ^= 1;
    }
  };
  for (let j = n - 1; j >= 1; j--) merge(gparent(j), j);
  for (let end = n - 1; end >= 2; end--) {
    m.swap(0, end);
    m.sorted(end);
    let x = 1;
    let y: number;
    while ((y = 2 * x + r[x]) < end) x = y;
    while (x > 0) {
      merge(0, x);
      x >>= 1;
    }
  }
  m.swap(0, 1);
  m.sorted(1);
  m.sorted(0);
  m.freeRaw(Math.ceil(n / 32));
}

// ---------------------------------------------------------------------------- smoothsort (Dijkstra 1981)
const LP: number[] = (() => {
  const l = [1, 1];
  while (l[l.length - 1] < 2 ** 31) l.push(l[l.length - 1] + l[l.length - 2] + 1);
  return l;
})();

/**
 * Smoothsort with Leonardo heaps. The bit vector `p` and order `pshift` follow the well-known
 * formulation (p has a bit for every Leonardo heap currently on the forest). Shifts are written
 * as multiplications/divisions so the vector is exact beyond 32 bits.
 */
export function smoothSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const hi = n - 1;
  const shl = (x: number, k: number) => x * 2 ** k;
  const shr = (x: number, k: number) => Math.floor(x / 2 ** k);
  const ntz = (x: number) => {
    let c = 0;
    while (x > 0 && x % 2 === 0) {
      x /= 2;
      c++;
    }
    return c;
  };
  const clearLow = (x: number) => (x % 2 === 1 ? x - 1 : x); // p & ~1

  const sift = (pshift: number, head: number) => {
    const val = m.read(head);
    while (pshift > 1) {
      const rt = head - 1;
      const lf = head - 1 - LP[pshift - 2];
      if (m.cmpHI(val, lf, head) >= 0 && m.cmpHI(val, rt, head) >= 0) break;
      if (m.cmp(lf, rt) >= 0) {
        m.move(head, lf);
        head = lf;
        pshift -= 1;
      } else {
        m.move(head, rt);
        head = rt;
        pshift -= 2;
      }
    }
    m.write(head, val);
  };

  const trinkle = (p: number, pshift: number, head: number, trusty: boolean) => {
    const val = m.read(head);
    while (p !== 1) {
      const stepson = head - LP[pshift];
      if (m.cmpHI(val, stepson, head) >= 0) break; // a[stepson] <= val
      if (!trusty && pshift > 1) {
        const rt = head - 1;
        const lf = head - 1 - LP[pshift - 2];
        if (m.cmp(rt, stepson) >= 0 || m.cmp(lf, stepson) >= 0) break;
      }
      m.move(head, stepson);
      head = stepson;
      const trail = ntz(clearLow(p));
      p = shr(p, trail);
      pshift += trail;
      trusty = false;
    }
    if (!trusty) {
      m.write(head, val);
      sift(pshift, head);
    }
  };

  let head = 0;
  let p = 1;
  let pshift = 1;
  while (head < hi) {
    if (p % 4 === 3) {
      sift(pshift, head);
      p = shr(p, 2);
      pshift += 2;
    } else {
      if (LP[pshift - 1] >= hi - head) trinkle(p, pshift, head, false);
      else sift(pshift, head);
      if (pshift === 1) {
        p = shl(p, 1);
        pshift--;
      } else {
        p = shl(p, pshift - 1);
        pshift = 1;
      }
    }
    p += p % 2 === 0 ? 1 : 0; // p |= 1
    head++;
  }
  trinkle(p, pshift, head, false);
  while (pshift !== 1 || p !== 1) {
    m.sorted(head);
    if (pshift <= 1) {
      const trail = ntz(clearLow(p));
      p = shr(p, trail);
      pshift += trail;
    } else {
      p = shl(p, 2);
      // p ^= 7 on the low three bits
      const low = p % 8;
      p = p - low + (low ^ 7);
      pshift -= 2;
      trinkle(shr(p, 1), pshift + 1, head - LP[pshift] - 1, true);
      trinkle(p, pshift, head - 1, true);
    }
    head--;
  }
  m.sortedRange(0, n - 1);
}
