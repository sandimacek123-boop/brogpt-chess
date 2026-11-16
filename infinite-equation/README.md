# THE INFINITE EQUATION

A 15-second vertical (1080 × 1920, 9:16, 60 fps, 900 frames) cinematic mathematical film,
rendered frame by frame with Three.js and custom GLSL shaders, then encoded to H.264 MP4.
The audio track is silent so music can be added in TikTok.

## Storyboard → implementation

| Time | Scene | What is on screen |
|---|---|---|
| 0.00–2.00 | The beginning | 9 000 GPU particles converge onto a circle, a golden line traces it, 3D extruded **MATHEMATICS** flips in letter by letter |
| 2.00–4.00 | The language | The circle tilts into a polar floor grid, x/y/z axes grow, a 3‑4‑5 right triangle, `e^{iπ} + 1 = 0`, `a² + b² = c²`, and exact identities floating at depth |
| 4.00–6.50 | Calculus | `f(x) = x²` draws itself. A tangent with slope exactly `2x₀` slides along it while the point `(x₀, 2x₀)` traces `f′(x) = 2x` live |
| 6.50–9.00 | Integration | The plot zooms to [0, 1]. The curve is swept into a lit surface, and midpoint Riemann boxes split n = 4 → 256 with the live sum (0.32813 → 0.33333) until they merge into the area `∫₀¹ x² dx = 1/3` |
| 9.00–12.00 | Pi | The area under the curve bends into a closed circle, a metallic π emerges, and 1 300 digits of π (computed with Machin's formula in BigInt) spiral around it while the camera orbits |
| 12.00–15.00 | Infinity | The camera flies through the digit vortex, spirals unwind into a lemniscate of Bernoulli, π returns, **INFINITE POSSIBILITIES**, then a fade to black at 15.00 s |

## How it renders

- `index.html` + `src/*.js`: the film. `window.renderFrame(i)` renders frame *i*.
  Every object is a pure function of time, so frames can be rendered in any order or in parallel, and re-rendering gives the same result.
- `render.js`: a small static server plus headless Chromium (Playwright, WebGL) that saves PNG frames, and an ffmpeg encode step.
- Pipeline per frame: 6 temporal sub-samples (180° shutter motion blur plus Halton sub-pixel jitter anti-aliasing) are accumulated in HDR. Then come bloom, ACES tone mapping, vignette, light chromatic aberration and static dither.
- Depth of field is done in the shaders. Particles become bokeh discs, and text and digits are blurred with mip-LOD based on distance from the focal plane.

| File | Contents |
|---|---|
| `src/main.js` | scene build, camera rigs, the whole timeline, post-processing |
| `src/text.js` | small TeX-style equation layout (KaTeX fonts), text-plane shader, opentype.js → 3D extruded letters |
| `src/lines.js` | `GlowLine`: screen-space glowing ribbon lines with draw-on, dashes and depth fade |
| `src/particles.js` | GPU particle field (convergence → dust → infinity flow) |
| `src/digits.js` | instanced π-digit helix |
| `src/util.js` | easing, seeded RNG, π digits (Machin formula, BigInt) |

## Commands

```bash
npm install
npm run preview          # a few half-res stills -> out/stills
npm run render:draft     # fast low-res full sequence -> out/prev/frames
npm run render           # final 1080x1920 frames -> out/final/frames (resumable)
npm run encode           # -> out/final/the-infinite-equation.mp4
```

To watch it interactively, serve the folder and open `index.html?play=1&scale=0.5&fit=1`.
To view one frame, use `index.html?t=8.5&scale=0.5&fit=1`.

## Mathematical accuracy

- Tangent: slope `m = f′(x₀) = 2x₀`, drawn in plot space with equal x/y scale, so its angle is exact.
- Riemann sums: midpoint rule `Σ f((i+½)/n)/n = 1/3 − 1/(12n²)`, computed on the fly. Values shown: 0.32813, 0.33203, 0.33301, 0.33325, 0.33331, 0.33333.
- π digits are generated, not typed: `π = 16·atan(1/5) − 4·atan(1/239)`, checked against a reference prefix and against the Feynman point (six 9s starting at decimal 762).
- The infinity curve is the lemniscate of Bernoulli: `x = a cos t / (1 + sin² t)`, `y = a sin t cos t / (1 + sin² t)`.
