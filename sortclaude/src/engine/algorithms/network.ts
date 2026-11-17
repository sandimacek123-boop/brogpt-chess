import type { Machine } from '../machine';

/** Comparator: ensures main[i] <= main[j] (for i < j as positions). */
function cs(m: Machine, i: number, j: number): void {
  if (m.gt(i, j)) m.swap(i, j);
}

/** Bitonic sort generalised to arbitrary n (Lang): no padding, comparators only within range. */
export function bitonicSort(m: Machine): void {
  const gp2lt = (n: number) => {
    let k = 1;
    while (k > 0 && k < n) k <<= 1;
    return k >> 1;
  };
  const merge = (lo: number, n: number, asc: boolean) => {
    if (n <= 1) return;
    const k = gp2lt(n);
    for (let i = lo; i < lo + n - k; i++) {
      if (asc === m.gt(i, i + k)) m.swap(i, i + k);
    }
    merge(lo, k, asc);
    merge(lo + k, n - k, asc);
  };
  const sort = (lo: number, n: number, asc: boolean) => {
    if (n <= 1) return;
    const k = n >> 1;
    sort(lo, k, !asc);
    sort(lo + k, n - k, asc);
    m.range(lo, lo + n - 1);
    merge(lo, n, asc);
  };
  sort(0, m.n, true);
  m.sortedRange(0, m.n - 1);
}

/** Batcher's odd–even merge sort, iterative formulation valid for any n. */
export function oddEvenMergeSort(m: Machine): void {
  const n = m.n;
  for (let p = 1; p < n; p <<= 1) {
    for (let k = p; k >= 1; k >>= 1) {
      for (let j = k % p; j + k < n; j += 2 * k) {
        for (let i = 0; i < k && i + j + k < n; i++) {
          if (Math.floor((i + j) / (2 * p)) === Math.floor((i + j + k) / (2 * p))) cs(m, i + j, i + j + k);
        }
      }
    }
  }
  m.sortedRange(0, n - 1);
}

/** Parberry's pairwise sorting network (1992), iterative form valid for any n. */
export function pairwiseNetwork(m: Machine): void {
  const n = m.n;
  let a = 1;
  while (a < n) {
    let b = a;
    let c = 0;
    while (b < n) {
      cs(m, b - a, b);
      c = (c + 1) % a;
      b++;
      if (c === 0) b += a;
    }
    a *= 2;
  }
  a = Math.floor(a / 4);
  let e = 1;
  while (a > 0) {
    let d = e;
    while (d > 0) {
      let b = (d + 1) * a;
      let c = 0;
      while (b < n) {
        cs(m, b - d * a, b);
        c = (c + 1) % a;
        b++;
        if (c === 0) b += a;
      }
      d = Math.floor(d / 2);
    }
    a = Math.floor(a / 2);
    e = e * 2 + 1;
  }
  m.sortedRange(0, n - 1);
}

/** Bose–Nelson sorting network (1962), recursive construction for any n. */
export function boseNelsonNetwork(m: Machine): void {
  const mergeBN = (i: number, x: number, j: number, y: number): void => {
    if (x === 1 && y === 1) cs(m, i, j);
    else if (x === 1 && y === 2) {
      cs(m, i, j + 1);
      cs(m, i, j);
    } else if (x === 2 && y === 1) {
      cs(m, i, j);
      cs(m, i + 1, j);
    } else {
      const a = x >> 1;
      const b = x & 1 ? y >> 1 : (y + 1) >> 1;
      mergeBN(i, a, j, b);
      mergeBN(i + a, x - a, j + b, y - b);
      mergeBN(i + a, x - a, j, b);
    }
  };
  const sort = (i: number, len: number): void => {
    if (len < 2) return;
    const half = len >> 1;
    sort(i, half);
    sort(i + half, len - half);
    m.range(i, i + len - 1);
    mergeBN(i, half, i + half, len - half);
  };
  sort(0, m.n);
  m.sortedRange(0, m.n - 1);
}
