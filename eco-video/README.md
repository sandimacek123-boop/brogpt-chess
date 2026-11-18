# Človek in narava — 150 s eco video (made with code)

The whole video is code: `index.html` draws every frame on a 1280×720 canvas
(`renderAt(t)` is a pure function of time), and `render.js` captures the frames
with Playwright and pipes them into ffmpeg.

## Make the video

```bash
cd eco-video
node render.js eko-video.mp4          # full video, 30 fps, H.264
node render.js --stills ./stills 10 60 120   # optional: PNG stills at given seconds
```

Needs `playwright` (Chromium) and `ffmpeg` on PATH.

## Storyboard

| # | time (s) | scene |
|---|---|---|
| 00 | 0–7 | intro: sunrise over the forest |
| 01 | 7–21 | cutting forests (harvester, tree count goes down) |
| 02 | 21–34 | cities and roads grow on the land |
| 03 | 34–47 | deforested slope loses soil, rain, landslide into the river |
| 04 | 47–61 | factory pollution: river turns brown, fish flee, plastic in the sea |
| 05 | 61–70 | invasive species spread and replace native plants |
| 06 | 70–80 | road blocks frogs from reaching the pond |
| 07 | 80–90 | choosing the route with the least damage |
| 08 | 90–101 | overpass (nadhod) and underpass (podhod) for animals |
| 09 | 101–108 | planting trees |
| 10 | 108–114 | cleaning rivers and the sea |
| 11 | 114–121 | filters in factory chimneys |
| 12 | 121–127 | protecting animals |
| 13 | 127–139 | people carry frogs in buckets across the road to the pond |
| 14 | 139–150 | nature comes back, closing message |

Scene lengths live in the `SCENES` array at the bottom of `index.html`.
