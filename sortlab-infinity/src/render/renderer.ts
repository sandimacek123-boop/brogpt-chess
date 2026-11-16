import type { VisualMode } from './modes';
import { HL_COMPARE, HL_SWAP, HL_WRITE } from '../engine/player';

export interface Frame {
  n: number;
  values: Int32Array;
  heights: Float32Array;
  offsets: Float32Array;
  hlType: Uint8Array;
  hlAge: Float32Array;
  maxValue: number;
  minValue: number;
  /** Indices < sweep are drawn in the verification colour (-1 = no sweep). */
  sweep: number;
  /** First index that failed verification (-1 = none). */
  sweepFail: number;
  /** Animation clock in seconds (frozen under reduced motion). */
  time: number;
}

export interface RenderOpts {
  palette: string[];
  background: string;
  compareColor: string;
  swapColor: string;
  writeColor: string;
  sweepColor: string;
  failColor: string;
  showHighlights: boolean;
  /** Fraction of each slot a bar occupies (0.1–1). */
  barWidth: number;
  /** Pixel gap between bars (subtracted from width when room allows). */
  barSpacing: number;
  glow: number;
  migraineIntensity: number;
  reducedMotion: boolean;
  dpr: number;
}

type ModeFn = (g: CanvasRenderingContext2D, f: Frame, W: number, H: number, o: RenderOpts) => void;

function colorAt(f: Frame, o: RenderOpts, i: number): string {
  if (f.sweep >= 0 && i < f.sweep) return f.sweepFail >= 0 && i >= f.sweepFail ? o.failColor : o.sweepColor;
  if (o.showHighlights) {
    const t = f.hlType[i];
    if (t === HL_COMPARE) return o.compareColor;
    if (t === HL_SWAP) return o.swapColor;
    if (t === HL_WRITE) return o.writeColor;
  }
  const v = f.values[i];
  return o.palette[v < 0 ? 0 : v >= o.palette.length ? o.palette.length - 1 : v] ?? '#fff';
}

const norm = (f: Frame, i: number) => {
  const h = f.heights[i] / f.maxValue;
  return h < 0 ? 0 : h > 1 ? 1 : h;
};
const posOf = (f: Frame, i: number) => i + f.offsets[i];
const TAU = Math.PI * 2;

/** Target index of a value assuming values are spread over [minValue, maxValue]. */
function targetIndex(f: Frame, v: number) {
  const span = f.maxValue - f.minValue;
  if (span <= 0) return 0;
  return ((v - f.minValue) / span) * (f.n - 1);
}

function barGeom(W: number, n: number, o: RenderOpts) {
  const slot = W / Math.max(1, n);
  let w = slot * o.barWidth;
  const gap = o.barSpacing * o.dpr;
  if (w - gap >= 1) w -= gap;
  return { slot, w: Math.max(0.6, w), off: (slot - Math.max(0.6, w)) / 2 };
}

const bars: ModeFn = (g, f, W, H, o) => {
  const { slot, w, off } = barGeom(W, f.n, o);
  const top = H * 0.02;
  const avail = H - top;
  for (let i = 0; i < f.n; i++) {
    const h = Math.max(1, norm(f, i) * avail);
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(posOf(f, i) * slot + off, H - h, w, h);
  }
};

const horizontal: ModeFn = (g, f, W, H, o) => {
  const { slot, w, off } = barGeom(H, f.n, o);
  for (let i = 0; i < f.n; i++) {
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(0, posOf(f, i) * slot + off, Math.max(1, norm(f, i) * W * 0.98), w);
  }
};

const ring: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.48;
  const r0 = R * 0.28;
  g.lineWidth = Math.max(1, ((TAU * r0) / f.n) * o.barWidth);
  g.lineCap = 'butt';
  for (let i = 0; i < f.n; i++) {
    const a = (posOf(f, i) / f.n) * TAU - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const r1 = r0 + norm(f, i) * (R - r0);
    g.strokeStyle = colorAt(f, o, i);
    g.beginPath();
    g.moveTo(cx + c * r0, cy + s * r0);
    g.lineTo(cx + c * r1, cy + s * r1);
    g.stroke();
  }
};

const spiral: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.47;
  const size = Math.max(1.5 * o.dpr, Math.min(8 * o.dpr, (R / Math.sqrt(f.n)) * 0.55));
  for (let i = 0; i < f.n; i++) {
    const a = (posOf(f, i) / f.n) * TAU - Math.PI / 2;
    const r = norm(f, i) * R;
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(cx + Math.cos(a) * r - size / 2, cy + Math.sin(a) * r - size / 2, size, size);
  }
};

const scatter: ModeFn = (g, f, W, H, o) => {
  const pad = 28 * o.dpr;
  const w = W - pad * 1.5;
  const h = H - pad * 1.5;
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = o.dpr;
  g.beginPath();
  for (let k = 0; k <= 4; k++) {
    const x = pad + (w * k) / 4;
    const y = pad * 0.5 + (h * k) / 4;
    g.moveTo(x, pad * 0.5);
    g.lineTo(x, pad * 0.5 + h);
    g.moveTo(pad, y);
    g.lineTo(pad + w, y);
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.setLineDash([4 * o.dpr, 4 * o.dpr]);
  g.beginPath();
  g.moveTo(pad, pad * 0.5 + h);
  g.lineTo(pad + w, pad * 0.5);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.font = `${10 * o.dpr}px ui-sans-serif, system-ui`;
  g.fillText('position →', pad + w - 70 * o.dpr, pad * 0.5 + h + 16 * o.dpr);
  g.save();
  g.translate(pad - 10 * o.dpr, pad * 0.5 + 60 * o.dpr);
  g.rotate(-Math.PI / 2);
  g.fillText('value →', 0, 0);
  g.restore();
  const size = Math.max(1.5 * o.dpr, Math.min(5 * o.dpr, (w / f.n) * 0.9));
  for (let i = 0; i < f.n; i++) {
    const x = pad + (posOf(f, i) / Math.max(1, f.n - 1)) * w;
    const y = pad * 0.5 + h - norm(f, i) * h;
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(x - size / 2, y - size / 2, size, size);
  }
};

const rainbowCircle: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.47;
  const r0 = R * 0.62;
  const step = TAU / f.n;
  const eps = step * 0.02;
  for (let i = 0; i < f.n; i++) {
    const a = posOf(f, i) * step - Math.PI / 2;
    g.fillStyle = colorAt(f, o, i);
    g.beginPath();
    g.arc(cx, cy, R, a - eps, a + step + eps);
    g.arc(cx, cy, r0, a + step + eps, a - eps, true);
    g.closePath();
    g.fill();
  }
};

const sunburst: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.48;
  const step = TAU / f.n;
  const eps = Math.min(step * 0.15, 0.003);
  for (let i = 0; i < f.n; i++) {
    const a = posOf(f, i) * step - Math.PI / 2;
    const r = R * (0.08 + 0.92 * norm(f, i));
    g.fillStyle = colorAt(f, o, i);
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, a - eps, a + step + eps);
    g.closePath();
    g.fill();
  }
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.22);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, R * 0.22, 0, TAU);
  g.fill();
};

const triangle: ModeFn = (g, f, W, H, o) => {
  const { slot, w, off } = barGeom(H, f.n, o);
  for (let i = 0; i < f.n; i++) {
    const len = Math.max(1, norm(f, i) * W * 0.96);
    g.fillStyle = colorAt(f, o, i);
    g.fillRect((W - len) / 2, posOf(f, i) * slot + off, len, w);
  }
};

const waveform: ModeFn = (g, f, W, H, o) => {
  const { slot, w, off } = barGeom(W, f.n, o);
  const mid = H / 2;
  for (let i = 0; i < f.n; i++) {
    const h = Math.max(1, norm(f, i) * H * 0.46);
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(posOf(f, i) * slot + off, mid - h, w, 2 * h);
  }
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1, o.dpr);
  for (const sign of [-1, 1]) {
    g.beginPath();
    for (let i = 0; i < f.n; i++) {
      const x = (i + 0.5) * slot;
      const y = mid + sign * norm(f, i) * H * 0.46;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, mid - o.dpr / 2, W, o.dpr);
};

const dots: ModeFn = (g, f, W, H, o) => {
  const slot = W / f.n;
  const r = Math.max(1.2 * o.dpr, Math.min(7 * o.dpr, slot * 0.5 * o.barWidth));
  const avail = H - 2 * r - 4;
  for (let i = 0; i < f.n; i++) {
    const x = (posOf(f, i) + 0.5) * slot;
    const y = H - r - 2 - norm(f, i) * avail;
    g.fillStyle = colorAt(f, o, i);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
};

const pixelGrid: ModeFn = (g, f, W, H, o) => {
  const cols = Math.max(1, Math.ceil(Math.sqrt((f.n * W) / H)));
  const rows = Math.max(1, Math.ceil(f.n / cols));
  const cw = W / cols;
  const ch = H / rows;
  const gap = cw > 6 ? o.dpr : 0;
  for (let i = 0; i < f.n; i++) {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(x, y, Math.ceil(cw) - gap, Math.ceil(ch) - gap);
  }
};

const colorWheel: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.47;
  const step = TAU / f.n;
  const eps = step * 0.04;
  for (let i = 0; i < f.n; i++) {
    const a = posOf(f, i) * step - Math.PI / 2;
    g.fillStyle = colorAt(f, o, i);
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, a - eps, a + step + eps);
    g.closePath();
    g.fill();
  }
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fill();
};

const helix: ModeFn = (g, f, W, H, o) => {
  const slot = W / f.n;
  const mid = H / 2;
  const turns = 4;
  const t = f.time * 0.9;
  const size = Math.max(1.5 * o.dpr, Math.min(6 * o.dpr, slot * 0.9));
  const rungEvery = Math.max(1, Math.round(f.n / 64));
  g.lineWidth = Math.max(1, o.dpr * 0.75);
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.beginPath();
  for (let i = 0; i < f.n; i += rungEvery) {
    const x = (posOf(f, i) + 0.5) * slot;
    const ph = (i / f.n) * turns * TAU + t;
    const amp = (0.08 + 0.9 * norm(f, i)) * H * 0.44;
    g.moveTo(x, mid + Math.sin(ph) * amp);
    g.lineTo(x, mid - Math.sin(ph) * amp);
  }
  g.stroke();
  for (let strand = 0; strand < 2; strand++) {
    const sign = strand === 0 ? 1 : -1;
    for (let i = 0; i < f.n; i++) {
      const x = (posOf(f, i) + 0.5) * slot;
      const ph = (i / f.n) * turns * TAU + t;
      const amp = (0.08 + 0.9 * norm(f, i)) * H * 0.44;
      const depth = 0.55 + 0.45 * Math.cos(ph) * sign;
      g.globalAlpha = 0.35 + 0.65 * depth;
      g.fillStyle = colorAt(f, o, i);
      const s = size * (0.6 + 0.6 * depth);
      g.fillRect(x - s / 2, mid + sign * Math.sin(ph) * amp - s / 2, s, s);
    }
  }
  g.globalAlpha = 1;
};

const stripes: ModeFn = (g, f, W, H, o) => {
  const slot = W / f.n;
  for (let i = 0; i < f.n; i++) {
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(Math.floor(posOf(f, i) * slot), 0, Math.ceil(slot) + 1, H);
  }
};

const blocks: ModeFn = (g, f, W, H, o) => {
  bars(g, f, W, H, o);
  const shade = g.createLinearGradient(0, H, 0, 0);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  g.restore();
  const cell = Math.max(4 * o.dpr, Math.min(14 * o.dpr, (W / f.n) * 1.2));
  g.fillStyle = o.background;
  for (let y = H - cell; y > 0; y -= cell) g.fillRect(0, y, W, Math.max(1, cell * 0.18));
  if (W / f.n >= 4 * o.dpr) {
    const slot = W / f.n;
    for (let i = 0; i <= f.n; i++) g.fillRect(i * slot - 0.5 * o.dpr, 0, o.dpr, H);
  }
};

const disparity: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.47;
  g.strokeStyle = 'rgba(255,255,255,0.07)';
  g.lineWidth = o.dpr;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.stroke();
  const size = Math.max(1.5 * o.dpr, Math.min(5 * o.dpr, ((TAU * R) / f.n) * 0.7));
  g.lineWidth = Math.max(0.5, o.dpr * 0.6);
  g.globalAlpha = 0.35;
  for (let i = 0; i < f.n; i++) {
    const a = (posOf(f, i) / f.n) * TAU - Math.PI / 2;
    const d = Math.abs(i - targetIndex(f, f.values[i])) / Math.max(1, f.n);
    const r = R * (1 - Math.min(1, d * 2));
    g.strokeStyle = colorAt(f, o, i);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  g.globalAlpha = 1;
  for (let i = 0; i < f.n; i++) {
    const a = (posOf(f, i) / f.n) * TAU - Math.PI / 2;
    const d = Math.abs(i - targetIndex(f, f.values[i])) / Math.max(1, f.n);
    const r = R * (1 - Math.min(1, d * 2));
    g.fillStyle = colorAt(f, o, i);
    g.fillRect(cx + Math.cos(a) * r - size / 2, cy + Math.sin(a) * r - size / 2, size, size);
  }
};

const radialLines: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.48;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineWidth = Math.max(0.6, o.dpr * 0.8);
  g.globalAlpha = 0.75;
  for (let i = 0; i < f.n; i++) {
    const a = (posOf(f, i) / f.n) * TAU - Math.PI / 2;
    const r = norm(f, i) * R;
    g.strokeStyle = colorAt(f, o, i);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
  g.restore();
};

const migraine: ModeFn = (g, f, W, H, o) => {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.48;
  const k = 6;
  const intensity = Math.max(0, Math.min(1, o.migraineIntensity));
  const t = o.reducedMotion ? 0 : f.time;
  const rot = t * 0.12 * intensity; // slow rotation, never flashing
  const step = Math.max(1, Math.floor(f.n / 1500));
  g.save();
  g.translate(cx, cy);
  g.lineWidth = Math.max(0.7, o.dpr * (0.6 + intensity * 1.6));
  g.globalAlpha = 0.25 + 0.45 * intensity;
  for (let s = 0; s < k; s++) {
    g.save();
    g.rotate((s / k) * TAU + rot);
    if (s % 2) g.scale(1, -1);
    for (let i = 0; i < f.n; i += step) {
      const v = f.values[i];
      const dis = (i - targetIndex(f, v)) / Math.max(1, f.n);
      const base = (i / f.n) * (TAU / k);
      const a = base + dis * Math.PI * (0.5 + 3.5 * intensity);
      const r1 = R * (0.12 + 0.88 * norm(f, i));
      const r0 = r1 * (1 - 0.35 * intensity * Math.min(1, Math.abs(dis) * 4)) * 0.6;
      g.strokeStyle = colorAt(f, o, i);
      g.beginPath();
      g.moveTo(Math.cos(base) * r0, Math.sin(base) * r0);
      g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.stroke();
    }
    g.restore();
  }
  g.restore();
  g.globalAlpha = 1;
};

const MODE_FNS: Record<Exclude<VisualMode, 'bars3d' | 'sphere3d'>, ModeFn> = {
  bars,
  horizontal,
  ring,
  spiral,
  scatter,
  rainbowCircle,
  sunburst,
  triangle,
  waveform,
  dots,
  pixelGrid,
  colorWheel,
  helix,
  stripes,
  blocks,
  disparity,
  radialLines,
  migraine,
};

export function is2dMode(mode: VisualMode): mode is Exclude<VisualMode, 'bars3d' | 'sphere3d'> {
  return mode !== 'bars3d' && mode !== 'sphere3d';
}

/** Draw a frame of a 2D mode. The caller is responsible for clearing / background. */
export function drawMode(g: CanvasRenderingContext2D, mode: VisualMode, f: Frame, W: number, H: number, o: RenderOpts) {
  if (f.n === 0) return;
  if (!is2dMode(mode)) return;
  MODE_FNS[mode](g, f, W, H, o);
}

let glowCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

/** Cheap bloom: downsample the frame and add it back with additive blending. */
export function applyGlow(g: CanvasRenderingContext2D, W: number, H: number, amount: number) {
  if (amount <= 0.001) return;
  const gw = Math.max(1, Math.floor(W / 8));
  const gh = Math.max(1, Math.floor(H / 8));
  if (!glowCanvas) {
    glowCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(gw, gh) : document.createElement('canvas');
  }
  if (glowCanvas.width !== gw || glowCanvas.height !== gh) {
    glowCanvas.width = gw;
    glowCanvas.height = gh;
  }
  const gc = glowCanvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!gc) return;
  gc.clearRect(0, 0, gw, gh);
  gc.drawImage(g.canvas, 0, 0, gw, gh);
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, amount) * 0.9;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(glowCanvas as CanvasImageSource, 0, 0, W, H);
  g.restore();
}
