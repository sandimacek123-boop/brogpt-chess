import { describe, expect, it } from 'vitest';
import { Machine } from '../../src/engine/machine';
import { getAlgorithm } from '../../src/engine/registry';
import { Rng } from '../../src/engine/rng';

function check(keys: number[], label: string) {
  const k = Int32Array.from(keys);
  const m = new Machine(k, { record: true, seed: 1, opLimit: 100_000_000 });
  getAlgorithm('timsort').run(m);
  for (let i = 1; i < k.length; i++) {
    const a = m.a[i - 1];
    const b = m.a[i];
    expect(k[a] <= k[b], `${label}: order at ${i}`).toBe(true);
    if (k[a] === k[b]) expect(a < b, `${label}: stability at ${i}`).toBe(true);
  }
  expect(Array.from(m.a).sort((x, y) => x - y)).toEqual(keys.map((_, i) => i));
  return m;
}

describe('TimSort galloping mode', () => {
  const rng = new Rng(2024);
  it('interleaved long runs (galloping-heavy)', () => {
    for (const n of [130, 1000, 4097, 20000]) {
      const half = n >> 1;
      const keys = [...Array.from({ length: half }, (_, i) => i * 2), ...Array.from({ length: n - half }, (_, i) => i * 2 + 1)];
      check(keys, `interleave ${n}`);
      const blocks = Array.from({ length: n }, (_, i) => (i < half ? Math.floor(i / 50) * 1000 + (i % 50) : Math.floor((i - half) / 50) * 1000 + 500 + ((i - half) % 50)));
      check(blocks, `blocky ${n}`);
    }
  });
  it('random runs, duplicates and descending runs', () => {
    for (let t = 0; t < 60; t++) {
      const n = 64 + rng.int(5000);
      const keys: number[] = [];
      while (keys.length < n) {
        const len = 1 + rng.int(400);
        const start = rng.int(200);
        const dir = rng.int(3);
        for (let i = 0; i < len && keys.length < n; i++) keys.push(dir === 0 ? start + i : dir === 1 ? start - i : start + rng.int(4));
      }
      check(keys, `mixed ${t}`);
    }
  });
  it('galloping cuts merge comparisons far below a linear merge on block-interleaved runs', () => {
    const n = 20000;
    const half = n / 2;
    // run A holds even hundreds, run B odd hundreds: they interleave in blocks of 100
    const a = Array.from({ length: half }, (_, i) => Math.floor(i / 100) * 200 + (i % 100));
    const b = Array.from({ length: half }, (_, i) => Math.floor(i / 100) * 200 + 100 + (i % 100));
    const m = check([...a, ...b], 'blocks');
    const mergePhase = m.comparisons - (n - 1); // run detection costs n-1
    // a linear merge would need ~n-1 comparisons here
    expect(mergePhase).toBeLessThan(n / 3);
  });
});
