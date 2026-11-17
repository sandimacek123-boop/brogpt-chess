# SortClaude 5.5

A cinematic, scientifically accurate sorting-algorithm visualizer — one TypeScript codebase that ships as a **website** and a **Windows 11 desktop app** (Electron).

Every bar, sound, counter, battle result and exported video frame is driven by the operations the algorithms *actually perform*. Nothing is faked.

- **67 real, tested algorithms** (no renamed duplicates), each with complexity, stability, memory and pseudocode info.
- **20 2D visualizations** (Canvas 2D) + **10 3D visualizations** (Three.js, instanced geometry, bloom, trails).
- **Time machine**: play, pause, step ±1, scrub, jump to op #, A/B loop. Every recorded position is exactly reproducible.
- **Sorting music**: Web Audio synthesis (11 instruments, 7 scales, ADSR, reverb, delay, filters) driven by displayed ops.
- **Battle mode**: 1v1, 2v2, 4/8/16-way races on one cloned seeded dataset; separate measured performance race; elimination / round-robin / championship tournaments.
- **Benchmark Championship**: worker-based timing with warm-ups, median/mean/min/max/σ, exact counts, charts, CSV/JSON.
- **Algorithm Lab**: explanations, step-through with plain-language narration of each op, six challenge types, and a **sandboxed custom-algorithm editor** (CodeMirror).
- **Cinematic mode + Cinematic Studio**: offline deterministic video export (WebCodecs → MP4/H.264 or WebM/VP9 with synthesized audio), multi-clip timeline, 6 layouts up to 16 panels, 7 transitions, 6 production presets.
- Extensive settings, presets (save/rename/duplicate/delete/import/export), configurable shortcuts, share links, accessibility options.

---

## Quick start

Requirements: Node.js 20+ (22 recommended).

```bash
cd sortclaude
npm install
npm run dev        # http://localhost:5173 — live development server
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build at http://localhost:4173
```

The production build in `dist/` is a fully static site (≈2.4 MB): deploy it to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3, nginx). All paths are relative, so it also works from a sub-folder. No server, account or network access is needed at runtime.

## Windows desktop app

```bash
npm run dist:win   # → release/SortClaude-5.5-Setup.exe  (NSIS installer, choose install dir)
                   # → release/SortClaude-5.5-Portable.exe (single-file portable app)
```

Run this on Windows (recommended), or on Linux/macOS with **Wine** installed (needed to stamp the icon and version resources into the `.exe`). Other scripts:

| Command | What it does |
|---|---|
| `npm run electron:start` | Compile the Electron shell and run the app against the current `dist/` |
| `npm run electron:dev` | Production build + run in Electron |
| `npm run dist:linux` | Unpacked Linux build (used for automated desktop tests) |
| `npm run icons` | Re-render `build/icon.ico` / `build/icon.png` from `public/icon.svg` |

The desktop app loads the bundled site through a privileged `app://` protocol — no dev server, no separate Node.js install. Preferences persist in the user profile. Exports use native Save dialogs or a chosen output folder.

**Security:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, navigation and new windows blocked, permission requests denied except fullscreen/clipboard-write. The preload exposes exactly four functions (`saveFile`, `chooseFolder`, `saveFileTo`, `info`); `saveFileTo` only writes into folders the user picked in a dialog and never overwrites silently.

## Controls

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Step backward / forward (Shift = 10 ops) |
| R | Restart (same data) |
| S | Shuffle (new random seed) |
| + / − | Faster / slower |
| F | Fullscreen |
| M | Mute / unmute |
| C | Cinematic mode |
| B | Battle mode |
| Esc | Exit fullscreen / cinematic / dialogs |

Shortcuts are rebindable in **Settings → Shortcuts** and never fire while typing in a field or the code editor. In 3D views: drag to orbit, scroll to zoom, right-drag to pan.

---

## Architecture

```
src/
  engine/            pure, UI-free core (runs in workers and in tests)
    ops.ts           reversible op encoding + counter conventions
    machine.ts       the instrumented array every algorithm runs on (record / count modes)
    algorithms/      67 implementations (elementary, merge, quick, heap, distribution, network, novelty)
    registry.ts      metadata, limits, input-domain validation
    generators.ts    20 seeded data patterns + custom data parsing
    rng.ts           SFC32 seeded by SplitMix32 (the only RNG used for data)
    runner.ts        recordRun (op log) / countRun (benchmarks, no log)
    timeline.ts      time machine: O(1) reversible steps + periodic checkpoints
  workers/           sort worker + cancellable client (terminate = hard stop)
  state/             settings schema & validation, zustand store, playback scheduler, simulation controller, share URLs
  render/            Renderer2D (20 modes, bucketed batch drawing, raster path for huge n), Renderer3D (Three.js), palettes, view model
  audio/             Web Audio synthesis shared by live playback and offline export
  battle/            race engine (shared metric clock) + tournament engine
  custom/            sandboxed execution of user algorithms
  export/            deterministic frame composer + WebCodecs encoder / MediaRecorder fallback
  ui/                React pages and components
electron/            main process (app:// protocol, IPC) + preload bridge
tests/unit           Vitest: algorithm correctness, stability, timeline, systems
tests/e2e            Playwright: acceptance workflows
```

**Separation of concerns.** An algorithm runs once (in a worker) against the instrumented `Machine` and produces an op log. The timeline replays it; the renderers, audio engine, battle engine and video exporter all consume the same log. Changing speed, visualization or quality never re-runs or alters the algorithm. Benchmarks use a separate count-only run with no log and no rendering.

**Op log.** Each op is 4 × Int32 `[type, a, b, c]` and is fully reversible (writes store the overwritten element ID; pivot/range/sorted markers store their previous value). The array state is an array of element IDs; keys are looked up by ID, so equal keys keep distinct identities (identity colouring, stability verification). Recording is capped at 16 M ops (~256 MB); beyond that the run stops with an explanation.

**Time machine.** Checkpoints (IDs, sorted flags, counters, markers) are taken every *k* ops, with *k* chosen so checkpoints fit the configured memory budget (default 96 MB). Seeking restores the nearest checkpoint and replays forward; single steps apply/undo one op. The same position always yields the same array, identities, markers, counters and highlights.

### Metric conventions (exact, never estimated)

| Counter | Definition |
|---|---|
| Comparisons | Every key comparison executed (main-array, held-register or auxiliary) |
| Swaps | Exchanges of two main-array positions. **1 swap = 2 reads + 2 writes** |
| Writes | Stores into the main array (2 per swap, 1 per write/move) |
| Reads | Main-array loads (2 per compare, 2 per swap, 1 per move, 1 per explicit read or copy-to-aux) |
| Aux writes | Stores into auxiliary memory (buffers, buckets, heaps, trees) |
| Aux memory | Auxiliary elements currently allocated |
| Operations | Data ops: compares + swaps + writes/moves + reads + aux copies (annotations excluded) |
| Execution time | Measured wall-clock time of the instrumented worker run (includes recording overhead) |
| Playback time | Real time spent animating |

## Algorithm catalog (67)

**Elementary:** Bubble, Optimized Bubble, Cocktail Shaker, Odd-Even, Comb, Comb 11, Exchange, Gnome, Optimized Gnome, Circle, Selection, Double Selection, Cycle, Tournament, Insertion, Binary Insertion, Tree, Library.
**Gap & Network:** Shell (Shell, Knuth, Hibbard, Pratt, Sedgewick, Tokuda, Ciura gaps), Bitonic, Odd-Even Merge, Pairwise Network, Bose-Nelson Network.
**Divide & Conquer:** Merge, Bottom-Up Merge, Natural Merge, In-Place Merge, SymMerge, Strand, Patience, Quick (Lomuto), Quick (Hoare), Three-Way Quick, Dual-Pivot Quick, Randomized Quick, Median-of-Three Quick, Stable Quick.
**Heap:** Heap, Bottom-Up Heap, Ternary Heap, Weak Heap, Smoothsort.
**Distribution:** Counting, Pigeonhole, Radix LSD (base 10), Radix LSD (base 4), Radix MSD, American Flag, Radix Exchange, Bucket, Flashsort, Gravity (bead, simulated).
**Hybrid:** TimSort, IntroSort.
**Experimental:** Pancake, Burnt Pancake, Stooge, Slow, Bogo, Bozo, Permutation.

Not included (no implementation we could verify to the required standard): **Block Merge Sort (WikiSort/GrailSort)**. TimSort omits the adaptive in-merge galloping *mode* (merges are linear; gallop trimming before merges is implemented) — documented in its notes.

## Testing

```bash
npm test                 # Vitest: 249 unit tests
npx playwright test      # Playwright acceptance tests (builds + serves the site automatically)
```

If Playwright cannot find its browser, point it at any Chromium: `CHROMIUM_PATH=/path/to/chrome npx playwright test`.

Unit tests verify every algorithm on empty / single / two-element / sorted / reversed / random / duplicate / all-equal / negative / extreme-value inputs, all 19 generated patterns at several sizes, multiset preservation via element IDs, stability for every algorithm marked stable, record-vs-count agreement, seeded determinism, timeline forward/backward/seek consistency, counter conventions, settings validation, audio mapping, tournaments and benchmark statistics.

## Dependencies & licenses

All runtime libraries are bundled into `dist/` by Vite; the desktop package contains no `node_modules`.
React, Zustand, Zod, Three.js, CodeMirror 6, mp4-muxer, webm-muxer, Electron, electron-builder, Vite, Vitest, Playwright — MIT / Apache-2.0. Fonts: Inter, Space Grotesk, JetBrains Mono — SIL Open Font License 1.1 (bundled via @fontsource). SortClaude's own code: MIT. No third-party sorting-visualizer code, images or branding were used.

See **[VERIFICATION.md](VERIFICATION.md)** for exactly what was tested, how, and the known limitations.
