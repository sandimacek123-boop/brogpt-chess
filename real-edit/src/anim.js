// Deterministic animation toolkit: easing, bezier curves, springs, keyframes, noise, beat envelopes.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (f, a, b) => clamp((f - a) / (b - a));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const E = {
  linear: t => t,
  inSine: t => 1 - Math.cos(t * Math.PI / 2),
  outSine: t => Math.sin(t * Math.PI / 2),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  inQuart: t => t ** 4,
  outQuart: t => 1 - (1 - t) ** 4,
  inQuint: t => t ** 5,
  outQuint: t => 1 - (1 - t) ** 5,
  inOutQuint: t => t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
  inExpo: t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inOutExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
};

// CSS-style cubic-bezier(x1,y1,x2,y2) timing curve (Newton + bisection solve).
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t;
  const sy = t => ((ay * t + by) * t + cy) * t;
  const dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; const d = dx(t); if (Math.abs(e) < 1e-6) break; if (Math.abs(d) < 1e-6) break; t -= e / d; }
    if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { const v = sx(t); if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return sy(t);
  };
}
// signature curves
export const B = {
  velocity: bezier(0.85, 0, 0.15, 1),     // AE "velocity edit" ramp: slow-in, violent middle, slow-out
  snap: bezier(0.05, 0.9, 0.1, 1),        // instant attack, long settle
  whipIn: bezier(0.7, 0, 0.95, 0.4),      // accelerate into a cut
  whipOut: bezier(0.05, 0.6, 0.3, 1),     // decelerate out of a cut
  glide: bezier(0.45, 0, 0.2, 1),
};

// Damped harmonic oscillator step response (0 -> 1 with overshoot). t in seconds.
export function spring(t, freq = 3, damp = 0.35) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq, z = damp;
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
// Spring evaluated in frames from a start frame
export const springF = (f, f0, freq = 3, damp = 0.35, fps = 60) => spring((f - f0) / fps, freq, damp);

// keyframes: [[frame, value, easeFn?], ...] ; ease applies to the segment ENDING at that key.
export function kf(f, keys) {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1, e] = keys[i];
    if (f <= f1) {
      const [f0, v0] = keys[i - 1];
      const t = (e || E.inOutCubic)(clamp((f - f0) / (f1 - f0)));
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], t)) : lerp(v0, v1, t);
    }
  }
  return keys[keys.length - 1][1];
}

// seeded PRNG
export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); };
// smooth 1D value noise in [-1, 1]
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * f * (f * (f * 6 - 15) + 10);
  return lerp(hash1(i + seed * 57.3), hash1(i + 1 + seed * 57.3), u) * 2 - 1;
}
// fractal shake: returns value in ~[-1,1]
export const shake = (f, freq, seed) => noise1(f * freq, seed) * 0.7 + noise1(f * freq * 2.3, seed + 9) * 0.3;

// Beat envelope: sum of decaying impulses at event frames (attack in frames, decay time-constant in frames)
export function beatEnv(f, frames, decay = 8, attack = 0.0, from = -1e9, to = 1e9) {
  let v = 0;
  for (const e of frames) {
    if (e < from || e > to) continue;
    const d = f - e;
    if (d < -attack || d > decay * 6) continue;
    v += d < 0 ? (1 + d / attack) : Math.exp(-d / decay);
  }
  return v;
}
