import type { Machine } from './machine';
import * as E from './algorithms/elementary';
import * as M from './algorithms/merge';
import * as Q from './algorithms/quick';
import * as H from './algorithms/heap';
import * as D from './algorithms/distribution';
import * as N from './algorithms/network';
import * as X from './algorithms/novelty';

export type Category = 'Elementary' | 'Gap & Network' | 'Divide & Conquer' | 'Heap' | 'Distribution' | 'Hybrid' | 'Experimental';
export type Family = 'Exchange' | 'Selection' | 'Insertion' | 'Shell' | 'Merge' | 'Quick' | 'Heap' | 'Distribution' | 'Network' | 'Tree' | 'Novelty' | 'Hybrid';

export interface AlgorithmInfo {
  id: string;
  name: string;
  category: Category;
  family: Family;
  run: (m: Machine) => void;
  best: string;
  average: string;
  worst: string;
  space: string;
  stable: boolean;
  inPlace: boolean;
  comparison: boolean;
  /** Max element count for recorded (visual) playback. */
  maxN: number;
  /** Max element count for benchmark (count-only) runs. */
  benchMaxN: number;
  description: string;
  notes: string;
  strengths: string[];
  weaknesses: string[];
  useCases: string;
  observation: string;
  pseudocode: string;
  /** Extra domain restriction on the key range (max - min). */
  maxKeySpan?: number;
  novelty?: boolean;
}

type Def = Omit<AlgorithmInfo, 'strengths' | 'weaknesses'> & { strengths?: string[]; weaknesses?: string[] };

const Q_MAX = 4096; // quadratic algorithms, recorded
const Q_BENCH = 20000;
const NLOGN_MAX = 100000;
const NLOGN_BENCH = 1000000;

const defs: Def[] = [
  // ======================================================================== Elementary
  {
    id: 'bubble', name: 'Bubble Sort', category: 'Elementary', family: 'Exchange', run: E.bubbleSort,
    best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Repeatedly steps through the array, swapping adjacent elements that are out of order. After pass i the i largest elements have "bubbled" to the end.',
    notes: 'This is the textbook version without early exit: it always performs n(n−1)/2 comparisons.',
    strengths: ['Trivial to implement', 'Stable', 'Constant extra memory'],
    weaknesses: ['Quadratic even on sorted input (this variant)', 'Very many swaps'],
    useCases: 'Teaching; tiny arrays.',
    observation: 'The number of swaps equals the number of inversions of the input permutation.',
    pseudocode: 'for i in 0 .. n-2:\n  for j in 0 .. n-2-i:\n    if a[j] > a[j+1]:\n      swap(a[j], a[j+1])',
  },
  {
    id: 'bubble-opt', name: 'Optimized Bubble Sort', category: 'Elementary', family: 'Exchange', run: E.optimizedBubbleSort,
    best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Bubble sort that remembers where the last swap happened: everything after it is already in place, and a pass without swaps ends the sort.',
    notes: 'Linear time on already sorted input.',
    useCases: 'Nearly sorted small arrays.',
    observation: 'Each pass can shrink the unsorted region by more than one element.',
    pseudocode: 'end = n-1\nwhile end > 0:\n  last = 0\n  for j in 0 .. end-1:\n    if a[j] > a[j+1]: swap; last = j\n  end = last',
  },
  {
    id: 'cocktail', name: 'Cocktail Shaker Sort', category: 'Elementary', family: 'Exchange', run: E.cocktailShakerSort,
    best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Bidirectional bubble sort: alternates forward and backward passes, so small elements near the end ("turtles") move quickly.',
    notes: 'Both bounds shrink to the position of the last swap in each direction.',
    useCases: 'Teaching; arrays with a few misplaced small elements.',
    observation: 'Fixes the turtle problem of bubble sort but remains quadratic.',
    pseudocode: 'lo, hi = 0, n-1\nwhile lo < hi:\n  forward pass lo..hi (swap if a[j] > a[j+1]), hi = last swap\n  backward pass hi..lo, lo = last swap',
  },
  {
    id: 'odd-even', name: 'Odd-Even Sort', category: 'Elementary', family: 'Exchange', run: E.oddEvenSort,
    best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Brick sort: alternates compare-swaps on (odd, odd+1) pairs and (even, even+1) pairs until a full round makes no swap.',
    notes: 'All comparisons within one phase are independent — the basis of parallel odd-even transposition sort.',
    useCases: 'Parallel processors with neighbour links.',
    observation: 'With n processors it sorts in n rounds.',
    pseudocode: 'repeat until no swap:\n  for odd i: compare-swap(i, i+1)\n  for even i: compare-swap(i, i+1)',
  },
  {
    id: 'comb', name: 'Comb Sort', category: 'Elementary', family: 'Exchange', run: E.combSort,
    best: 'O(n log n)', average: 'Ω(n²/2ᵖ), empirically ~n log n', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: 50000, benchMaxN: 500000,
    description: 'Bubble sort with a gap that shrinks by a factor of 1.3 each pass, eliminating turtles early.',
    notes: 'Shrink factor 1.3 (Lacey & Box 1991). Final passes with gap 1 run until no swaps occur.',
    useCases: 'Simple code with much better practical speed than bubble sort.',
    observation: 'The shrink factor 1.3 was found empirically; ≈1/(1−e^(−φ)).',
    pseudocode: 'gap = n\nrepeat:\n  gap = max(1, floor(gap / 1.3))\n  for i: if a[i] > a[i+gap]: swap\nuntil gap == 1 and no swaps',
  },
  {
    id: 'comb11', name: 'Comb Sort 11', category: 'Elementary', family: 'Exchange', run: E.combSort11,
    best: 'O(n log n)', average: 'empirically ~n log n', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: 50000, benchMaxN: 500000,
    description: 'Comb sort variant using the "rule of 11": gaps of 9 or 10 are replaced by 11, which avoids bad gap sequences.',
    notes: 'Documented variant (Lacey & Box). Otherwise identical to Comb Sort.',
    useCases: 'Same as comb sort, slightly more robust.',
    observation: 'Gap sequences ending 9→6→4→3→2→1 or 10→7→5→3→2→1 perform worse than 11→8→6→4→3→2→1.',
    pseudocode: 'as Comb Sort, but if gap in {9, 10}: gap = 11',
  },
  {
    id: 'exchange', name: 'Exchange Sort', category: 'Elementary', family: 'Exchange', run: E.exchangeSort,
    best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Compares the element at i with every later element and swaps whenever the later one is smaller.',
    notes: 'Swaps non-adjacent elements, so it is not stable.',
    useCases: 'Teaching.',
    observation: 'Like selection sort, but swaps eagerly instead of remembering the minimum.',
    pseudocode: 'for i in 0..n-2:\n  for j in i+1..n-1:\n    if a[i] > a[j]: swap(a[i], a[j])',
  },
  {
    id: 'gnome', name: 'Gnome Sort', category: 'Elementary', family: 'Exchange', run: E.gnomeSort,
    best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'A garden gnome sorting flower pots: step forward if the pair is ordered, otherwise swap and step back.',
    notes: 'Single loop, no nested loops in the code — but still quadratic.',
    useCases: 'Teaching; code golf.',
    observation: 'Performs the same swaps as insertion sort, with extra comparisons walking back.',
    pseudocode: 'pos = 0\nwhile pos < n:\n  if pos == 0 or a[pos-1] <= a[pos]: pos++\n  else: swap(a[pos-1], a[pos]); pos--',
  },
  {
    id: 'gnome-opt', name: 'Optimized Gnome Sort', category: 'Elementary', family: 'Insertion', run: E.optimizedGnomeSort,
    best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Gnome sort where the gnome remembers where it was and "teleports" back after placing a pot.',
    notes: 'Equivalent to insertion sort implemented with adjacent swaps.',
    useCases: 'Teaching.',
    observation: 'Removes the walk-back comparisons of plain gnome sort.',
    pseudocode: 'for i in 1..n-1:\n  pos = i\n  while pos > 0 and a[pos-1] > a[pos]:\n    swap; pos--',
  },
  {
    id: 'circle', name: 'Circle Sort', category: 'Elementary', family: 'Exchange', run: E.circleSort,
    best: 'O(n log n)', average: 'O(n log² n) (empirical)', worst: 'O(n log² n) passes × O(n log n) (conjectured)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: 50000, benchMaxN: 500000,
    description: 'Compares and swaps mirrored pairs (first vs last, second vs second-to-last, …) recursively on both halves, repeating until a pass makes no swap.',
    notes: 'The number of outer passes has no proven tight bound; empirically O(log n).',
    useCases: 'Curiosity; visually striking.',
    observation: 'Each pass concentrates small elements left and large ones right like concentric circles.',
    pseudocode: 'circle(lo, hi):\n  swap mirrored pairs if out of order\n  circle(lo, mid); circle(mid+1, hi)\nrepeat circle(0, n-1) while it swapped',
  },
  {
    id: 'selection', name: 'Selection Sort', category: 'Elementary', family: 'Selection', run: E.selectionSort,
    best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Finds the minimum of the unsorted suffix and swaps it into place, growing a sorted prefix.',
    notes: 'At most n−1 swaps — useful when writes are expensive.',
    strengths: ['Minimal number of swaps (≤ n−1)', 'Simple'],
    weaknesses: ['Always n(n−1)/2 comparisons', 'Not stable'],
    useCases: 'When writes are far more expensive than reads.',
    observation: 'Comparison count is completely independent of the input.',
    pseudocode: 'for i in 0..n-2:\n  min = i\n  for j in i+1..n-1: if a[j] < a[min]: min = j\n  swap(a[i], a[min])',
  },
  {
    id: 'double-selection', name: 'Double Selection Sort', category: 'Elementary', family: 'Selection', run: E.doubleSelectionSort,
    best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Finds both minimum and maximum of the unsorted middle in one scan, placing them at both ends.',
    notes: 'Handles the case where the maximum sat at the position the minimum was swapped into.',
    useCases: 'Teaching.',
    observation: 'Halves the number of passes; comparisons drop to about 3n²/8 thanks to the else-if.',
    pseudocode: 'lo, hi = 0, n-1\nwhile lo < hi:\n  find min and max in a[lo..hi]\n  swap min to lo, max to hi\n  lo++, hi--',
  },
  {
    id: 'cycle', name: 'Cycle Sort', category: 'Elementary', family: 'Selection', run: E.cycleSort,
    best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Decomposes the permutation into cycles and rotates each, writing every element directly to its final position.',
    notes: 'Write-optimal: every element is written at most once to its final position.',
    strengths: ['Theoretically minimal number of writes'],
    weaknesses: ['Quadratic comparisons'],
    useCases: 'Flash/EEPROM where writes wear out memory.',
    observation: 'The number of writes equals n minus the number of fixed-point cycles.',
    pseudocode: 'for start in 0..n-2:\n  item = a[start]\n  pos = start + #{a[i] < item, i > start}\n  skip duplicates, place item at pos\n  continue the cycle until it returns to start',
  },
  {
    id: 'tournament', name: 'Tournament Sort', category: 'Elementary', family: 'Selection', run: E.tournamentSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Builds a knockout tournament (winner tree) over all elements. The champion is output, removed, and only its path is replayed.',
    notes: 'Ties are won by the leaf with the smaller original index, making this implementation stable.',
    useCases: 'External sorting (replacement selection); k-way merging.',
    observation: 'Each extraction replays exactly ⌈log₂ n⌉ matches.',
    pseudocode: 'build winner tree over leaves\nfor k in 0..n-1:\n  out[k] = champion\n  remove champion leaf, replay its path to the root',
  },
  {
    id: 'insertion', name: 'Insertion Sort', category: 'Elementary', family: 'Insertion', run: E.insertionSort,
    best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Takes each element and shifts larger elements of the sorted prefix right until its slot is found.',
    notes: 'Shifting version: the element is held in a register, larger elements are moved one slot right.',
    strengths: ['Adaptive: O(n + inversions)', 'Stable, online', 'Fastest for tiny arrays'],
    weaknesses: ['Quadratic on random input'],
    useCases: 'Small arrays; finishing step of hybrid sorts (IntroSort, TimSort).',
    observation: 'Runs in O(n + I) where I is the number of inversions.',
    pseudocode: 'for i in 1..n-1:\n  t = a[i]; j = i-1\n  while j >= 0 and a[j] > t:\n    a[j+1] = a[j]; j--\n  a[j+1] = t',
  },
  {
    id: 'binary-insertion', name: 'Binary Insertion Sort', category: 'Elementary', family: 'Insertion', run: E.binaryInsertionSort,
    best: 'O(n log n) comparisons', average: 'O(n²) moves', worst: 'O(n²) moves', space: 'O(1)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Insertion sort that finds each insertion point with binary search, cutting comparisons to O(n log n) while moves stay quadratic.',
    notes: 'Binary search lands after equal keys, keeping the sort stable.',
    useCases: 'When comparisons are expensive but moves are cheap.',
    observation: 'Uses at most ⌈log₂(i+1)⌉ comparisons to insert element i.',
    pseudocode: 'for i in 1..n-1:\n  t = a[i]\n  p = upper_bound(a[0..i), t)\n  shift a[p..i-1] right; a[p] = t',
  },
  {
    id: 'tree', name: 'Tree Sort', category: 'Elementary', family: 'Tree', run: E.treeSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²) (sorted input, unbalanced)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: 10000, benchMaxN: 50000,
    description: 'Inserts every element into a binary search tree, then writes them back with an in-order traversal.',
    notes: 'Unbalanced BST: sorted or reversed inputs degenerate into a linked list. Equal keys go right, so it is stable.',
    useCases: 'When a search tree is needed anyway.',
    observation: 'The comparisons performed are exactly those of quicksort with first-element pivots.',
    pseudocode: 'for x in a: bst.insert(x)\nk = 0\nfor x in inorder(bst): a[k++] = x',
  },
  // ======================================================================== Shell
  ...([
    ['shell', 'Shell Sort', 'Shell 1959: n/2, n/4, …, 1', 'O(n²)', 'O(n²) worst for this sequence'],
    ['shell-knuth', 'Shell Sort (Knuth)', 'Knuth 1973: 1, 4, 13, 40, … = (3ᵏ−1)/2', 'O(n^1.5)', 'O(n^1.5)'],
    ['shell-hibbard', 'Shell Sort (Hibbard)', 'Hibbard 1963: 1, 3, 7, 15, … = 2ᵏ−1', 'O(n^1.5)', 'O(n^1.5)'],
    ['shell-pratt', 'Shell Sort (Pratt)', 'Pratt 1971: all 2ᵖ3ᵠ < n', 'O(n log² n)', 'O(n log² n)'],
    ['shell-sedgewick', 'Shell Sort (Sedgewick)', 'Sedgewick 1986: 1, 8, 23, 77, 281, … = 4ᵏ+3·2ᵏ⁻¹+1', 'O(n^(4/3))', 'O(n^(4/3))'],
    ['shell-tokuda', 'Shell Sort (Tokuda)', 'Tokuda 1992: ⌈(9ᵏ−4ᵏ)/(5·4ᵏ⁻¹)⌉ = 1, 4, 9, 20, 46, 103, …', 'unknown (empirically excellent)', 'unknown'],
    ['shell-ciura', 'Shell Sort (Ciura)', 'Ciura 2001: 1, 4, 10, 23, 57, 132, 301, 701, 1750, then ×2.25', 'unknown (empirically best known)', 'unknown'],
  ] as const).map(([id, name, seq, avg, worst]): Def => ({
    id, name, category: 'Gap & Network', family: 'Shell',
    run: ({ shell: E.shellSort, 'shell-knuth': E.shellKnuth, 'shell-hibbard': E.shellHibbard, 'shell-pratt': E.shellPratt, 'shell-sedgewick': E.shellSedgewick, 'shell-tokuda': E.shellTokuda, 'shell-ciura': E.shellCiura } as Record<string, (m: Machine) => void>)[id],
    best: 'O(n log n)', average: avg, worst, space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: id === 'shell' ? 50000 : NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: `Gapped insertion sort: elements far apart are sorted first, then the gap shrinks to 1. Gap sequence: ${seq}.`,
    notes: 'Each gap pass is an insertion sort over interleaved sub-arrays. Complexity depends entirely on the gap sequence.',
    strengths: ['In place, tiny code', 'Very good practical speed with a good sequence'],
    weaknesses: ['Not stable', 'Exact complexity unknown for the best sequences'],
    useCases: 'Embedded systems; mid-sized arrays where code size matters.',
    observation: 'A k-sorted array stays k-sorted after h-sorting (Knuth), which is why the passes compound.',
    pseudocode: 'for gap in sequence (descending):\n  for i in gap..n-1:\n    t = a[i]; j = i\n    while j >= gap and a[j-gap] > t:\n      a[j] = a[j-gap]; j -= gap\n    a[j] = t',
  })),
  // ======================================================================== Divide & Conquer: merge
  {
    id: 'merge', name: 'Merge Sort', category: 'Divide & Conquer', family: 'Merge', run: M.mergeSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Top-down: split in half, sort each half recursively, then merge the two sorted halves through an auxiliary buffer.',
    notes: 'Both runs are copied to the buffer and merged back; ties take the left run (stable).',
    strengths: ['Guaranteed O(n log n)', 'Stable', 'Predictable'],
    weaknesses: ['Θ(n) extra memory'],
    useCases: 'Linked lists, external sorting, whenever stability matters.',
    observation: 'Uses between ½n log₂ n and n log₂ n comparisons.',
    pseudocode: 'sort(lo, hi):\n  if lo >= hi: return\n  mid = (lo+hi)/2\n  sort(lo, mid); sort(mid+1, hi)\n  merge(lo, mid, hi) via buffer',
  },
  {
    id: 'merge-bu', name: 'Bottom-Up Merge Sort', category: 'Divide & Conquer', family: 'Merge', run: M.bottomUpMergeSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Iterative merge sort: merges runs of width 1, 2, 4, 8, … across the whole array without recursion.',
    notes: 'Same merge routine as top-down merge sort.',
    useCases: 'Environments without recursion; cache-friendly passes.',
    observation: 'Exactly ⌈log₂ n⌉ passes over the data.',
    pseudocode: 'for width = 1; width < n; width *= 2:\n  for lo in steps of 2·width:\n    merge(lo, lo+width-1, min(lo+2·width-1, n-1))',
  },
  {
    id: 'merge-natural', name: 'Natural Merge Sort', category: 'Divide & Conquer', family: 'Merge', run: M.naturalMergeSort,
    best: 'O(n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Detects ascending runs already present in the input and merges neighbouring runs until one remains.',
    notes: 'Each round rescans runs; O(n log r) for r initial runs.',
    useCases: 'Partially sorted data.',
    observation: 'A sorted input is recognised in a single pass of n−1 comparisons.',
    pseudocode: 'repeat:\n  find run boundaries\n  if one run: done\n  merge runs pairwise',
  },
  {
    id: 'merge-inplace', name: 'In-Place Merge Sort', category: 'Divide & Conquer', family: 'Merge', run: M.inPlaceMergeSort,
    best: 'O(n log n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(log n)', stable: true, inPlace: true, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Merge sort without a buffer: when the right run’s head is smaller, it is inserted into the left run by shifting.',
    notes: 'Naive in-place merge; moves are quadratic in the worst case. See SymMerge for the efficient in-place approach.',
    useCases: 'Teaching the cost of avoiding auxiliary memory.',
    observation: 'Skips merges whose halves are already in order (one comparison).',
    pseudocode: 'merge(lo, mid, hi):\n  i = lo, j = mid+1\n  while i <= mid and j <= hi:\n    if a[i] <= a[j]: i++\n    else: rotate a[j] into position i; i++, mid++, j++',
  },
  {
    id: 'symmerge', name: 'SymMerge Sort', category: 'Divide & Conquer', family: 'Merge', run: M.symMergeSort,
    best: 'O(n log n)', average: 'O(n log² n)', worst: 'O(n log² n)', space: 'O(log n)', stable: true, inPlace: true, comparison: true,
    maxN: 50000, benchMaxN: 500000,
    description: 'Stable in-place merge sort (Kim & Kutzner 2004): blocks of 20 are insertion-sorted, then merged with the SymMerge algorithm using rotations.',
    notes: 'The same structure as Go’s sort.Stable. Rotations are implemented with block swaps.',
    useCases: 'Stable sorting with no auxiliary buffer.',
    observation: 'SymMerge uses O(m log(n/m + 1)) comparisons — optimal — and O((m+n) log m) swaps.',
    pseudocode: 'insertion-sort blocks of 20\nfor size = 20; size < n; size *= 2:\n  symMerge(a, a+size, b) for each pair of blocks\nsymMerge: binary-search a split, rotate, recurse on both sides',
  },
  {
    id: 'timsort', name: 'TimSort', category: 'Hybrid', family: 'Hybrid', run: M.timSort,
    best: 'O(n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Hybrid of merge sort and binary insertion sort (Tim Peters, 2002) used by Python, Java (objects) and V8. Finds natural runs, extends short ones to minrun, and merges runs from a stack with balancing invariants.',
    notes: 'Implements minrun, descending-run reversal, the corrected stack invariants and gallop-trimmed merge_lo/merge_hi. Simplification: the adaptive in-merge galloping mode is not used (merges are linear), which changes comparison counts on highly structured data but not correctness or stability.',
    strengths: ['O(n) on sorted/reversed data', 'Stable', 'Excellent on real-world data'],
    weaknesses: ['Complex', 'O(n) buffer in the worst case'],
    useCases: 'General-purpose stable sorting of real data.',
    observation: 'minrun is chosen in [32, 64] so that n/minrun is close to a power of two.',
    pseudocode: 'minrun = computeMinRun(n)\nwhile elements remain:\n  run = next natural run (reverse if descending)\n  extend run to minrun with binary insertion\n  push run; mergeCollapse()\nmergeForceCollapse()',
  },
  {
    id: 'strand', name: 'Strand Sort', category: 'Divide & Conquer', family: 'Merge', run: M.strandSort,
    best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: Q_MAX, benchMaxN: Q_BENCH,
    description: 'Repeatedly pulls an increasing "strand" out of the remaining elements and merges it into the result.',
    notes: 'Array variant: after each merge, the main array holds the merged result followed by the remaining elements.',
    useCases: 'Linked lists with long existing ascending subsequences.',
    observation: 'The number of rounds equals the number of strands needed, at most n.',
    pseudocode: 'result = []\nwhile rest:\n  strand = [rest[0]] + greedy increasing picks\n  result = merge(result, strand)',
  },
  {
    id: 'patience', name: 'Patience Sort', category: 'Divide & Conquer', family: 'Merge', run: M.patienceSort,
    best: 'O(n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n)', stable: false, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Deals elements onto piles like the card game (each on the leftmost pile whose top is larger), then merges the piles with a priority queue.',
    notes: 'Pile tops are increasing, so placement uses binary search.',
    useCases: 'Finding the longest increasing subsequence (= number of piles).',
    observation: 'The number of piles equals the length of the longest strictly increasing subsequence.',
    pseudocode: 'for x in a: put x on leftmost pile with top > x (binary search)\nk-way merge pile tops with a min-heap',
  },
  {
    id: 'library', name: 'Library Sort', category: 'Elementary', family: 'Insertion', run: M.librarySort,
    best: 'O(n log n)', average: 'O(n log n) w.h.p. (randomized input order)', worst: 'O(n²)', space: 'O((1+ε)n)', stable: true, inPlace: false, comparison: true,
    maxN: 20000, benchMaxN: 100000,
    description: 'Gapped insertion sort (Bender, Farach-Colton & Mosteiro 2006): leaves gaps like a librarian leaves space on shelves, so inserts rarely shift far. Rebalances after rounds of doubling size.',
    notes: 'ε = 1. Inserts in index order (the paper randomises order for its w.h.p. bound). Equal keys go right, so it is stable.',
    useCases: 'Insertion-heavy workloads.',
    observation: 'Gaps turn insertion sort’s O(n) shifts into O(log n) expected shifts.',
    pseudocode: 'for round size 1, 2, 4, …:\n  rebalance (spread elements with gaps)\n  binary-search + insert next elements, shifting to the nearest gap',
  },
  // ======================================================================== Quick
  {
    id: 'quick', name: 'Quick Sort', category: 'Divide & Conquer', family: 'Quick', run: Q.quickSortLomuto,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Hoare’s quicksort with the Lomuto partition scheme: the last element is the pivot; smaller elements are swapped to the front.',
    notes: 'Recursion into the smaller side keeps stack depth O(log n). Sorted input triggers the O(n²) worst case.',
    strengths: ['Fast in practice', 'In place'],
    weaknesses: ['O(n²) on sorted input with this pivot', 'Not stable'],
    useCases: 'General purpose (with better pivot selection).',
    observation: 'Expected comparisons ≈ 2n ln n ≈ 1.39 n log₂ n on random permutations.',
    pseudocode: 'partition(lo, hi):\n  p = a[hi]; i = lo\n  for j in lo..hi-1: if a[j] < p: swap(a[i++], a[j])\n  swap(a[i], a[hi]); return i',
  },
  {
    id: 'quick-hoare', name: 'Quick Sort (Hoare)', category: 'Divide & Conquer', family: 'Quick', run: Q.quickSortHoare,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Hoare’s original partition: two indices move toward each other and swap pairs on the wrong side of the middle-element pivot.',
    notes: 'Performs about three times fewer swaps than Lomuto on average.',
    useCases: 'General purpose.',
    observation: 'Handles many equal keys well because both scans stop on equality.',
    pseudocode: 'p = a[mid]; i = lo-1; j = hi+1\nloop:\n  do i++ while a[i] < p\n  do j-- while a[j] > p\n  if i >= j: return j\n  swap(a[i], a[j])',
  },
  {
    id: 'quick-3way', name: 'Three-Way Quick Sort', category: 'Divide & Conquer', family: 'Quick', run: Q.threeWayQuickSort,
    best: 'O(n)', average: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Dijkstra’s Dutch-national-flag partition splits into < pivot, = pivot and > pivot; equal keys are never touched again.',
    notes: 'Linear time when all keys are equal.',
    useCases: 'Data with many duplicate keys.',
    observation: 'Entropy-optimal: comparisons are within a constant factor of n·H(key distribution).',
    pseudocode: 'v = a[lo]; lt = lo; gt = hi; i = lo+1\nwhile i <= gt:\n  if a[i] < v: swap(a[lt++], a[i++])\n  elif a[i] > v: swap(a[i], a[gt--])\n  else: i++',
  },
  {
    id: 'quick-dual', name: 'Dual-Pivot Quick Sort', category: 'Divide & Conquer', family: 'Quick', run: Q.dualPivotQuickSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Yaroslavskiy’s scheme with two pivots P ≤ Q producing three partitions: < P, between, > Q.',
    notes: 'Pivots are the first and last element (no sampling), as in the original paper.',
    useCases: 'Primitive arrays (basis of Java’s Arrays.sort for primitives).',
    observation: 'Uses ≈1.9 n ln n comparisons but fewer cache misses than classic quicksort.',
    pseudocode: 'P = a[lo], Q = a[hi] (swap if P > Q)\nl = lo+1, g = hi-1\nfor k in l..g: place a[k] into <P, middle, or >Q region\nswap pivots into place; recurse on 3 parts',
  },
  {
    id: 'quick-random', name: 'Randomized Quick Sort', category: 'Divide & Conquer', family: 'Quick', run: Q.randomizedQuickSort,
    best: 'O(n log n)', average: 'O(n log n) expected', worst: 'O(n²) (probability vanishingly small)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Lomuto quicksort with a uniformly random pivot, making the expected running time independent of the input order.',
    notes: 'Random pivots come from the seeded generator, so runs are reproducible.',
    useCases: 'Defending against adversarial inputs.',
    observation: 'Expected comparisons are 2(n+1)H_n − 4n on every input.',
    pseudocode: 'r = random in [lo, hi]; swap(a[r], a[hi])\nLomuto partition',
  },
  {
    id: 'quick-median3', name: 'Median-of-Three Quick Sort', category: 'Divide & Conquer', family: 'Quick', run: Q.medianOfThreeQuickSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²) (median-of-3 killer sequences)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Sorts first, middle and last element and uses their median as the pivot for a Hoare partition.',
    notes: 'Sorted and reversed inputs become best cases.',
    useCases: 'General purpose; the classic engineering improvement.',
    observation: 'Reduces expected comparisons from ~1.39 to ~1.19 n log₂ n.',
    pseudocode: 'order(a[lo], a[mid], a[hi])\npivot = a[mid]\nHoare partition',
  },
  {
    id: 'quick-stable', name: 'Stable Quick Sort', category: 'Divide & Conquer', family: 'Quick', run: Q.stableQuickSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n²)', space: 'O(n)', stable: true, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Quicksort whose partition copies elements into <, = and > buffers in their original order, then writes them back.',
    notes: 'Stability comes from order-preserving out-of-place partitioning; equal keys are final after one pass.',
    useCases: 'When stability is required and O(n) memory is acceptable.',
    observation: 'One three-way comparison per element per level.',
    pseudocode: 'p = a[mid]\nfor x in a[lo..hi]: append x to LESS, EQUAL or GREATER\na[lo..hi] = LESS + EQUAL + GREATER\nrecurse on LESS and GREATER',
  },
  {
    id: 'introsort', name: 'IntroSort', category: 'Hybrid', family: 'Hybrid', run: Q.introSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Musser’s introspective sort: median-of-three quicksort that switches to heapsort when recursion gets too deep, and insertion sort for small partitions.',
    notes: 'Depth limit 2·⌊log₂ n⌋, insertion sort threshold 16.',
    useCases: 'C++ std::sort and .NET Array.Sort use variants of it.',
    observation: 'Quicksort speed with heapsort’s worst-case guarantee.',
    pseudocode: 'intro(lo, hi, depth):\n  while size > 16:\n    if depth == 0: heapsort(lo, hi); return\n    partition (median of 3); recurse smaller side\n  insertion sort(lo, hi)',
  },
  // ======================================================================== Heap
  {
    id: 'heap', name: 'Heap Sort', category: 'Heap', family: 'Heap', run: H.heapSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Builds a binary max-heap in place, then repeatedly swaps the maximum to the end and restores the heap.',
    notes: 'Floyd’s bottom-up heap construction in O(n).',
    strengths: ['Guaranteed O(n log n)', 'O(1) extra memory'],
    weaknesses: ['Poor cache locality', 'Not stable'],
    useCases: 'Hard real-time or memory-constrained systems.',
    observation: 'Heap construction needs at most 2n comparisons.',
    pseudocode: 'for i = n/2-1 downto 0: siftDown(i, n)\nfor end = n-1 downto 1:\n  swap(a[0], a[end]); siftDown(0, end)',
  },
  {
    id: 'heap-bottomup', name: 'Bottom-Up Heap Sort', category: 'Heap', family: 'Heap', run: H.bottomUpHeapSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Wegener’s variant: sift-down first walks to a leaf along larger children (one comparison per level), then climbs back up to the right spot.',
    notes: 'Approximately n log₂ n + O(n) comparisons, versus ~2n log₂ n for classic heapsort.',
    useCases: 'When comparisons are expensive.',
    observation: 'The displaced root almost always belongs near the bottom, which is why the leaf search pays off.',
    pseudocode: 'siftDown(i):\n  j = leaf reached by following larger children\n  while a[i] > a[j]: j = parent(j)\n  rotate a[i] into position j along the path',
  },
  {
    id: 'heap-ternary', name: 'Ternary Heap Sort', category: 'Heap', family: 'Heap', run: H.ternaryHeapSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Heap sort on a 3-ary heap: each node has three children, giving a shallower tree.',
    notes: 'Children of i are 3i+1, 3i+2, 3i+3.',
    useCases: 'Exploring the d-ary heap trade-off.',
    observation: 'Height drops by log₂3 ≈ 1.58× but each level costs up to 3 comparisons.',
    pseudocode: 'as Heap Sort with children 3i+1..3i+3',
  },
  {
    id: 'weak-heap', name: 'Weak Heap Sort', category: 'Heap', family: 'Heap', run: H.weakHeapSort,
    best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(n) bits', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Dutton’s weak heap: a relaxed heap where each node only dominates its right subtree; one reverse bit per node decides which child is "left".',
    notes: 'Uses at most n⌈log₂ n⌉ − 2^⌈log₂ n⌉ + n − 1 comparisons — close to the information-theoretic bound.',
    useCases: 'Comparison-minimising heap sorting.',
    observation: 'Construction takes exactly n − 1 comparisons.',
    pseudocode: 'for j = n-1 downto 1: join(gparent(j), j)\nfor end = n-1 downto 2:\n  swap(a[0], a[end])\n  descend left spine via reverse bits; join(0, x) up the path',
  },
  {
    id: 'smooth', name: 'Smoothsort', category: 'Heap', family: 'Heap', run: H.smoothSort,
    best: 'O(n)', average: 'O(n log n)', worst: 'O(n log n)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Dijkstra’s adaptive heap sort using a forest of Leonardo heaps; nearly sorted input approaches linear time.',
    notes: 'Leonardo numbers L(k) = L(k−1) + L(k−2) + 1. Heap shapes are tracked in a bit vector.',
    strengths: ['O(n) best case and O(n log n) worst case', 'In place'],
    weaknesses: ['Intricate', 'Not stable'],
    useCases: 'Adaptive in-place sorting with a worst-case guarantee.',
    observation: 'Any n can be written as a sum of O(log n) distinct Leonardo numbers.',
    pseudocode: 'grow: add a[head] to the Leonardo forest (merge last two heaps or start a new one), trinkle/sift\nshrink: remove root of last heap, expose its two children, re-trinkle them',
  },
  // ======================================================================== Distribution
  {
    id: 'counting', name: 'Counting Sort', category: 'Distribution', family: 'Distribution', run: D.countingSort,
    best: 'O(n + k)', average: 'O(n + k)', worst: 'O(n + k)', space: 'O(n + k)', stable: true, inPlace: false, comparison: false,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH, maxKeySpan: 4_000_000,
    description: 'Counts occurrences of each key, turns counts into positions with prefix sums, and places each element directly.',
    notes: 'k = max − min + 1. Placement keeps original order of equal keys (stable). Requires integer keys with a bounded range.',
    useCases: 'Small integer key ranges; as a pass inside radix sort.',
    observation: 'Makes zero key comparisons.',
    pseudocode: 'count[key(x)]++ for each x\nprefix sums → start positions\nfor x in input order: out[pos[key(x)]++] = x',
  },
  {
    id: 'pigeonhole', name: 'Pigeonhole Sort', category: 'Distribution', family: 'Distribution', run: D.pigeonholeSort,
    best: 'O(n + k)', average: 'O(n + k)', worst: 'O(n + k)', space: 'O(n + k)', stable: true, inPlace: false, comparison: false,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH, maxKeySpan: 4_000_000,
    description: 'Puts each element into the "pigeonhole" for its exact key, then empties the holes in key order.',
    notes: 'Holes are FIFO lists, preserving input order (stable).',
    useCases: 'When the key range is about the same as n.',
    observation: 'Counting sort moves counts; pigeonhole sort moves the elements themselves.',
    pseudocode: 'for x in a: holes[key(x) - min].append(x)\nk = 0\nfor hole in holes: for x in hole: a[k++] = x',
  },
  {
    id: 'radix-lsd', name: 'Radix Sort LSD', category: 'Distribution', family: 'Distribution', run: D.radixLSD10,
    best: 'O(d(n + b))', average: 'O(d(n + b))', worst: 'O(d(n + b))', space: 'O(n + b)', stable: true, inPlace: false, comparison: false,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Least-significant-digit radix sort, base 10: a stable counting pass per digit, from the last digit to the first.',
    notes: 'Keys are offset by the minimum so negative integers are supported. d = number of base-10 digits of the key span.',
    useCases: 'Fixed-width integer keys.',
    observation: 'Correctness relies on each digit pass being stable.',
    pseudocode: 'for exp = 1; span/exp > 0; exp *= 10:\n  stable counting sort by (key/exp) mod 10',
  },
  {
    id: 'radix-lsd4', name: 'Radix Sort LSD (Base 4)', category: 'Distribution', family: 'Distribution', run: D.radixLSD4,
    best: 'O(d(n + b))', average: 'O(d(n + b))', worst: 'O(d(n + b))', space: 'O(n + b)', stable: true, inPlace: false, comparison: false,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'LSD radix sort with base 4: more passes with fewer buckets each — a documented variant that makes the pass structure easy to see.',
    notes: 'Same algorithm as base 10 with b = 4; d = ⌈log₄(span+1)⌉ passes.',
    useCases: 'Illustrating the base/pass-count trade-off.',
    observation: 'Total work d(n+b) is minimised around b ≈ n for a fixed key width.',
    pseudocode: 'for exp = 1; span/exp > 0; exp *= 4:\n  stable counting sort by (key/exp) mod 4',
  },
  {
    id: 'radix-msd', name: 'Radix Sort MSD', category: 'Distribution', family: 'Distribution', run: D.radixMSD,
    best: 'O(n + b·d)', average: 'O(n·d)', worst: 'O(n·d)', space: 'O(n + b·d)', stable: true, inPlace: false, comparison: false,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Most-significant-digit radix sort, base 10: distribute by the leading digit, then recurse into every bucket.',
    notes: 'Out-of-place stable distribution per level.',
    useCases: 'Strings and variable-length keys; can stop early on distinct prefixes.',
    observation: 'Processes only as many digits as needed to separate keys.',
    pseudocode: 'msd(lo, hi, exp):\n  stable distribute a[lo..hi] by digit at exp\n  for each bucket: msd(bucket, exp/10)',
  },
  {
    id: 'american-flag', name: 'American Flag Sort', category: 'Distribution', family: 'Distribution', run: D.americanFlagSort,
    best: 'O(n·d)', average: 'O(n·d)', worst: 'O(n·d)', space: 'O(b·d)', stable: false, inPlace: true, comparison: false,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'In-place MSD radix sort (McIlroy, Bostic & McIlroy 1993): counts bucket sizes, then permutes elements into their buckets by cycling swaps.',
    notes: 'Named after the stripes of the flag. Base 10.',
    useCases: 'Large arrays where O(n) buffers are unaffordable.',
    observation: 'Each element is swapped directly into its bucket region.',
    pseudocode: 'count digits; compute bucket starts\nfor each bucket d:\n  while next[d] < end[d]:\n    if digit(a[next[d]]) == d: next[d]++\n    else swap into its bucket\nrecurse per bucket',
  },
  {
    id: 'radix-exchange', name: 'Radix Exchange Sort', category: 'Distribution', family: 'Distribution', run: D.radixExchangeSort,
    best: 'O(n·w)', average: 'O(n·w)', worst: 'O(n·w)', space: 'O(w)', stable: false, inPlace: true, comparison: false,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Binary MSD radix sort: partitions like quicksort, but on the current bit instead of a pivot.',
    notes: 'w = number of bits of the key span. Also called binary quicksort.',
    useCases: 'Fixed-width integers, in place.',
    observation: 'Its recursion tree is exactly the binary trie of the keys.',
    pseudocode: 'rx(lo, hi, bit):\n  partition: 0-bit keys left, 1-bit keys right\n  rx(left, bit-1); rx(right, bit-1)',
  },
  {
    id: 'bucket', name: 'Bucket Sort', category: 'Distribution', family: 'Distribution', run: D.bucketSort,
    best: 'O(n + k)', average: 'O(n + n²/k + k) — O(n) for uniform keys', worst: 'O(n²)', space: 'O(n + k)', stable: true, inPlace: false, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Scatters elements into ~√n equal-width buckets by value, writes the buckets back in order, then insertion-sorts each bucket.',
    notes: 'Uses comparisons inside buckets; expected linear only for (near-)uniform key distributions.',
    useCases: 'Uniformly distributed keys.',
    observation: 'Degrades to insertion sort when all keys fall into one bucket.',
    pseudocode: 'k = √n buckets over [min, max]\nfor x in a: bucket[(x-min)/width].append(x)\nconcatenate buckets; insertion-sort each bucket',
  },
  {
    id: 'flash', name: 'Flashsort', category: 'Distribution', family: 'Distribution', run: D.flashSort,
    best: 'O(n)', average: 'O(n) for uniform keys', worst: 'O(n²)', space: 'O(m), m ≈ 0.43n', stable: false, inPlace: true, comparison: true,
    maxN: NLOGN_MAX, benchMaxN: NLOGN_BENCH,
    description: 'Neubert’s Flashsort (1998): estimates each element’s class from its value, permutes elements into classes with cycle leaders, then finishes with insertion sort.',
    notes: 'm = 0.43n classes as recommended by Neubert.',
    useCases: 'Uniformly distributed numeric data.',
    observation: 'Classification is a linear interpolation of the key between min and max.',
    pseudocode: 'class(x) = floor((m-1)(x-min)/(max-min))\nL = prefix counts per class\ncycle-leader permutation into classes\ninsertion sort',
  },
  {
    id: 'gravity', name: 'Gravity Sort', category: 'Distribution', family: 'Distribution', run: D.gravitySort,
    best: 'O(n + S)', average: 'O(n + S)', worst: 'O(n + S)', space: 'O(n + max)', stable: true, inPlace: false, comparison: false,
    maxN: 10000, benchMaxN: 200000, maxKeySpan: 2_000_000,
    description: 'Bead sort (Arulanandham, Calude & Dinneen 2002): values are beads on rods that fall under gravity. Simulated here with per-level bead counts.',
    notes: 'A physical/hardware algorithm; in software the fall is simulated with suffix sums over levels (S = key span). Requires bounded integer key span.',
    useCases: 'Analog/hardware sorting thought experiments.',
    observation: 'In hardware, all beads fall simultaneously: O(√h) time for height h under gravity.',
    pseudocode: 'beads[l] = #values ≥ l\nposition p from the top gets value max{l : beads[l] > p}',
  },
  // ======================================================================== Networks
  {
    id: 'bitonic', name: 'Bitonic Sort', category: 'Gap & Network', family: 'Network', run: N.bitonicSort,
    best: 'O(n log² n)', average: 'O(n log² n)', worst: 'O(n log² n)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: 50000, benchMaxN: 500000,
    description: 'Batcher’s bitonic sorting network: recursively builds bitonic sequences (up then down) and merges them with half-cleaners.',
    notes: 'Generalised to arbitrary n (no padding) using the greatest power of two below the merge size.',
    useCases: 'GPUs and parallel hardware — the comparator sequence is data-independent.',
    observation: 'The comparisons performed never depend on the data, so it is an oblivious algorithm.',
    pseudocode: 'sort(lo, n, dir): sort(lo, n/2, !dir); sort(lo+n/2, n-n/2, dir); merge(lo, n, dir)\nmerge: compare-swap i with i+k (k = largest power of 2 < n), recurse',
  },
  {
    id: 'odd-even-merge', name: 'Odd-Even Merge Sort', category: 'Gap & Network', family: 'Network', run: N.oddEvenMergeSort,
    best: 'O(n log² n)', average: 'O(n log² n)', worst: 'O(n log² n)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: 50000, benchMaxN: 500000,
    description: 'Batcher’s odd–even merge sort network in its iterative form, which works for any n by skipping out-of-range comparators.',
    notes: 'Fewer comparators than bitonic sort.',
    useCases: 'Hardware sorting networks.',
    observation: 'For n = 2ᵏ it uses (k² − k + 4)·2^(k−2) − 1 comparators.',
    pseudocode: 'for p = 1; p < n; p *= 2:\n  for k = p; k >= 1; k /= 2:\n    for j = k mod p; j+k < n; j += 2k:\n      for i in 0..k-1:\n        if (i+j)/(2p) == (i+j+k)/(2p): cs(i+j, i+j+k)',
  },
  {
    id: 'pairwise', name: 'Pairwise Sorting Network', category: 'Gap & Network', family: 'Network', run: N.pairwiseNetwork,
    best: 'O(n log² n)', average: 'O(n log² n)', worst: 'O(n log² n)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: 50000, benchMaxN: 500000,
    description: 'Parberry’s pairwise network (1992): sorts pairs, then pairs of pairs, then repairs with a cascade of comparators.',
    notes: 'Same comparator count as odd–even merge sort, different structure.',
    useCases: 'Sorting networks research.',
    observation: 'The first phase alone produces a sequence where every element is ≤ its pair partner at each scale.',
    pseudocode: 'phase 1: for a = 1, 2, 4…: compare b−a with b in blocks\nphase 2: repairing cascades with decreasing a and multiples d·a',
  },
  {
    id: 'bose-nelson', name: 'Bose-Nelson Sorting Network', category: 'Gap & Network', family: 'Network', run: N.boseNelsonNetwork,
    best: 'O(n^1.585)', average: 'O(n^1.585)', worst: 'O(n^1.585)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: 20000, benchMaxN: 200000,
    description: 'The 1962 Bose–Nelson recursive network construction: sort halves, then merge them with a recursive comparator pattern.',
    notes: 'Comparator count grows as n^log₂3; optimal for small n (≤ 8) but worse than Batcher asymptotically.',
    useCases: 'Generating small fixed-size sorting networks.',
    observation: 'Was proved optimal for n ≤ 8 comparators-wise for several sizes.',
    pseudocode: 'sort(i, n): sort(i, n/2); sort(i+n/2, n-n/2); merge(i, n/2, i+n/2, n-n/2)\nmerge splits both sides recursively',
  },
  // ======================================================================== Other / experimental
  {
    id: 'pancake', name: 'Pancake Sort', category: 'Experimental', family: 'Selection', run: X.pancakeSort,
    best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: 3000, benchMaxN: Q_BENCH,
    description: 'Only "flips" (reversing a prefix with a spatula) are allowed. Each round flips the largest element to the top and then to its final place.',
    notes: 'At most 2n − 3 flips; each flip is implemented as swaps.',
    useCases: 'Problems where prefix reversal is the only primitive (e.g. genome rearrangement).',
    observation: 'Bill Gates co-authored the 1979 paper bounding pancake numbers by (5n+5)/3.',
    pseudocode: 'for size = n downto 2:\n  m = index of max in a[0..size-1]\n  flip(m); flip(size-1)',
  },
  {
    id: 'burnt-pancake', name: 'Burnt Pancake Sort', category: 'Experimental', family: 'Selection', run: X.burntPancakeSort,
    best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(n) orientation bits', stable: false, inPlace: true, comparison: true,
    maxN: 3000, benchMaxN: Q_BENCH,
    description: 'Pancakes have a burnt side; every flip also turns them over. The stack must end sorted with all burnt sides down.',
    notes: 'Orientation starts burnt-side down for every pancake. Single-pancake flips are shown as flag events. ≤ 3(n−1)+1 flips.',
    useCases: 'Signed genome rearrangement models.',
    observation: 'Gates & Papadimitriou proved ≤ 2n − 2 flips are always possible for burnt pancakes (with a cleverer strategy).',
    pseudocode: 'for size = n downto 2:\n  bring max to top; flip top alone if burnt side down\n  flip(size-1) → max at bottom, burnt side down',
  },
  {
    id: 'stooge', name: 'Stooge Sort', category: 'Experimental', family: 'Novelty', run: X.stoogeSort, novelty: true,
    best: 'O(n^2.71)', average: 'O(n^2.71)', worst: 'O(n^2.71)', space: 'O(log n)', stable: false, inPlace: true, comparison: true,
    maxN: 256, benchMaxN: 1000,
    description: 'Recursively sorts the first 2/3, the last 2/3, then the first 2/3 again.',
    notes: 'Exponent log 3 / log 1.5 ≈ 2.7095. Deliberately inefficient; capped at small sizes.',
    useCases: 'Demonstrating that "correct" is not the same as "efficient".',
    observation: 'Named after the Three Stooges slapping each other.',
    pseudocode: 'stooge(i, j):\n  if a[i] > a[j]: swap\n  if j-i+1 > 2:\n    t = (j-i+1)/3\n    stooge(i, j-t); stooge(i+t, j); stooge(i, j-t)',
  },
  {
    id: 'slow', name: 'Slow Sort', category: 'Experimental', family: 'Novelty', run: X.slowSort, novelty: true,
    best: 'Ω(n^(log₂n/(2+ε)))', average: 'super-polynomial', worst: 'super-polynomial', space: 'O(n)', stable: false, inPlace: true, comparison: true,
    maxN: 100, benchMaxN: 160,
    description: 'Broder & Stolfi’s "multiply and surrender": find the maximum by recursively sorting both halves, move it to the end, then sort the rest — recursively.',
    notes: 'Deliberately pessimal. Capped at very small sizes.',
    useCases: 'Humour; complexity theory teaching.',
    observation: 'Its running time is not bounded by any polynomial.',
    pseudocode: 'slow(i, j):\n  if i >= j: return\n  m = (i+j)/2\n  slow(i, m); slow(m+1, j)\n  if a[m] > a[j]: swap\n  slow(i, j-1)',
  },
  {
    id: 'bogo', name: 'Bogo Sort', category: 'Experimental', family: 'Novelty', run: X.bogoSort, novelty: true,
    best: 'O(n)', average: 'O(n·n!) expected', worst: 'unbounded', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: 8, benchMaxN: 9,
    description: 'Shuffle randomly and check whether the array is sorted. Repeat.',
    notes: 'Uses the seeded generator for shuffles, so a given seed always produces the same run. Unbounded worst case: an operation limit stops runaway runs.',
    useCases: 'None — a joke and a lesson in expected running time.',
    observation: 'Expected number of shuffles for distinct keys is n!.',
    pseudocode: 'while not sorted(a): shuffle(a)',
  },
  {
    id: 'bozo', name: 'Bozo Sort', category: 'Experimental', family: 'Novelty', run: X.bozoSort, novelty: true,
    best: 'O(n)', average: 'O(n!) expected swaps', worst: 'unbounded', space: 'O(1)', stable: false, inPlace: true, comparison: true,
    maxN: 8, benchMaxN: 9,
    description: 'Swap two random elements, check if sorted, repeat.',
    notes: 'Seeded randomness; an operation limit stops runaway runs.',
    useCases: 'None.',
    observation: 'It is a random walk on the Cayley graph of the symmetric group.',
    pseudocode: 'while not sorted(a): swap(a[rand], a[rand])',
  },
  {
    id: 'permutation', name: 'Permutation Sort', category: 'Experimental', family: 'Novelty', run: X.permutationSort, novelty: true,
    best: 'O(n)', average: 'O(n·n!)', worst: 'O(n·n!)', space: 'O(n)', stable: false, inPlace: true, comparison: true,
    maxN: 8, benchMaxN: 9,
    description: 'Deterministic brute force: enumerates permutations with Heap’s algorithm (one swap per step) until a sorted one appears.',
    notes: 'Bounded, unlike Bogo Sort, but factorial.',
    useCases: 'Showing the size of the search space.',
    observation: 'Heap’s algorithm visits all n! permutations using exactly n! − 1 swaps.',
    pseudocode: 'for each permutation p (Heap’s algorithm):\n  if sorted(p): stop',
  },
];

export const ALGORITHMS: AlgorithmInfo[] = defs.map((d) => ({
  strengths: d.strengths ?? defaultStrengths(d),
  weaknesses: d.weaknesses ?? defaultWeaknesses(d),
  ...d,
}));

function defaultStrengths(d: Def): string[] {
  const s: string[] = [];
  if (d.stable) s.push('Stable');
  if (d.inPlace) s.push('In place');
  if (!d.comparison) s.push('No key comparisons needed');
  if (d.worst.includes('log n') && !d.worst.includes('²')) s.push(`Worst case ${d.worst}`);
  if (d.best === 'O(n)') s.push('Linear on favourable input');
  return s.length ? s : ['Simple structure'];
}

function defaultWeaknesses(d: Def): string[] {
  const w: string[] = [];
  if (!d.stable) w.push('Not stable');
  if (!d.inPlace) w.push(`Extra memory: ${d.space}`);
  if (d.worst.includes('²') || d.worst.includes('unbounded') || d.worst.includes('!')) w.push(`Worst case ${d.worst}`);
  if (!d.comparison) w.push('Requires integer keys');
  return w.length ? w : ['More complex than elementary sorts'];
}

export const ALGORITHM_MAP: Record<string, AlgorithmInfo> = Object.fromEntries(ALGORITHMS.map((a) => [a.id, a]));

export function getAlgorithm(id: string): AlgorithmInfo {
  return ALGORITHM_MAP[id] ?? ALGORITHM_MAP['merge'];
}

export const CATEGORIES: Category[] = ['Elementary', 'Gap & Network', 'Divide & Conquer', 'Heap', 'Distribution', 'Hybrid', 'Experimental'];

/** Validate whether an algorithm can run on a dataset. Returns an error string or null. */
export function validateRun(algo: AlgorithmInfo, keys: ArrayLike<number>, mode: 'record' | 'bench' = 'record'): string | null {
  const n = keys.length;
  const limit = mode === 'record' ? algo.maxN : algo.benchMaxN;
  if (n > limit) {
    return `${algo.name} is limited to ${limit.toLocaleString()} elements in ${mode === 'record' ? 'visual' : 'benchmark'} mode (${algo.average} average work).`;
  }
  if (algo.maxKeySpan !== undefined && n > 0) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      if (keys[i] < min) min = keys[i];
      if (keys[i] > max) max = keys[i];
    }
    if (max - min > algo.maxKeySpan) {
      return `${algo.name} needs a bounded integer key range (span ≤ ${algo.maxKeySpan.toLocaleString()}); this dataset spans ${(max - min).toLocaleString()}.`;
    }
  }
  return null;
}
