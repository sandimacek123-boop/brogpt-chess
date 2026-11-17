import { describe, expect, it } from 'vitest';
import { ALGORITHMS, type AlgorithmInfo } from '../../src/engine/registry';
import { Machine } from '../../src/engine/machine';
import { Rng } from '../../src/engine/rng';
import { recordRun, countRun } from '../../src/engine/runner';

function cases(algo: AlgorithmInfo): { name: string; keys: number[] }[] {
  const rng = new Rng(12345);
  const lim = algo.novelty ? Math.min(algo.maxN, 7) : Math.min(algo.maxN, 300);
  const rand = (n: number, lo: number, hi: number) => Array.from({ length: n }, () => rng.range(lo, hi));
  const perm = (n: number) => {
    const a = Array.from({ length: n }, (_, i) => i + 1);
    for (let i = n - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const small = Math.min(lim, 60);
  const out = [
    { name: 'empty', keys: [] },
    { name: 'single', keys: [42] },
    { name: 'two sorted', keys: [1, 2] },
    { name: 'two reversed', keys: [2, 1] },
    { name: 'two equal', keys: [5, 5] },
    { name: 'sorted', keys: Array.from({ length: lim }, (_, i) => i + 1) },
    { name: 'reversed', keys: Array.from({ length: lim }, (_, i) => lim - i) },
    { name: 'random permutation', keys: perm(lim) },
    { name: 'duplicates', keys: rand(lim, 1, Math.max(2, Math.floor(lim / 6))) },
    { name: 'all equal', keys: Array.from({ length: small }, () => 7) },
    { name: 'negatives', keys: rand(small, -500, 500) },
    { name: 'large values', keys: rand(small, 2_000_000_000, 2_100_000_000) },
    { name: 'small negative values', keys: rand(small, -2_100_000_000, -2_000_000_000) },
  ];
  if (!algo.novelty) {
    for (const n of [3, 5, 7, 16, 17, 31, 33, 64, 65, 100]) if (n <= lim) out.push({ name: `random n=${n}`, keys: perm(n) });
  }
  return out;
}

function keySpanOk(algo: AlgorithmInfo, keys: number[]) {
  if (algo.maxKeySpan === undefined || keys.length === 0) return true;
  return Math.max(...keys) - Math.min(...keys) <= algo.maxKeySpan;
}

describe('every algorithm sorts correctly and preserves the multiset', () => {
  for (const algo of ALGORITHMS) {
    it(algo.name, () => {
      for (const c of cases(algo)) {
        if (!keySpanOk(algo, c.keys)) continue;
        const keys = Int32Array.from(c.keys);
        const m = new Machine(keys, { record: true, seed: 99, opLimit: 50_000_000 });
        algo.run(m);
        const final = Array.from(m.finalKeys());
        const expected = [...c.keys].sort((a, b) => a - b);
        expect(final, `${algo.name} on ${c.name}`).toEqual(expected);
        // identities form a permutation (no element lost or duplicated)
        const ids = Array.from(m.a).sort((a, b) => a - b);
        expect(ids, `${algo.name} ids on ${c.name}`).toEqual(c.keys.map((_, i) => i));
      }
    });
  }
});

describe('algorithms marked stable preserve the order of equal keys', () => {
  for (const algo of ALGORITHMS.filter((a) => a.stable)) {
    it(algo.name, () => {
      const rng = new Rng(777);
      const n = Math.min(algo.maxN, 400);
      for (let trial = 0; trial < 6; trial++) {
        const distinct = [2, 3, 5, 10, 40, n][trial];
        const keys = Int32Array.from({ length: n }, () => rng.range(1, distinct));
        const m = new Machine(keys, { record: false, seed: trial, opLimit: 50_000_000 });
        algo.run(m);
        for (let i = 1; i < n; i++) {
          const a = m.a[i - 1];
          const b = m.a[i];
          if (keys[a] === keys[b]) expect(a < b, `${algo.name} unstable at ${i} (distinct=${distinct})`).toBe(true);
        }
      }
    });
  }
});

describe('record and count modes agree', () => {
  for (const algo of ALGORITHMS.filter((a) => !a.novelty)) {
    it(algo.name, () => {
      const rng = new Rng(4242);
      const n = Math.min(algo.maxN, 200);
      const keys = Int32Array.from({ length: n }, () => rng.range(1, n));
      const rec = recordRun(algo.id, keys, { seed: 5 });
      const cnt = countRun(algo.id, keys, { seed: 5 });
      expect(rec.sorted).toBe(true);
      expect(cnt.sorted).toBe(true);
      // replaying counters from the log must equal the scalar counters
      const m = new Machine(keys, { record: true, seed: 5 });
      algo.run(m);
      expect(cnt.comparisons).toBe(m.comparisons);
      expect(cnt.swaps).toBe(m.swaps);
      expect(cnt.writes).toBe(m.writes);
    });
  }
});

describe('catalog integrity', () => {
  it('has unique ids and names', () => {
    expect(new Set(ALGORITHMS.map((a) => a.id)).size).toBe(ALGORITHMS.length);
    expect(new Set(ALGORITHMS.map((a) => a.name)).size).toBe(ALGORITHMS.length);
  });
  it('reports catalog size', () => {
    console.log(`catalog: ${ALGORITHMS.length} algorithms`);
    expect(ALGORITHMS.length).toBeGreaterThanOrEqual(60);
  });
});
