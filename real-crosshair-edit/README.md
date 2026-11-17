# REAL — Cinematic Spinning Crosshair Edit

A 15-second, 1080×1920, 60 fps spinning crosshair edit built around the official **REAL** brand (Project Real, https://projectreal.gg). It's made with Remotion and rendered frame by frame, so the same frame index always produces the same picture.

**Final export:** `out/REAL_Spinning_Crosshair_Final.mp4`. H.264, yuv420p, 900 frames, no audio stream.

## What's in the frame

- **Official branding.** The centre shows the official REAL symbol (the site's vector `real-logo.svg`) as the app-icon lockup: a white rounded square with the symbol in its official blue→violet gradient. Under it is the wordmark **Real** in Montserrat SemiBold, matching the official lockup, then **EXECUTOR**. **PROJECT REAL** appears for the reveal. The site's own fonts, Geist and Geist Mono, are used for interface text and technical labels. Where every asset came from is listed in `public/brand/SOURCES.md`.
- **Fixed logo layer.** The logo is drawn last, upright and never blurred, on an opaque plate. It's never split by the crosshair and never spins. It only animates on purpose: blue-light exposure, scale/tracking reveal, impact pulses, final reveal, outro move.
- **Four-panel crosshair.** Electric-blue panels sit top-left and bottom-right, near-black/red panels top-right and bottom-left, split by white crosshair lines. The panels rotate as one object using AE-style Bézier keyframes.
  - Each quadrant also animates on its own: ray spin direction and artwork drift.
  - Panel artwork is official product imagery used as subtle textures: the editor window, the editor hero, the wave texture and the REAL symbol. One scene is original abstract calibration geometry.
- **11 concentric rings.** Ticks, degree labels, calibration notches, dotted rings, brackets and red/cyan arcs, plus sweeping light streaks, radial light bursts and shockwaves.
  - Every ring has its own angular velocity, direction (alternating CW/CCW), radius, thickness, tick count and impact response.
  - Ring angles are `θ(t) = θ₀ + dir·ω·∫E(τ)dτ`, integrated numerically from a smooth energy envelope.
  - A smootherstep correction lands every ring exactly on its rest pose at the lock frame (11.57 s).
- **Motion blur.** The panels use temporal supersampling: up to 64 sub-frames, scaled to how far the frame corners actually travel. Every ring is supersampled separately at its own velocity. Static text never gets blurred.
- **Impacts.** Each one layers a decaying-impulse camera shake, a scale punch, a short capped flash, a restrained radial chromatic-aberration burst, light bursts and shockwaves. There's a reduced-flash mode for photosensitive viewers.

## Timeline

| Time | What happens |
| --- | --- |
| 0.00–1.50 | Near-black + the official wave texture. Thin rings sweep in, a central blue light exposes the REAL symbol, and the "Real" wordmark lands with a fast scale/opacity/tracking transition |
| 1.50–3.50 | The four panels open from the logo plate with a rapid zoom. 90° CW with overshoot, then 90° CCW home. More rings join, calibration labels appear |
| 3.50–6.00 | Acceleration: 180° CW speeding up, a 90° stop, then 270° CCW with overshoot. Blue/red light streaks, scale pulses, impact flashes, artwork cut on the fastest frame |
| 6.00–9.00 | Max intensity: 360° CW, then a sharp 360° CCW reverse, a 90° snap, 360° CCW, then 270° CW at full speed. Peak ≈ 1600°/s, counter-rotating rings, light bursts, a shockwave, chromatic bursts |
| 9.00–11.50 | Controlled slowdown: outer rings stop first and inner ones keep going briefly. The REAL symbol sweeps into all four panels, with a cinematic contrast shift. The panels decelerate, overshoot and lock to 0° |
| 11.50–13.50 | Everything is locked symmetrical. A central impact (shockwave + blue light) reveals the logo at 1.2× with **PROJECT REAL**, followed by a final camera push |
| 13.50–15.00 | The lockup lifts, **projectreal.gg** and **discord.gg/projectreal** fade in, and the geometry collapses into the plate. It ends on a clean brand card |

## Run it

```bash
cd real-crosshair-edit
npm install
npm run preview        # editor + exporter → http://localhost:5180
npm run render         # → out/REAL_Spinning_Crosshair_Final.mp4
npm run verify         # QC report + contact sheet → out/qc/
npm run studio         # optional: Remotion Studio
```

Needs Node 18+. `ffmpeg`/`ffprobe` on PATH are only used by `verify` and `analyze-audio`; rendering uses Remotion's bundled ffmpeg. Remotion downloads its own headless Chrome the first time, or you can set `REMOTION_BROWSER_EXECUTABLE`.

## Editor (`npm run preview`)

- **Transport:** play/pause (space), restart (R), frame step (←/→, shift = 10), last frame, timeline scrubbing with section markers, loop, preview quality (full / draft / fast).
- **Project:** save the project to JSON, load a project, reset all controls. Settings also autosave in the browser.
- **Motion:** spin speed, spin direction, acceleration ease, deceleration ease, motion blur, blur sample count, ring / inner ring / outer ring speed, camera zoom, impact strength.
- **Visual:** blue and red intensity, inverted-blue-panel toggle (the classic trend negative), glow, ring thickness / density, tick density, contrast, brightness, chromatic aberration, background opacity, flash intensity, reduced flashes, camera shake, palette guard.
- **Colours:** the 7-colour palette. The official logo keeps its own colours.
- **REAL branding:**
  - Upload a logo file, or use the built-in official symbol.
  - Logo style (app icon or white symbol), scale, X/Y position, wordmark text and size.
  - Toggles for EXECUTOR, PROJECT REAL, projectreal.gg and discord.gg/projectreal.
- **Artwork (4-panel):** 5 scenes. Each one has a built-in official asset or upload, layout, treatment, fit, blend, opacity, scale, offset, light rays, and separate art per panel.
- **Audio:** import MP3/WAV/M4A, enable/disable, song start offset, volume, beat sync.
- **Export:** file name (default `REAL_Spinning_Crosshair_Final.mp4`), CRF, render without audio or with music, live progress (frames), cancel, download.

The preview runs the exact same component and timeline maths as the export. The only preview-only setting is the motion-blur sub-frame cap. Exports are rendered offline at full quality.

## CLI options

```bash
npm run render -- --props real-crosshair-project.json   # a project saved from the editor
npm run render -- --crf 12                              # bigger, near-lossless
npm run render -- --frames 360-539 --out out/max.mp4    # partial render
npm run render -- --still 696                           # single PNG
```

## Optional music

The edit is silent by default, and nothing is downloaded or generated. If you own or have licensed a track:

```bash
npm run render:music -- --audio path/to/track.mp3 [--offset 12.3] [--no-sync]
# → out/REAL_Spinning_Crosshair_Final.mp4 + out/REAL_Spinning_Crosshair_Final_music.mp4
```

Beats are detected (spectral-flux onsets, tempo, then dynamic-programming beat tracking). Every major impact moves to its nearest beat, and the timeline in between is time-warped so everything stays aligned.

## QC (`npm run verify`)

- **File:** codec, 1080×1920, 60/1 fps, exactly 900 decoded frames, 15.000 s, yuv420p, no audio stream, a clean full decode, and evenly spaced timestamps (no missing or duplicated frames).
- **Maths:** panel and ring rotation is C¹-continuous (a jump detector), rings and panels are precisely aligned at the lock, the edit ends aligned, and no corner is ever exposed.
- **Pixels:** green/purple scan, centred white crosshair lines plus the blue/red checkerboard on rest frames, the official logo visible on 9 key frames, and "Real" wordmark contrast ≥ 7:1 (WCAG AAA). The outro links are present with ≥ 7:1 contrast.

It also writes stills plus a contact sheet of frames 0, 60, 120, 240, 360, 450, 540, 660, 780 and 899 to `out/qc/`.

## Project layout

```
src/config.ts            props, palette, scenes, brand settings, defaults
src/CrosshairEdit.tsx    Remotion component (canvas renderer + optional <Audio>)
src/engine/timeline.ts   choreography: panel keys, ring energy integration + lock, impacts, logo states
src/engine/render.ts     layered compositor: panels (supersampled), FX rings (supersampled per ring), bloom, CA, flash, brand
src/engine/rings.ts      ring / streak specs + drawing
src/engine/brand.ts      official logo lockup, wordmark, plate, outro links
src/engine/color.ts      panel duotones, palette guard
src/engine/assets.ts     font/image loading, per-tab cached treatments
src/engine/bezier.ts     AE-style speed/influence Bézier keyframes
src/art/procedural.ts    original abstract geometry (calibration, grid)
src/audio/beats.ts       beat tracker (browser + Node)
preview/                 editor (Vite + @remotion/player)
server/render-server.ts  uploads, render queue, SSE progress, downloads
scripts/                 render, verify, analyze-audio, stills
public/brand/            official REAL assets (see SOURCES.md)
public/fonts/            Montserrat, Geist, Geist Mono (OFL)
```

Brand assets belong to Project Real. Remotion is free for individuals and small teams, but larger companies need a license (remotion.dev/license).
