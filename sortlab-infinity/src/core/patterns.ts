import { mulberry32 } from './rng';

export type PatternId =
  | 'random'
  | 'reversed'
  | 'sorted'
  | 'nearly'
  | 'fewUnique'
  | 'alternating'
  | 'mountain'
  | 'valley'
  | 'organPipe'
  | 'sawtooth'
  | 'blocks';

export const PATTERNS: { id: PatternId; name: string; description: string }[] = [
  { id: 'random', name: 'Random', description: 'Uniform random permutation of 1..n' },
  { id: 'reversed', name: 'Reversed', description: 'Strictly descending values' },
  { id: 'sorted', name: 'Sorted', description: 'Already in ascending order' },
  { id: 'nearly', name: 'Nearly sorted', description: 'Sorted with ~3% of elements displaced locally' },
  { id: 'fewUnique', name: 'Few unique', description: 'Only 8 distinct values, shuffled' },
  { id: 'alternating', name: 'Alternating high/low', description: 'Low, high, low, high …' },
  { id: 'mountain', name: 'Mountain', description: 'Permutation rising to a peak, then falling' },
  { id: 'valley', name: 'Valley', description: 'Descending then ascending' },
  { id: 'organPipe', name: 'Organ pipe', description: 'Mirrored ramp with duplicates: 1,3,5…5,3,1' },
  { id: 'sawtooth', name: 'Sawtooth', description: 'Several repeated ascending ramps' },
  { id: 'blocks', name: 'Randomized blocks', description: 'Sorted blocks placed in random order' },
];

function shuffle(a: number[], rng: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}

/** Generate starting data. Values are positive integers in 1..n. */
export function generatePattern(pattern: PatternId, n: number, seed: number): Int32Array {
  const rng = mulberry32(seed);
  const sorted = Array.from({ length: n }, (_, i) => i + 1);
  let out: number[];
  switch (pattern) {
    case 'random':
      out = sorted.slice();
      shuffle(out, rng);
      break;
    case 'reversed':
      out = sorted.slice().reverse();
      break;
    case 'sorted':
      out = sorted;
      break;
    case 'nearly': {
      out = sorted.slice();
      const swaps = n < 2 ? 0 : Math.max(1, Math.round(n * 0.03));
      for (let k = 0; k < swaps; k++) {
        const i = Math.floor(rng() * n);
        const j = Math.min(n - 1, Math.max(0, i + Math.floor(rng() * 11) - 5));
        const t = out[i];
        out[i] = out[j];
        out[j] = t;
      }
      break;
    }
    case 'fewUnique': {
      const k = Math.min(8, Math.max(1, n));
      out = Array.from({ length: n }, (_, i) => Math.max(1, Math.round(((Math.floor((i * k) / n) + 1) * n) / k)));
      shuffle(out, rng);
      break;
    }
    case 'alternating': {
      out = new Array(n);
      let lo = 0;
      let hi = n - 1;
      for (let i = 0; i < n; i++) out[i] = i % 2 === 0 ? sorted[lo++] : sorted[hi--];
      break;
    }
    case 'mountain': {
      const evens = sorted.filter((_, i) => i % 2 === 0);
      const odds = sorted.filter((_, i) => i % 2 === 1).reverse();
      out = evens.concat(odds);
      break;
    }
    case 'valley': {
      const evens = sorted.filter((_, i) => i % 2 === 0).reverse();
      const odds = sorted.filter((_, i) => i % 2 === 1);
      out = evens.concat(odds);
      break;
    }
    case 'organPipe': {
      // Bentley–McIlroy style organ pipe: 1,3,5,…,peak,…,5,3,1 (contains duplicates)
      out = Array.from({ length: n }, (_, i) => Math.min(n, 2 * Math.min(i, n - 1 - i) + 1));
      break;
    }
    case 'sawtooth': {
      const teeth = Math.max(1, Math.min(8, Math.floor(n / 4)));
      const per = Math.ceil(n / teeth);
      // ramps that each span the full value range
      out = Array.from({ length: n }, (_, i) => {
        const pos = i % per;
        return Math.max(1, Math.round(((pos + 1) / per) * n));
      });
      break;
    }
    case 'blocks': {
      const bs = Math.max(1, Math.round(Math.sqrt(n)));
      const blocks: number[][] = [];
      for (let i = 0; i < n; i += bs) blocks.push(sorted.slice(i, i + bs));
      shuffle(blocks as unknown as number[], rng);
      out = ([] as number[]).concat(...blocks);
      break;
    }
    default:
      out = sorted;
  }
  return Int32Array.from(out);
}

export function isSorted(a: ArrayLike<number>): boolean {
  for (let i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false;
  return true;
}
