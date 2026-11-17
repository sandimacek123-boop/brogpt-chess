import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from '../../src/engine/registry';
import { Machine } from '../../src/engine/machine';
import { generateKeys, PATTERNS } from '../../src/engine/generators';

describe('larger inputs across all data patterns', () => {
  for (const algo of ALGORITHMS.filter((a) => !a.novelty)) {
    it(algo.name, () => {
      const sizes = [algo.maxN >= 20000 ? 5003 : Math.min(algo.maxN, 1201), 127, 1000];
      for (const n of sizes) {
        for (const p of PATTERNS.filter((x) => x.id !== 'custom')) {
          const keys = generateKeys({ n, pattern: p.id, seed: n * 31 + 7 });
          const m = new Machine(keys, { record: false, seed: 3, opLimit: 2_000_000_000 });
          algo.run(m);
          expect(m.isSorted(), `${algo.name} ${p.id} n=${n}`).toBe(true);
          if (algo.stable) {
            for (let i = 1; i < n; i++) {
              const a = m.a[i - 1], b = m.a[i];
              if (keys[a] === keys[b] && a > b) throw new Error(`${algo.name} unstable on ${p.id} n=${n}`);
            }
          }
        }
      }
    });
  }
});
