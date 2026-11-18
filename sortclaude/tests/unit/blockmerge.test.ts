import { describe, expect, it } from 'vitest';
import { Machine } from '../../src/engine/machine';
import { getAlgorithm } from '../../src/engine/registry';
import { Rng } from '../../src/engine/rng';
import { generateKeys, PATTERNS } from '../../src/engine/generators';

const run = (keys: Int32Array) => {
  const m = new Machine(keys, { record: false, seed: 1, opLimit: 2_000_000_000 });
  getAlgorithm('block-merge').run(m);
  return m;
};

describe('Block Merge Sort fuzz', () => {
  it('300 random inputs: sorted, permutation, stable', () => {
    const rng = new Rng(31337);
    for (let t = 0; t < 300; t++) {
      const n = 1 + rng.int(t < 200 ? 3000 : 40000);
      const distinct = [1, 2, 3, 10, 100, n][rng.int(6)];
      const keys = Int32Array.from({ length: n }, () => rng.range(-distinct, distinct));
      const m = run(keys);
      for (let i = 1; i < n; i++) {
        const a = m.a[i - 1];
        const b = m.a[i];
        if (keys[a] > keys[b]) throw new Error(`unsorted t=${t} n=${n} at ${i}`);
        if (keys[a] === keys[b] && a > b) throw new Error(`unstable t=${t} n=${n} distinct=${distinct} at ${i}`);
      }
      const seen = new Uint8Array(n);
      for (const id of m.a) seen[id]++;
      expect(seen.every((x) => x === 1)).toBe(true);
    }
  });
  it('O(n log n) growth on every pattern', () => {
    for (const p of PATTERNS.filter((x) => x.id !== 'custom')) {
      const c = (n: number) => run(generateKeys({ n, pattern: p.id, seed: 4 })).comparisons;
      const r = c(64000) / c(16000);
      // n log n would give ≈ 4.6×; quadratic would give 16×
      expect(r, p.id).toBeLessThan(6.5);
    }
  });
});
