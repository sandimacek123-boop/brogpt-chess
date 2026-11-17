import { describe, expect, it } from 'vitest';
import { generateKeys, PATTERNS, parseCustomData } from '../../src/engine/generators';
import { Rng, normalizeSeed } from '../../src/engine/rng';
import { recordRun } from '../../src/engine/runner';
import { Timeline } from '../../src/engine/timeline';
import { Op } from '../../src/engine/ops';

describe('seeded generation', () => {
  it('same seed => same data, different seed => different data', () => {
    for (const p of PATTERNS.filter((x) => x.id !== 'custom')) {
      const a = generateKeys({ n: 500, pattern: p.id, seed: 1234 });
      const b = generateKeys({ n: 500, pattern: p.id, seed: 1234 });
      expect(Array.from(a)).toEqual(Array.from(b));
      expect(a.length).toBe(500);
    }
    const x = generateKeys({ n: 500, pattern: 'random', seed: 1 });
    const y = generateKeys({ n: 500, pattern: 'random', seed: 2 });
    expect(Array.from(x)).not.toEqual(Array.from(y));
  });
  it('permutation patterns are permutations of 1..n', () => {
    for (const p of PATTERNS.filter((x) => !x.duplicates)) {
      for (const n of [1, 2, 9, 10, 101]) {
        const a = Array.from(generateKeys({ n, pattern: p.id, seed: 9 })).sort((u, v) => u - v);
        expect(a, `${p.id} n=${n}`).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      }
    }
  });
  it('handles n = 0', () => {
    expect(generateKeys({ n: 0, pattern: 'random', seed: 1 }).length).toBe(0);
  });
  it('rng is deterministic and in range', () => {
    const r1 = new Rng(77), r2 = new Rng(77);
    for (let i = 0; i < 1000; i++) {
      const v = r1.next();
      expect(v).toBe(r2.next());
      expect(v >= 0 && v < 1).toBe(true);
    }
    expect(normalizeSeed('123')).toBe(123);
    expect(normalizeSeed(2 ** 40)).toBe(normalizeSeed(2 ** 40));
  });
  it('parses custom data and rejects junk', () => {
    expect(parseCustomData('3, -1 2 99')).toEqual({ keys: [3, -1, 2, 99] });
    expect('error' in parseCustomData('1, 2.5')).toBe(true);
    expect('error' in parseCustomData('')).toBe(true);
  });
});

describe('timeline time travel', () => {
  const keys = generateKeys({ n: 300, pattern: 'random', seed: 5 });
  for (const algoId of ['merge', 'quick', 'heap', 'radix-lsd', 'timsort', 'shell-ciura']) {
    it(`${algoId}: forward to end equals final state; backward to 0 restores the input`, () => {
      const rec = recordRun(algoId, keys, { seed: 1 });
      const tl = new Timeline(rec, 64 * 1024); // tiny budget -> many checkpoints
      tl.seek(tl.total);
      expect(Array.from(tl.ids)).toEqual(Array.from(rec.finalIds));
      const endCounters = tl.getCounters();
      tl.stepBackward(tl.total);
      expect(Array.from(tl.ids)).toEqual(Array.from({ length: 300 }, (_, i) => i));
      expect(tl.getCounters().comparisons).toBe(0);
      expect(tl.getCounters().writes).toBe(0);
      // forward stepping again yields the same counters
      tl.stepForward(tl.total);
      expect(tl.getCounters()).toEqual(endCounters);
    });
    it(`${algoId}: seek is consistent with stepping (same position -> same state)`, () => {
      const rec = recordRun(algoId, keys, { seed: 1 });
      const tl = new Timeline(rec, 64 * 1024);
      const ref = new Timeline(rec, 64 * 1024);
      const rng = new Rng(3);
      for (let t = 0; t < 25; t++) {
        const p = rng.int(tl.total + 1);
        tl.seek(p);
        ref.seek(0);
        ref.stepForward(p);
        expect(Array.from(tl.ids)).toEqual(Array.from(ref.ids));
        expect(Array.from(tl.sorted)).toEqual(Array.from(ref.sorted));
        expect(tl.getCounters()).toEqual(ref.getCounters());
        expect(tl.pivot).toBe(ref.pivot);
        expect(tl.range).toEqual(ref.range);
      }
    });
  }
  it('operation counts follow the documented conventions', () => {
    const rec = recordRun('bubble', Int32Array.from([3, 2, 1]), { seed: 1 });
    const tl = new Timeline(rec);
    tl.seek(tl.total);
    const c = tl.getCounters();
    // bubble on [3,2,1]: 3 comparisons, 3 swaps
    expect(c.comparisons).toBe(3);
    expect(c.swaps).toBe(3);
    expect(c.writes).toBe(6);
    expect(c.reads).toBe(3 * 2 + 3 * 2);
    expect(c.operations).toBe(6);
    let compares = 0;
    for (let k = 0; k < tl.total; k++) if (tl.opAt(k)[0] === Op.COMPARE) compares++;
    expect(compares).toBe(3);
  });
  it('merge sort comparison count is within the theoretical bounds', () => {
    const n = 1024;
    const rec = recordRun('merge', generateKeys({ n, pattern: 'random', seed: 8 }), { seed: 1 });
    const tl = new Timeline(rec);
    tl.seek(tl.total);
    const c = tl.getCounters().comparisons;
    expect(c).toBeGreaterThanOrEqual((n / 2) * Math.log2(n));
    expect(c).toBeLessThanOrEqual(n * Math.log2(n));
  });
  it('enforces element limits instead of freezing', () => {
    const rec = recordRun('bogo', generateKeys({ n: 50, pattern: 'random', seed: 1 }), { seed: 1 });
    expect(rec.error).toMatch(/limited/);
    const r2 = recordRun('bogo', generateKeys({ n: 8, pattern: 'reversed', seed: 1 }), { seed: 1, opLimit: 1000 });
    expect(r2.truncated).toBe(true);
  });
});
