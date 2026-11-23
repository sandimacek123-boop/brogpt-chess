# Michael: a Slovenian beekeeper's life

A 96-second illustrated short about Michael (1945–2024), who grew up in a village under Triglav and kept bees until he was 79. Built with Remotion: 1920×1080, 30 fps, H.264 with an original soundtrack.

**Final export:** `out/Michael_Slovenian_Beekeeper.mp4`

## Chapters

| Time | Year (age) | Chapter |
| --- | --- | --- |
| 0:00 | | Title: dawn over Triglav, a bee flies in |
| 0:08 | 1945 (0) | Born in a village in Gorenjska: houses with geranium balconies, a kozolec, the church on the hill |
| 0:16 | 1952 (7) | His dedek's čebelnjak with painted hive fronts. First honeycomb. The kranjska čebela (Carniolan bee) |
| 0:26 | 1964 (19) | Lake Bled: pletna boat, the island church, the castle on the cliff |
| 0:34 | 1970 (25) | Marries Marija, church bells, cherry blossoms |
| 0:42 | 1976 (31) | Builds his own bee house: 20 hives, hand-painted panjske končnice, honey jars |
| 0:52 | 1991 (46) | 25 June 1991, independence: fireworks, the Slovenian flag goes up |
| 1:00 | 2005 (60) | Teaching his grandkids at the hives |
| 1:08 | 2018 (73) | The first World Bee Day (20 May, Anton Janša's birthday, a Slovenian initiative) |
| 1:16 | 2024 (79) | His last autumn evening by the hives |
| 1:26 | | Outro: "čebelar · dedek · Slovenec" |

The year/age counter and the life timeline at the bottom tick forward between chapters. Four transitions are honeycomb wipes.

## Soundtrack

`scripts/music.py` synthesises the music from scratch with numpy. No samples are used and nothing is downloaded. It's a gentle waltz in G, 90 BPM in 3/4, so one bar is 2 s (60 frames) and every chapter starts on a downbeat. Instruments: a musette accordion, a music box, a plucked-guitar oom-pah-pah, strings, wedding bells and a hum of bees at the hives.

## Run it

```bash
cd michael-beekeeper
npm install
npm run music                                 # → public/music.wav (already committed)
npm run studio                                # live preview
npm run render                                # → out/Michael_Slovenian_Beekeeper.mp4
node scripts/stills.mjs 400 900 1500          # QC stills → out/stills/
```

On machines with a preinstalled headless Chrome, set `REMOTION_BROWSER_EXECUTABLE`. Otherwise Remotion downloads its own.

## Files

- `src/lib.tsx`: drawing primitives (Triglav, ridges, houses, church, kozolec, čebelnjak, painted hive fronts, bees, figures, honeycomb grid)
- `src/scenes.tsx`: the 11 chapters
- `src/Video.tsx`: timeline, captions, year counter, life timeline, transitions, grain, audio
