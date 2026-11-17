// "REAL: INFINITE" – a 15 s edit built directly on the song's beat grid.
// Sections are counted in beats, so every cut lands on a beat by construction:
//   beats 0-3   intro: terminal "injects" real.exe, INJECTED slam on beat 3
//   beats 4-9   infinite crosshair tunnel (zooms one and a half levels per beat)
//   beats 10-17 kinetic type, one word per beat
//   beats 18-21 rings spin in and lock, the logo drops in
//   beat 22+    end card, glitch-out

import {FPS} from '../config';

export const INSANE_COMPOSITION_ID = 'RealInsane';
export const INSANE_FRAMES = 900;

export type Section = 'intro' | 'tunnel' | 'type' | 'logo' | 'end';

export type BeatInfo = {
  i: number; // index of the last beat at or before t (-1 before the first beat)
  lt: number; // frames since that beat
  len: number; // frames until the next beat
  sec: Section;
};

export type InsaneTimeline = {
  beats: number[]; // beat frames inside the edit
  bounds: {tunnel: number; type: number; logo: number; end: number};
  at: (t: number) => BeatInfo;
};

export const buildInsaneTimeline = (opts: {beats: number[] | null; startOffset: number}): InsaneTimeline => {
  let beats = (opts.beats ?? [])
    .map((b) => (b - opts.startOffset) * FPS)
    .filter((f) => f >= 0 && f < INSANE_FRAMES - 2)
    .sort((a, b) => a - b);
  // fallback grid (97 BPM) when no track is supplied
  if (beats.length < 23) beats = Array.from({length: 25}, (_, k) => 8 + k * 37.1);

  const b = (k: number) => beats[Math.min(k, beats.length - 1)];
  const bounds = {tunnel: b(4), type: b(10), logo: b(18), end: b(22)};

  const at = (t: number): BeatInfo => {
    let i = -1;
    for (let k = 0; k < beats.length; k++) if (beats[k] <= t) i = k;
    const prev = i >= 0 ? beats[i] : 0;
    const next = i + 1 < beats.length ? beats[i + 1] : INSANE_FRAMES;
    const sec: Section = t < bounds.tunnel ? 'intro' : t < bounds.type ? 'tunnel' : t < bounds.logo ? 'type' : t < bounds.end ? 'logo' : 'end';
    return {i, lt: t - prev, len: Math.max(1, next - prev), sec};
  };

  return {beats, bounds, at};
};
