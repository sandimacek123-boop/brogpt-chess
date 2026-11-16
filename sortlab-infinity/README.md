# SortLab Infinity

A high-performance sorting algorithm visualizer: **101 tested algorithms**, **20 visualization modes** (including two WebGL 3D modes), synthesized sound, an 8-lane algorithm battle mode and WebM/MP4 video export.

Built with React 19, TypeScript, Vite, Tailwind CSS 4, Canvas 2D, Three.js (lazy-loaded), the Web Audio API and Web Workers.

## Quick start

Requires Node.js 18+ (developed on Node 22).

```bash
cd sortlab-infinity
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server with hot reload |
| `npm test` | Run the full Vitest suite (348 tests) |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

### Deploying

`npm run build` produces a fully static site in `dist/` with relative asset paths (`base: './'`), so it can be hosted from any path on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3, nginx…). Routing uses the URL hash (`#/battle`), so no server rewrite rules are needed.

## Features

- **Visualizer** — large central canvas; default vertical bars on a shared baseline that form a right-angled triangle (shortest left, tallest right) with a continuous rainbow gradient. Start / pause / resume, single step, restart, new array, skip to end, slow-mo (0.1×) and turbo (20×), log-scale speed (1 – 500k ops/s), element count up to 16,384, fullscreen, keyboard shortcuts (Space, →, R, N, F).
- **Live statistics** — comparisons, swaps, array writes, auxiliary writes, total operations, progress, playback time, FPS / draw time, and *measured* compute time. Comparison counts are shown next to ⌈log₂ n!⌉, n log₂ n and n(n−1)/2.
- **20 visualization modes** — vertical bars, horizontal bars, circular ring, spiral, scatter plot, rainbow circle, sunburst, triangle, waveform, dots, pixel grid, color wheel, helix, rainbow stripes, gradient blocks, disparity, 3D bars, 3D sphere, radial lines and migraine mode (non-flashing, intensity control, respects reduced motion).
- **Animation engine** — highlights for comparisons / swaps / writes, swapped bars slide to their new positions, height interpolation (or instant transitions), post-sort verification sweep, cheap bloom glow, adaptive quality when frames get heavy.
- **Audio** — pitch from element value, 4 waveforms, 9 musical scales, pitch range, per-operation toggles, throttling + voice limit + compressor to prevent distortion. The AudioContext is created only from a user gesture.
- **Battle mode** — 2–8 algorithms on the identical array; each is computed and timed in the worker, then all lanes start on the same frame. Pacing is either *equal operations per second* (finish order = operation count) or *real time* (lane durations proportional to measured compute time). Rankings table, winner banner and comparison charts.
- **Recording** — 720p / 1080p / 1440p / square / vertical, 30 or 60 fps, optional sound, WebM (VP9/VP8) and MP4 only where the browser can encode it; progress display, preview and download.
- **Settings** — every visual, sorting and audio option, saved to `localStorage`.

## Architecture

```
src/
  core/        SortContext (instrumented array), trace encoding, patterns, seeded RNG, executeSort
  algorithms/  101 algorithms grouped by family, all written against SortContext
  workers/     Web Worker entry: runs executeSort off the main thread
  engine/      SortClient (worker RPC + cancellation), Player (trace playback),
               Stage (canvas + renderer + adaptive quality), Visualizer & Battle controllers
  render/      2D renderers for 18 modes, Three.js renderer for the 3D modes, palettes
  audio/       Web Audio synth and musical scale mapping
  record/      MediaRecorder wrapper and format detection
  pages/, ui/  React UI
```

**Computation is separated from rendering.** An algorithm runs to completion inside a Web Worker on an instrumented array (`SortContext`). Every comparison, swap and write is counted, and visual operations are recorded into a compact `Int32Array` trace (3 ints per op). The main thread replays that trace at the chosen speed with `requestAnimationFrame`, so **correctness never depends on frame rate** — the tests replay traces in batches of 1, 7, 1000 and ∞ ops and always reach the identical array.

**Statistics are never faked.** Counters during playback come from the operations actually replayed; totals come from the worker. Compute time is the mean of repeated worker runs (≥ 60 ms in total) with counting but no trace recording; it is reported separately from playback time, which only reflects the animation speed.

**Limits.** Each algorithm has a practical maximum element count (e.g. 2,048 for quadratic sorts, 9 for bogosort); larger sizes are blocked with an explanation and a one-click fix. Runs also stop at a configurable operation limit (default 4M, i.e. ~48 MB of trace) and a 30 s safety deadline; partial runs are clearly marked as unsorted. Cancelling terminates the worker and starts a fresh one.

### Operation counting conventions

- *Comparisons* — every key comparison, including comparisons against a pivot held in a temporary.
- *Swaps* — exchanges of two main-array elements (not double-counted as writes).
- *Array writes* — direct writes into the main array.
- *Aux writes* — writes into scratch structures (buffers, trees, counts); counted but not animated.
- *Total operations* = comparisons + swaps + writes + aux writes.

## Algorithms

| Category | Algorithms |
| --- | --- |
| Exchange (10) | Bubble Sort, Optimized Bubble Sort, Cocktail Shaker Sort, Odd–Even Sort, Comb Sort, Combsort11, Gnome Sort, Optimized Gnome Sort, Exchange Sort, Circle Sort |
| Insertion (17) | Insertion Sort, Binary Insertion Sort, Two-Way Insertion Sort, Library Sort, Shell Sort, Shell Sort — Frank & Lazarus (1960), Shell Sort — Hibbard (1963), Shell Sort — Papernov & Stasevich (1965), Shell Sort — Pratt (1971), Shell Sort — Knuth (1973), Shell Sort — Sedgewick (1982), Shell Sort — Sedgewick (1986), Shell Sort — Gonnet & Baeza-Yates (1991), Shell Sort — Tokuda (1992), Shell Sort — Incerpi & Sedgewick (1985), Shell Sort — Ciura (2001), Shell Sort — Lee (2021) |
| Selection (17) | Selection Sort, Double Selection Sort, Bingo Sort, Heap Sort, Heap Sort — Williams' Construction, Bottom-Up Heap Sort, Ternary Heap Sort, Weak Heap Sort, Smoothsort, Tournament Sort, Stable Selection Sort, Quadratic Selection Sort, Comparison Counting Sort, Quaternary Heap Sort, Poplar Sort, Cycle Sort, Pancake Sort |
| Tree (5) | Tree Sort, AVL Tree Sort, Red–Black Tree Sort, Splaysort, Cartesian Tree Sort |
| Quick (12) | Quick Sort (Lomuto), Quick Sort, Quick Sort (Median of 3), Quick Sort (Tukey Ninther), Randomized Quick Sort, 3-Way Quick Sort (Dijkstra), 3-Way Quick Sort (Bentley–McIlroy), Dual-Pivot Quick Sort, Quick Sort + Insertion Cutoff, Stable Quick Sort, Quick Sort (Median of Medians), Samplesort |
| Merge (9) | Merge Sort, Bottom-Up Merge Sort, Natural Merge Sort, 3-Way Merge Sort, In-Place Merge Sort (Rotations), SymMerge Sort, Strand Sort, Patience Sort, Merge-Insertion Sort (Ford–Johnson) |
| Hybrid (5) | IntroSort, Pattern-Defeating Quicksort, Merge Sort + Insertion Cutoff, TimSort, Powersort |
| Distribution (15) | Counting Sort, Pigeonhole Sort, Bucket Sort, LSD Radix Sort (Base 2), LSD Radix Sort (Base 4), LSD Radix Sort (Base 10), LSD Radix Sort (Base 16), MSD Radix Sort (Base 4), MSD Radix Sort (Base 10), American Flag Sort, Binary Radix Exchange Sort, Flashsort, Proxmap Sort, Interpolation Sort, Gravity (Bead) Sort |
| Network (6) | Bitonic Sort, Odd–Even Merge Sort, Batcher's Merge-Exchange Sort, Bose–Nelson Sort, Pairwise Sorting Network, Periodic Balanced Sorting Network |
| Impractical (5) | Stooge Sort, Slowsort, Bogo Sort, Bozo Sort, Permutation Sort |

Variants (e.g. Shellsort gap sequences, radix bases, heap arity) are labelled with the parameter that makes them different. Algorithms that are not yet implemented (GrailSort, WikiSort / block merge sort) are listed in [ROADMAP.md](./ROADMAP.md) rather than shipped under a borrowed name.

## Tests

`npm test` runs:

- **Correctness** for every algorithm on all 11 starting patterns at sizes 0, 1, 2, 3, 5, 8, 17, 31, 64, 100, 257, plus duplicates, all-equal, empty and single-element arrays — and the recorded trace must replay to the same sorted result.
- **Statistics** — trace contents match the counters; exact known counts (bubble sort on reversed input, selection sort, sorted-input insertion sort, cycle sort's write optimality, zero comparisons for LSD radix, Ford–Johnson's optimal comparison counts for n ≤ 11).
- **Operation limits and cancellation** — exact stop at the limit, abort callbacks, deadlines.
- **Playback engine** — frame-batch and frame-rate independence, smoothing convergence, bounded sound events.
- **Visualization stability** — every 2D mode is drawn into a recording mock context for empty, single, equal, large and highlighted data; no exceptions and no non-finite coordinates.
- Pattern generators, settings sanitization and pitch/scale mapping.

## Browser support

Any current Chromium, Firefox or Safari. 3D modes need WebGL (a clear message is shown otherwise). Recording needs `MediaRecorder` and `canvas.captureStream`. `prefers-reduced-motion` freezes time-based animation (helix, 3D orbit, migraine rotation) and caps migraine intensity.
