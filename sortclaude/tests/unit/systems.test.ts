import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitize, registerEnum } from '../../src/state/settings';
import { pitchFor, scaleIntervals, notesForOps } from '../../src/audio/engine';
import { Tournament } from '../../src/battle/tournament';
import { recordRun } from '../../src/engine/runner';
import { Timeline } from '../../src/engine/timeline';
import { collectHighlights } from '../../src/render/view';
import { generateKeys } from '../../src/engine/generators';
import { ColorLUT, PALETTES } from '../../src/render/palettes';
import { summarize } from '../../src/battle/engine';

describe('settings validation', () => {
  it('drops unknown keys, clamps numbers, rejects bad enums and colors', () => {
    registerEnum('appearance.viz', ['bars', 'spiral']);
    const s = sanitize(DEFAULT_SETTINGS, {
      evil: '<script>',
      sorting: { n: 1e12, speed: 'fast', algorithm: 42 },
      appearance: { viz: 'not-a-viz', fixedColor: 'red', glow: -5, bgImage: 'javascript:alert(1)', customGradient: [{ pos: 2, color: '#ffffff' }, { pos: 0, color: 'bad' }] },
    });
    expect((s as any).evil).toBeUndefined();
    expect(s.sorting.n).toBe(1_000_000);
    expect(s.sorting.speed).toBe(DEFAULT_SETTINGS.sorting.speed);
    expect(s.appearance.viz).toBe(DEFAULT_SETTINGS.appearance.viz);
    expect(s.appearance.fixedColor).toBe(DEFAULT_SETTINGS.appearance.fixedColor);
    expect(s.appearance.glow).toBe(0);
    expect(s.appearance.bgImage).toBe('');
    expect(s.appearance.customGradient).toEqual(DEFAULT_SETTINGS.appearance.customGradient);
  });
  it('round-trips the defaults unchanged', () => {
    expect(sanitize(DEFAULT_SETTINGS, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))).toEqual(DEFAULT_SETTINGS);
  });
});

describe('audio mapping', () => {
  const a = DEFAULT_SETTINGS.audio;
  it('quantizes pitches into the selected scale and range', () => {
    const iv = scaleIntervals({ ...a, scale: 'pentatonic' });
    for (let t = 0; t <= 1; t += 0.01) {
      const m = pitchFor(t, a, iv);
      expect(m).toBeGreaterThanOrEqual(a.pitchMin - 2);
      expect(m).toBeLessThanOrEqual(a.pitchMax + 2);
      expect(iv).toContain((((m - a.rootNote) % 12) + 12) % 12);
    }
  });
  it('custom scales are parsed and validated', () => {
    expect(scaleIntervals({ ...a, scale: 'custom', customScale: '0 4 7 99 x' })).toEqual([0, 4, 7]);
  });
  it('notes come only from displayed ops and respect density', () => {
    const rec = recordRun('bubble', generateKeys({ n: 50, pattern: 'random', seed: 3 }), { seed: 1 });
    const tl = new Timeline(rec);
    tl.seek(500);
    const notes = notesForOps(tl, 400, 500, { ...a, density: 5 }, 1, 50);
    expect(notes.length).toBe(5);
    expect(notesForOps(tl, 500, 500, a, 1, 50)).toEqual([]);
    expect(notesForOps(tl, 400, 500, { ...a, soundCompare: false, soundSwap: false, soundWrite: false }, 1, 50)).toEqual([]);
  });
});

describe('highlights are a pure function of the playback position', () => {
  it('same position => same highlights', () => {
    const rec = recordRun('quick', generateKeys({ n: 100, pattern: 'random', seed: 9 }), { seed: 1 });
    const tl = new Timeline(rec);
    const a = { compare: [] as number[], write: [] as number[] };
    const b = { compare: [] as number[], write: [] as number[] };
    tl.seek(777);
    collectHighlights(tl, 8, a);
    tl.seek(tl.total);
    tl.seek(777);
    collectHighlights(tl, 8, b);
    expect(a).toEqual(b);
    expect(a.compare.length + a.write.length).toBeGreaterThan(0);
  });
});

describe('palettes', () => {
  it('every palette produces a valid 256-entry LUT and palettes are distinct', () => {
    const sigs = new Set<string>();
    for (const p of PALETTES) {
      const l = new ColorLUT(p.stops, 256, p.hsl ? 'hsl' : 'rgb');
      expect(l.css.every((c) => /^rgb\(\d+,\d+,\d+\)$/.test(c))).toBe(true);
      sigs.add(l.css.filter((_, i) => i % 32 === 0).join());
    }
    expect(sigs.size).toBe(PALETTES.length);
  });
});

describe('tournament', () => {
  it('elimination: bracket progresses, every match uses one dataset, champion has fewest comparisons', async () => {
    const t = new Tournament({ format: 'elimination', competitors: ['bubble', 'merge', 'insertion', 'heap'], metric: 'comparisons', sizes: [200], patterns: ['random'], seed: 5 }, () => {});
    await t.run();
    expect(t.matches.every((m) => m.done)).toBe(true);
    expect(t.matches).toHaveLength(3);
    const final = t.matches[2];
    expect([final.a, final.b]).toContain(t.matches[0].winner);
    expect([final.a, final.b]).toContain(t.matches[1].winner);
    expect(t.champion()).toBe('merge');
    t.dispose();
  });
  it('round robin standings award 3/1/0 points', async () => {
    const t = new Tournament({ format: 'round-robin', competitors: ['bubble', 'selection', 'exchange'], metric: 'comparisons', sizes: [50], patterns: ['random'], seed: 1 }, () => {});
    await t.run();
    // all three make exactly n(n-1)/2 comparisons -> every match is a draw
    const st = t.standings();
    expect(st.every((s) => s.draws === 2 && s.points === 2)).toBe(true);
    t.dispose();
  });
});

describe('benchmark statistics', () => {
  it('median / mean / std are computed from measured runs', () => {
    const mk = (ms: number) => ({ algorithmId: 'x', ms, comparisons: 1, swaps: 0, writes: 0, reads: 0, auxWrites: 0, auxPeak: 0, operations: 1, sorted: true });
    const s = summarize('x', [mk(1), mk(3), mk(2), mk(10)]);
    expect(s.median).toBe(2.5);
    expect(s.mean).toBe(4);
    expect(s.min).toBe(1);
    expect(s.max).toBe(10);
    expect(s.std).toBeCloseTo(Math.sqrt((9 + 1 + 4 + 36) / 4));
  });
});
