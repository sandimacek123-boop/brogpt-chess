// The edit's choreography. Everything is a pure function of the frame number,
// so every frame renders deterministically in any tab / any order.
//
// Angles are cumulative degrees, clockwise positive (canvas rotation).
// Because the 4 panels are a checkerboard, every 90° turn swaps which screen
// quadrant is blue – exactly like the trend. Rest angles that are multiples of
// 360° show the reference layout (blue TL/BR, red TR/BL).

import {FPS, DURATION_FRAMES, type EditProps, type SceneId} from '../config';
import {clamp, cubicBezier, easeOutExpo, makeCurve, smoothstep, type Curve, type Key} from './bezier';

// ---------------------------------------------------------------------------
// Rotation: AE-style keyframes (frame, angle, speed°/frame, influences)
// ---------------------------------------------------------------------------

type Group = {start: number; anchor: number; end: number};

/** Spin "moves". spinSpeed compresses each move toward its anchor (impact) frame. */
const GROUPS: Group[] = [
  {start: 56, anchor: 78, end: 100}, // 0–2 s   first 90° CW + overshoot
  {start: 120, anchor: 240, end: 262}, // 2–4.4 s 180° CW accelerating → 90° CW stop
  {start: 264, anchor: 306, end: 328}, // 4.4–5.5 s 270° CCW + overshoot
  {start: 360, anchor: 394, end: 426}, // 6–7.1 s  360° CW → sharp reverse 360° CCW
  {start: 432, anchor: 448, end: 448}, // 90° CW snap
  {start: 456, anchor: 488, end: 488}, // 360° CCW
  {start: 494, anchor: 516, end: 536}, // 180° CW + overshoot
  {start: 690, anchor: 810, end: 866}, // 11.5–14.4 s build-up → final 360°
];

const ROT_KEYS: Key[] = [
  {f: 0, v: 0},
  // --- 0.00–2.00 intro: first 90° with overshoot + settle
  {f: 56, v: 0, s: 0, o: 0.72},
  {f: 78, v: 90, s: 2.6, i: 0.32, o: 0.3},
  {f: 85, v: 95.5, s: 0, i: 0.5, o: 0.5},
  {f: 100, v: 90, s: 0, i: 0.6},
  // --- 2.00–4.00 first spin: 180° CW, gradually faster (peak speed at 4.00 s)
  {f: 120, v: 90, s: 0, o: 0.62},
  {f: 240, v: 270, s: 6.8, i: 0.16, o: 0.34},
  // --- 4.00–6.00: 90° CW (decelerating out of the spin) → 270° CCW
  {f: 262, v: 360, s: 0, i: 0.62},
  {f: 264, v: 360, s: 0, o: 0.6},
  {f: 306, v: 90, s: -2.4, i: 0.3, o: 0.25},
  {f: 313, v: 85.5, s: 0, i: 0.5, o: 0.5},
  {f: 328, v: 90, s: 0, i: 0.6},
  // --- 6.00–9.00 maximum intensity
  {f: 360, v: 90, s: 0, o: 0.55},
  {f: 394, v: 450, s: 0, i: 0.55, o: 0.5}, // full 360° CW, then reverse sharply
  {f: 426, v: 90, s: 0, i: 0.6}, // 360° CCW
  {f: 432, v: 90, s: 0, o: 0.7},
  {f: 448, v: 180, s: 0, i: 0.7}, // 90° CW snap
  {f: 456, v: 180, s: 0, o: 0.55},
  {f: 488, v: -180, s: 0, i: 0.55}, // 360° CCW
  {f: 494, v: -180, s: 0, o: 0.55},
  {f: 516, v: 0, s: 3, i: 0.25, o: 0.23}, // 180° CW back to 0° + overshoot
  {f: 523, v: 5, s: 0, i: 0.5, o: 0.5},
  {f: 536, v: 0, s: 0, i: 0.6},
  // --- 9.00–11.50 slowdown (REAL branding reveal, upright at 0°)
  {f: 548, v: 0, s: 0, o: 0.45},
  {f: 684, v: 90, s: 0, i: 0.45},
  // --- 11.50–13.50 build-up: 270° clockwise, accelerating → 13.50–15.00 final 360°
  {f: 690, v: 90, s: 0, o: 0.55},
  {f: 810, v: 360, s: 7.5, i: 0.2, o: 0.33},
  {f: 866, v: 720, s: 0, i: 0.58}, // snap: 720° ≡ 0° → same layout as the opening
  {f: DURATION_FRAMES, v: 720},
];

// ---------------------------------------------------------------------------
// Camera zoom (base curve). Impact punches are added on top.
// ---------------------------------------------------------------------------
const SCALE_KEYS: Key[] = [
  {f: 0, v: 1.9},
  {f: 14, v: 1.9, s: -0.1, o: 0.25}, // rapid zoom reveal
  {f: 44, v: 1.0, s: 0, i: 0.7},
  {f: 120, v: 1.0, s: 0, o: 0.7},
  {f: 240, v: 1.17, sIn: 0.0035, s: -0.012, i: 0.2, o: 0.3}, // push toward the centre
  {f: 268, v: 1.0, s: 0, i: 0.6},
  {f: 548, v: 1.0, s: 0, o: 0.5},
  {f: 684, v: 1.07, s: 0, i: 0.5},
  {f: 690, v: 1.07, s: 0, o: 0.55},
  {f: 810, v: 1.24, sIn: 0.0028, s: -0.006, i: 0.15, o: 0.35},
  {f: 866, v: 1.0, s: 0, i: 0.6},
  {f: DURATION_FRAMES, v: 1.0},
];

// ---------------------------------------------------------------------------
// Impacts: flash, zoom punch, shake, chromatic aberration, checkerboard swap
// ---------------------------------------------------------------------------
type Impact = {f: number; flash?: number; punch?: number; shake?: number; ca?: number; swap?: number};

const IMPACTS: Impact[] = [
  {f: 40, flash: 0.22, shake: 0.35},
  {f: 78, flash: 0.55, punch: 0.07, shake: 1, ca: 0.8},
  {f: 240, flash: 0.7, shake: 0.8, ca: 1},
  {f: 262, flash: 0.35, punch: 0.05, shake: 0.6, swap: 3},
  {f: 306, flash: 0.6, punch: 0.08, shake: 1, ca: 0.8},
  {f: 394, flash: 0.7, punch: 0.12, shake: 1.2, ca: 1, swap: 2},
  {f: 426, flash: 0.4, punch: 0.06, shake: 0.7},
  {f: 448, flash: 0.45, punch: 0.08, shake: 0.8, swap: 2},
  {f: 488, flash: 0.5, punch: 0.1, shake: 1, ca: 0.8},
  {f: 516, flash: 0.6, punch: 0.1, shake: 1, ca: 0.8},
  {f: 548, flash: 0.5, punch: 0.05, shake: 0.4},
  {f: 810, flash: 0.2, ca: 0.8},
  {f: 866, flash: 0.75, punch: 0.07, shake: 0.9, ca: 0.8},
];

/** Artwork changes. `peak` = cut on the fastest frame inside the window (hidden by blur). */
type Switch = {f: number; scene: SceneId; peak?: [number, number]; wipe?: number};
const SWITCHES: Switch[] = [
  {f: 0, scene: 'A'},
  {f: 240, scene: 'B'},
  {f: 285, scene: 'C', peak: [270, 300]},
  {f: 377, scene: 'D', peak: [362, 392]},
  {f: 410, scene: 'A', peak: [396, 424]},
  {f: 472, scene: 'B', peak: [458, 486]},
  {f: 505, scene: 'C', peak: [496, 514]},
  {f: 548, scene: 'BRAND', wipe: 26},
  {f: 826, scene: 'A', peak: [812, 860]},
];

export const SECTIONS = [
  {f: 0, label: 'Intro'},
  {f: 120, label: 'First spin'},
  {f: 240, label: 'Acceleration'},
  {f: 360, label: 'Max intensity'},
  {f: 540, label: 'Slowdown'},
  {f: 690, label: 'Build-up'},
  {f: 810, label: 'Final spin'},
];

// ---------------------------------------------------------------------------

export type CameraSample = {angle: number; scale: number; dx: number; dy: number};

export type FrameState = {
  /** timeline frame after beat-warp (fractional) */
  t: number;
  camera: CameraSample;
  /** deg / frame */
  omega: number;
  flash: number;
  ca: number;
  swap: boolean;
  scene: SceneId;
  prevScene: SceneId | null;
  wipe: number; // 0..1 radial wipe progress from prevScene → scene (1 = done)
  sceneTime: number; // seconds since the scene became active
  linesGrow: number; // 0..1 crosshair line reveal
  iris: number; // 0..1 panel reveal
  brandPhase: number; // 0..1 progress through the slowdown section
};

// --- deterministic smooth noise for camera shake --------------------------------
const noise1 = (t: number, seed: number) =>
  Math.sin(t * 0.91 + seed * 1.7) * 0.5 +
  Math.sin(t * 2.13 + seed * 4.1) * 0.3 +
  Math.sin(t * 4.71 + seed * 2.9) * 0.2;

// --- speed mapping ---------------------------------------------------------------
const makeSpeedMap = (speed: number) => {
  const s = clamp(speed, 0.8, 1.6);
  const spans = GROUPS.map((g, idx) => {
    const prev = GROUPS[idx - 1];
    const next = GROUPS[idx + 1];
    const limitLeft = prev ? (prev.end + g.start) / 2 : 0;
    const limitRight = next ? (g.end + next.start) / 2 : DURATION_FRAMES;
    const pre = g.anchor - g.start;
    const post = g.end - g.anchor;
    // when slowing down, don't expand into the neighbour's half of the gap
    const sPre = pre > 0 ? Math.max(s, pre / Math.max(1, g.anchor - limitLeft)) : s;
    const sPost = post > 0 ? Math.max(s, post / Math.max(1, limitRight - g.anchor)) : s;
    return {...g, sPre, sPost};
  });
  return (t: number) => {
    for (const g of spans) {
      if (t >= g.start && t <= g.end) {
        return t <= g.anchor ? g.anchor - (g.anchor - t) / g.sPre : g.anchor + (t - g.anchor) / g.sPost;
      }
    }
    return t;
  };
};

const mapKeys = (keys: Key[], m: (t: number) => number, speed: number, scaleSpeeds: boolean): Key[] => {
  const s = clamp(speed, 0.8, 1.6);
  return keys.map((k) => ({
    ...k,
    f: m(k.f),
    s: k.s !== undefined && scaleSpeeds ? k.s * s : k.s,
    sIn: k.sIn !== undefined && scaleSpeeds ? k.sIn * s : k.sIn,
  }));
};

// --- beat warp -------------------------------------------------------------------
/** Piecewise-linear output-frame → timeline-frame map that lands impacts on beats. */
const makeBeatWarp = (anchors: number[], beatsSec: number[], startOffset: number) => {
  const beatFrames = beatsSec
    .map((b) => (b - startOffset) * FPS)
    .filter((b) => b > 4 && b < DURATION_FRAMES - 4)
    .sort((a, b) => a - b);
  if (beatFrames.length === 0) return (f: number) => f;
  const pairs: Array<[number, number]> = [[0, 0]]; // [outputFrame, timelineFrame]
  const TOL = 16; // ≈ half a beat at 112 BPM
  for (const a of [...anchors].sort((x, y) => x - y)) {
    let best = -1;
    let bestD = Infinity;
    for (const b of beatFrames) {
      const d = Math.abs(b - a);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (bestD > TOL) continue;
    const last = pairs[pairs.length - 1];
    // keep it monotonic and avoid crushing segments
    if (best - last[0] < 6 || a - last[1] < 6) continue;
    pairs.push([best, a]);
  }
  pairs.push([DURATION_FRAMES, DURATION_FRAMES]);
  return (f: number) => {
    if (f <= 0) return f;
    if (f >= DURATION_FRAMES) return f;
    for (let k = 0; k < pairs.length - 1; k++) {
      const [o0, t0] = pairs[k];
      const [o1, t1] = pairs[k + 1];
      if (f >= o0 && f <= o1) return t0 + ((f - o0) / (o1 - o0)) * (t1 - t0);
    }
    return f;
  };
};

const linesEase = easeOutExpo;
const irisEase = cubicBezier(0.7, 0, 0.18, 1);

export type Timeline = {
  rotation: Curve;
  scale: Curve;
  warp: (f: number) => number;
  impacts: Impact[];
  switches: Array<{f: number; scene: SceneId; wipe: number}>;
  camera: (t: number) => CameraSample;
  state: (outputFrame: number) => FrameState;
};

export const buildTimeline = (props: Pick<EditProps, 'spinSpeed' | 'shakeIntensity' | 'audio'>): Timeline => {
  const speed = props.spinSpeed ?? 1;
  const m = makeSpeedMap(speed);
  const rotation = makeCurve(mapKeys(ROT_KEYS, m, speed, true));
  const scale = makeCurve(mapKeys(SCALE_KEYS, m, speed, true));
  const impacts = IMPACTS.map((e) => ({...e, f: m(e.f)}));

  // scene switches: cut on the peak angular velocity inside the window
  const switches = SWITCHES.map((sw) => {
    let f = m(sw.f);
    if (sw.peak) {
      const [a, b] = [m(sw.peak[0]), m(sw.peak[1])];
      let best = f;
      let bestV = -1;
      for (let x = Math.ceil(a); x <= Math.floor(b); x++) {
        const v = Math.abs(rotation.vel(x));
        if (v > bestV) {
          bestV = v;
          best = x;
        }
      }
      f = best;
    }
    return {f: Math.round(f), scene: sw.scene, wipe: sw.wipe ?? 0};
  });

  const audio = props.audio;
  const warp =
    audio && audio.enabled && audio.src && audio.beatSync && audio.beats && audio.beats.length > 0
      ? makeBeatWarp(
          impacts.filter((e) => (e.flash ?? 0) >= 0.3 || (e.punch ?? 0) > 0).map((e) => e.f),
          audio.beats,
          audio.startOffset ?? 0,
        )
      : (f: number) => f;

  const shakeAmt = 30 * (props.shakeIntensity ?? 1);

  const camera = (t: number): CameraSample => {
    let punch = 0;
    let sx = 0;
    let sy = 0;
    for (const e of impacts) {
      const d = t - e.f;
      if (e.punch) {
        if (d >= -2 && d < 0) punch += e.punch * smoothstep(-2, 0, d);
        else if (d >= 0 && d < 16) punch += e.punch * Math.pow(1 - d / 16, 3);
      }
      if (e.shake && d >= 0 && d < 20) {
        const env = Math.pow(1 - d / 20, 2) * e.shake;
        sx += env * noise1(t * 1.9, e.f);
        sy += env * noise1(t * 1.9, e.f + 13.37);
      }
    }
    // controlled camera drift in the max-intensity section
    const drift = smoothstep(360, 380, t) * (1 - smoothstep(515, 540, t));
    sx += drift * 0.45 * Math.sin((t / FPS) * 2.4);
    sy += drift * 0.35 * Math.sin((t / FPS) * 1.7 + 1.2);
    // rising tension during the build-up
    const build = smoothstep(700, 805, t) * (1 - smoothstep(810, 840, t));
    sx += build * 0.4 * noise1(t * 2.6, 99);
    sy += build * 0.4 * noise1(t * 2.6, 199);

    let dx = sx * shakeAmt;
    let dy = sy * shakeAmt;
    const mag = Math.hypot(dx, dy);
    const MAX = 64; // keeps the corners covered (comp half-size 1200 > 1101.5 + 64)
    if (mag > MAX) {
      dx *= MAX / mag;
      dy *= MAX / mag;
    }
    return {angle: rotation.at(t), scale: Math.max(scale.at(t) + punch, t < 44 ? 0 : 1), dx, dy};
  };

  const state = (outputFrame: number): FrameState => {
    const t = warp(outputFrame);
    const omega = rotation.vel(t);

    let flash = 0;
    let ca = 0;
    let swap = false;
    for (const e of impacts) {
      const d = t - e.f;
      if (e.flash && d >= 0 && d < 8) flash += e.flash * Math.pow(1 - d / 8, 2.2);
      if (e.ca && d >= 0 && d < 12) ca += e.ca * Math.pow(1 - d / 12, 2);
      if (e.swap && d >= 0 && d < e.swap) swap = true;
    }
    ca += clamp(Math.abs(omega) / 22, 0, 1) * 0.55;

    let idx = 0;
    for (let k = 0; k < switches.length; k++) if (t >= switches[k].f) idx = k;
    const sw = switches[idx];
    const prev = idx > 0 ? switches[idx - 1] : null;
    const wipe = sw.wipe > 0 ? clamp((t - sw.f) / sw.wipe, 0, 1) : 1;

    return {
      t,
      camera: camera(t),
      omega,
      flash: clamp(flash, 0, 1),
      ca: clamp(ca, 0, 1.5),
      swap,
      scene: sw.scene,
      prevScene: prev ? prev.scene : null,
      wipe,
      sceneTime: (t - sw.f) / FPS,
      linesGrow: linesEase(clamp((t - 5) / 19, 0, 1)),
      iris: irisEase(clamp((t - 14) / 26, 0, 1)),
      brandPhase: clamp((t - m(548)) / (m(690) - m(548)), 0, 1),
    };
  };

  return {rotation, scale, warp, impacts, switches, camera, state};
};
