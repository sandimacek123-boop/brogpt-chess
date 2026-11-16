# SortLab Infinity — Roadmap

## Status by phase

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Project structure, working app | ✅ Done |
| 2 | High-quality default bar visualization (rainbow right-angled triangle) | ✅ Done |
| 3 | Algorithm library + correctness tests | ✅ 103 algorithms, all tested |
| 4 | Animation engine and controls | ✅ Done |
| 5 | Additional visualization modes | ✅ 20 modes (2 in WebGL) |
| 6 | Audio and customization | ✅ Done |
| 7 | Algorithm battle mode | ✅ Done |
| 8 | Recording and export | ✅ WebM, MP4 where supported |
| 9 | Performance optimization and testing | ✅ Worker computation, adaptive quality, 393 tests |
| — | Android app | ✅ Capacitor wrapper, APK build |

## Not yet implemented (honest gaps)

### Algorithms
- Candidates: Quadsort, Spreadsort, Shear sort (needs a 2D grid mapping for arbitrary n), BlockQuicksort-style branchless partitioning for pdqsort, Hwang–Lin merging.
- GrailSort variants with a fixed 512-element or dynamic external buffer, and WikiSort with its external cache, are not exposed: the shipped versions are the fully in-place ones (no external buffer / cache size 0).

### Algorithm fidelity notes
- **pdqsort** is the branchful variant (no block partitioning).
- **Ford–Johnson** writes its result back at the end, so its animation is mostly comparisons.

### Engine / UX
- Streaming traces from the worker in chunks so playback can start before very long computations finish, and to lower peak memory (currently 12 bytes per visual operation, bounded by the operation limit).
- WebGL/instanced 2D renderer for > 16,384 elements.
- Interactive camera (orbit/zoom) for the 3D modes.
- Recording the whole battle grid as one video.
- Per-lane stereo panning for battle audio.
- Playwright end-to-end tests in CI (manual Playwright runs were used during development to verify all 20 modes, battle, recording and mobile layout).
- Shareable URLs that encode algorithm, pattern, seed and mode.
- Android: publish signed release builds (e.g. GitHub Releases) so updates install over the previous version; Play Store listing.
