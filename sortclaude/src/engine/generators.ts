import { Rng } from './rng';

export type PatternId =
  | 'random' | 'reversed' | 'sorted' | 'nearly-sorted' | 'few-unique' | 'many-duplicates'
  | 'pipe-organ' | 'reverse-pipe-organ' | 'sawtooth' | 'staggered' | 'alternating' | 'random-swaps'
  | 'random-runs' | 'ascending-blocks' | 'descending-blocks' | 'double-organ' | 'gaussian'
  | 'uniform' | 'sinusoidal' | 'custom';

export const PATTERNS: { id: PatternId; name: string; description: string; duplicates: boolean }[] = [
  { id: 'random', name: 'Random permutation', description: 'Every value 1..n exactly once, uniformly shuffled (Fisher–Yates).', duplicates: false },
  { id: 'reversed', name: 'Reversed', description: 'n, n−1, …, 1.', duplicates: false },
  { id: 'sorted', name: 'Already sorted', description: '1, 2, …, n.', duplicates: false },
  { id: 'nearly-sorted', name: 'Nearly sorted', description: 'Sorted, then ~5% of elements displaced by a few positions.', duplicates: false },
  { id: 'few-unique', name: 'Few unique', description: 'Only 5 distinct values, shuffled.', duplicates: true },
  { id: 'many-duplicates', name: 'Many duplicates', description: 'About n/8 distinct values, each repeated, shuffled.', duplicates: true },
  { id: 'pipe-organ', name: 'Pipe organ', description: 'Ascending to the middle, then descending.', duplicates: false },
  { id: 'reverse-pipe-organ', name: 'Reverse pipe organ', description: 'Descending to the middle, then ascending.', duplicates: false },
  { id: 'sawtooth', name: 'Sawtooth', description: 'Several ascending ramps (teeth).', duplicates: false },
  { id: 'staggered', name: 'Staggered', description: 'Perfect interleave of √n sorted blocks.', duplicates: false },
  { id: 'alternating', name: 'Alternating high/low', description: '1, n, 2, n−1, 3, …', duplicates: false },
  { id: 'random-swaps', name: 'Random swaps', description: 'Sorted, then n/10 random pairs swapped.', duplicates: false },
  { id: 'random-runs', name: 'Random runs', description: 'Sorted runs of random length, concatenated in random order.', duplicates: false },
  { id: 'ascending-blocks', name: 'Ascending blocks', description: 'Blocks that are internally ascending, in random block order.', duplicates: false },
  { id: 'descending-blocks', name: 'Descending blocks', description: 'Blocks that are internally descending, in ascending block order.', duplicates: false },
  { id: 'double-organ', name: 'Double organ', description: 'Two pipe organs side by side (organ-like value distribution).', duplicates: false },
  { id: 'gaussian', name: 'Gaussian values', description: 'Values drawn from a normal distribution (mean n/2, σ n/6), clamped to [1, n].', duplicates: true },
  { id: 'uniform', name: 'Uniform random values', description: 'Values drawn uniformly from [1, n] with replacement.', duplicates: true },
  { id: 'sinusoidal', name: 'Sinusoidal', description: 'Values follow three periods of a sine wave across the array.', duplicates: true },
  { id: 'custom', name: 'Custom data', description: 'Your own comma/space separated integers.', duplicates: true },
];

export const ELEMENT_PRESETS = [10, 20, 50, 100, 160, 256, 512, 1024, 2048, 5000, 10000, 50000, 100000];
export const MAX_ELEMENTS = 1_000_000;

export interface DatasetConfig {
  n: number;
  pattern: PatternId;
  seed: number;
  custom?: number[];
}

function shuffle(a: Int32Array, rng: Rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}

function ascending(n: number): Int32Array {
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) a[i] = i + 1;
  return a;
}

/** Generate the keys of a dataset. Same config => identical output, always. */
export function generateKeys(cfg: DatasetConfig): Int32Array {
  const rng = new Rng(cfg.seed >>> 0);
  if (cfg.pattern === 'custom') {
    const src = cfg.custom ?? [];
    return Int32Array.from(src.slice(0, MAX_ELEMENTS));
  }
  const n = Math.max(0, Math.min(MAX_ELEMENTS, Math.floor(cfg.n)));
  const a = ascending(n);
  switch (cfg.pattern) {
    case 'random':
      shuffle(a, rng);
      break;
    case 'reversed':
      a.reverse();
      break;
    case 'sorted':
      break;
    case 'nearly-sorted': {
      const k = Math.max(1, Math.floor(n * 0.05));
      const reach = Math.max(2, Math.floor(Math.sqrt(n) / 2));
      for (let t = 0; t < k && n > 1; t++) {
        const i = rng.int(n);
        const j = Math.min(n - 1, Math.max(0, i + rng.range(-reach, reach)));
        const x = a[i];
        a[i] = a[j];
        a[j] = x;
      }
      break;
    }
    case 'few-unique': {
      const levels = 5;
      for (let i = 0; i < n; i++) a[i] = Math.floor((i * levels) / Math.max(1, n)) * Math.max(1, Math.floor(n / levels)) + Math.max(1, Math.floor(n / levels));
      shuffle(a, rng);
      break;
    }
    case 'many-duplicates': {
      const levels = Math.max(2, Math.floor(n / 8));
      const step = n / levels;
      for (let i = 0; i < n; i++) a[i] = Math.max(1, Math.round((Math.floor(i / step) + 1) * step));
      shuffle(a, rng);
      break;
    }
    case 'pipe-organ': {
      const half = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) a[i] = i < half ? 2 * i + 1 : 2 * (n - i);
      break;
    }
    case 'reverse-pipe-organ': {
      const half = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) a[i] = i < half ? n - 2 * i : 2 * (i - half) + (n % 2 === 0 ? 1 : 2);
      break;
    }
    case 'sawtooth': {
      const teeth = Math.max(2, Math.min(8, Math.floor(n / 4)));
      const per = Math.ceil(n / teeth);
      // tooth t holds values t, t+teeth, t+2·teeth, ... ascending
      let k = 0;
      for (let t = 0; t < teeth && k < n; t++) for (let v = t; v < n && k < n; v += teeth) a[k++] = v + 1;
      void per;
      break;
    }
    case 'staggered': {
      const b = Math.max(1, Math.round(Math.sqrt(n)));
      const out = new Int32Array(n);
      let k = 0;
      for (let r = 0; r < b; r++) for (let i = r; i < n; i += b) out[k++] = i + 1;
      a.set(out);
      break;
    }
    case 'alternating': {
      let lo = 1;
      let hi = n;
      for (let i = 0; i < n; i++) a[i] = i % 2 === 0 ? lo++ : hi--;
      break;
    }
    case 'random-swaps': {
      const k = Math.max(1, Math.floor(n / 10));
      for (let t = 0; t < k && n > 1; t++) {
        const i = rng.int(n);
        const j = rng.int(n);
        const x = a[i];
        a[i] = a[j];
        a[j] = x;
      }
      break;
    }
    case 'random-runs': {
      const runs: Int32Array[] = [];
      let start = 0;
      const maxRun = Math.max(2, Math.floor(n / 6));
      while (start < n) {
        const len = Math.min(n - start, rng.range(1, maxRun));
        runs.push(a.slice(start, start + len));
        start += len;
      }
      for (let i = runs.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [runs[i], runs[j]] = [runs[j], runs[i]];
      }
      let k = 0;
      for (const r of runs) for (const v of r) a[k++] = v;
      break;
    }
    case 'ascending-blocks': {
      const bs = Math.max(1, Math.round(Math.sqrt(n)));
      const blocks: Int32Array[] = [];
      for (let s = 0; s < n; s += bs) blocks.push(a.slice(s, Math.min(n, s + bs)));
      for (let i = blocks.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      }
      let k = 0;
      for (const bl of blocks) for (const v of bl) a[k++] = v;
      break;
    }
    case 'descending-blocks': {
      const bs = Math.max(1, Math.round(Math.sqrt(n)));
      for (let s = 0; s < n; s += bs) a.subarray(s, Math.min(n, s + bs)).reverse();
      break;
    }
    case 'double-organ': {
      // values interleaved so two organs together form a permutation
      const half = Math.ceil(n / 2);
      const left: number[] = [];
      const right: number[] = [];
      for (let v = 1; v <= n; v++) (v % 2 ? left : right).push(v);
      const organ = (vals: number[]) => {
        const up: number[] = [];
        const down: number[] = [];
        vals.forEach((v, i) => (i % 2 === 0 ? up : down).push(v));
        return [...up, ...down.reverse()];
      };
      const o = [...organ(left), ...organ(right)];
      for (let i = 0; i < n; i++) a[i] = o[i];
      void half;
      break;
    }
    case 'gaussian':
      for (let i = 0; i < n; i++) a[i] = Math.min(n, Math.max(1, Math.round(n / 2 + (rng.gaussian() * n) / 6)));
      break;
    case 'uniform':
      for (let i = 0; i < n; i++) a[i] = rng.range(1, Math.max(1, n));
      break;
    case 'sinusoidal':
      for (let i = 0; i < n; i++) a[i] = Math.max(1, Math.round(((Math.sin((2 * Math.PI * 3 * i) / Math.max(1, n)) + 1) / 2) * (n - 1)) + 1);
      break;
  }
  return a;
}

/** Parse user-entered custom data. Returns keys or an error message. */
export function parseCustomData(text: string): { keys: number[] } | { error: string } {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 0) return { error: 'Enter at least one integer.' };
  if (parts.length > MAX_ELEMENTS) return { error: `At most ${MAX_ELEMENTS.toLocaleString()} values are supported.` };
  const keys: number[] = [];
  for (const p of parts) {
    if (!/^-?\d+$/.test(p)) return { error: `"${p.slice(0, 20)}" is not an integer. Only whole numbers are supported.` };
    const v = Number(p);
    if (v > 2147483647 || v < -2147483648) return { error: `${p} is outside the 32-bit integer range.` };
    keys.push(v);
  }
  return { keys };
}
