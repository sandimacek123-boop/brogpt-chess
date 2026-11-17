/**
 * SortClaude 5.5 — operation encoding.
 *
 * Every algorithm runs against an instrumented array. Each primitive it performs is
 * recorded as one fixed-size record of OP_STRIDE Int32 slots: [type, a, b, c].
 * Records are fully reversible, which is what makes single-step rewind O(1).
 *
 * The array state itself is an array of element IDs. An element's key (the value that is
 * sorted on) is looked up through `keys[id]`, so writes only need to carry IDs and equal keys
 * keep distinct identities (needed for identity colouring and stability verification).
 *
 * METRIC CONVENTIONS (also shown in the UI, see METRIC_DEFINITIONS):
 *   COMPARE      main[a] vs main[b]                    -> comparisons +1, reads +2
 *   COMPARE_AUX  comparison of two held/aux values     -> comparisons +1 (a,b = highlight hints, -1 = none)
 *   COMPARE_HELD held value vs main[a]                 -> comparisons +1, reads +1 (b = hint)
 *   AUX_STORE    store a held value into aux memory    -> auxWrites +1 (a = hint)
 *   SWAP         main[a] <-> main[b]                   -> swaps +1, reads +2, writes +2
 *   WRITE        main[a] = element b (was c)            -> writes +1      (value came from a register/aux)
 *   MOVE         main[a] = element b (was c), copied from another main index -> reads +1, writes +1
 *   READ         read main[a] into a register           -> reads +1
 *   TO_AUX       copy main[a] into auxiliary storage    -> reads +1, auxWrites +1
 *   PIVOT        pivot marker a (previous pivot b)      -> annotation only
 *   RANGE        active range [a,b] (previous RANGE op index c) -> annotation only
 *   SORTED       index a confirmed in final position (previous flag b) -> annotation only
 *   ALLOC/FREE   auxiliary memory +a / -a elements      -> auxMemory
 *   FLAG         algorithm-specific annotation (e.g. burnt-pancake orientation flip) at a
 */
export const OP_STRIDE = 4;

export const enum Op {
  COMPARE = 1,
  COMPARE_AUX = 2,
  SWAP = 3,
  WRITE = 4,
  MOVE = 5,
  READ = 6,
  TO_AUX = 7,
  PIVOT = 8,
  RANGE = 9,
  SORTED = 10,
  ALLOC = 11,
  FREE = 12,
  FLAG = 13,
  COMPARE_HELD = 14,
  AUX_STORE = 15,
}

export const OP_NAMES: Record<number, string> = {
  1: 'compare',
  2: 'compare (aux)',
  3: 'swap',
  4: 'write',
  5: 'move',
  6: 'read',
  7: 'copy to aux',
  8: 'pivot',
  9: 'range',
  10: 'sorted',
  11: 'allocate',
  12: 'release',
  13: 'flag',
  14: 'compare (held vs main)',
  15: 'store to aux',
};

/** Counter slots, stored in a Float64Array for exact large integers. */
export const C_COMPARISONS = 0;
export const C_SWAPS = 1;
export const C_WRITES = 2;
export const C_READS = 3;
export const C_AUX_WRITES = 4;
export const C_AUX_MEMORY = 5;
export const C_OPERATIONS = 6;
export const COUNTER_SLOTS = 7;

export interface Counters {
  comparisons: number;
  swaps: number;
  writes: number;
  reads: number;
  auxWrites: number;
  auxMemory: number;
  operations: number;
}

export function countersFromArray(c: ArrayLike<number>): Counters {
  return {
    comparisons: c[C_COMPARISONS],
    swaps: c[C_SWAPS],
    writes: c[C_WRITES],
    reads: c[C_READS],
    auxWrites: c[C_AUX_WRITES],
    auxMemory: c[C_AUX_MEMORY],
    operations: c[C_OPERATIONS],
  };
}

/**
 * Apply the counter delta of one op (sign = +1 forward, -1 reverse).
 * "operations" counts data operations only (compare/swap/write/move/read/aux copy);
 * annotations such as pivot markers are not counted as operations.
 */
export function applyCounterDelta(c: Float64Array, type: number, a: number, sign: number): void {
  switch (type) {
    case Op.COMPARE:
      c[C_COMPARISONS] += sign;
      c[C_READS] += 2 * sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.COMPARE_AUX:
      c[C_COMPARISONS] += sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.SWAP:
      c[C_SWAPS] += sign;
      c[C_READS] += 2 * sign;
      c[C_WRITES] += 2 * sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.WRITE:
      c[C_WRITES] += sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.MOVE:
      c[C_WRITES] += sign;
      c[C_READS] += sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.READ:
      c[C_READS] += sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.TO_AUX:
      c[C_READS] += sign;
      c[C_AUX_WRITES] += sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.COMPARE_HELD:
      c[C_COMPARISONS] += sign;
      c[C_READS] += sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.AUX_STORE:
      c[C_AUX_WRITES] += sign;
      c[C_OPERATIONS] += sign;
      break;
    case Op.ALLOC:
      c[C_AUX_MEMORY] += a * sign;
      break;
    case Op.FREE:
      c[C_AUX_MEMORY] -= a * sign;
      break;
    default:
      break;
  }
}

export const METRIC_DEFINITIONS: { key: keyof Counters; label: string; definition: string }[] = [
  { key: 'operations', label: 'Operations', definition: 'Data operations performed: compares + swaps + writes/moves + explicit reads + copies to auxiliary memory. Annotations (pivot/range/sorted markers) are not counted.' },
  { key: 'comparisons', label: 'Comparisons', definition: 'Every key comparison the algorithm actually executed, whether both keys were in the main array or one was held in a register / auxiliary buffer.' },
  { key: 'swaps', label: 'Swaps', definition: 'Exchanges of two main-array positions. One swap = 2 reads + 2 writes.' },
  { key: 'writes', label: 'Writes', definition: 'Stores into the main array (2 per swap, 1 per write or move). Writes into auxiliary buffers are counted separately.' },
  { key: 'reads', label: 'Reads', definition: 'Main-array loads: 2 per main-array compare, 2 per swap, 1 per move, 1 per explicit read or copy to aux.' },
  { key: 'auxWrites', label: 'Aux writes', definition: 'Stores into auxiliary memory (buffers, buckets, heaps, trees).' },
  { key: 'auxMemory', label: 'Aux memory', definition: 'Elements of auxiliary memory currently allocated by the algorithm.' },
];
