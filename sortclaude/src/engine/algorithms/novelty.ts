import type { Machine } from '../machine';

function flip(m: Machine, k: number): void {
  let i = 0;
  let j = k;
  while (i < j) m.swap(i++, j--);
}

/** Pancake sort: only prefix reversals ("flips") may move elements. */
export function pancakeSort(m: Machine): void {
  for (let size = m.n; size > 1; size--) {
    let mx = 0;
    for (let i = 1; i < size; i++) if (m.gt(i, mx)) mx = i;
    m.pivot(mx);
    if (mx !== size - 1) {
      if (mx !== 0) flip(m, mx);
      flip(m, size - 1);
    }
    m.sorted(size - 1);
  }
  m.sorted(0);
}

/**
 * Burnt pancake sort: every flip also turns the flipped pancakes over. The goal is sorted order
 * with every pancake burnt-side down. Orientation is tracked per element (not shown as a key) and
 * each single-pancake flip(0) is recorded as a FLAG annotation. Uses at most 3(n-1)+1 flips.
 */
export function burntPancakeSort(m: Machine): void {
  const n = m.n;
  if (n < 1) return;
  m.allocRaw(n);
  const up = new Uint8Array(n); // orientation indexed by element id: 1 = burnt side up
  const bflip = (k: number) => {
    let i = 0;
    let j = k;
    while (i < j) m.swap(i++, j--);
    for (let t = 0; t <= k; t++) {
      const id = m.a[t];
      up[id] ^= 1;
    }
    if (k === 0) m.flag(0, up[m.a[0]]);
  };
  for (let size = n; size > 1; size--) {
    let mx = 0;
    for (let i = 1; i < size; i++) if (m.gt(i, mx)) mx = i;
    m.pivot(mx);
    if (mx === size - 1 && up[m.a[mx]] === 0) {
      m.sorted(size - 1);
      continue;
    }
    if (mx !== 0) bflip(mx); // largest to the top (orientation toggled)
    if (up[m.a[0]] === 0) bflip(0); // make it burnt-side up so the next flip puts it burnt-side down
    bflip(size - 1);
    m.sorted(size - 1);
  }
  if (up[m.a[0]] === 1) bflip(0);
  m.sorted(0);
  m.freeRaw(n);
}

export function stoogeSort(m: Machine): void {
  const rec = (i: number, j: number) => {
    if (m.gt(i, j)) m.swap(i, j);
    if (j - i + 1 > 2) {
      const t = Math.floor((j - i + 1) / 3);
      m.range(i, j);
      rec(i, j - t);
      rec(i + t, j);
      rec(i, j - t);
    }
  };
  if (m.n > 1) rec(0, m.n - 1);
  m.sortedRange(0, m.n - 1);
}

/** Slowsort (Broder & Stolfi 1986), the "multiply and surrender" paradigm. */
export function slowSort(m: Machine): void {
  const rec = (i: number, j: number) => {
    if (i >= j) return;
    const mid = (i + j) >>> 1;
    rec(i, mid);
    rec(mid + 1, j);
    if (m.gt(mid, j)) m.swap(mid, j);
    m.sorted(j);
    rec(i, j - 1);
  };
  rec(0, m.n - 1);
  m.sortedRange(0, m.n - 1);
}

function checkSorted(m: Machine): boolean {
  for (let i = 1; i < m.n; i++) if (m.gt(i - 1, i)) return false;
  return true;
}

/** Bogosort: shuffle (seeded Fisher–Yates) until sorted. Expected O(n·n!) work. */
export function bogoSort(m: Machine): void {
  while (!checkSorted(m)) {
    for (let i = m.n - 1; i > 0; i--) {
      const j = m.rng.int(i + 1);
      if (i !== j) m.swap(i, j);
    }
  }
  m.sortedRange(0, m.n - 1);
}

/** Bozosort: swap two random elements until sorted. */
export function bozoSort(m: Machine): void {
  while (!checkSorted(m)) {
    const i = m.rng.int(m.n);
    const j = m.rng.int(m.n);
    if (i !== j) m.swap(i, j);
  }
  m.sortedRange(0, m.n - 1);
}

/** Permutation sort: enumerate permutations (Heap's algorithm, one swap each) until sorted. */
export function permutationSort(m: Machine): void {
  const n = m.n;
  if (checkSorted(m)) return;
  const c = new Int32Array(n);
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) m.swap(0, i);
      else m.swap(c[i], i);
      if (checkSorted(m)) break;
      c[i]++;
      i = 0;
    } else {
      c[i] = 0;
      i++;
    }
  }
  m.sortedRange(0, n - 1);
}
