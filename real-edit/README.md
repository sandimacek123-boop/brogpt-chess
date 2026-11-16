# REAL — BEYOND EXECUTION · 15s cinematic impact edit

Vertical promo edit for **REAL** (projectreal.gg). 1080×1920, 60 fps, 900 frames, H.264 + AAC.

**Deliverables** (in `out/`)

| file | what |
|---|---|
| `REAL_FINAL_EDIT.mp4` | final master: 1080×1920, 60 fps, exactly 15.000 s / 900 frames, H.264 High@4.2 yuv420p, AAC 320k 48 kHz, faststart |
| `REAL_EDIT_PREVIEW.mp4` | smaller preview: 720×1280, 60 fps |

Everything is rendered offline and deterministically: same source, same frames, every time.

## How it is built

```
audio/make_audio.py   → original soundtrack (pure synthesis: 808s, kicks, claps, cowbells, risers,
                        booms, whooshes, glitches, reverb) + src/audio_events.json (beat map)
src/timeline.json     → the edit's frame-exact cue sheet (shared by audio + visuals)
src/world.js          → 3D assets: extruded official logo, drawable logo outline, 3D type,
                        official UI panels, particles, tunnel, grid
src/director.js       → the edit: camera moves, velocity curves, every cue per frame
src/post.js           → sub-frame accumulation (motion blur + anti-aliasing), HDR bloom,
                        anamorphic streaks, god rays, and the impact-frame compositor
src/anim.js           → quintic/expo easing, cubic-bezier solver, damped springs, keyframes, noise
render.js             → serves the project, drives headless Chromium frame by frame, pipes RGBA to FFmpeg
tools/                → fetch_assets.sh, prep_logo.mjs, render_all.sh, finalize.sh, sheet.py
```

### Reproduce

Requirements: Node 18+, Python 3 (numpy, scipy), FFmpeg with libx264, Playwright's Chromium.

```bash
npm install                    # three.js only
./tools/fetch_assets.sh        # official REAL logo + UI screenshots from projectreal.gg
node tools/prep_logo.mjs       # smooth the official logo SVG into extrudable contours
JOBS=2 ./tools/render_all.sh   # audio → video chunks → out/REAL_FINAL_EDIT.mp4 + preview
```

QC stills for any frames: `node render.js --stills 102,270,654,750 --dir build/qc`

## The cut (60 fps, 150 BPM, 1 beat = 24 frames, drop on frame 270)

| frames | scene | what happens |
|---|---|---|
| 0–126 | **Awakening** | darkness, bokeh dust, the official logo is drawn by glowing lines that fly in and lock; f102 B/W impact frame → solid chrome logo, shock ring, light sweep |
| 126–270 | **Buildup** | camera orbits the logo; official app windows float in depth; `REAL` (letters flip up on springs), `PRECISION.` (scattered letters converge + crosshair lines lock), `PERFORMANCE.` (velocity entry with motion trails); f258 inhale (pull back, desaturate, particles implode), f264 rocket in |
| 270–366 | **Main drop** | hit-stop freeze: f270 B/W frame → f271 manga-ink frame → f272 chromatic punch; shockwave, RGB split, damped shake, 360° logo spin with motion blur, beat-synced rings; whip-pan out |
| 366–558 | **Execution** | grid world + flying official UI panels; `UNC` slams from deep space, `sUNC` whips in with trails, `STABILITY` stays locked while the world shakes and glitch slices settle, `ONE KEY.` presses down like a key; dive through the type |
| 558–750 | **Climax** | tunnel of rings and logo crowns with `REAL` typography walls; f654 manga ink impact on a giant `REAL` + negative frame + 180° snap roll; f702 velocity ramp (FOV widen, streaks, zoom blur); f738 everything converges |
| 750–900 | **Final reveal** | ink → B/W → chroma impact, logo on REAL's official dark-wave backdrop, `REAL.`, `BEYOND EXECUTION.` revealed by a light streak, cinematic fade |

### Impact-frame system (`src/post.js`)

All impacts are 1–3 frames, each one on a musical hit, and spaced out to avoid strobing:

- **B/W**: hard threshold, subject white, contour cuts, white focus lines
- **Ink**: paper texture, solid black subject with a white inner rim, brush-wobbled outlines, screentone dots, black manga focus lines
- **Negative**: tinted inversion
- **Shockwave**: radial refraction ring with chromatic fringing
- **RGB split / chromatic aberration / lens distortion / glitch slices**
- **Speed lines**: radial focus lines or directional lines that follow the camera move
- **Hit-stop**: the 3D world freezes during an impact while the music keeps time

Motion blur is real: each output frame averages 5–12 sub-frame renders over the shutter interval, with sub-pixel jitter for anti-aliasing.

## Credits and attribution

- **REAL logo, app screenshots, dark-wave background**: official assets publicly served on projectreal.gg, © their owners. They are not stored in this repo; `tools/fetch_assets.sh` downloads them.
- **Fonts**: Inter Display and Open Runde (REAL's own site fonts), both SIL OFL 1.1. See `assets/fonts/FONTS.md`.
- **Music and SFX**: original, synthesized from scratch by `audio/make_audio.py`. No samples or third-party audio.
- The edit shows no exploit code, bypasses or instructions. It is promotional motion graphics only.
