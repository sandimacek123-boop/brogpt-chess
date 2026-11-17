# REAL — Spinning Crosshair Edit

A 15-second, 1080×1920, 60 fps spinning crosshair edit of **REAL** (the Roblox executor). It's built with Remotion and rendered frame by frame, so every frame comes out the same each time.

- Four panels in a 2×2 grid, split by thin white crosshair lines that cross exactly at the centre.
- **Blue panels are inverted:** the artwork gets a real negative, then a blue/white gradient map. They sit top-left and bottom-right.
- **Red panels are normal:** a black → red gradient map. They sit top-right and bottom-left.
- The whole composition rotates as one object, using After-Effects-style Bézier keyframes (speed + influence), overshoots and controlled settles.
- Motion blur comes from temporal supersampling: up to 64 sub-frames per frame, and the count follows the real angular velocity.
- Silent by default. There's an optional music track, and its beats can drive the impacts.

**Rendered deliverable:** `out/real-crosshair-silent.mp4` (H.264, 900 frames, no audio stream).

---

## Quick start

```bash
cd real-crosshair-edit
npm install

npm run preview        # preview + export UI → http://localhost:3000
npm run render         # → out/real-crosshair-silent.mp4
npm run verify         # QC report + contact sheet in out/qc/
```

Requirements: Node 18+ and `ffmpeg`/`ffprobe` on PATH (only `verify` and `analyze-audio` use them; rendering uses Remotion's bundled ffmpeg). Remotion downloads its own headless Chrome the first time you render. To use a Chrome you already have, set `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell`.

## Preview interface (`npm run preview`)

| Area | What it does |
| --- | --- |
| Transport | Play/pause (space), frame step (← / →, shift = 10), jump to start/end, timeline scrubber with section markers, loop |
| Motion | Spin speed (0.8–1.6×: spins get compressed toward their impact frame, so impacts stay on time), motion-blur intensity, max blur sub-frames, draft-blur toggle for smooth playback |
| Effects | Impact flashes, camera shake, chromatic aberration, palette guard |
| Colours | All 8 palette colours (4 blue for the inverted panels, 4 red for the normal panels) |
| REAL branding | Upload the official REAL logo. It's placed into the wordmark, emblem, UI and branding scenes |
| Artwork | 5 scenes (A, B, C, D, BRAND). For each one you can replace the artwork, pick split or repeated layout, set fit/blend/scale/offset, change the rays, and upload separate art for each of the 4 panels |
| Audio | Import MP3/WAV/M4A, enable/disable, song start offset, volume, beat-sync toggle. Beats are detected in the browser |
| Export | **Render silent MP4** / **Render MP4 with music**, with live progress (frames rendered), cancel and download. There's also *Download props JSON* for the CLI |

The preview runs the same `CrosshairEdit` component with the same timeline maths as the final render. The only preview-only option is *draft blur*, which caps the sub-frames so playback stays real-time.

There's also `npm run studio`, which opens Remotion Studio with the composition `RealCrosshair`.

## Rendering from the CLI

```bash
npm run render                                  # silent, no audio stream
npm run render -- --props real-crosshair-props.json   # settings/artwork exported from the preview
npm run render -- --frames 360-539 --out out/max-intensity.mp4   # partial render
npm run render -- --still 394                   # single PNG frame
```

Output settings: H.264, CRF 16, x264 `slow`, PNG frame capture, yuv420p, bt709. That's 1080×1920 at 60 fps, exactly 900 frames.

## Optional music: Montagem Mythical

The edit is silent by default and looks finished without audio. Nothing is downloaded, generated or added automatically. If you have a **legally obtained** copy of the track:

```bash
# analyse beats (optional – render:music does it automatically)
npm run analyze-audio -- public/audio/montagem-mythical.mp3

# renders BOTH out/real-crosshair-silent.mp4 and out/real-crosshair-music.mp4
npm run render:music -- --audio path/to/montagem-mythical.mp3 --offset 0
#   --offset <s>     where in the song the edit starts (e.g. at the drop)
#   --no-sync        keep the original timing instead of snapping impacts to beats
#   --skip-silent    only render the music version
```

How beat sync works: the analyser builds a log-spectral-flux onset envelope, estimates tempo, then tracks beats with dynamic programming. Every major impact (flash or zoom punch) moves to its nearest beat, and the timeline in between is time-warped piecewise-linearly. Rotations, zooms, flashes and artwork cuts all move together, so alignment is kept.

## Replacing the placeholder art

**The built-in artwork is placeholder art.** It's procedurally drawn in `src/art/placeholders.ts` and is not an official REAL logo. To swap it:

- **Preview UI:** use *REAL branding → Upload logo* and *Artwork → Replace artwork / per-panel upload*.
- **Code / CLI:** put files in `public/assets/` and point a scene at them in `src/config.ts` (or in a props JSON):
  ```ts
  {id: 'A', art: 'assets/real-key-art.png', layout: 'split', fit: 'contain', artScale: 1, ...}
  logo: 'assets/real-logo.png'
  ```

Every image is converted to luminance and gets both treatments automatically: a real inversion mapped to blue/white, and a red/black duotone. Silhouettes and edges are kept. Transparent PNGs look best. For a screenshot with a dark background, try `blend: 'lighten'`.

*Show "placeholder art" labels* stamps a visible label on the placeholder artwork if you need to flag it in a review.

## Timeline (60 fps)

| Time | Frames | What happens |
| --- | --- | --- |
| 0.00–2.00 | 0–119 | Black, then the crosshair lines draw out and an iris + rapid zoom (1.9→1.0) reveals the panels. First 90° CW turn with overshoot, impact at f78 |
| 2.00–4.00 | 120–239 | 180° CW, speeding up gradually, with a push toward the centre (zoom 1.0→1.17). Artwork cuts at peak speed (f240) |
| 4.00–6.00 | 240–359 | Decelerating 90° CW, then straight into a 270° CCW turn with overshoot. White impact flashes and a checkerboard-swap flash |
| 6.00–9.00 | 360–539 | Max intensity: 360° CW, then a sharp reverse 360° CCW, a 90° snap, 360° CCW, 180° CW. Peak ≈ 1500°/s, zoom bursts, camera drift, artwork cuts on the fastest frames |
| 9.00–11.50 | 540–689 | Slowdown. A radial-mask wipe reveals REAL branding in all four panels, then a slow 90° turn with internal art movement |
| 11.50–13.50 | 690–809 | Build-up: 270° CW that keeps getting faster, zoom 1.07→1.24, rising shake |
| 13.50–15.00 | 810–899 | Final 360° spin, smooth deceleration, snaps to 720° (≡ 0°) on the opening artwork, so it loops cleanly |

Keyframes live in `src/engine/timeline.ts` (`ROT_KEYS`, `SCALE_KEYS`, `IMPACTS`, `SWITCHES`).

## QC (`npm run verify`)

`verify` checks the rendered file directly:

- **File basics:** codec, 1080×1920, 60/1 fps, exactly 900 decoded frames, 15.000 s, and no audio stream on the silent version.
- **Off-palette pixels:** scans every frame for green or purple pixels.
- **Rest frames:** the white crosshair is centred and the diagonal blue/red checkerboard is correct.
- **Corners:** proves analytically that no corner is ever exposed, across every frame and the whole blur shutter span.
- **Loop point:** the edit ends aligned on the opening layout.

It also writes stills and a contact sheet to `out/qc/`.

## Project layout

```
src/
  config.ts              props, palette, scenes, defaults
  CrosshairEdit.tsx      Remotion component (canvas renderer + optional <Audio>)
  Root.tsx, index.ts     composition registration (RealCrosshair, 1080×1920, 60 fps, 900 frames)
  engine/bezier.ts       AE-style speed/influence Bézier keyframes, cubic-bezier easing
  engine/timeline.ts     choreography, impacts, artwork switches, spin-speed mapping, beat warp
  engine/render.ts       composition build, temporal-supersampled motion blur, CA, palette guard, flash
  engine/color.ts        gradient maps (invert→blue, red duotone), palette guard
  engine/assets.ts       font/image loading, per-tab cached treatments
  art/placeholders.ts    PLACEHOLDER artwork (wordmark, executor UI, emblem, code, brand tile)
  audio/beats.ts         beat tracker (browser + Node)
preview/                 Vite + @remotion/player preview UI
server/render-server.ts  preview server: uploads, render queue, SSE progress, downloads
scripts/                 render, render-core, analyze-audio, verify, stills
public/fonts/            Anton + JetBrains Mono (OFL)
```

Remotion is free for individuals and small teams. Companies above Remotion's size limit need a company license (see remotion.dev/license).
