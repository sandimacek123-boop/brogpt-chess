import type { AlgoDef, AlgorithmInfo, Category } from './types';
import { exchangeSorts } from './exchange';
import { insertionSorts } from './insertion';
import { selectionSorts } from './selection';
import { treeSorts } from './tree';
import { quickSorts } from './quick';
import { mergeSorts } from './merge';
import { distributionSorts } from './distribution';
import { networkSorts } from './network';
import { miscSorts } from './misc';

const defs: AlgoDef[] = [
  ...exchangeSorts,
  ...insertionSorts,
  ...selectionSorts,
  ...treeSorts,
  ...quickSorts,
  ...mergeSorts,
  ...distributionSorts,
  ...networkSorts,
  ...miscSorts,
];

export const ALGORITHMS: AlgorithmInfo[] = defs.map((d) => ({ maxN: 16384, ...d }));

export const ALGORITHM_MAP = new Map(ALGORITHMS.map((a) => [a.id, a]));

export const CATEGORIES: Category[] = [
  'Exchange',
  'Insertion',
  'Selection',
  'Tree',
  'Quick',
  'Merge',
  'Hybrid',
  'Distribution',
  'Network',
  'Impractical',
];

export function getAlgorithm(id: string): AlgorithmInfo {
  return ALGORITHM_MAP.get(id) ?? ALGORITHM_MAP.get('quick')!;
}

export type { AlgorithmInfo, Category };
