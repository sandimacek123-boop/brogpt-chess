# Miha: a Slovenian beekeeper's life

A 2-minute illustrated short about Miha (1945–2024). He grew up in a village under Triglav and kept bees until he was 79. The whole film is in Slovenian: captions, titles and the year/age counter (with proper plurals: 1 leto, 2 leti, 3 leta, 5 let). It's built with Remotion and exported in 4K (3840×2160) at 60 fps, H.264, with an original soundtrack and sound design. The scenes are authored at 1920×1080 in 30 fps time, then rendered at 2× scale with sub-frames for smooth 60 fps motion.

**Final export:** `out/Miha_Slovenian_Beekeeper.mp4`. It's a two-pass encode of the local 4K master, sized to fit under GitHub's 100 MB limit.

## Chapters

| Time | Year (age) | Chapter |
| --- | --- | --- |
| 0:00 | | Title: dawn over Triglav, a bee flies in |
| 0:08 | 1945 (0) | Born in a village in Gorenjska: geranium balconies, a kozolec, the church on the hill |
| 0:16 | 1952 (7) | His dedek's čebelnjak with painted hive fronts. First honeycomb. The kranjska čebela |
| 0:26 | 1960 (15) | Planica with his father: a ski jumper flies, the crowd cheers, snow falls |
| 0:34 | 1964 (19) | Lake Bled: pletna boat, swans, the island church, the castle on the cliff |
| 0:42 | 1970 (25) | Marries Marija: church bells, cherry blossoms, doves |
| 0:50 | 1973 (28) | Daughter Ana is born, and Miha plants a lipa (linden tree) for her |
| 0:58 | 1976 (31) | Builds his own bee house: 20 hives, hand-painted panjske končnice, honey jars |
| 1:08 | 1985 (40) | Selling *med* at the Ljubljana market: castle, Franciscan church, the bridge, pigeons |
| 1:16 | 1991 (46) | 25 June 1991, independence: fireworks, the Slovenian flag goes up |
| 1:24 | 2005 (60) | Teaching his grandkids at the hives |
| 1:32 | 2018 (73) | The first World Bee Day (20 May, Anton Janša's birthday, a Slovenian initiative) |
| 1:40 | 2020 (75) | Golden anniversary: the whole family at a table under Ana's lipa |
| 1:48 | 2024 (79) | His last autumn evening by the hives |
| 1:58 | | Outro: "čebelar · dedek · Slovenec" |

As the film moves between chapters, the year/age counter ticks forward and so does the life timeline at the bottom. Four of the transitions are honeycomb wipes. To keep the world alive, every face has eyes with catchlights and a smile, and blinks on its own rhythm (sometimes twice in a row). People cast shadows, the fairy lights at the golden wedding twinkle in a chase, fireflies blink on Miha's last evening, clouds and birds drift past, and grass and trees sway. There are also butterflies, swans, pigeons and a walking market crowd. For polish, the mountains are shaded and snow-capped, out-of-focus bokeh drifts across sunny shots, the camera floats slowly like it's handheld, and captions write on word by word.

## Soundtrack

`scripts/music.py` synthesises the music from scratch with numpy. No samples are used and nothing is downloaded. It's a gentle waltz in G, 90 BPM in 3/4. One bar is 2 s (64 bars = 128 s), so every chapter starts on a downbeat. Instruments: a musette accordion, a music box, a plucked-guitar oom-pah-pah, strings, wedding bells and a hum of bees at the hives.

The sound design is synthesised the same way, all timed to the picture: birdsong in the daytime scenes, mountain wind, the Planica crowd and a ski whoosh, market chatter, and fireworks booms that match each burst in 1991.

## Run it

```bash
cd miha-beekeeper
npm install
npm run music                                 # → public/music.wav (already committed)
npm run studio                                # live preview
npm run render                                # 4K master → out/Miha_Slovenian_Beekeeper.mp4 (<100 MB)
node scripts/stills.mjs 800 1800 4360         # QC stills (60 fps frame numbers) → out/stills/
```

On machines with a preinstalled headless Chrome, set `REMOTION_BROWSER_EXECUTABLE`. Otherwise Remotion downloads its own.

## Files

- `src/lib.tsx`: drawing primitives (Triglav, ridges, houses, church, kozolec, čebelnjak, painted hive fronts, bees, figures, clouds, birds, grass, butterflies, honeycomb grid)
- `src/scenes.tsx`: the 15 chapters
- `src/Video.tsx`: timeline, captions, year counter, life timeline, transitions, grain, audio
