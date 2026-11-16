import { describe, expect, it } from 'vitest';
import { CancelledError, OperationLimitError, SortContext } from '../src/core/context';
import { executeSort } from '../src/core/execute';
import { totalOps } from '../src/core/ops';
import { generatePattern, isSorted, PATTERNS } from '../src/core/patterns';
import { ALGORITHMS, getAlgorithm } from '../src/algorithms';
import { Player } from '../src/engine/player';
import { frequencyFor } from '../src/audio/scales';
import { DEFAULT_SETTINGS, effectiveSpeed, sanitize } from '../src/state/settings';

describe('patterns', () => {
  it('generate n positive integer values for every pattern and are deterministic per seed', () => {
    for (const p of PATTERNS) {
      for (const n of [0, 1, 2, 7, 100, 513]) {
        const a = generatePattern(p.id, n, 42);
        const b = generatePattern(p.id, n, 42);
        expect(a.length).toBe(n);
        expect(Array.from(a)).toEqual(Array.from(b));
        for (const v of a) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(Math.max(1, n));
        }
      }
    }
  });
  it('random is a permutation and sorted/reversed are what they claim', () => {
    expect(Array.from(generatePattern('random', 50, 1)).sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(isSorted(generatePattern('sorted', 50, 1))).toBe(true);
    expect(isSorted(Array.from(generatePattern('reversed', 50, 1)).reverse())).toBe(true);
    expect(new Set(generatePattern('fewUnique', 200, 1)).size).toBeLessThanOrEqual(8);
  });
});

describe('statistics correctness', () => {
  it('bubble sort on a reversed array performs exactly n(n-1)/2 comparisons and swaps', () => {
    const n = 40;
    const ctx = new SortContext(generatePattern('reversed', n, 0));
    getAlgorithm('bubble').run(ctx);
    expect(ctx.stats.comparisons).toBe((n * (n - 1)) / 2);
    expect(ctx.stats.swaps).toBe((n * (n - 1)) / 2);
    expect(ctx.stats.writes).toBe(0);
  });
  it('optimized bubble sort on sorted input does n-1 comparisons and no swaps', () => {
    const ctx = new SortContext(generatePattern('sorted', 100, 0));
    getAlgorithm('bubble-opt').run(ctx);
    expect(ctx.stats.comparisons).toBe(99);
    expect(ctx.stats.swaps).toBe(0);
  });
  it('selection sort always does n(n-1)/2 comparisons', () => {
    const ctx = new SortContext(generatePattern('random', 30, 9));
    getAlgorithm('selection').run(ctx);
    expect(ctx.stats.comparisons).toBe(435);
  });
  it('insertion sort on sorted input does n-1 comparisons and no writes', () => {
    const ctx = new SortContext(generatePattern('sorted', 64, 0));
    getAlgorithm('insertion').run(ctx);
    expect(ctx.stats.comparisons).toBe(63);
    expect(ctx.stats.writes).toBe(0);
  });
  it('cycle sort writes each misplaced element at most once', () => {
    const data = generatePattern('random', 64, 3);
    const misplaced = Array.from(data).filter((v, i) => v !== i + 1).length;
    const ctx = new SortContext(data);
    getAlgorithm('cycle').run(ctx);
    expect(ctx.stats.writes).toBe(misplaced);
  });
  it('LSD radix sort performs zero comparisons', () => {
    const ctx = new SortContext(generatePattern('random', 300, 3));
    getAlgorithm('radix-lsd-10').run(ctx);
    expect(ctx.stats.comparisons).toBe(0);
    expect(isSorted(ctx.a)).toBe(true);
  });
  it('merge-insertion sort uses close to the information-theoretic minimum of comparisons', () => {
    // Ford–Johnson is optimal for n <= 11: F(n) = 0,1,3,5,7,10,13,16,19,22,26 (n = 1..11)
    const F = [0, 0, 1, 3, 5, 7, 10, 13, 16, 19, 22, 26];
    for (let n = 1; n <= 11; n++) {
      let worst = 0;
      for (let s = 0; s < 40; s++) {
        const ctx = new SortContext(generatePattern('random', n, s));
        getAlgorithm('merge-insertion').run(ctx);
        worst = Math.max(worst, ctx.stats.comparisons);
      }
      expect(worst).toBeLessThanOrEqual(F[n]);
    }
  });
  it('operation count equals the sum of counted stats', () => {
    for (const id of ['quick', 'merge', 'tim', 'counting', 'heap']) {
      const ctx = new SortContext(generatePattern('random', 200, 5));
      getAlgorithm(id).run(ctx);
      expect(ctx.operationCount).toBe(totalOps(ctx.stats));
    }
  });
});

describe('operation limits', () => {
  it('stops exactly at the limit and reports status "limit"', () => {
    const res = executeSort({ id: 1, algorithmId: 'bubble', values: generatePattern('reversed', 200, 0), opLimit: 1000, seed: 1, record: true });
    expect(res.status).toBe('limit');
    expect(res.operations).toBe(1000);
    expect(res.trace.length / 3).toBeLessThanOrEqual(1000);
    expect(isSorted(res.final)).toBe(false);
  });
  it('throws OperationLimitError from the context', () => {
    const ctx = new SortContext([3, 2, 1], { opLimit: 1 });
    ctx.cmp(0, 1);
    expect(() => ctx.swap(0, 1)).toThrow(OperationLimitError);
  });
  it('bogo sort is bounded by the limit on hopeless sizes', () => {
    const res = executeSort({ id: 2, algorithmId: 'bogo', values: generatePattern('reversed', 9, 0), opLimit: 5000, seed: 1, record: true });
    expect(['limit', 'sorted']).toContain(res.status);
    expect(res.operations).toBeLessThanOrEqual(5000);
  });
});

describe('cancellation', () => {
  it('aborts a running algorithm when shouldAbort returns true', () => {
    let calls = 0;
    const ctx = new SortContext(generatePattern('reversed', 3000, 0), { shouldAbort: () => ++calls > 2 });
    expect(() => getAlgorithm('bubble').run(ctx)).toThrow(CancelledError);
    expect(isSorted(ctx.a)).toBe(false);
  });
  it('executeSort reports "cancelled" when the external abort fires', () => {
    const res = executeSort({ id: 3, algorithmId: 'exchange', values: generatePattern('reversed', 2000, 0), opLimit: 1e9, seed: 1, record: false }, () => true);
    expect(res.status).toBe('cancelled');
  });
  it('executeSort enforces its deadline', () => {
    const res = executeSort({ id: 4, algorithmId: 'stooge', values: generatePattern('reversed', 256, 0), opLimit: 1e9, seed: 1, record: false, deadlineMs: 1 });
    expect(['cancelled', 'sorted']).toContain(res.status);
  });
});

describe('executeSort', () => {
  it('returns sorted output, trace and timing for every algorithm', () => {
    for (const a of ALGORITHMS) {
      const n = a.slow ? 6 : 64;
      const res = executeSort({ id: 9, algorithmId: a.id, values: generatePattern('random', n, 77), opLimit: 4_000_000, seed: 3, record: true, timing: true });
      expect(res.status, a.id).toBe('sorted');
      expect(isSorted(res.final), a.id).toBe(true);
      expect(res.timedMs, a.id).toBeGreaterThanOrEqual(0);
      expect(res.timingRuns, a.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('player (playback engine)', () => {
  it('replaying the full trace reproduces the worker result regardless of frame batching', () => {
    for (const id of ['quick', 'merge', 'shell', 'radix-msd-4', 'smooth', 'bitonic']) {
      const data = generatePattern('random', 300, 11);
      const res = executeSort({ id: 1, algorithmId: id, values: data, opLimit: 1e7, seed: 1, record: true });
      for (const batch of [1, 7, 1000, 1e9]) {
        const p = new Player();
        p.load(data, res.trace);
        let guard = 0;
        while (!p.done && guard++ < 1e7) p.advance(batch);
        expect(Array.from(p.arr)).toEqual(Array.from(res.final));
        expect(p.stats.comparisons).toBe(res.stats.comparisons);
        expect(p.stats.swaps).toBe(res.stats.swaps);
        expect(p.stats.writes).toBe(res.stats.writes);
      }
    }
  });
  it('time-based ticking is independent of frame rate', () => {
    const data = generatePattern('random', 200, 2);
    const res = executeSort({ id: 1, algorithmId: 'heap', values: data, opLimit: 1e7, seed: 1, record: true });
    const run = (fps: number) => {
      const p = new Player();
      p.load(data, res.trace);
      for (let k = 0; k < fps; k++) p.tick(1 / fps, 1000);
      return p.pos;
    };
    expect(Math.abs(run(30) - run(144))).toBeLessThanOrEqual(2);
  });
  it('smoothing converges to exact values and instant mode snaps', () => {
    const data = generatePattern('random', 50, 2);
    const res = executeSort({ id: 1, algorithmId: 'selection', values: data, opLimit: 1e7, seed: 1, record: true });
    const p = new Player();
    p.load(data, res.trace);
    p.advance(1e9);
    for (let i = 0; i < 600; i++) p.animate(1 / 60, 0.8, 10);
    for (let i = 0; i < p.n; i++) expect(Math.abs(p.heights[i] - p.arr[i])).toBeLessThan(1e-3);
    p.animate(1 / 60, 0, 10);
    for (let i = 0; i < p.n; i++) expect(p.heights[i]).toBe(p.arr[i]);
    expect(p.firstInversion()).toBe(-1);
  });
  it('limits per-frame sound events', () => {
    const data = generatePattern('random', 500, 2);
    const res = executeSort({ id: 1, algorithmId: 'bubble', values: data, opLimit: 1e7, seed: 1, record: true });
    const p = new Player();
    p.load(data, res.trace);
    p.advance(50_000);
    expect(p.events.length).toBeLessThanOrEqual(p.maxEvents);
  });
});

describe('audio pitch mapping', () => {
  it('stays within range and snaps to scale notes', () => {
    for (const t of [0, 0.1, 0.5, 0.99, 1]) {
      const f = frequencyFor(t, 200, 1600, 'major');
      expect(f).toBeGreaterThanOrEqual(200 - 1e-6);
      expect(f).toBeLessThanOrEqual(1600 + 1e-6);
      const semis = 12 * Math.log2(f / 200);
      expect(Math.abs(semis - Math.round(semis))).toBeLessThan(1e-6);
    }
    expect(frequencyFor(0.5, 100, 400, 'continuous')).toBeCloseTo(200, 5);
  });
});

describe('settings', () => {
  it('sanitizes corrupt stored values', () => {
    const s = sanitize({ n: 1e9, speed: -5, glow: 'x', algorithmId: 5, barWidth: 9 });
    expect(s.n).toBe(16384);
    expect(s.speed).toBeGreaterThan(0);
    expect(s.glow).toBe(DEFAULT_SETTINGS.glow);
    expect(s.algorithmId).toBe(DEFAULT_SETTINGS.algorithmId);
    expect(s.barWidth).toBe(1);
    expect(sanitize(null)).toEqual(DEFAULT_SETTINGS);
  });
  it('slow motion and turbo scale the speed', () => {
    expect(effectiveSpeed({ speed: 100, speedMode: 'slow' })).toBe(10);
    expect(effectiveSpeed({ speed: 100, speedMode: 'turbo' })).toBe(2000);
  });
});
