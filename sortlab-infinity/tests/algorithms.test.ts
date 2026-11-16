import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from '../src/algorithms';
import { SortContext } from '../src/core/context';
import { OP_COMPARE, OP_STRIDE, OP_SWAP, OP_WRITE } from '../src/core/ops';
import { generatePattern, PATTERNS } from '../src/core/patterns';
import { mulberry32 } from '../src/core/rng';

function reference(a: ArrayLike<number>) {
  return Array.from(a).sort((x, y) => x - y);
}

/** Replays a trace on the initial data, mirroring the visualizer's playback engine. */
function replay(initial: Int32Array, trace: Int32Array) {
  const a = Int32Array.from(initial);
  for (let k = 0; k < trace.length; k += OP_STRIDE) {
    const op = trace[k];
    if (op === OP_SWAP) {
      const t = a[trace[k + 1]];
      a[trace[k + 1]] = a[trace[k + 2]];
      a[trace[k + 2]] = t;
    } else if (op === OP_WRITE) a[trace[k + 1]] = trace[k + 2];
    else if (op !== OP_COMPARE) throw new Error('bad opcode ' + op);
  }
  return a;
}

function run(id: string, data: ArrayLike<number>, seed = 7) {
  const algo = ALGORITHMS.find((a) => a.id === id)!;
  const ctx = new SortContext(data, { record: true, seed });
  algo.run(ctx);
  return ctx;
}

function sizesFor(maxN: number, slow?: boolean) {
  if (slow) return [0, 1, 2, 3, Math.min(6, maxN)];
  return [0, 1, 2, 3, 5, 8, 17, 31, 64, 100, Math.min(257, maxN)];
}

describe('algorithm library', () => {
  it('contains at least 100 algorithms with unique ids and names', () => {
    expect(ALGORITHMS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ALGORITHMS.map((a) => a.id)).size).toBe(ALGORITHMS.length);
    expect(new Set(ALGORITHMS.map((a) => a.name)).size).toBe(ALGORITHMS.length);
  });
});

for (const algo of ALGORITHMS) {
  describe(algo.name, () => {
    it('sorts every starting pattern at many sizes, and the trace replays to the same result', () => {
      for (const n of sizesFor(algo.maxN, algo.slow)) {
        for (const p of PATTERNS) {
          const data = generatePattern(p.id, n, 99 + n);
          const ctx = run(algo.id, data);
          const expected = reference(data);
          expect(Array.from(ctx.a), `${p.id} n=${n}`).toEqual(expected);
          expect(Array.from(replay(data, ctx.getTrace())), `replay ${p.id} n=${n}`).toEqual(expected);
        }
      }
    });

    it('handles duplicates, all-equal, empty and single-element arrays', () => {
      const rng = mulberry32(5);
      const small = algo.slow ? 6 : 60;
      const dup = Array.from({ length: small }, () => 1 + Math.floor(rng() * 4));
      const eq = Array.from({ length: small }, () => 3);
      for (const data of [dup, eq, [], [42], [2, 1], [1, 1]]) {
        const ctx = run(algo.id, data);
        expect(Array.from(ctx.a)).toEqual(reference(data));
      }
    });

    it('stats match the recorded trace', () => {
      const n = algo.slow ? 6 : 50;
      const data = generatePattern('random', n, 3);
      const ctx = run(algo.id, data);
      const t = ctx.getTrace();
      let c = 0;
      let s = 0;
      let w = 0;
      for (let k = 0; k < t.length; k += 3) {
        if (t[k] === OP_COMPARE) c++;
        else if (t[k] === OP_SWAP) s++;
        else w++;
      }
      expect(c).toBe(ctx.stats.comparisons);
      expect(s).toBe(ctx.stats.swaps);
      expect(w).toBe(ctx.stats.writes);
      for (let k = 0; k < t.length; k += 3) {
        expect(t[k + 1]).toBeLessThan(Math.max(n, 1));
        if (t[k] !== OP_WRITE) expect(t[k + 2]).toBeLessThan(Math.max(n, 1));
      }
    });

  });
}

describe('stability (key-only comparisons with original index in the low bits)', () => {
  const comparisonStable = ALGORITHMS.filter((a) => a.stable && a.category !== 'Distribution' && !a.slow);
  for (const algo of comparisonStable) {
    it(`${algo.name} keeps equal keys in original order`, () => {
      const rng = mulberry32(31337);
      for (const n of [2, 9, 40, 200, 700]) {
        for (const u of [1, 2, 4, 25]) {
          if (n > algo.maxN) continue;
          const keys = Array.from({ length: n }, () => 1 + Math.floor(rng() * u));
          const tagged = keys.map((k, i) => (k << 16) | i);
          const ctx = new SortContext(tagged, { keyShift: 16, seed: 3 });
          algo.run(ctx);
          const expected = tagged.slice().sort((x, y) => (x >> 16) - (y >> 16) || x - y);
          expect(Array.from(ctx.a), `n=${n} u=${u}`).toEqual(expected);
        }
      }
    });
  }
});
