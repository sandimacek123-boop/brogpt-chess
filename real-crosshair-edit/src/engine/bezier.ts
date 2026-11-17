// After-Effects style temporal interpolation.
// Every keyframe has a value, a speed (units / frame) and an influence (0..1).
// The curve between two keyframes is a cubic Bézier in (time, value) space,
// exactly like AE's graph editor – so speed is continuous wherever the in and
// out speed of a keyframe match, and overshoot/settle moves are just keys.

export type Key = {
  f: number; // frame
  v: number; // value
  s?: number; // speed through this key (units / frame), default 0
  sIn?: number; // optional separate incoming speed
  i?: number; // incoming influence (0..1), default 0.5
  o?: number; // outgoing influence (0..1), default 0.5
};

const cubic = (p0: number, p1: number, p2: number, p3: number, u: number) => {
  const m = 1 - u;
  return m * m * m * p0 + 3 * m * m * u * p1 + 3 * m * u * u * p2 + u * u * u * p3;
};

const cubicDeriv = (p0: number, p1: number, p2: number, p3: number, u: number) => {
  const m = 1 - u;
  return 3 * m * m * (p1 - p0) + 6 * m * u * (p2 - p1) + 3 * u * u * (p3 - p2);
};

/** Solve x(u) = x for a monotonic cubic (x control points 0 ≤ x1,x2 ≤ T). */
const solveU = (x1: number, x2: number, T: number, x: number) => {
  if (x <= 0) return 0;
  if (x >= T) return 1;
  let u = x / T;
  // Newton
  for (let k = 0; k < 8; k++) {
    const xu = cubic(0, x1, x2, T, u) - x;
    if (Math.abs(xu) < 1e-7) return u;
    const d = cubicDeriv(0, x1, x2, T, u);
    if (Math.abs(d) < 1e-9) break;
    u -= xu / d;
    if (u < 0 || u > 1) break;
  }
  // Bisection fallback (always converges)
  let lo = 0;
  let hi = 1;
  u = x / T;
  for (let k = 0; k < 60; k++) {
    const xu = cubic(0, x1, x2, T, u);
    if (Math.abs(xu - x) < 1e-7) break;
    if (xu < x) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return u;
};

export type Curve = {
  keys: Key[];
  at: (t: number) => number;
  /** derivative (units / frame) */
  vel: (t: number) => number;
};

export const makeCurve = (input: Key[]): Curve => {
  const keys = [...input].sort((a, b) => a.f - b.f);
  const segIndex = (t: number) => {
    // binary search last key with f <= t
    let lo = 0;
    let hi = keys.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (keys[mid].f <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const evalSeg = (idx: number, t: number, wantVel: boolean) => {
    const a = keys[idx];
    const b = keys[idx + 1];
    const T = b.f - a.f;
    if (T <= 0) return wantVel ? 0 : b.v;
    let o = a.o ?? 0.5;
    let i = b.i ?? 0.5;
    const sOut = a.s ?? 0;
    const sIn = b.sIn ?? b.s ?? 0;
    // sanitise handles so a segment never overshoots its own end value
    // (keeps position monotonic inside a move; overshoots are explicit keys)
    const d = b.v - a.v;
    if (Math.abs(d) > 1e-9) {
      const reachOut = sOut * d > 0 ? Math.abs(sOut) * o * T : 0;
      const reachIn = sIn * d > 0 ? Math.abs(sIn) * i * T : 0;
      const total = reachOut + reachIn;
      if (total > Math.abs(d) * 0.98) {
        const k = (Math.abs(d) * 0.98) / total;
        if (reachOut > 0) o *= k;
        if (reachIn > 0) i *= k;
      }
    }
    const x1 = o * T;
    const y1 = a.v + sOut * o * T;
    const x2 = T - i * T;
    const y2 = b.v - sIn * i * T;
    const u = solveU(x1, x2, T, t - a.f);
    if (!wantVel) return cubic(a.v, y1, y2, b.v, u);
    const dx = cubicDeriv(0, x1, x2, T, u);
    const dy = cubicDeriv(a.v, y1, y2, b.v, u);
    if (Math.abs(dx) < 1e-9) return u < 0.5 ? sOut : sIn;
    return dy / dx;
  };

  const at = (t: number) => {
    if (keys.length === 0) return 0;
    if (t <= keys[0].f) return keys[0].v;
    if (t >= keys[keys.length - 1].f) return keys[keys.length - 1].v;
    return evalSeg(segIndex(t), t, false);
  };

  const vel = (t: number) => {
    if (keys.length < 2) return 0;
    if (t < keys[0].f || t > keys[keys.length - 1].f) return 0;
    const idx = Math.min(segIndex(t), keys.length - 2);
    return evalSeg(idx, t, true);
  };

  return {keys, at, vel};
};

/** CSS-style cubic-bezier easing (x1,y1,x2,y2) on 0..1 */
export const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const u = solveU(x1, x2, 1, x);
    return cubic(0, y1, y2, 1, u);
  };
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const easeOutExpo = cubicBezier(0.16, 1, 0.3, 1);
export const easeInOut = cubicBezier(0.65, 0, 0.35, 1);
export const easeOutCubic = cubicBezier(0.33, 1, 0.68, 1);
