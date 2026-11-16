/**
 * Operation trace encoding. Each operation occupies 3 consecutive Int32 slots:
 *   [opcode, a, b]
 * COMPARE  a=i, b=j    (either may be -1 when one side is a temporary value)
 * SWAP     a=i, b=j
 * WRITE    a=i, b=value
 */
export const OP_COMPARE = 0;
export const OP_SWAP = 1;
export const OP_WRITE = 2;
export const OP_STRIDE = 3;

export interface SortStats {
  comparisons: number;
  swaps: number;
  /** Direct writes to the main array (swaps are counted separately). */
  writes: number;
  /** Writes into auxiliary (scratch) arrays. */
  auxWrites: number;
  /** Reads of the main array performed outside comparisons. */
  reads: number;
}

export function emptyStats(): SortStats {
  return { comparisons: 0, swaps: 0, writes: 0, auxWrites: 0, reads: 0 };
}

export function totalOps(s: SortStats): number {
  return s.comparisons + s.swaps + s.writes + s.auxWrites;
}
