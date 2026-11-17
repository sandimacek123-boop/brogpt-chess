// Timeline for the fact-file section (its own 15 s composition).
// It implements the same Timeline interface as the first edit, so the existing
// layered renderer draws it: the crosshair snaps 90° on every fact, the rings
// turn slowly under the text, and a text overlay is drawn on top.

import {clamp, makeCurve, smoothstep, type Key} from '../engine/bezier';
import {RING_SPECS, STREAKS} from '../engine/rings';
import type {CameraSample, FrameState, LogoState, Timeline} from '../engine/timeline';
import {BEAT_FRAMES, FACT_BEATS, FACTS_FRAMES} from './content';
import {drawFactsOverlay} from './overlay';

const LAST_BEAT = FACT_BEATS.length - 1;
const beatOf = (f: number) => clamp(Math.floor(f / BEAT_FRAMES), 0, LAST_BEAT);

/** panel angle per beat: 0°, 90°, … 720° (≡ 0°, so the section ends on the blue-TL/BR layout) */
const angleOfBeat = (k: number) => Math.min(k, 8) * 90;

const keys: Key[] = [{f: 0, v: 0}];
for (let k = 1; k <= 8; k++) {
  // each snap eases in/out over 16 frames, then holds for the rest of the beat
  keys.push({f: k * BEAT_FRAMES, v: angleOfBeat(k - 1), s: 0, o: 0.3});
  keys.push({f: k * BEAT_FRAMES + 16, v: angleOfBeat(k), s: 0, i: 0.3});
}
keys.push({f: FACTS_FRAMES, v: angleOfBeat(8)});

const LOGO_OFF: LogoState = {
  iconAlpha: 0,
  iconScale: 1,
  wordAlpha: 0,
  wordScale: 1,
  tracking: 0.1,
  execAlpha: 0,
  projAlpha: 0,
  scale: 1,
  offsetY: 0,
  plateAlpha: 0,
  urlAlpha: [0, 0],
  glow: 0,
};

export const buildFactsTimeline = (): Timeline => {
  const rotation = makeCurve(keys);
  const zoom = makeCurve([
    {f: 0, v: 1},
    {f: FACTS_FRAMES, v: 1},
  ]);

  const camera = (t: number): CameraSample => {
    const b = beatOf(t);
    const lt = t - b * BEAT_FRAMES;
    const punch = 0.06 * Math.exp(-Math.max(0, lt) / 6); // cut punch
    const dolly = 1.02 + 0.035 * (lt / BEAT_FRAMES); // slow push within each fact
    const amp = 16 * Math.exp(-Math.max(0, lt) / 9); // decaying shake
    return {
      angle: rotation.at(t),
      scale: dolly + punch,
      dx: amp * Math.sin(t * 1.7 + b),
      dy: amp * Math.cos(t * 2.1 + b * 0.5),
    };
  };

  const ringAngle = (i: number, t: number) => {
    const s = RING_SPECS[i];
    return s.home + s.dir * s.speed * 0.25 * t;
  };
  const streakAngle = (i: number, t: number) => {
    const s = STREAKS[i];
    return s.phase + s.dir * s.speed * 0.4 * t;
  };

  const state = (frame: number): FrameState => {
    const f = clamp(frame, 0, FACTS_FRAMES - 1);
    const b = beatOf(f);
    const lt = f - b * BEAT_FRAMES;
    const beat = FACT_BEATS[b];
    const cutFlash = lt < 24 ? Math.exp(-lt / 5) : 0;
    return {
      t: f,
      camera: camera(f),
      omega: rotation.vel(f),
      flash: 0.28 * cutFlash,
      blueFlash: b === 0 ? 0.35 * Math.exp(-lt / 14) : 0,
      ca: 0.12 + 0.55 * Math.exp(-lt / 9),
      swap: false,
      scene: beat.scene,
      prevScene: b > 0 ? FACT_BEATS[b - 1].scene : null,
      wipe: 1,
      panelsIris: 1,
      panelsAlpha: 0.72,
      linesGrow: 1,
      brandPhase: 0,
      ringsSweep: RING_SPECS.map(() => 1),
      ringsAlpha: 0.7,
      ringsZoom: 1,
      streakAlpha: 0.5,
      bursts: lt < 16 ? [{age: lt, strength: 0.7, seed: b}] : [],
      shocks: b > 0 && lt < 34 ? [{age: lt, strength: 0.8, seed: b}] : [],
      grade: {
        contrast: 1.1,
        brightness: 0.8 * (1 - 0.1 * smoothstep(FACTS_FRAMES - 30, FACTS_FRAMES - 1, f)),
        saturate: 0.95,
        vignette: 0.6,
      },
      bgWave: 0.35,
      logo: LOGO_OFF,
      collapse: 0,
      overlay: (ctx, extra) => drawFactsOverlay(ctx, extra.frame, extra),
    };
  };

  return {
    rotation,
    zoom,
    warp: (f: number) => f,
    impacts: [],
    switches: [],
    camera,
    ringAngle,
    streakAngle,
    state,
    lockFrame: 0,
    revealFrame: 0,
  };
};
