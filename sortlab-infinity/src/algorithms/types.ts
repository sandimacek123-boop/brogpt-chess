import type { SortContext } from '../core/context';

export type Category =
  | 'Exchange'
  | 'Insertion'
  | 'Selection'
  | 'Tree'
  | 'Quick'
  | 'Merge'
  | 'Hybrid'
  | 'Distribution'
  | 'Network'
  | 'Impractical';

export interface AlgorithmInfo {
  id: string;
  name: string;
  category: Category;
  best: string;
  average: string;
  worst: string;
  space: string;
  stable: boolean;
  inPlace: boolean;
  description: string;
  /** Largest element count this algorithm may be run with in the UI. */
  maxN: number;
  /** Show a "very slow" warning. */
  slow?: boolean;
  /** Variant/notes shown in the Algorithms catalog. */
  notes?: string;
  run(ctx: SortContext): void;
}

export type AlgoDef = Omit<AlgorithmInfo, 'maxN'> & { maxN?: number };
