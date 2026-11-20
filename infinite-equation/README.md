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

---

# CICADA 3301: impact edit (`cicada.html`)

A second 15 s, 1080×1920, 60 fps film made with the same engine: a fan edit about the Cicada 3301 puzzles.
It is built on a **120 BPM beat grid** (one beat = 0.5 s = 30 frames), so every cut and impact lands on a beat.
Pick a 120 BPM sound in TikTok and line its first downbeat up with **4.0 s** (the "3301" hit). The big drop is at **8.0 s**.
`cicada.html?bpm=…` re-times every beat-locked event (stay near 120 so it fits in 15 s).

| Time | Section |
|---|---|
| 0–4 s | Terminal transmission types out. An original line-art cicada draws itself over hex rain. Glitch ticks build tension |
| 4–8 s | Hard cut on every beat: 3301 → PRIME → STEGANOGRAPHY → PGP → LIBER PRIMUS → runes = primes, then a 2012 / 2013 / 2014 stutter on half beats, then "?" |
| 8 s | **Drop.** A five-frame impact burst, chrome 3D CICADA / 3301, wings flare, and Gematria Primus rune rings (29 runes ↔ the first 29 primes) |
| 8–12 s | Camera orbit with a zoom punch, shake and wing flutter on every beat, and full impact frames on strong beats |
| 12–15 s | The cicada shatters into particles, then WHO / ARE / THEY?, then STILL **UNSOLVED.**, then a glitch-out to black |

**Impact frame engine** (`src/cicada/main.js`): every hit is a timed event. Depending on the kind of hit (`tick` / `beat` / `mid` / `big` / `mega`) it drives:
- a camera zoom punch;
- a decaying screen shake and roll;
- chromatic split, glitch slices and flash;
- manga radial speed lines.

These effects are continuous, so motion blur keeps them smooth. The impact frames themselves are frame-exact:
- 1–5 frames of black ink on white, red ink on black, or hard white on black;
- one black frame right before big hits.

They are thresholded from a pre-bloom buffer, so the line art stays crisp.

Facts used on screen:
- 3301 is prime, and reversed (1033) it is also prime.
- The puzzles appeared in 2012, 2013 and 2014; the first one appeared on 2012-01-04.
- Messages were PGP-signed.
- The Liber Primus is written in runes. Its Gematria Primus maps ᚠ ᚢ ᚦ ᚩ ᚱ … to 2 3 5 7 11 …
- The cicada artwork is an original design, not the group's logo.
