# SortClaude 5.5 — Verification Report

Environment used for building and testing: Linux container (4 vCPU, no GPU), Node 22, headless Chromium 130/1243 with SwiftShader (software WebGL), Electron 33.2.1, Wine 9.0 for Windows packaging/smoke tests. **No physical Windows 11 machine was available**, and no measurements were taken on the target Ryzen 7 5700U hardware.

## Results at a glance

| Check | Result |
|---|---|
| `npm run build` (strict TypeScript + Vite production build) | ✅ passes, 0 type errors, `dist/` ≈ 2.4 MB |
| Unit tests (`npm test`) | ✅ 258 / 258 |
| Browser acceptance tests (`npx playwright test`) | ✅ 6 / 6 |
| Linux Electron build driven by Playwright | ✅ (see Desktop) |
| `SortClaude-5.5-Setup.exe` (NSIS, x64 app) | ✅ built; silent install under Wine succeeded; installed app launched |
| `SortClaude-5.5-Portable.exe` | ✅ built; PE metadata + icon verified |
| Windows `SortClaude.exe` under Wine | ✅ boots from `app://`, reports `platform: win32`, runs a sort with live counters |

SHA-256 of the delivered executables:
```
ce6a02d40f7ffd83caf674f0dac6bceb551d742394ff1c7a90cb1e5ccf91b5c6  SortClaude-5.5-Setup.exe
cfe922b3e3e2447faadd61e3b3e8d01b3af38dab53499c07f4a63fa65118aa4e  SortClaude-5.5-Portable.exe
```

## Implemented and tested

**Sorting engine (unit tests)**
- 68 algorithms sorted correctly on: empty, single, two-element (sorted / reversed / equal), sorted, reversed, random permutation, heavy duplicates, all-equal, negatives, values near ±2.1·10⁹, and odd/power-of-two sizes; plus all 19 generated patterns at three sizes each (up to 5,003 elements).
- Multiset preservation verified by element identity (every final array is a permutation of the input IDs).
- Stability verified for **all 23 algorithms marked stable**, over 6 duplicate densities each.
- **Block Merge Sort** additionally fuzzed on 300 random inputs (n up to 40,000, 1 to n distinct keys, negatives): always sorted, a permutation, and stable; comparison growth from n = 16k → 64k stays ≈ n log n on all 19 patterns.
- **TimSort galloping mode** tested on interleaved and block-interleaved runs, mixed ascending/descending/duplicate runs (60 random cases): sorted and stable; on block-interleaved runs the merge phase uses < n/3 comparisons (a linear merge needs ≈ n).
- Record mode and count-only mode produce identical comparison/swap/write counts.
- Bubble sort on [3,2,1] yields exactly 3 comparisons, 3 swaps, 6 writes, 12 reads (documented convention); Merge Sort comparisons fall within [½·n·log₂n, n·log₂n].
- Safety limits: over-limit element counts are rejected with a message; runaway Bogo Sort stops at the op limit.

**Determinism & time machine**
- Same seed + pattern + count → identical data for all 19 patterns; different seeds differ.
- Stepping to the end reproduces the recorded final state; stepping all the way back restores the input and zeroes counters; 25 random seeks per algorithm match a from-scratch replay exactly (array, sorted flags, counters, pivot, range). Tested with a tiny checkpoint budget to force many checkpoints.
- Highlights are a pure function of playback position.

**Interface acceptance (Playwright, production build)** — Merge Sort, Bars, 160 elements, random order, seed 777: start → counters increase → pause holds position → step back = pos−1 → step forward = pos → speed change → resume → switch to Spiral keeps the exact position → jump to completion → final array equals the sorted input → Restart returns to op 0 with the identical initial array → reload reproduces the same data from the seed.

**Shortcuts** — arrow keys step; typing in the seed field does not trigger shortcuts.

**Battle acceptance** — Quick vs Bubble on identical data (Spiral): independent counters, pause freezes both, resume, finish, results screen names the winner, JSON export contains seed 42, two verified-sorted results, Bubble's comparison count is exactly n(n−1)/2 = 12,720; Replay resets to 0.

**Tournament (unit)** — 4-player elimination advances winners correctly; champion is the comparison-minimal algorithm; round robin awards 3/1/0 points (three n(n−1)/2 algorithms → all draws).

**Custom algorithm sandbox** — correct code verified sorted and lossless; a data-destroying example is caught ("Elements were lost"); an infinite loop is stopped by the operation budget; `fetch`, `XMLHttpRequest` and `importScripts` are `undefined` inside the sandbox.

**Video export at full spec** — TikTok Rainbow Sort at **1080×1920, 60 FPS**: H.264, 1,170 frames, 19.50 s, Opus audio (mean −25.1 dB), full decode OK, rendered in 99 s. **3D** Galaxy Sort at **1920×1080, 30 FPS**: H.264, 615 frames, 20.50 s, audio, full decode OK, frames show the 3D galaxy with bloom.

**Video export** — Neon Spiral preset at 720×1280, 30 FPS with audio: progress UI shown, file downloaded, valid MP4 container, result reports 720×1280 and "with audio". An independent check with `ffprobe`/`ffmpeg` on an exported file: H.264 720×1280 @ 30 fps, 615 frames, 20.50 s; Opus 48 kHz stereo, 20.52 s; full decode without errors; audio mean −23.8 dB / peak −9.9 dB (not silent); extracted frames show the real Quick Sort progression and the outro.

**Benchmark** — runs in a worker and renders charts and the results table; summary statistics (median, mean, min, max, σ) unit-tested.

**Desktop (Linux Electron build of the same code, under Xvfb)** — loads from `app://sortclaude/index.html` with no dev server; `require`/`process` are not reachable from the page; the preload exposes exactly `isDesktop, saveFile, chooseFolder, saveFileTo, info`; a sort runs; Battle runs; after closing and relaunching, the changed visualization and palette were persisted; Electron's encoder supports H.264 at 1080×1920@60 and VP9 (+ Opus).

**Large datasets (headless Chromium, software rendering, no GPU)** — measured at 128× speed:

| Algorithm | n | Recorded ops | Ready (record + checkpoints) | FPS | Seek to end |
|---|---|---|---|---|---|
| Merge Sort | 100,000 | 5,073,968 | 1.3 s | 39 | 170 ms |
| Three-Way Quick Sort | 100,000 | 4,718,350 | 0.8 s | 45 | 166 ms |
| Radix Sort LSD | 100,000 | 1,200,004 | 0.6 s | 50 | 311 ms |
| Shell Sort (Ciura) | 50,000 | 2,755,992 | 1.0 s | 43 | 194 ms |

All four ended verified sorted. These numbers come from a CPU-only container, not the target laptop; a 60 FPS figure is **not** claimed.

## Implemented but not fully tested

- **Real Windows 11**: the installer, portable exe, DPI scaling (125–200 %), native Save dialogs, output-folder export and window-state persistence were not exercised on real Windows (Wine only).
- **Fonts on Windows**: under Wine, stylesheet `@font-face` loads failed (all bundled fonts reported `error`) although the same files fetched and decoded fine. A self-healing loader (`src/fonts.ts`) now re-registers any failed UI font through the `FontFace` API; with it, the Windows build under Wine renders Space Grotesk, Inter and JetBrains Mono correctly. Whether real Windows needs the fallback at all is unverified.
- **AAC audio**: not available in the Linux Chromium/Electron builds, so MP4 exports use Opus audio there. On Windows, Chromium normally provides AAC through Media Foundation; the app probes at runtime and picks AAC when supported. Not verified.
- **Video export at 1440p / 4K**: not rendered in tests (720p30, 1080p60 and 1080p30-3D were). Support is probed per configuration at runtime.
- **3D**: all 10 modes render under software WebGL and a 3D clip exported correctly; bloom/trails/shadows quality and frame rate on a real GPU were not measured.
- **MediaRecorder fallback** (browsers without WebCodecs): implemented, not exercised by tests (Chromium has WebCodecs).
- **Live audio**: synthesis is unit-tested via the shared note mapping and verified in the exported file; live playback through speakers can't be heard in a headless container.
- **Firefox / Edge**: only Chromium was automated. Edge shares Chromium's engine; Firefox (WebCodecs since v130) was not tested.
- **Touch / phone layouts**: responsive CSS exists down to narrow widths; this is a desktop-first app and mobile was not tested.

## Not implemented / limitations

- **Block Merge Sort** uses an O(√n) external buffer (WikiSort's cache-assisted mode), not the fully in-place O(1)-memory internal-buffer variant.
- **Pseudocode line highlighting** is intentionally not shown: ops are instrumented at the array-primitive level, not per source line.
- **FFmpeg integration** for the desktop app was not added; export uses Chromium's WebCodecs encoders in both the website and the desktop app.
- **Code signing**: the executables are unsigned, so Windows SmartScreen will warn on first launch ("More info → Run anyway").
- **Recording cap**: 16 M ops per sort (~256 MB). Quadratic algorithms are limited to ~4,096 visual elements; novelty sorts (Bogo/Bozo/Permutation ≤ 8, Stooge ≤ 256, Slow ≤ 100).
- **Language**: English only (UI strings are organized per component; no translation layer yet).
- **Benchmark memory** is reported as auxiliary elements allocated (exact), not process memory.
- The reference SortingSim screenshots mentioned in the brief were **not attached** to the session; the visual design is original and based on the written description.
