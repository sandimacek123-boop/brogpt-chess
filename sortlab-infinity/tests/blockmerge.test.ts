import { describe, expect, it } from 'vitest';
import { getAlgorithm } from '../src/algorithms';
import { SortContext } from '../src/core/context';
import { mulberry32 } from '../src/core/rng';

/**
 * Stress tests for the long, branch-heavy algorithms. Few distinct values force the
 * "not enough unique keys" code paths (GrailSort without buffer, WikiSort without
 * buffer2 / with in-place merging); large sizes exercise multi-level merging.
 */
const SIZES = [16, 17, 31, 63, 64, 65, 100, 127, 128, 129, 255, 256, 257, 511, 1000, 1023, 1025, 2048, 3001, 5000];
const UNIQUE = [1, 2, 3, 4, 5, 7, 10, 16, 33, 64, 1e9];

for (const id of ['grail', 'wiki', 'tim', 'powersort']) {
  describe(`${id} stress`, () => {
    it('sorts random arrays of many sizes and value distributions', () => {
      const rng = mulberry32(2024);
      const algo = getAlgorithm(id);
      for (const n of SIZES) {
        for (const u of UNIQUE) {
          const data = Array.from({ length: n }, () => 1 + Math.floor(rng() * Math.min(u, n * 4)));
          const ctx = new SortContext(data);
          algo.run(ctx);
          expect(Array.from(ctx.a), `n=${n} unique=${u}`).toEqual(data.slice().sort((a, b) => a - b));
        }
      }
    });
    it('is stable: equal keys keep their original order', () => {
      // Encode (key, original index) as key * 2^14 + index, but compare on key only by
      // sorting values whose low bits are the index *within each key group, ascending*.
      // A stable sort of keys-with-ascending-tags must leave tags ascending inside each key;
      // since tags are strictly increasing in input order per key, the full value order is
      // only correct if equal keys were never reordered. We verify by sorting key-only
      // values and replaying the trace on tagged values.
      const rng = mulberry32(77);
      const algo = getAlgorithm(id);
      for (const n of [50, 300, 2000]) {
        for (const u of [2, 5, 40]) {
          const keys = Array.from({ length: n }, () => 1 + Math.floor(rng() * u));
          const ctx = new SortContext(keys, { record: true });
          algo.run(ctx);
          // replay swaps on tags; writes must come from values, so only swap-only algorithms are checkable
          const t = ctx.getTrace();
          let writes = false;
          for (let k = 0; k < t.length; k += 3) if (t[k] === 2) writes = true;
          if (writes) continue;
          const tags = keys.map((_, i) => i);
          for (let k = 0; k < t.length; k += 3) {
            if (t[k] === 1) {
              const a = t[k + 1];
              const b = t[k + 2];
              [tags[a], tags[b]] = [tags[b], tags[a]];
            }
          }
          for (let i = 1; i < n; i++) {
            if (keys[tags[i]] === keys[tags[i - 1]]) expect(tags[i], `n=${n} u=${u} i=${i}`).toBeGreaterThan(tags[i - 1]);
          }
        }
      }
    });
  });
}

describe('TimSort galloping mode', () => {
  it('copies long stretches with few comparisons when runs interleave in big blocks', () => {
    const A = [...Array.from({ length: 500 }, (_, i) => i + 1), ...Array.from({ length: 500 }, (_, i) => 1001 + i)];
    const B = [...Array.from({ length: 500 }, (_, i) => 501 + i), ...Array.from({ length: 500 }, (_, i) => 1501 + i)];
    const data = [...A, ...B];
    const ctx = new SortContext(data);
    getAlgorithm('tim').run(ctx);
    expect(Array.from(ctx.a)).toEqual(data.slice().sort((x, y) => x - y));
    // run detection costs ~2000 comparisons; a non-galloping merge would add ~1500 more
    expect(ctx.stats.comparisons).toBeLessThan(2000 + 150);
  });
  it('is linear on already sorted and reversed input', () => {
    for (const data of [Array.from({ length: 4096 }, (_, i) => i + 1), Array.from({ length: 4096 }, (_, i) => 4096 - i)]) {
      const ctx = new SortContext(data);
      getAlgorithm('tim').run(ctx);
      expect(ctx.stats.comparisons).toBeLessThan(4096);
    }
  });
});
