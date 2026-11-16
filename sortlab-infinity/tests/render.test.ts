import { describe, expect, it } from 'vitest';
import { drawMode, Frame, RenderOpts } from '../src/render/renderer';
import { VISUAL_MODES } from '../src/render/modes';
import { buildPalette } from '../src/render/palette';
import { HL_COMPARE, HL_SWAP, HL_WRITE } from '../src/engine/player';

/** A permissive mock 2D context that records every numeric argument passed to drawing calls. */
function mockContext() {
  const bad: string[] = [];
  let calls = 0;
  const grad = { addColorStop: () => undefined };
  const target: Record<string, unknown> = { canvas: { width: 800, height: 400 } };
  const proxy: CanvasRenderingContext2D = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      return (...args: unknown[]) => {
        calls++;
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) bad.push(`${prop}(${args.join(',')})`);
        return undefined;
      };
    },
    set(t, prop: string, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${prop}=${v}`);
      t[prop] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { g: proxy, bad, calls: () => calls };
}

function frame(values: number[], extras: Partial<Frame> = {}): Frame {
  const n = values.length;
  const max = Math.max(1, ...values);
  const hlType = new Uint8Array(n);
  if (n > 3) {
    hlType[0] = HL_COMPARE;
    hlType[1] = HL_SWAP;
    hlType[2] = HL_WRITE;
  }
  return {
    n,
    values: Int32Array.from(values),
    heights: Float32Array.from(values),
    offsets: new Float32Array(n).map((_, i) => (i % 5 === 0 ? 2.5 : 0)),
    hlType,
    hlAge: new Float32Array(n).fill(0.5),
    maxValue: max,
    minValue: n ? Math.min(...values) : 0,
    sweep: -1,
    sweepFail: -1,
    time: 1.25,
    ...extras,
  };
}

const opts = (max: number): RenderOpts => ({
  palette: buildPalette('rainbow', max, 1, '#000000', '#ffffff'),
  background: '#000',
  compareColor: '#fff',
  swapColor: '#f00',
  writeColor: '#0f0',
  sweepColor: '#0f0',
  failColor: '#f00',
  showHighlights: true,
  barWidth: 0.8,
  barSpacing: 1,
  glow: 0,
  migraineIntensity: 1,
  reducedMotion: false,
  dpr: 2,
});

const cases: [string, number[]][] = [
  ['empty', []],
  ['single', [1]],
  ['two', [2, 1]],
  ['all equal', Array(64).fill(5)],
  ['random 257', Array.from({ length: 257 }, (_, i) => ((i * 37) % 257) + 1)],
  ['large 5000', Array.from({ length: 5000 }, (_, i) => 5000 - i)],
];

describe('visualization stability', () => {
  it('has 20 visualization modes', () => {
    expect(VISUAL_MODES.length).toBe(20);
    expect(new Set(VISUAL_MODES.map((m) => m.id)).size).toBe(20);
  });
  for (const mode of VISUAL_MODES.filter((m) => !m.is3d)) {
    it(`${mode.name} draws only finite coordinates for edge-case data`, () => {
      for (const [label, values] of cases) {
        for (const extras of [{}, { sweep: Math.floor(values.length / 2), sweepFail: values.length > 4 ? 3 : -1 }]) {
          const { g, bad, calls } = mockContext();
          const f = frame(values, extras);
          expect(() => drawMode(g, mode.id, f, 800, 400, opts(f.maxValue)), label).not.toThrow();
          expect(bad, `${mode.id} ${label}`).toEqual([]);
          if (values.length > 0) expect(calls(), `${mode.id} ${label} draws something`).toBeGreaterThan(0);
        }
      }
    });
  }
  it('palette covers every value and is cached', () => {
    const p = buildPalette('rainbow', 100, 1, '#000000', '#ffffff');
    expect(p.length).toBe(101);
    expect(buildPalette('rainbow', 100, 1, '#000000', '#ffffff')).toBe(p);
    for (const scheme of ['neon', 'heat', 'ocean', 'mono', 'custom'] as const) {
      const q = buildPalette(scheme, 10, 1, '#123456', '#abcdef');
      for (const c of q) expect(c).toMatch(/^(rgb|hsl)\(/);
    }
  });
});
