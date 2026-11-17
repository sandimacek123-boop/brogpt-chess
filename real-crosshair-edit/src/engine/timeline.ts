// The edit's choreography. Everything is a pure function of the frame number,
// so every frame renders deterministically in any tab / any order.
//
// Panel angle: cumulative degrees, clockwise positive, AE-style Bézier keys
// (position AND velocity continuous – every key's in/out speed matches).
// Ring angles: θ(t) = θ₀ + dir·ω·∫E(τ)dτ, where E is a smooth energy envelope,
// integrated numerically; a smootherstep correction lands every ring exactly
// on its rest orientation at the lock frame (precision alignment).

import {DURATION_FRAMES, FPS, type EditProps, type SceneId} from '../config';
import {clamp, cubicBezier, easeOutExpo, makeCurve, smoothstep, type Curve, type Key} from './bezier';
import {RING_SPECS, STREAKS, ringPeriod} from './rings';

// ---------------------------------------------------------------------------
// Sections (seconds per the creative brief)
// ---------------------------------------------------------------------------
export const SECTIONS = [
  {f: 0, label: 'Intro'},
  {f: 90, label: 'Initial rotation'},
  {f: 210, label: 'Acceleration'},
  {f: 360, label: 'Max intensity'},
  {f: 540, label: 'Slowdown'},
  {f: 690, label: 'Brand reveal'},
  {f: 810, label: 'Outro'},
];

export const LOCK_FRAME = 694; // panels + rings aligned
export const REVEAL_FRAME = 696; // central impact

// ---------------------------------------------------------------------------
// Panel rotation keys
// ---------------------------------------------------------------------------
type Group = {start: number; anchor: number; end: number};
const GROUPS: Group[] = [
  {start: 128, anchor: 154, end: 174},
  {start: 180, anchor: 204, end: 204},
  {start: 212, anchor: 262, end: 284},
  {start: 290, anchor: 330, end: 350},
  {start: 360, anchor: 392, end: 422},
  {start: 428, anchor: 446, end: 446},
  {start: 452, anchor: 482, end: 482},
  {start: 488, anchor: 520, end: 520},
];

const ROT_KEYS: Key[] = [
  {f: 0, v: 0},
  // 1.50–3.50 initial rotation: 90° CW with overshoot, 90° CCW home
  {f: 128, v: 0, s: 0, o: 0.62},
  {f: 154, v: 90, s: 2.4, i: 0.32, o: 0.28},
  {f: 161, v: 95, s: 0, i: 0.5, o: 0.5},
  {f: 174, v: 90, s: 0, i: 0.6},
  {f: 180, v: 90, s: 0, o: 0.65},
  {f: 204, v: 0, s: 0, i: 0.65},
  // 3.50–6.00 acceleration: 180° CW speeding up → 90° CW stop → 270° CCW + overshoot
  {f: 212, v: 0, s: 0, o: 0.6},
  {f: 262, v: 180, s: 6.6, i: 0.17, o: 0.34},
  {f: 284, v: 270, s: 0, i: 0.62},
  {f: 290, v: 270, s: 0, o: 0.6},
  {f: 330, v: 0, s: -2.6, i: 0.3, o: 0.25},
  {f: 337, v: -4.6, s: 0, i: 0.5, o: 0.5},
  {f: 350, v: 0, s: 0, i: 0.6},
  // 6.00–9.00 maximum intensity
  {f: 360, v: 0, s: 0, o: 0.55},
  {f: 392, v: 360, s: 0, i: 0.55, o: 0.5}, // 360° CW → sharp reverse
  {f: 422, v: 0, s: 0, i: 0.6}, // 360° CCW
  {f: 428, v: 0, s: 0, o: 0.7},
  {f: 446, v: 90, s: 0, i: 0.7}, // 90° snap
  {f: 452, v: 90, s: 0, o: 0.55},
  {f: 482, v: -270, s: 0, i: 0.55}, // 360° CCW
  {f: 488, v: -270, s: 0, o: 0.55},
  {f: 520, v: 0, s: 8, i: 0.3, o: 0.25}, // 270° CW at full speed, flows into the slowdown
  // 9.00–11.50 controlled slowdown → overshoot → precision alignment
  {f: 668, v: 363.5, s: 0, i: 0.7, o: 0.5},
  {f: LOCK_FRAME, v: 360, s: 0, i: 0.6},
  {f: DURATION_FRAMES, v: 360},
];

// Panel camera zoom (impact punches are added on top)
const ZOOM_KEYS: Key[] = [
  {f: 0, v: 1.5},
  {f: 92, v: 1.5, s: -0.04, o: 0.25}, // rapid zoom reveal of the panels
  {f: 126, v: 1.0, s: 0, i: 0.7},
  {f: 212, v: 1.0, s: 0, o: 0.7},
  {f: 262, v: 1.12, sIn: 0.004, s: -0.008, i: 0.2, o: 0.3},
  {f: 292, v: 1.0, s: 0, i: 0.6},
  {f: 540, v: 1.0, s: 0, o: 0.5},
  {f: 690, v: 1.05, s: 0, i: 0.5},
  {f: REVEAL_FRAME, v: 1.0, s: 0, o: 0.4},
  {f: 810, v: 1.1, s: 0, i: 0.6}, // final camera push
  {f: DURATION_FRAMES, v: 1.1},
];

// Ring energy envelopes (inner keeps spinning a little longer than outer)
const ENERGY_INNER: Key[] = [
  {f: 0, v: 0.25},
  {f: 90, v: 0.35},
  {f: 210, v: 0.75},
  {f: 360, v: 1.4},
  {f: 392, v: 2.6},
  {f: 540, v: 2.6},
  {f: 610, v: 1.3},
  {f: 686, v: 0},
  {f: DURATION_FRAMES, v: 0},
];
const ENERGY_OUTER: Key[] = [
  {f: 0, v: 0.25},
  {f: 90, v: 0.35},
  {f: 210, v: 0.7},
  {f: 360, v: 1.3},
  {f: 392, v: 2.4},
  {f: 540, v: 2.4},
  {f: 636, v: 0},
  {f: DURATION_FRAMES, v: 0},
];
const ENERGY_STREAK: Key[] = [
  {f: 0, v: 0},
  {f: 214, v: 0},
  {f: 262, v: 1},
  {f: 392, v: 1.6},
  {f: 520, v: 1.6},
  {f: 570, v: 0.4},
  {f: DURATION_FRAMES, v: 0.4},
];

// ---------------------------------------------------------------------------
type Impact = {
  f: number;
  flash?: number;
  punch?: number;
  shake?: number;
  ca?: number;
  swap?: number;
  burst?: number;
  shock?: number;
  blue?: number; // central blue light flash
};

const IMPACTS: Impact[] = [
  {f: 40, blue: 1},
  {f: 122, flash: 0.18, shake: 0.3},
  {f: 154, flash: 0.28, punch: 0.05, shake: 0.6, ca: 0.5},
  {f: 204, flash: 0.22, punch: 0.04, shake: 0.5},
  {f: 262, flash: 0.38, ca: 0.9, burst: 0.5},
  {f: 284, flash: 0.28, punch: 0.05, shake: 0.6, swap: 2},
  {f: 330, flash: 0.42, punch: 0.08, shake: 1, ca: 0.8, burst: 0.6},
  {f: 392, flash: 0.5, punch: 0.11, shake: 1.2, ca: 1, swap: 2, burst: 1, shock: 0.6},
  {f: 422, flash: 0.32, punch: 0.06, shake: 0.7},
  {f: 446, flash: 0.38, punch: 0.08, shake: 0.8, swap: 2, burst: 0.6},
  {f: 482, flash: 0.42, punch: 0.09, shake: 1, ca: 0.8, burst: 0.8},
  {f: 520, flash: 0.45, punch: 0.08, shake: 0.9, ca: 0.9, burst: 0.7},
  {f: REVEAL_FRAME, flash: 0.55, punch: 0.07, shake: 0.9, ca: 0.8, shock: 1, burst: 1, blue: 0.7},
];

/** Artwork changes. `peak` = cut on the fastest frame inside the window (hidden by blur). */
type Switch = {f: number; scene: SceneId; peak?: [number, number]; wipe?: number};
const SWITCHES: Switch[] = [
  {f: 0, scene: 'A'},
  {f: 262, scene: 'B'},
  {f: 312, scene: 'C', peak: [300, 326]},
  {f: 377, scene: 'D', peak: [366, 388]},
  {f: 408, scene: 'A', peak: [398, 418]},
  {f: 468, scene: 'B', peak: [458, 478]},
  {f: 505, scene: 'C', peak: [494, 516]},
  {f: 560, scene: 'BRAND', wipe: 30},
  {f: REVEAL_FRAME, scene: 'D'},
];

// ---------------------------------------------------------------------------
export type CameraSample = {angle: number; scale: number; dx: number; dy: number};

export type LogoState = {
  iconAlpha: number;
  iconScale: number;
  wordAlpha: number;
  wordScale: number;
  tracking: number; // em
  execAlpha: number;
  projAlpha: number;
  scale: number; // whole lockup
  offsetY: number;
  plateAlpha: number;
  urlAlpha: [number, number];
  glow: number;
};

export type Burst = {age: number; strength: number; seed: number};

export type FrameState = {
  t: number; // timeline frame after beat-warp (fractional)
  camera: CameraSample;
  omega: number; // panel deg / frame
  flash: number;
  blueFlash: number; // 0..1 central light
  ca: number;
  swap: boolean;
  scene: SceneId;
  prevScene: SceneId | null;
  wipe: number;
  panelsIris: number; // 0 = closed (hidden behind the logo plate) … 1 = full frame
  panelsAlpha: number;
  linesGrow: number;
  brandPhase: number;
  ringsSweep: number[]; // per ring reveal 0..1
  ringsAlpha: number;
  ringsZoom: number;
  streakAlpha: number;
  bursts: Burst[];
  shocks: Burst[];
  grade: {contrast: number; brightness: number; saturate: number; vignette: number};
  bgWave: number;
  logo: LogoState;
  collapse: number; // outro geometric collapse 0..1
};

// --- deterministic smooth noise for camera shake ---------------------------------
const noise1 = (t: number, seed: number) =>
  Math.sin(t * 0.91 + seed * 1.7) * 0.5 + Math.sin(t * 2.13 + seed * 4.1) * 0.3 + Math.sin(t * 4.71 + seed * 2.9) * 0.2;

const smootherstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// --- spin-speed mapping (compress moves toward their impact frame) --------------
const makeSpeedMap = (speed: number) => {
  const s = clamp(speed, 0.8, 1.6);
  const spans = GROUPS.map((g, idx) => {
    const prev = GROUPS[idx - 1];
    const next = GROUPS[idx + 1];
    const limitLeft = prev ? (prev.end + g.start) / 2 : 0;
    const limitRight = next ? (g.end + next.start) / 2 : DURATION_FRAMES;
    const pre = g.anchor - g.start;
    const post = g.end - g.anchor;
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

export type TimelineInput = Pick<
  EditProps,
  | 'spinSpeed'
  | 'shakeIntensity'
  | 'audio'
  | 'spinDirection'
  | 'acceleration'
  | 'deceleration'
  | 'ringSpeed'
  | 'innerRingSpeed'
  | 'outerRingSpeed'
  | 'cameraZoom'
  | 'impactStrength'
  | 'tickDensity'
  | 'reducedFlash'
>;

const mapRotKeys = (keys: Key[], m: (t: number) => number, p: Partial<TimelineInput>): Key[] => {
  const s = clamp(p.spinSpeed ?? 1, 0.8, 1.6);
  const acc = clamp(p.acceleration ?? 1, 0.5, 1.5);
  const dec = clamp(p.deceleration ?? 1, 0.5, 1.5);
  const inGroup = (f: number) => GROUPS.some((g) => f >= g.start && f <= g.end);
  return keys.map((k) => ({
    ...k,
    f: m(k.f),
    // only keys inside a compressed move get faster
    s: k.s !== undefined ? k.s * (inGroup(k.f) ? s : 1) : k.s,
    sIn: k.sIn !== undefined ? k.sIn * (inGroup(k.f) ? s : 1) : k.sIn,
    o: k.o !== undefined ? clamp(k.o * acc, 0.05, 0.95) : k.o,
    i: k.i !== undefined ? clamp(k.i * dec, 0.05, 0.95) : k.i,
  }));
};

const mapTimes = (keys: Key[], m: (t: number) => number): Key[] => keys.map((k) => ({...k, f: m(k.f)}));

// --- beat warp -------------------------------------------------------------------
const makeBeatWarp = (anchors: number[], beatsSec: number[], startOffset: number) => {
  const beatFrames = beatsSec
    .map((b) => (b - startOffset) * FPS)
    .filter((b) => b > 4 && b < DURATION_FRAMES - 4)
    .sort((a, b) => a - b);
  if (beatFrames.length === 0) return (f: number) => f;
  const pairs: Array<[number, number]> = [[0, 0]];
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
    if (best - last[0] < 6 || a - last[1] < 6) continue;
    pairs.push([best, a]);
  }
  pairs.push([DURATION_FRAMES, DURATION_FRAMES]);
  return (f: number) => {
    if (f <= 0 || f >= DURATION_FRAMES) return f;
    for (let k = 0; k < pairs.length - 1; k++) {
      const [o0, t0] = pairs[k];
      const [o1, t1] = pairs[k + 1];
      if (f >= o0 && f <= o1) return t0 + ((f - o0) / (o1 - o0)) * (t1 - t0);
    }
    return f;
  };
};

// --- numeric integral of an envelope (deterministic table, C¹ Hermite lookup) -----
const STEPS_PER_FRAME = 8;
const integrate = (fn: (t: number) => number, from: number, to: number) => {
  const n = Math.ceil((to - from) * STEPS_PER_FRAME);
  const h = (to - from) / n;
  const I = new Float64Array(n + 1);
  const V = new Float64Array(n + 1);
  V[0] = fn(from);
  for (let k = 1; k <= n; k++) {
    const t0 = from + (k - 1) * h;
    const a = fn(t0);
    const mid = fn(t0 + h / 2);
    const b = fn(t0 + h);
    V[k] = b;
    I[k] = I[k - 1] + (h / 6) * (a + 4 * mid + b); // Simpson
  }
  return (t: number) => {
    if (t <= from) return V[0] * (t - from);
    if (t >= to) return I[n] + V[n] * (t - to);
    const x = (t - from) / h;
    const k = Math.min(n - 1, Math.floor(x));
    const u = x - k;
    const m0 = V[k] * h;
    const m1 = V[k + 1] * h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * I[k] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * I[k + 1] + (u3 - u2) * m1;
  };
};

const lineEase = easeOutExpo;
const irisEase = cubicBezier(0.7, 0, 0.18, 1);
const collapseEase = cubicBezier(0.6, 0, 0.4, 1);
const inOut = cubicBezier(0.65, 0, 0.35, 1);

export type Timeline = {
  rotation: Curve;
  zoom: Curve;
  warp: (f: number) => number;
  impacts: Impact[];
  switches: Array<{f: number; scene: SceneId; wipe: number}>;
  camera: (t: number) => CameraSample;
  ringAngle: (i: number, t: number) => number;
  streakAngle: (i: number, t: number) => number;
  state: (outputFrame: number) => FrameState;
  lockFrame: number;
  revealFrame: number;
};

export const buildTimeline = (p: Partial<TimelineInput>): Timeline => {
  const speed = p.spinSpeed ?? 1;
  const m = makeSpeedMap(speed);
  const dir = p.spinDirection === -1 ? -1 : 1;
  const rotation = makeCurve(mapRotKeys(ROT_KEYS, m, p));
  const zoom = makeCurve(mapTimes(ZOOM_KEYS, m));
  const strength = clamp(p.impactStrength ?? 1, 0, 1.5);
  const impacts = IMPACTS.map((e) => ({...e, f: m(e.f)}));
  const lockFrame = m(LOCK_FRAME);
  const revealFrame = m(REVEAL_FRAME);

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

  const audio = p.audio;
  const warp =
    audio && audio.enabled && audio.src && audio.beatSync && audio.beats && audio.beats.length > 0
      ? makeBeatWarp(
          impacts.filter((e) => (e.flash ?? 0) >= 0.3 || (e.punch ?? 0) > 0).map((e) => e.f),
          audio.beats,
          audio.startOffset ?? 0,
        )
      : (f: number) => f;

  // --- rings: integrate energy, then align at the lock -------------------------
  const eInner = makeCurve(mapTimes(ENERGY_INNER, m));
  const eOuter = makeCurve(mapTimes(ENERGY_OUTER, m));
  const eStreak = makeCurve(mapTimes(ENERGY_STREAK, m));
  // impacts kick the rings briefly (smooth, decaying angular impulse)
  const kick = (t: number) => {
    let k = 0;
    for (const e of impacts) {
      const d = t - e.f;
      if (d > -3 && d < 40 && (e.punch || e.burst)) {
        const rise = smoothstep(-3, 0, d);
        k += ((e.punch ?? 0) * 6 + (e.burst ?? 0) * 0.6) * rise * Math.exp(-Math.max(0, d) / 8);
      }
    }
    return k * strength;
  };
  const span = DURATION_FRAMES + 2;
  const Iin = integrate((t) => eInner.at(t) + kick(t) * (1 - smoothstep(lockFrame - 120, lockFrame - 60, t)), -2, span);
  const Iout = integrate((t) => eOuter.at(t) + kick(t) * (1 - smoothstep(lockFrame - 140, lockFrame - 80, t)), -2, span);
  const Istreak = integrate((t) => eStreak.at(t), -2, span);

  const ringSpeed = clamp(p.ringSpeed ?? 1, 0, 3);
  const innerMul = clamp(p.innerRingSpeed ?? 1, 0, 3);
  const outerMul = clamp(p.outerRingSpeed ?? 1, 0, 3);
  const tickDensity = p.tickDensity ?? 1;

  const ringRaw = RING_SPECS.map((s) => {
    const mul = ringSpeed * (innerMul * (1 - s.outer) + outerMul * s.outer);
    const k = s.dir * s.speed * mul;
    return (t: number) => s.home + k * ((1 - s.outer) * Iin(t) + s.outer * Iout(t));
  });
  const LOCK_RAMP = 70;
  const ringCorr = RING_SPECS.map((s, i) => {
    const P = ringPeriod(s, tickDensity);
    const a = ringRaw[i](lockFrame);
    const target = s.home + Math.round((a - s.home) / P) * P;
    return target - a;
  });
  const ringAngle = (i: number, t: number) => ringRaw[i](t) + ringCorr[i] * smootherstep(lockFrame - LOCK_RAMP, lockFrame, t);
  const streakAngle = (i: number, t: number) => {
    const s = STREAKS[i];
    return s.phase + s.dir * s.speed * ringSpeed * Istreak(t);
  };

  const shakeAmt = 30 * (p.shakeIntensity ?? 1) * strength;
  const zoomMul = clamp(p.cameraZoom ?? 1, 0, 1.5);

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
      if (e.shake && d >= 0 && d < 22) {
        // decaying impulse that eases in and returns smoothly to rest
        const env = Math.pow(1 - d / 22, 2) * Math.sin(Math.min(1, d / 2) * Math.PI * 0.5) * e.shake;
        sx += env * noise1(t * 1.9, e.f);
        sy += env * noise1(t * 1.9, e.f + 13.37);
      }
    }
    const drift = smoothstep(360, 380, t) * (1 - smoothstep(515, 540, t));
    sx += drift * 0.4 * Math.sin((t / FPS) * 2.4);
    sy += drift * 0.3 * Math.sin((t / FPS) * 1.7 + 1.2);
    let dx = sx * shakeAmt;
    let dy = sy * shakeAmt;
    const mag = Math.hypot(dx, dy);
    const MAX = 60; // keeps the corners covered (comp half-size 1200 > 1101.5 + 60)
    if (mag > MAX) {
      dx *= MAX / mag;
      dy *= MAX / mag;
    }
    const z = 1 + (zoom.at(t) - 1) * Math.max(zoomMul, t < 126 ? 1 : 0) + punch * strength * zoomMul;
    return {angle: dir * rotation.at(t), scale: Math.max(z, t < 126 ? 0 : 1), dx, dy};
  };

  const reduced = Boolean(p.reducedFlash);

  const state = (outputFrame: number): FrameState => {
    const t = warp(outputFrame);
    const omega = dir * rotation.vel(t);

    let flash = 0;
    let ca = 0;
    let blue = 0;
    let swap = false;
    const bursts: Burst[] = [];
    const shocks: Burst[] = [];
    let logoPunch = 0;
    for (const e of impacts) {
      const d = t - e.f;
      if (e.flash && d >= 0 && d < 8) flash += e.flash * Math.pow(1 - d / 8, 2.2);
      if (e.ca && d >= 0 && d < 12) ca += e.ca * Math.pow(1 - d / 12, 2);
      if (e.swap && d >= 0 && d < e.swap) swap = true;
      if (e.blue && d >= -4 && d < 26) blue = Math.max(blue, e.blue * (d < 0 ? smoothstep(-4, 0, d) : Math.pow(1 - d / 26, 1.6)));
      if (e.burst && d >= 0 && d < 16) bursts.push({age: d, strength: e.burst * strength * (reduced ? 0.5 : 1), seed: e.f});
      if (e.shock && d >= 0 && d < 34) shocks.push({age: d, strength: e.shock * strength, seed: e.f});
      if (e.punch && d >= 0 && d < 14) logoPunch += e.punch * Math.pow(1 - d / 14, 3);
    }
    ca = ca * strength + clamp(Math.abs(omega) / 22, 0, 1) * 0.45;
    flash *= strength;
    if (reduced) {
      flash = Math.min(flash, 0.2);
      blue *= 0.6;
    }

    let idx = 0;
    for (let k = 0; k < switches.length; k++) if (t >= switches[k].f) idx = k;
    const sw = switches[idx];
    const prev = idx > 0 ? switches[idx - 1] : null;
    const wipe = sw.wipe > 0 ? clamp((t - sw.f) / sw.wipe, 0, 1) : 1;

    // outro geometric collapse
    const collapse = collapseEase(clamp((t - m(846)) / 40, 0, 1));
    const ringsSweep = RING_SPECS.map((s, i) => {
      const start = s.intro ? 6 + i * 3 : 96 + (i % 6) * 16;
      return irisEase(clamp((t - start) / (s.intro ? 46 : 40), 0, 1));
    });

    // cinematic contrast shift during the slowdown, pop on the reveal
    const shift = smoothstep(m(560), m(684), t) * (1 - smoothstep(revealFrame, revealFrame + 40, t));
    const pop = t >= revealFrame ? Math.exp(-(t - revealFrame) / 10) : 0;
    const grade = {
      contrast: 1 + 0.18 * shift,
      brightness: 1 - 0.2 * shift + 0.25 * pop,
      saturate: 1 - 0.15 * shift,
      vignette: 0.35 + 0.4 * shift + 0.25 * collapse,
    };

    // logo choreography (upright, never spins with the crosshair)
    const reveal = easeOutExpo(clamp((t - revealFrame) / 48, 0, 1));
    const outroMove = inOut(clamp((t - m(812)) / 40, 0, 1));
    const logo: LogoState = {
      iconAlpha: smoothstep(38, 48, t),
      iconScale: 0.82 + 0.18 * easeOutExpo(clamp((t - 38) / 26, 0, 1)),
      wordAlpha: smoothstep(50, 62, t),
      wordScale: 1.16 - 0.16 * easeOutExpo(clamp((t - 50) / 26, 0, 1)),
      tracking: 0.1 + 0.26 * (1 - easeOutExpo(clamp((t - 50) / 34, 0, 1))),
      execAlpha: smoothstep(70, 90, t),
      projAlpha: smoothstep(revealFrame + 6, revealFrame + 30, t),
      scale: 1 + 0.2 * reveal + logoPunch * 0.35 * strength,
      offsetY: -150 * outroMove,
      plateAlpha: smoothstep(90, 112, t),
      urlAlpha: [smoothstep(m(818), m(840), t), smoothstep(m(828), m(850), t)],
      glow: 0.45 + 0.55 * blue + 0.25 * pop,
    };

    return {
      t,
      camera: camera(t),
      omega,
      flash: clamp(flash, 0, 1),
      blueFlash: clamp(blue, 0, 1),
      ca: clamp(ca, 0, 1.5),
      swap,
      scene: sw.scene,
      prevScene: prev ? prev.scene : null,
      wipe,
      panelsIris: irisEase(clamp((t - 92) / 32, 0, 1)) * (1 - collapse),
      panelsAlpha: smoothstep(90, 100, t) * (1 - 0.85 * collapse),
      linesGrow: lineEase(clamp((t - 90) / 24, 0, 1)),
      brandPhase: clamp((t - m(560)) / (revealFrame - m(560)), 0, 1),
      ringsSweep,
      ringsAlpha: 1 - collapse,
      ringsZoom: 1 - 0.45 * collapse,
      streakAlpha: smoothstep(m(214), m(250), t) * (1 - smoothstep(m(540), m(580), t)),
      bursts,
      shocks,
      grade,
      bgWave: 0.22 + 0.2 * collapse,
      logo,
      collapse,
    };
  };

  return {rotation, zoom, warp, impacts, switches, camera, ringAngle, streakAngle, state, lockFrame, revealFrame};
};
