import type { Machine } from '../machine';

// ============================================================================ exchange sorts
export function bubbleSort(m: Machine): void {
  const n = m.n;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      if (m.gt(j, j + 1)) m.swap(j, j + 1);
    }
    m.sorted(n - 1 - i);
  }
  m.sorted(0);
}

/** Early exit + shrink the pass to the position of the last swap. */
export function optimizedBubbleSort(m: Machine): void {
  let end = m.n - 1;
  while (end > 0) {
    let last = 0;
    for (let j = 0; j < end; j++) {
      if (m.gt(j, j + 1)) {
        m.swap(j, j + 1);
        last = j;
      }
    }
    m.sortedRange(last + 1, end);
    end = last;
  }
  m.sorted(0);
}

export function cocktailShakerSort(m: Machine): void {
  let lo = 0;
  let hi = m.n - 1;
  while (lo < hi) {
    let last = lo;
    for (let j = lo; j < hi; j++) {
      if (m.gt(j, j + 1)) {
        m.swap(j, j + 1);
        last = j;
      }
    }
    m.sortedRange(last + 1, hi);
    hi = last;
    if (lo >= hi) break;
    last = hi;
    for (let j = hi; j > lo; j--) {
      if (m.gt(j - 1, j)) {
        m.swap(j - 1, j);
        last = j;
      }
    }
    m.sortedRange(lo, last - 1);
    lo = last;
  }
  m.sortedRange(0, m.n - 1);
}

export function oddEvenSort(m: Machine): void {
  let sorted = false;
  while (!sorted) {
    sorted = true;
    for (let i = 1; i < m.n - 1; i += 2) {
      if (m.gt(i, i + 1)) {
        m.swap(i, i + 1);
        sorted = false;
      }
    }
    for (let i = 0; i < m.n - 1; i += 2) {
      if (m.gt(i, i + 1)) {
        m.swap(i, i + 1);
        sorted = false;
      }
    }
  }
  m.sortedRange(0, m.n - 1);
}

function combCore(m: Machine, rule11: boolean): void {
  let gap = m.n;
  let swapped = true;
  while (gap > 1 || swapped) {
    gap = Math.floor(gap / 1.3);
    if (rule11 && (gap === 9 || gap === 10)) gap = 11;
    if (gap < 1) gap = 1;
    swapped = false;
    for (let i = 0; i + gap < m.n; i++) {
      if (m.gt(i, i + gap)) {
        m.swap(i, i + gap);
        swapped = true;
      }
    }
  }
  m.sortedRange(0, m.n - 1);
}
export const combSort = (m: Machine) => combCore(m, false);
export const combSort11 = (m: Machine) => combCore(m, true);

export function exchangeSort(m: Machine): void {
  for (let i = 0; i < m.n - 1; i++) {
    for (let j = i + 1; j < m.n; j++) {
      if (m.gt(i, j)) m.swap(i, j);
    }
    m.sorted(i);
  }
  m.sorted(m.n - 1);
}

export function gnomeSort(m: Machine): void {
  let pos = 0;
  while (pos < m.n) {
    if (pos === 0 || !m.gt(pos - 1, pos)) pos++;
    else {
      m.swap(pos, pos - 1);
      pos--;
    }
  }
  m.sortedRange(0, m.n - 1);
}

/** Gnome sort that "teleports" back to where it left off after placing an element. */
export function optimizedGnomeSort(m: Machine): void {
  for (let i = 1; i < m.n; i++) {
    let pos = i;
    while (pos > 0 && m.gt(pos - 1, pos)) {
      m.swap(pos - 1, pos);
      pos--;
    }
  }
  m.sortedRange(0, m.n - 1);
}

/** Circle sort: compare-swap mirrored pairs recursively until a full pass makes no swap. */
export function circleSort(m: Machine): void {
  if (m.n < 2) return;
  const rec = (lo: number, hi: number): boolean => {
    if (lo === hi) return false;
    let swapped = false;
    let l = lo;
    let h = hi;
    while (l < h) {
      if (m.gt(l, h)) {
        m.swap(l, h);
        swapped = true;
      }
      l++;
      h--;
    }
    if (l === h && h + 1 <= hi && m.gt(l, h + 1)) {
      m.swap(l, h + 1);
      swapped = true;
    }
    const mid = lo + Math.floor((hi - lo) / 2);
    const a = rec(lo, mid);
    const b = rec(mid + 1, hi);
    return swapped || a || b;
  };
  while (rec(0, m.n - 1)) {
    /* repeat */
  }
  m.sortedRange(0, m.n - 1);
}

// ============================================================================ selection sorts
export function selectionSort(m: Machine): void {
  for (let i = 0; i < m.n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < m.n; j++) {
      if (m.lt(j, min)) {
        min = j;
        m.pivot(min);
      }
    }
    if (min !== i) m.swap(i, min);
    m.sorted(i);
  }
  m.sorted(m.n - 1);
}

export function doubleSelectionSort(m: Machine): void {
  let lo = 0;
  let hi = m.n - 1;
  while (lo < hi) {
    let min = lo;
    let max = lo;
    for (let j = lo + 1; j <= hi; j++) {
      if (m.lt(j, min)) min = j;
      else if (m.gt(j, max)) max = j;
    }
    if (min !== lo) m.swap(lo, min);
    if (max === lo) max = min; // the maximum was just moved
    if (max !== hi) m.swap(hi, max);
    m.sorted(lo);
    m.sorted(hi);
    lo++;
    hi--;
  }
  m.sortedRange(0, m.n - 1);
}

export function cycleSort(m: Machine): void {
  const n = m.n;
  for (let start = 0; start < n - 1; start++) {
    let item = m.read(start);
    let pos = start;
    for (let i = start + 1; i < n; i++) if (m.cmpHI(item, i) > 0) pos++;
    if (pos === start) {
      m.sorted(start);
      continue;
    }
    while (m.cmpHI(item, pos) === 0) pos++;
    let held = m.read(pos);
    m.write(pos, item);
    m.sorted(pos);
    item = held;
    while (pos !== start) {
      pos = start;
      for (let i = start + 1; i < n; i++) if (m.cmpHI(item, i) > 0) pos++;
      while (pos !== start && m.cmpHI(item, pos) === 0) pos++;
      held = m.read(pos);
      m.write(pos, item);
      m.sorted(pos);
      item = held;
    }
  }
  m.sortedRange(0, n - 1);
}

/** Winner-tree tournament sort. Leaves live in auxiliary memory; winners are written to the output. */
export function tournamentSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  let size = 1;
  while (size < n) size <<= 1;
  const leaves = m.alloc(size);
  const alive = new Uint8Array(size);
  for (let i = 0; i < n; i++) {
    m.toAux(leaves, i, i);
    alive[i] = 1;
  }
  m.allocRaw(size);
  const tree = new Int32Array(2 * size).fill(-1); // internal node -> leaf index of winner
  for (let i = 0; i < size; i++) tree[size + i] = alive[i] ? i : -1;
  const play = (x: number, y: number): number => {
    if (x < 0) return y;
    if (y < 0) return x;
    const c = m.cmpH(leaves.ids[x], leaves.ids[y], x < n ? x : -1, y < n ? y : -1);
    return c <= 0 ? x : y; // ties go to the left (lower index) leaf -> stable
  };
  for (let v = size - 1; v >= 1; v--) {
    tree[v] = play(tree[2 * v], tree[2 * v + 1]);
    m.auxTouch();
  }
  for (let k = 0; k < n; k++) {
    const w = tree[1];
    m.write(k, leaves.ids[w]);
    m.sorted(k);
    let v = size + w;
    tree[v] = -1;
    v >>= 1;
    while (v >= 1) {
      tree[v] = play(tree[2 * v], tree[2 * v + 1]);
      m.auxTouch();
      v >>= 1;
    }
  }
  m.freeRaw(size);
  m.free(leaves);
}

// ============================================================================ insertion sorts
export function insertionSort(m: Machine): void {
  insertionRange(m, 0, m.n - 1);
  m.sortedRange(0, m.n - 1);
}

/** Shifting insertion sort on [lo, hi] (inclusive). Shared by hybrid algorithms. */
export function insertionRange(m: Machine, lo: number, hi: number): void {
  for (let i = lo + 1; i <= hi; i++) {
    const t = m.read(i);
    let j = i - 1;
    while (j >= lo && m.cmpHI(t, j, i) < 0) {
      m.move(j + 1, j);
      j--;
    }
    if (j + 1 !== i) m.write(j + 1, t);
  }
}

export function binaryInsertionSort(m: Machine): void {
  binaryInsertionRange(m, 0, m.n - 1, 1);
  m.sortedRange(0, m.n - 1);
}

/** Binary insertion of elements start..hi into the sorted prefix [lo, start). Stable. */
export function binaryInsertionRange(m: Machine, lo: number, hi: number, startOffset: number): void {
  for (let i = lo + startOffset; i <= hi; i++) {
    const t = m.read(i);
    let l = lo;
    let r = i;
    while (l < r) {
      const mid = (l + r) >>> 1;
      if (m.cmpHI(t, mid, i) < 0) r = mid;
      else l = mid + 1;
    }
    if (l === i) continue;
    for (let j = i; j > l; j--) m.move(j, j - 1);
    m.write(l, t);
  }
}

// ============================================================================ shell sorts
export type GapFn = (n: number) => number[];

function gappedInsertion(m: Machine, gaps: number[]): void {
  for (const gap of gaps) {
    if (gap < 1) continue;
    m.range(gap, gap);
    for (let i = gap; i < m.n; i++) {
      const t = m.read(i);
      let j = i;
      while (j >= gap && m.cmpHI(t, j - gap, i) < 0) {
        m.move(j, j - gap);
        j -= gap;
      }
      if (j !== i) m.write(j, t);
    }
  }
  m.sortedRange(0, m.n - 1);
}

export const gapSequences: Record<string, GapFn> = {
  shell: (n) => {
    const g: number[] = [];
    for (let h = Math.floor(n / 2); h >= 1; h = Math.floor(h / 2)) g.push(h);
    return g.length ? g : [1];
  },
  knuth: (n) => {
    const g: number[] = [];
    for (let h = 1; h < Math.max(2, Math.ceil(n / 3)); h = 3 * h + 1) g.push(h);
    return g.reverse();
  },
  hibbard: (n) => {
    const g: number[] = [];
    for (let k = 1; (1 << k) - 1 < n || k === 1; k++) {
      g.push((1 << k) - 1);
      if (k > 30) break;
    }
    return g.reverse();
  },
  pratt: (n) => {
    const g: number[] = [];
    for (let p2 = 1; p2 < n || p2 === 1; p2 *= 2) {
      for (let v = p2; v < n || v === 1; v *= 3) {
        g.push(v);
        if (v === 1 && n <= 1) break;
      }
      if (n <= 1) break;
    }
    return Array.from(new Set(g)).sort((x, y) => y - x);
  },
  sedgewick: (n) => {
    // Sedgewick 1986: 1, 8, 23, 77, 281, ... = 4^k + 3·2^(k-1) + 1
    const g = [1];
    for (let k = 1; ; k++) {
      const v = Math.pow(4, k) + 3 * Math.pow(2, k - 1) + 1;
      if (v >= n) break;
      g.push(v);
    }
    return g.reverse();
  },
  tokuda: (n) => {
    const g: number[] = [];
    for (let k = 1; ; k++) {
      const v = Math.ceil((Math.pow(9, k) - Math.pow(4, k)) / (5 * Math.pow(4, k - 1)));
      if (v >= n && g.length) break;
      g.push(v);
      if (v >= n) break;
    }
    return g.filter((v) => v < Math.max(n, 2)).reverse();
  },
  ciura: (n) => {
    const base = [1, 4, 10, 23, 57, 132, 301, 701, 1750];
    const g = [...base];
    while (g[g.length - 1] * 2.25 < n) g.push(Math.floor(g[g.length - 1] * 2.25));
    return g.filter((v) => v < Math.max(n, 2)).reverse();
  },
};

export const shellSort = (m: Machine) => gappedInsertion(m, gapSequences.shell(m.n));
export const shellKnuth = (m: Machine) => gappedInsertion(m, gapSequences.knuth(m.n));
export const shellHibbard = (m: Machine) => gappedInsertion(m, gapSequences.hibbard(m.n));
export const shellPratt = (m: Machine) => gappedInsertion(m, gapSequences.pratt(m.n));
export const shellSedgewick = (m: Machine) => gappedInsertion(m, gapSequences.sedgewick(m.n));
export const shellTokuda = (m: Machine) => gappedInsertion(m, gapSequences.tokuda(m.n));
export const shellCiura = (m: Machine) => gappedInsertion(m, gapSequences.ciura(m.n));

// ============================================================================ tree sort
/** Unbalanced binary-search-tree sort. Equal keys go right, so in-order traversal is stable. */
export function treeSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  m.allocRaw(3 * n);
  const left = new Int32Array(n).fill(-1);
  const right = new Int32Array(n).fill(-1);
  const node = new Int32Array(n); // node index -> element handle
  node[0] = m.read(0);
  m.auxTouch(0);
  for (let i = 1; i < n; i++) {
    const h = m.read(i);
    node[i] = h;
    m.auxTouch(i);
    let cur = 0;
    for (;;) {
      if (m.cmpH(h, node[cur], i, -1) < 0) {
        if (left[cur] < 0) {
          left[cur] = i;
          break;
        }
        cur = left[cur];
      } else {
        if (right[cur] < 0) {
          right[cur] = i;
          break;
        }
        cur = right[cur];
      }
    }
  }
  // iterative in-order traversal
  const stack: number[] = [];
  let cur = 0;
  let k = 0;
  while (cur >= 0 || stack.length) {
    while (cur >= 0) {
      stack.push(cur);
      cur = left[cur];
    }
    cur = stack.pop()!;
    m.write(k, node[cur]);
    m.sorted(k++);
    cur = right[cur];
  }
  m.freeRaw(3 * n);
}
