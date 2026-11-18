# Quantumath — Verification Report

Build and test environment: Linux container (x86_64, 4 vCPU), JDK 21, Gradle 8.11.1, AGP 8.7.3, Kotlin 2.0.21, Android SDK platform 35 / build-tools 35.0.0. **No physical Android device and no emulator were available** (the container has no KVM). UI behaviour was therefore verified with Robolectric (simulated Android 14 runtime, native graphics mode), not on real hardware.

## Results at a glance

| Check | Result |
|---|---|
| `./gradlew assembleDebug` | ✅ `Quantumath-1.0.0-debug.apk`, 62,247,213 bytes |
| `./gradlew assembleRelease` (R8 minify + resource shrinking) | ✅ `Quantumath-1.0.0-release.apk`, 3,835,987 bytes |
| Math engine unit tests (`:mathcore:test`) | ✅ 56 / 56 |
| App tests on Robolectric (`testDebugUnitTest`) | ✅ 20 / 20 (UI flows, landscape, fractal rendering, persistence, ViewModels) |
| Instrumented tests (`connectedDebugAndroidTest`) | ⚠️ compiled, **not run** (no device or emulator) |
| `apksigner verify` | ✅ both APKs (v2 scheme; minSdk 28 needs no v1) — debug: `CN=Android Debug`, release: `CN=Quantumath` |
| `aapt dump badging` | ✅ package `com.quantumath.app`, versionName 1.0.0 / versionCode 1, label "Quantumath", minSdk 28, targetSdk 35 |
| Permissions | ✅ none requested. The only entry is `com.quantumath.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, a signature-level permission AndroidX Core defines for the app's own internal broadcast receivers; it is not shown to users. No `INTERNET`. |

SHA-256 of the delivered APKs:
```
f0e950686554ee2088e61d6c201ecffe27a79c810efa0484d665f706e5376e92  Quantumath-1.0.0-debug.apk
becf85167d633756ec22e7aaee7e985d8c029c735b93818f71294772184f43af  Quantumath-1.0.0-release.apk
```

## Math engine (56 tests)

- **Parser:** precedence, right-associative `^`, unary minus vs powers (`−2² = −4`), implicit multiplication, `|x|`, postfix `! %`, scientific notation vs the constant `e`, function names and aliases, helpful error positions; no code execution path exists.
- **Precision:** BigDecimal results at 16–100 digits (√2, π, e, `sin(π) = 0`, large factorials, exact quadrant values in degree mode); formatter styles.
- **Solver:**
  - polynomial roots, both exact and complex (cubic conjugates);
  - rational equations, with denominator exclusions;
  - radical equations, with the extraneous root rejected (`√(x+7) = x − 5 → x = 9`, `x = 4` rejected);
  - trig general solutions; substitution; exponential and log equations;
  - inequalities through sign charts, including domain boundaries;
  - linear systems: unique, infinite and inconsistent cases; 2×2 nonlinear systems through Newton;
  - numeric fallback for cases with no exact method.
- **Calculus:**
  - derivatives, with steps;
  - antiderivatives verified by differentiation (table, substitution, parts, partial fractions);
  - definite integrals, including infinite bounds;
  - limits through L'Hôpital, cross-checked numerically, plus one-sided and non-existent limits;
  - critical points and tangent lines.
- **Domains:** division by zero, logs and even roots of negatives, inverse-trig range, overflow guards, NaN/∞ handling in strict vs graph mode.
- **Plotting:** `1/x` and `tan x` are split at their poles (no connecting vertical lines); `√x` starts at its domain boundary; roots, extrema, intersections, vertical and horizontal asymptotes are found (and a removable discontinuity is *not* reported as an asymptote); polar curves.
- **Fractals:** known interior points (cardioid, period-2 bulb, Douady rabbit centre) and exterior points; the logistic map converges to its analytic fixed point.
- **Learning content:**
  - every lesson exercise's stated answer passes the answer checker;
  - generated quizzes: 12 topics × 3 difficulties × 15 seeds × 6 questions (3,240 questions) are self-consistent;
  - quadratic quiz roots satisfy their equations when substituted back; determinant answers match an independent ad − bc computation;
  - the daily challenge is deterministic per date and different between dates;
  - the answer checker accepts equivalent forms (`0.5` for `1/2`, `0.866` for `√3/2`) and rejects wrong or malformed input.
- **Explanation text:** a guard test runs simplify, factor, derivative, integral, limit and solve over a set of inputs and asserts that no step text contains raw syntax-tree dumps. This bug was found and fixed during UI review.

## App (20 tests, Robolectric, phone 411×891 dp and landscape 891×411 dp)

End-to-end UI flows drive the real Compose UI and check values produced by the engine.

**Home and navigation**
- Home, Laboratory, Learn and Graph tabs all render.
- Every Laboratory tool opens and closes with back: geometry, trigonometry, linear algebra, statistics, number theory, complex, visualization, notebook, formulas, challenges.

**Calculator**
- `2+3×4 = 14`.
- `1/3+1/6` shows `0.5` and the exact fraction `1/2`.
- `√2 = 1.414213562373095`, with the exact form `√2`.
- Memory store and recall work.
- `1/0` shows an error instead of crashing.
- The result survives activity recreation (rotation).

**Solver**
- `x² − 5x + 6 = 0 → x = 2, x = 3`, with steps.
- The radical equation rejects its extraneous root.
- The 2×2 linear system solves to `x = 3, y = 2`.

**Calculus and algebra**
- The derivative of `x² sin x` is correct.
- The antiderivative of `x eˣ` is shown as "Verified by differentiation".
- `x⁴ − 16` factors to `(x + 2)(x − 2)(x² + 4)`.

**Graph**
- Adding `1/(x−1)` plots two branches.
- The screenshot button renders a PNG (> 5 KB) into the app cache and fires a share intent.

**Linear algebra and number theory**
- The determinant of the sample matrix is `−1`.
- Gauss–Jordan gives `x₁ = 2, x₂ = 3, x₃ = −1`.
- `360 = 2³ · 3² · 5`.

**Learning and notebook**
- A lesson exercise is checked as correct.
- A practice quiz question is submitted and gets feedback.
- A calculator result saved to the notebook appears there.
- The light theme applies.

**Rendering and layout**
- **Fractal rendering:** the Mandelbrot set finishes all progressive passes. The test asserts the rendered area contains more than 200 distinct colours, and the screenshot shows the full set.
- **Landscape:** the calculator shows display and keypad side by side, the graph shows canvas and function list side by side, and a navigation rail replaces the bottom bar.

**Persistence (Room in-memory + DataStore file)**
- History trimming keeps the newest entries plus favourites, and "keep history" off stores nothing.
- Deleting a folder keeps its notes.
- A full **backup → wipe → restore** round trip restores:
  - settings;
  - notebook, folders, history and favourites;
  - lessons, quizzes and achievements;
  - graph projects.
- Invalid or foreign backups are rejected without touching existing data.
- Notebook import merges folders by name.
- Settings are clamped.
- Daily-streak arithmetic is correct, and each achievement unlocks only once.

**ViewModel**
- Exact and complex results; errors.
- `ans` chaining after `=`.
- Memory registers.
- Function-token backspace.
- Cursor editing.

### Bugs found by these tests and fixed

1. An "Achievement unlocked" snackbar covered the bottom keypad row (`=` and `0`) for ~4 s and swallowed taps. Messages are now a top banner that does not intercept touches.
2. Canvas labels near the right edge crashed Compose `drawText` (negative layout width). All canvas text now goes through a guarded helper.
3. Factorization explanations printed raw AST objects. They now use the pretty printer, with a regression test.
4. Long values (e.g. a divisor list) squeezed labels into one-letter columns. Long rows now stack.
5. The trig explorer's coordinate label was clipped at the canvas edge. It is now placed inside.
6. Graph screenshots used a hardware RenderNode path that fails on software canvases. Screenshots now render directly into a bitmap.
7. The landscape bottom bar wasted ~20 % of the height. A navigation rail is used in landscape.

## Implemented but not fully tested

- **Real devices and emulators.** The APKs were never installed or launched on Android hardware. Robolectric runs the real app code against a simulated framework, but these were not checked:
  - GPU rendering performance and frame rate;
  - real touch gestures (pinch zoom was not simulated; drag and tap were);
  - the IME and soft keyboard behaviour;
  - edge-to-edge insets on specific devices;
  - haptics.
- **Release (R8-minified) build:** built and signature-verified, but all automated tests ran against the non-minified debug code. Keep rules for kotlinx.serialization are in place; Room and Compose ship their own consumer rules. If anything misbehaves only in the release APK, use the debug APK.
- **Instrumented tests** (`app/src/androidTest`): two smoke tests (calculator and solver, rotation) compile but were not executed.
- **Share sheet, Storage Access Framework pickers and FileProvider** on real Android versions 9–15: intents and file writes were verified in Robolectric only.
- **Android 9–13 specific behaviour:** tests ran at API 34 only.

## Limitations (by design or not implemented)

- **Symbolic coverage is deliberately bounded.** Simplification, factoring over ℚ, integration rules and exact equation solving cover the classes listed in the README. Outside them, the app says so or falls back to clearly labelled numerical methods. It does not claim to be a general computer-algebra system.
  - No implicit plotting (e.g. `x² + y² = 1`).
  - No symbolic integration of special functions.
  - No Gröbner-basis nonlinear systems beyond 2×2 Newton.
- **Precision:** graphing, numerical integration, root finding, complex arithmetic and fractals use IEEE double precision. Fractal zoom becomes blocky below about 10⁻¹³ units per pixel (the app shows a warning).
- **Long computations:** these are time-limited (calculator 20 s, number theory 15 s). A computation that exceeds its limit is abandoned from the UI's point of view, but a pure CPU loop cannot be interrupted mid-step; it finishes in the background and its result is discarded.
- **Factorization** of very large semiprimes may stop at the time limit; the app reports unsplit factors.
- **Language:** English only.
- **Signing:** the release key generated for this build was kept outside the repository. Future official releases must be signed with the same key, or users must uninstall before upgrading.
