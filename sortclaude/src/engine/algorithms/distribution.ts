import type { Machine } from '../machine';
import { insertionRange } from './elementary';

/** Distribution sorts read every element once into registers / aux memory; min/max come from those reads. */
function readAllToAux(m: Machine) {
  const buf = m.alloc(m.n);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < m.n; i++) {
    m.toAux(buf, i, i);
    const k = m.key(buf.ids[i]);
    if (k < min) min = k;
    if (k > max) max = k;
  }
  return { buf, min, max };
}

/** Stable counting sort (prefix sums, placement from the right). */
export function countingSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const { buf, min, max } = readAllToAux(m);
  const range = max - min + 1;
  m.allocRaw(range);
  const count = new Int32Array(range + 1);
  for (let i = 0; i < n; i++) {
    count[m.key(buf.ids[i]) - min + 1]++;
    m.auxTouch(i);
  }
  for (let v = 1; v <= range; v++) {
    count[v] += count[v - 1];
  }
  for (let i = 0; i < n; i++) {
    const h = buf.ids[i];
    const pos = count[m.key(h) - min]++;
    m.fromAux(pos, buf, i);
  }
  m.freeRaw(range);
  m.free(buf);
  m.sortedRange(0, n - 1);
}

/** Pigeonhole sort: one hole (list) per possible key, filled in input order -> stable. */
export function pigeonholeSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const { min, max } = m.scanMinMax();
  const range = max - min + 1;
  m.allocRaw(range + n);
  const head = new Int32Array(range).fill(-1);
  const tail = new Int32Array(range).fill(-1);
  const next = new Int32Array(n).fill(-1);
  const item = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const h = m.read(i);
    item[i] = h;
    const k = m.key(h) - min;
    if (head[k] < 0) head[k] = i;
    else next[tail[k]] = i;
    tail[k] = i;
    m.auxTouch(i);
  }
  let pos = 0;
  for (let k = 0; k < range; k++) {
    for (let e = head[k]; e >= 0; e = next[e]) {
      m.write(pos, item[e]);
      m.sorted(pos++);
    }
  }
  m.freeRaw(range + n);
}

function lsdRadix(m: Machine, base: number): void {
  const n = m.n;
  if (n < 2) return;
  const { min, max } = m.scanMinMax();
  const span = max - min;
  const buf = m.alloc(n);
  m.allocRaw(base);
  for (let exp = 1; Math.floor(span / exp) > 0; exp *= base) {
    const count = new Int32Array(base + 1);
    for (let i = 0; i < n; i++) {
      m.toAux(buf, i, i);
      count[Math.floor((m.key(buf.ids[i]) - min) / exp) % base + 1]++;
    }
    for (let d = 1; d <= base; d++) count[d] += count[d - 1];
    for (let i = 0; i < n; i++) {
      const d = Math.floor((m.key(buf.ids[i]) - min) / exp) % base;
      m.fromAux(count[d]++, buf, i);
    }
    if (exp > span) break;
  }
  m.freeRaw(base);
  m.free(buf);
  m.sortedRange(0, n - 1);
}
export const radixLSD10 = (m: Machine) => lsdRadix(m, 10);
export const radixLSD4 = (m: Machine) => lsdRadix(m, 4);

/** MSD radix sort, base 10, out-of-place buckets, recursive on each bucket. */
export function radixMSD(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const { min, max } = m.scanMinMax();
  const span = max - min;
  let exp = 1;
  while (Math.floor(span / exp) >= 10) exp *= 10;
  const buf = m.alloc(n);
  m.allocRaw(11);
  const rec = (lo: number, hi: number, e: number) => {
    if (hi <= lo || e < 1) return;
    m.range(lo, hi);
    const count = new Int32Array(11);
    for (let i = lo; i <= hi; i++) {
      m.toAux(buf, i, i);
      count[Math.floor((m.key(buf.ids[i]) - min) / e) % 10 + 1]++;
    }
    for (let d = 1; d <= 10; d++) count[d] += count[d - 1];
    const starts = count.slice();
    for (let i = lo; i <= hi; i++) {
      const d = Math.floor((m.key(buf.ids[i]) - min) / e) % 10;
      m.fromAux(lo + count[d]++, buf, i);
    }
    for (let d = 0; d < 10; d++) rec(lo + starts[d], lo + starts[d + 1] - 1, Math.floor(e / 10));
  };
  rec(0, n - 1, exp);
  m.freeRaw(11);
  m.free(buf);
  m.sortedRange(0, n - 1);
}

/** American flag sort: in-place MSD radix (base 10), permuting elements into buckets by cycling swaps. */
export function americanFlagSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const { min, max } = m.scanMinMax();
  const span = max - min;
  let exp = 1;
  while (Math.floor(span / exp) >= 10) exp *= 10;
  m.allocRaw(20);
  const digit = (h: number, e: number) => Math.floor((m.key(h) - min) / e) % 10;
  const rec = (lo: number, hi: number, e: number) => {
    if (hi <= lo || e < 1) return;
    m.range(lo, hi);
    const count = new Int32Array(10);
    for (let i = lo; i <= hi; i++) count[digit(m.read(i), e)]++;
    const start = new Int32Array(10);
    const next = new Int32Array(10);
    let s = lo;
    for (let d = 0; d < 10; d++) {
      start[d] = s;
      next[d] = s;
      s += count[d];
    }
    for (let d = 0; d < 10; d++) {
      const end = start[d] + count[d];
      while (next[d] < end) {
        const dd = digit(m.read(next[d]), e);
        if (dd === d) next[d]++;
        else {
          m.swap(next[d], next[dd]);
          next[dd]++;
        }
      }
    }
    for (let d = 0; d < 10; d++) rec(start[d], start[d] + count[d] - 1, Math.floor(e / 10));
  };
  rec(0, n - 1, exp);
  m.freeRaw(20);
  m.sortedRange(0, n - 1);
}

/** Radix exchange sort (binary MSD quicksort-like partitioning on bits, in place). */
export function radixExchangeSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const { min, max } = m.scanMinMax();
  const span = max - min;
  let bit = 0;
  while (span >= 2 ** (bit + 1)) bit++;
  const bitOf = (h: number, b: number) => Math.floor((m.key(h) - min) / 2 ** b) % 2;
  const rec = (lo: number, hi: number, b: number) => {
    if (hi <= lo || b < 0) return;
    m.range(lo, hi);
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (i <= j && bitOf(m.read(i), b) === 0) i++;
      while (i <= j && bitOf(m.read(j), b) === 1) j--;
      if (i < j) m.swap(i++, j--);
    }
    rec(lo, j, b - 1);
    rec(i, hi, b - 1);
  };
  rec(0, n - 1, bit);
  m.sortedRange(0, n - 1);
}

/** Bucket sort: ~√n equal-width buckets, written back in order, then insertion sort per bucket. */
export function bucketSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const { min, max } = m.scanMinMax();
  const k = Math.max(1, Math.round(Math.sqrt(n)));
  const width = (max - min + 1) / k;
  m.allocRaw(n + k);
  const buckets: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) {
    const h = m.read(i);
    const b = Math.min(k - 1, Math.floor((m.key(h) - min) / width));
    buckets[b].push(h);
    m.auxTouch(i);
  }
  let pos = 0;
  const bounds: [number, number][] = [];
  for (let b = 0; b < k; b++) {
    const start = pos;
    for (const h of buckets[b]) m.write(pos++, h);
    if (pos - 1 > start) bounds.push([start, pos - 1]);
  }
  m.freeRaw(n + k);
  for (const [lo, hi] of bounds) {
    m.range(lo, hi);
    insertionRange(m, lo, hi);
  }
  m.sortedRange(0, n - 1);
}

/** Neubert's Flashsort: classify into m≈0.43n classes, cycle-leader permutation, insertion sort. */
export function flashSort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  let minI = 0;
  let maxI = 0;
  for (let i = 1; i < n; i++) {
    if (m.lt(i, minI)) minI = i;
    if (m.gt(i, maxI)) maxI = i;
  }
  const minV = m.key(m.read(minI));
  const maxV = m.key(m.read(maxI));
  if (minV === maxV) {
    m.sortedRange(0, n - 1);
    return;
  }
  const classes = Math.max(2, Math.floor(0.43 * n));
  m.allocRaw(classes);
  const c1 = (classes - 1) / (maxV - minV);
  const cls = (h: number) => Math.floor(c1 * (m.key(h) - minV));
  const L = new Int32Array(classes);
  for (let i = 0; i < n; i++) {
    L[cls(m.read(i))]++;
    m.auxTouch(i);
  }
  for (let k = 1; k < classes; k++) L[k] += L[k - 1];
  m.swap(maxI, 0);
  let nmove = 0;
  let j = 0;
  let k = classes - 1;
  while (nmove < n - 1) {
    while (j > L[k] - 1) {
      j++;
      if (j >= n) break;
      k = cls(m.read(j));
    }
    if (j >= n) break;
    let flash = m.read(j);
    m.pivot(j);
    while (j !== L[k]) {
      k = cls(flash);
      const dst = L[k] - 1;
      const hold = m.read(dst);
      m.write(dst, flash);
      flash = hold;
      L[k]--;
      nmove++;
    }
  }
  m.freeRaw(classes);
  insertionRange(m, 0, n - 1);
  m.sortedRange(0, n - 1);
}

/**
 * Gravity (bead) sort: beads on rods fall under gravity. Simulated with per-level bead counts:
 * the sorted value at position i (from the top) = number of levels holding more than i beads.
 * Values are reconstructed and written back; each written element is taken from a per-key pool of
 * the original elements, so identities are preserved.
 */
export function gravitySort(m: Machine): void {
  const n = m.n;
  if (n < 2) return;
  const { min, max } = m.scanMinMax();
  const levels = max - min;
  m.allocRaw(levels + 1 + n);
  const beads = new Int32Array(levels + 2); // beads[l] = #values with (v - min) >= l
  const pool = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const h = m.read(i);
    const v = m.key(h) - min;
    beads[v] += 1;
    m.auxTouch(i);
    const list = pool.get(v);
    if (list) list.push(h);
    else pool.set(v, [h]);
  }
  for (let l = levels - 1; l >= 0; l--) beads[l] += beads[l + 1];
  // beads[l] now = number of values >= l. Fall: position p (0 = smallest) gets value
  // v such that exactly the (n - p) largest rods reach level v.
  const cursor = new Map<number, number>();
  let level = 0;
  for (let p = 0; p < n; p++) {
    const fromTop = n - 1 - p; // index from the largest
    while (level < levels && beads[level + 1] > fromTop) level++;
    while (level > 0 && beads[level] <= fromTop) level--;
    const v = level;
    const c = cursor.get(v) ?? 0;
    cursor.set(v, c + 1);
    m.write(p, pool.get(v)![c]);
    m.sorted(p);
  }
  m.freeRaw(levels + 1 + n);
}
