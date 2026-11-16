# SortLab Infinity — Roadmap

## Status by phase

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project structure, working app | ✅ Done |
| 2 | High-quality default bar visualization (rainbow right-angled triangle) | ✅ Done |
| 3 | Algorithm library + correctness tests | ✅ 101 algorithms, all tested |
| 4 | Animation engine and controls | ✅ Done |
| 5 | Additional visualization modes | ✅ 20 modes (2 in WebGL) |
| 6 | Audio and customization | ✅ Done |
| 7 | Algorithm battle mode | ✅ Done |
| 8 | Recording and export | ✅ WebM, MP4 where supported |
| 9 | Performance optimization and testing | ✅ Worker computation, adaptive quality, 348 tests |

## Not yet implemented (honest gaps)

### Algorithms requested but not shipped
- **GrailSort** (Astrelin) and **WikiSort / block merge sort** (Arne Kutzner & Pok-Son Kim's in-place stable block merge). Both are 600–1,000 line algorithms with internal buffer extraction, block tagging and rotations. They will be ported from their reference implementations and must pass the same test suite before being listed. Until then the in-place stable merging family is represented by *In-Place Merge Sort (Rotations)* and *SymMerge Sort*.
- Other candidates: Quadsort, Spreadsort, Shear sort (needs a 2D grid mapping for arbitrary n), BlockQuicksort-style branchless partitioning for pdqsort, Hwang–Lin merging.

### Algorithm fidelity notes
- **TimSort** implements run detection, minrun, binary insertion, the corrected merge-collapse invariants and galloping merge-boundary trimming, but not the adaptive galloping *mode inside merges* (min_gallop).
- **pdqsort** is the branchful variant (no block partitioning).
- **Ford–Johnson** writes its result back at the end, so its animation is mostly comparisons.

### Engine / UX
- Stability is declared per algorithm and covered by implementation review, but there is no automated tagged-key stability test yet (algorithms compare raw integer values only). Plan: add an optional key extractor to `SortContext` so (key, index) pairs can be sorted by key.
- Streaming traces from the worker in chunks so playback can start before very long computations finish, and to lower peak memory (currently 12 bytes per visual operation, bounded by the operation limit).
- WebGL/instanced 2D renderer for > 16,384 elements.
- Interactive camera (orbit/zoom) for the 3D modes.
- Recording the whole battle grid as one video.
- Per-lane stereo panning for battle audio.
- Playwright end-to-end tests in CI (manual Playwright runs were used during development to verify all 20 modes, battle, recording and mobile layout).
- Shareable URLs that encode algorithm, pattern, seed and mode.
