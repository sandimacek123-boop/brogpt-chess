// Radial geometry: concentric rings, streaks, light bursts, shockwaves.
// Pure geometry specs live here (also used by the timeline for alignment);
// drawing happens in screen space on the FX layer with per-ring temporal
// supersampling, so every ring blurs according to its own angular velocity.

export type RingKind = 'ticks' | 'arcs' | 'solid' | 'dots' | 'brackets';
export type RingColor = 'white' | 'cyan' | 'electric' | 'red';

export type RingSpec = {
  r: number;
  kind: RingKind;
  n: number; // ticks / dots / arcs / brackets count (before tick density)
  arc?: number; // deg, arcs + brackets
  len?: number; // tick length
  longEvery?: number; // deg between long ticks
  longLen?: number;
  longColor?: RingColor;
  w: number;
  color: RingColor;
  alpha: number;
  speed: number; // deg / frame at energy 1
  dir: 1 | -1;
  outer: number; // 0 = follows the inner energy envelope, 1 = outer envelope
  home: number; // deg – rest orientation after the lock
  labels?: boolean;
  intro?: boolean; // one of the few thin rings visible in the intro
  priority: number; // ring density: lower = kept first
};

export const RING_SPECS: RingSpec[] = [
  {r: 316, kind: 'ticks', n: 120, len: 10, w: 2, color: 'white', alpha: 0.55, speed: 1.4, dir: 1, outer: 0, home: 0, intro: true, priority: 1},
  {r: 342, kind: 'arcs', n: 3, arc: 78, w: 5, color: 'cyan', alpha: 0.95, speed: 2.0, dir: -1, outer: 0.1, home: 90, priority: 2},
  {r: 378, kind: 'solid', n: 4, w: 1.6, color: 'white', alpha: 0.45, speed: 0.8, dir: 1, outer: 0.15, home: 0, intro: true, priority: 1},
  {r: 418, kind: 'ticks', n: 72, len: 10, longEvery: 30, longLen: 22, w: 2.4, color: 'white', alpha: 0.6, speed: 0.9, dir: -1, outer: 0.25, home: 0, labels: true, priority: 1},
  {r: 476, kind: 'arcs', n: 2, arc: 40, w: 9, color: 'red', alpha: 0.95, speed: 2.8, dir: 1, outer: 0.35, home: 0, priority: 2},
  {r: 528, kind: 'dots', n: 120, w: 2.2, color: 'cyan', alpha: 0.65, speed: 1.1, dir: -1, outer: 0.45, home: 0, priority: 3},
  {r: 604, kind: 'brackets', n: 4, arc: 22, w: 3, color: 'white', alpha: 0.85, speed: 0.7, dir: 1, outer: 0.55, home: 45, priority: 2},
  {r: 692, kind: 'ticks', n: 180, len: 8, longEvery: 15, longLen: 26, longColor: 'cyan', w: 1.5, color: 'white', alpha: 0.38, speed: 0.5, dir: -1, outer: 0.7, home: 0, intro: true, priority: 1},
  {r: 806, kind: 'arcs', n: 6, arc: 22, w: 2.5, color: 'white', alpha: 0.5, speed: 1.0, dir: 1, outer: 0.8, home: 0, priority: 3},
  {r: 936, kind: 'ticks', n: 240, len: 6, w: 1.2, color: 'white', alpha: 0.3, speed: 0.35, dir: -1, outer: 0.9, home: 0, priority: 3},
  {r: 1090, kind: 'arcs', n: 2, arc: 64, w: 14, color: 'electric', alpha: 0.55, speed: 0.8, dir: 1, outer: 1, home: 90, priority: 2},
];

/** effective repeat count after tick density */
export const ringCount = (s: RingSpec, tickDensity: number) =>
  s.kind === 'ticks' || s.kind === 'dots' ? Math.max(12, Math.round((s.n * tickDensity) / 4) * 4) : s.n;

/** rotational symmetry period (deg) – the lock aligns every ring to it */
export const ringPeriod = (s: RingSpec, tickDensity: number) => {
  const n = ringCount(s, tickDensity);
  if (s.kind === 'solid') return 90;
  if (s.kind === 'ticks' && s.longEvery) return s.longEvery;
  return 360 / n;
};

export type StreakSpec = {r: number; len: number; color: RingColor; dir: 1 | -1; phase: number; w: number; speed: number};

export const STREAKS: StreakSpec[] = [
  {r: 560, len: 110, color: 'cyan', dir: 1, phase: 20, w: 7, speed: 5.5},
  {r: 650, len: 85, color: 'red', dir: -1, phase: 160, w: 6, speed: 6.5},
  {r: 760, len: 120, color: 'electric', dir: 1, phase: 250, w: 9, speed: 4.5},
  {r: 880, len: 70, color: 'red', dir: -1, phase: 70, w: 5, speed: 7},
];

// ---------------------------------------------------------------------------
type Ctx = CanvasRenderingContext2D;
const D2R = Math.PI / 180;

export type RingDrawOpts = {
  cx: number;
  cy: number;
  zoom: number;
  color: string;
  longColor: string;
  thickness: number;
  tickDensity: number;
  labelFont: string;
  sweep: number; // 0..1 reveal sweep (draws from 12 o'clock clockwise)
};

/** Draws one copy of a ring at angle `deg` (composite op / alpha set by caller). */
export const drawRing = (ctx: Ctx, s: RingSpec, deg: number, o: RingDrawOpts) => {
  const r = s.r * o.zoom;
  const n = ringCount(s, o.tickDensity);
  const a0 = -90 * D2R;
  const sweepEnd = a0 + o.sweep * Math.PI * 2;
  const inSweep = (a: number) => {
    if (o.sweep >= 1) return true;
    let x = (a - a0) % (Math.PI * 2);
    if (x < 0) x += Math.PI * 2;
    return x <= o.sweep * Math.PI * 2;
  };
  const w = s.w * o.thickness * Math.max(0.7, o.zoom);
  ctx.lineCap = 'butt';
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  ctx.lineWidth = w;
  const rot = deg * D2R;

  switch (s.kind) {
    case 'solid': {
      ctx.beginPath();
      ctx.arc(o.cx, o.cy, r, a0, sweepEnd);
      ctx.stroke();
      // calibration notches
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = rot + (k * Math.PI) / 2;
        if (!inSweep(a)) continue;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const t = 9 * o.zoom;
        ctx.moveTo(o.cx + ca * (r - 2), o.cy + sa * (r - 2));
        ctx.lineTo(o.cx + ca * (r - 16 * o.zoom) - sa * t, o.cy + sa * (r - 16 * o.zoom) + ca * t);
        ctx.lineTo(o.cx + ca * (r - 16 * o.zoom) + sa * t, o.cy + sa * (r - 16 * o.zoom) - ca * t);
        ctx.closePath();
      }
      ctx.fill();
      break;
    }
    case 'ticks': {
      const step = (Math.PI * 2) / n;
      const longEvery = s.longEvery ? Math.max(1, Math.round((s.longEvery * D2R) / step)) : 0;
      const len = (s.len ?? 8) * o.zoom;
      const longLen = (s.longLen ?? len) * o.zoom;
      ctx.beginPath();
      const longs: number[] = [];
      for (let k = 0; k < n; k++) {
        const a = rot + k * step;
        if (!inSweep(a)) continue;
        if (longEvery && k % longEvery === 0) {
          longs.push(a);
          continue;
        }
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ctx.moveTo(o.cx + ca * r, o.cy + sa * r);
        ctx.lineTo(o.cx + ca * (r - len), o.cy + sa * (r - len));
      }
      ctx.stroke();
      if (longs.length) {
        ctx.strokeStyle = s.longColor ? o.longColor : o.color;
        ctx.lineWidth = w * 1.5;
        ctx.beginPath();
        for (const a of longs) {
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          ctx.moveTo(o.cx + ca * (r + 2), o.cy + sa * (r + 2));
          ctx.lineTo(o.cx + ca * (r - longLen), o.cy + sa * (r - longLen));
        }
        ctx.stroke();
        if (s.labels) {
          ctx.font = o.labelFont;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let k = 0; k < longs.length; k++) {
            const a = longs[k];
            const label = String(Math.round(((k * 360) / longs.length + 360) % 360)).padStart(3, '0');
            ctx.save();
            ctx.translate(o.cx + Math.cos(a) * (r - longLen - 16 * o.zoom), o.cy + Math.sin(a) * (r - longLen - 16 * o.zoom));
            ctx.rotate(a + Math.PI / 2);
            ctx.fillText(label, 0, 0);
            ctx.restore();
          }
        }
      }
      break;
    }
    case 'dots': {
      const step = (Math.PI * 2) / n;
      const dr = Math.max(0.8, s.w * o.thickness * o.zoom);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const a = rot + k * step;
        if (!inSweep(a)) continue;
        const x = o.cx + Math.cos(a) * r;
        const y = o.cy + Math.sin(a) * r;
        ctx.moveTo(x + dr, y);
        ctx.arc(x, y, dr, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    }
    case 'arcs':
    case 'brackets': {
      const half = ((s.arc ?? 20) * D2R) / 2;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const c = rot + (k * Math.PI * 2) / n;
        if (!inSweep(c)) continue;
        ctx.moveTo(o.cx + Math.cos(c - half) * r, o.cy + Math.sin(c - half) * r);
        ctx.arc(o.cx, o.cy, r, c - half, c + half);
        if (s.kind === 'brackets') {
          for (const e of [c - half, c + half]) {
            ctx.moveTo(o.cx + Math.cos(e) * (r - 14 * o.zoom), o.cy + Math.sin(e) * (r - 14 * o.zoom));
            ctx.lineTo(o.cx + Math.cos(e) * (r + 14 * o.zoom), o.cy + Math.sin(e) * (r + 14 * o.zoom));
          }
        }
      }
      ctx.stroke();
      break;
    }
  }
};

/** Tapered light streak (head at `deg`, tail trailing against the direction of travel). */
export const drawStreak = (ctx: Ctx, s: StreakSpec, deg: number, cx: number, cy: number, zoom: number, color: string, alpha: number) => {
  const r = s.r * zoom;
  const SEG = 28;
  const len = s.len * D2R;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  for (let k = 0; k < SEG; k++) {
    const p0 = k / SEG;
    const p1 = (k + 1) / SEG;
    const a0 = deg * D2R - s.dir * len * (1 - p0);
    const a1 = deg * D2R - s.dir * len * (1 - p1);
    ctx.globalAlpha = alpha * Math.pow(p1, 1.6);
    ctx.lineWidth = s.w * zoom * (0.25 + 0.75 * p1);
    ctx.beginPath();
    if (s.dir > 0) ctx.arc(cx, cy, r, a0, a1);
    else ctx.arc(cx, cy, r, a1, a0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};
