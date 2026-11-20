# Quantumath — Advanced Mathematics Laboratory (Android + Windows)

A native, offline app (Kotlin, Jetpack Compose, Material 3) for calculating, solving, graphing, exploring and learning mathematics. No account, no network access, no ads, no analytics. One codebase ships as an **Android app** and a **Windows desktop app** (Compose Multiplatform).

- **Package:** `com.quantumath.app` · **Version:** 1.0.0 (1)
- **Runs on:** Android 9 (API 28) through Android 15 (API 35); target SDK 35
- **Architecture:** MVVM + Navigation Compose + coroutines/StateFlow, Room + DataStore, a pure-Kotlin math engine in its own module

## Install

### Windows

Run **`Quantumath-1.0.0-Setup.exe`** (~37 MB; a prebuilt copy is in [`dist/`](dist/)). It installs for your user account only (no administrator rights needed) into `%LOCALAPPDATA%\Programs\Quantumath`, with a Start-menu entry, an optional desktop shortcut and an uninstaller (Settings → Apps). Quantumath brings its own Java runtime, so nothing else needs to be installed. Windows 10 or 11 x64.

The installer is not code-signed, so SmartScreen may say "Windows protected your PC". Click **More info → Run anyway**. Your data lives in `%APPDATA%\Quantumath` and is kept on uninstall. If the window ever renders incorrectly on an unusual graphics driver, set the environment variable `QUANTUMATH_SOFTWARE_RENDER=1`.

Desktop extras:
- the calculator accepts typing from the keyboard (digits, operators, letters, Enter or `=`, Backspace, Esc, ←/→);
- the mouse wheel zooms graphs and fractals;
- "Share" copies to the clipboard or opens a Save dialog;
- backups and exports use the native Windows file dialogs.

### Android

Ready-built APKs (when built locally) are in `output/`:

| File | What it is |
|---|---|
| `Quantumath-1.0.0-debug.apk` | Debug build (not minified, ~60 MB). This is the build the automated UI tests exercise. |
| `Quantumath-1.0.0-release.apk` | Release build (R8-minified, ~3.8 MB), signed with the project's release key. |

On the phone, open the APK and allow "Install unknown apps" for your file manager or browser when Android asks. Both APKs use the same package name but **different signing keys**, so uninstall one before installing the other.

## Features

| Area | What it does |
|---|---|
| **Scientific calculator** | Arbitrary precision (8–100 significant digits, BigDecimal), exact fractions and radicals (`1/3+1/6 = 1/2`, `√8 = 2√2`), complex fallback (`√(−4) = 2i`), degrees/radians, `ans`, memory (MC/MR/M+/M−/MS), 2nd-function layer, cursor editing, history, copy/share/save. Optional system keyboard. |
| **Equation solver** | Polynomials (rational roots, factoring, quadratic/cubic formulas, complex roots), rational equations (denominator checks), radical equations (squaring with **extraneous-root rejection**), exponential/log/trig by inverse operations (trig general solutions with `n ∈ ℤ`), substitution (`x⁴ − 5x² + 4`), inequalities (sign charts), linear systems (exact Gauss–Jordan; infinite and inconsistent cases) and 2×2 nonlinear systems (Newton). Steps, domains, and a both-sides plot. A **numerical fallback** (Brent on [−100, 100]) is used and labelled when no exact method applies. |
| **Algebra studio** | Simplify, expand, factor over ℚ (with quadratic surds), substitute, evaluate; each transformation explained. |
| **Calculus lab** | Derivatives with rule-by-rule steps (any order); antiderivatives (table, linear substitution, u-substitution, parts, partial fractions), always **verified by differentiation**; definite integrals (exact when possible, otherwise adaptive Gauss–Kronrod with an error estimate, infinite bounds supported); limits (substitution, L'Hôpital cross-checked numerically, one-sided analysis); critical points and tangent lines; plots for each. |
| **Graphing engine** | Multiple functions, `y = f(x)`, parametric `x(t); y(t)` and polar `r(θ)`. Adaptive sampling that breaks at discontinuities (no false vertical lines at asymptotes). Pinch/drag/double-tap zoom, fit, reset, equal aspect. Tap to trace with snapping. Roots, extrema, intersections, vertical and horizontal asymptotes. Colours, visibility, saved projects, PNG screenshot sharing. Landscape side-by-side layout. |
| **Geometry workshop** | Draggable triangle/quadrilateral/polygon/circle with live lengths, angles, area (shoelace), perimeter, circumcircle and incircle; shape and solid calculator; coordinate geometry (distance, midpoint, slope, line). |
| **Trigonometry explorer** | Draggable unit circle with sin/cos/tan segments, exact values, quadrant and reference angle; triangle solver for SSS/SAS/ASA/AAS/SSA, including the **ambiguous case** (two triangles); degree↔radian converter; exact-value table. |
| **Linear algebra** | Exact rational matrices: determinant, inverse, transpose, RREF, rank, trace, powers, A±B, AB, characteristic polynomial and eigenvalues (exact where the polynomial allows, otherwise numerical, including complex). Every elimination step is shown. Ax = b with parametric solutions. Vectors: dot, cross, norms, angle, projection. |
| **Statistics & probability** | Descriptive statistics (quartiles type 7, sample and population variance, skewness, 1.5·IQR outliers) with histogram and box plot; linear/quadratic/cubic/exponential regression with R² and residuals; normal/binomial/Poisson/exponential/uniform/geometric probabilities with shaded plots; seeded coin, dice and Monte Carlo π simulations against the exact theory. |
| **Number theory** | BigInteger arithmetic: primality (deterministic Miller–Rabin below 3.3·10²⁴, probabilistic above), Pollard–Brent factorization with a time limit, divisors, σ, φ, gcd/lcm with Euclid steps and Bézout coefficients, modular power and inverse, CRT (non-coprime moduli supported), sequences, combinatorics, divisibility rules. |
| **Complex numbers** | Complex expressions (principal branches), rectangular and polar forms, modulus/argument/conjugate, n-th roots, an Argand plane you can tap to place z. |
| **Visualization studio** | Mandelbrot and Julia sets (smooth colouring, 5 palettes, pinch/double-tap zoom, progressive multi-core rendering, presets, image sharing); logistic-map bifurcation with time series; Lorenz attractor (RK4, adjustable σ/ρ/β, animated); Fourier series, Taylor polynomials, Riemann sums and Lissajous animations. |
| **Learning center** | 20 lessons from foundation to advanced (explanations, formulas, worked examples, exercises with hints and solutions; answers are checked numerically, so `1/2`, `0.5` and `sqrt(3)/2` are all accepted) with saved progress. |
| **Practice and challenges** | Seeded quiz generators for 12 topics × 3 difficulties, with **every answer computed by the math engine**; a deterministic daily challenge (same 5 problems for everyone on a given date) with streaks; timed sprints; 14 achievements; stats; save mistakes to the notebook. |
| **Formula library** | 78 formulas in 10 categories with variable definitions and examples; search, filters, stars, save to notebook. |
| **Notebook** | Save any result; folders, favourites, editing, sharing; reopen an entry in its tool; JSON export/import through the system file picker. |
| **Search, history, favourites** | Global search across tools, lessons, formulas, notes and history. Automatic history (limit configurable, can be turned off). Favourites across formulas, lessons, notes and history. |
| **Settings** | Dark (default) / light / system theme, 5 accent colours, text size, high contrast, reduce motion, angle unit, precision, number format (auto/plain/scientific/engineering), digit grouping, exact results, steps, graph quality, haptics, history, **full backup and restore** (JSON via the system file picker), reset progress. |

## Build

Requirements: JDK 17 or 21, Android SDK with platform 35 and build-tools 35 (`ANDROID_HOME` set, or `sdk.dir` in `local.properties`). The desktop app needs only the JDK.

```bash
cd quantumath
./gradlew assembleDebug        # → app/build/outputs/apk/debug/app-debug.apk
./gradlew :mathcore:test       # math engine unit tests (plain JVM)
./gradlew testDebugUnitTest    # app tests: Robolectric UI flows, persistence, ViewModels
./gradlew connectedDebugAndroidTest   # instrumented smoke tests (needs a device or emulator)
```

### Windows app

```bash
./gradlew :desktop:run                  # run the desktop app on the current OS
./gradlew :desktop:test                 # desktop UI + storage tests (headless)
desktop/packaging/build-windows.sh      # → output/Quantumath-1.0.0-Setup.exe (works on Linux, macOS or WSL)
```

`build-windows.sh` performs these steps:
1. Builds a self-contained jar with the Windows Skia natives (`:desktop:windowsJar`).
2. Strips unused Material icons from the jar and builds a minimal Windows Java 21 runtime with `jlink`. It downloads the Windows and Linux Temurin JDKs of the same version, or you can point `WIN_JDK` / `LINUX_JDK` at extracted JDK folders.
3. Compiles the small `Quantumath.exe` launcher and the installer with NSIS (`makensis`, e.g. `apt install nsis`).

On Windows you can also use `./gradlew :desktop:packageMsi` (jpackage + WiX) instead.

### Android release build

1. Create a keystore once and **keep it safe**: Android only accepts updates signed with the same key.
   ```bash
   keytool -genkeypair -v -keystore quantumath-release.jks -alias quantumath -keyalg RSA -keysize 3072 -validity 10000
   ```
2. Create `quantumath/keystore.properties`. It is gitignored, as are `*.jks` files; never commit either.
   ```properties
   storeFile=/absolute/path/to/quantumath-release.jks
   storePassword=…
   keyAlias=quantumath
   keyPassword=…
   ```
3. Build:
   ```bash
   ./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk (R8-minified)
   ./gradlew bundleRelease       # → app/build/outputs/bundle/release/app-release.aab (for Google Play)
   ```
   Without `keystore.properties`, the release build falls back to the debug key, which is fine for local testing but not for distribution.

## Project structure

```
quantumath/
  mathcore/                      pure Kotlin/JVM math engine (no Android dependencies, fully unit-tested)
  desktop/                       Windows/desktop app (Compose Multiplatform): window, JSON-file storage implementing the
                                 same DAO interfaces as Room, desktop platform services, Room annotation stand-ins,
                                 NSIS launcher + installer scripts (desktop/packaging)
    core/        Rational (BigInteger), error types
    expr/        tokenizer + recursive-descent parser → AST, pretty printer (no eval / scripting)
    eval/        double evaluator (compiled closures), BigDecimal evaluator + BigMath, exact rational evaluator
    symbolic/    polynomials, multivariate rational forms, simplifier, algebra, calculus, solver
    numeric/     Brent, Ridders, adaptive Gauss–Kronrod, numeric limits, Aberth polynomial roots
    linalg/ stats/ numbertheory/ complex/ geometry/ plot/ fractal/ format/
    learning/    lessons, formula library, seeded quiz generators, daily challenge, achievements
  app/
    src/main/java      platform-neutral code shared by Android and desktop:
    data/        entities, DAO interfaces, DataStore settings, JSON backup/restore
    ui/theme     dark/light Material 3 theme, accents, font scaling
    ui/components shared widgets, plot canvas helpers
    ui/nav       Navigation Compose graph, bottom bar / navigation rail
    ui/screens   one ViewModel + screen per feature
    util/        background computation with time limits
    platform/    PlatformActions interface (clipboard, share, files) — implemented per platform
    src/main/platform  Android-only code: Activity, Application, Room database builder, Intents/FileProvider/SAF
  output/                        built APKs and Windows installer (gitignored)
```

### Engineering notes

- **No string execution.** All input goes through Quantumath's own tokenizer and parser into an AST. Nothing is ever passed to a script engine.
- **Honest precision.** Exact arithmetic uses arbitrary-size rationals. The calculator uses BigDecimal at the chosen precision, with guard digits and high-precision constants, so `sin(π)` shows `0`. Graphs, numerical integration and root finding use double precision, and numerical results are labelled as such.
- **Domains and errors.** Division by zero, logs of non-positive numbers, even roots of negatives (in real mode), out-of-domain inverse trig, overflow and unsupported inputs produce clear messages instead of crashes. Solutions are checked against the original equation's domain.
- **Responsiveness.** Heavy work runs on `Dispatchers.Default` with cancellation and a time limit (calculator 20 s, number theory 15 s). Fractals render progressively (8× → 1×) across 8 parallel bands, and graph sampling is cached over a window larger than the visible one so panning is smooth.
- **State.** ViewModels survive rotation, back navigation keeps each tab's state, and settings, history, notebook, progress and graph projects persist in Room/DataStore.
- **Accessibility.** Content descriptions on all icon buttons, calculator keys and canvases; live regions for results and feedback; headings; scalable text (80–140 %); high-contrast and reduce-motion options; 48 dp touch targets for primary actions.
- **Permissions.** None requested on Android. Files are exchanged through the Storage Access Framework and `FileProvider` sharing (Android), or through native file dialogs (Windows).

See **[VERIFICATION.md](VERIFICATION.md)** for exactly what was tested and the known limitations.
