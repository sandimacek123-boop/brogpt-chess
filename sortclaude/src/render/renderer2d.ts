import type { RenderView } from './view';
import { ColorLUT, paletteStops, hexToRgb } from './palettes';
import type { Settings, Viz2D, CompletionEffect, BackgroundType } from '../state/settings';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface RenderOptions {
  viz: Viz2D;
  appearance: Settings['appearance'];
  sorting: Pick<Settings['sorting'], 'highlightCompare' | 'highlightSwap' | 'highlightPivot' | 'highlightSorted'>;
  completionEffect: CompletionEffect;
  reducedMotion: boolean;
  reducedFlashing: boolean;
  /** 0..1 quality scale used to switch off costly effects */
  quality: number;
  /** Cinematic post effects */
  post?: {
    vignette: number;
    grain: number;
    grading: Settings['cinematic']['grading'];
    zoom: number;
    cameraMotion: boolean;
    cameraSpeed: number;
    backgroundAnimation: boolean;
    backgroundBlur: number;
    glowBoost: number;
    particles: number;
  };
  /** Draw background? (multi-panel layouts draw it once) */
  background?: boolean;
}

const HEAT_STOPS = [
  { pos: 0, color: '#0b1d3a' },
  { pos: 0.25, color: '#2b59c3' },
  { pos: 0.5, color: '#a855f7' },
  { pos: 0.75, color: '#f43f5e' },
  { pos: 1, color: '#fde047' },
];

const HL_COMPARE = '#ffffff';
const HL_WRITE = '#f43fbd';
const HL_PIVOT = '#facc15';

interface Geo {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  R: number;
  dpr: number;
}

/** Cheap deterministic hash -> [0,1). */
function hash01(x: number): number {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Renderer2D {
  readonly canvas: AnyCanvas;
  private ctx: Ctx;
  private layer: AnyCanvas | null = null;
  private layerCtx: Ctx | null = null;
  private lut: ColorLUT | null = null;
  private lutKey = '';
  private heat = new ColorLUT(HEAT_STOPS, 256);
  private buckets = new Uint8Array(0);
  private order = new Int32Array(0);
  private counts = new Int32Array(257);
  private noise: AnyCanvas | null = null;
  private bgImage: HTMLImageElement | null = null;
  private bgImageSrc = '';
  private stars: Float32Array | null = null;

  constructor(canvas: AnyCanvas) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false }) as Ctx | null;
    if (!ctx) throw new Error('Canvas 2D is not available.');
    this.ctx = ctx;
  }

  private ensureLayer(w: number, h: number) {
    if (!this.layer || this.layer.width !== w || this.layer.height !== h) {
      this.layer = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      this.layerCtx = this.layer.getContext('2d') as Ctx;
    }
    return this.layerCtx!;
  }

  private getLUT(a: Settings['appearance']): ColorLUT {
    const stops = paletteStops(a.palette, a.customGradient);
    const key = JSON.stringify([stops, a.interpolation, a.palette]);
    if (key !== this.lutKey || !this.lut) {
      const hsl = a.palette === 'classic-rainbow' ? 'hsl' : a.interpolation;
      this.lut = new ColorLUT(stops, 256, hsl);
      this.lutKey = key;
    }
    return this.lut;
  }

  /** Render one frame into the full canvas, or into a sub-rectangle (multi-panel layouts). */
  render(view: RenderView, opt: RenderOptions, rect?: { x: number; y: number; w: number; h: number }) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const r = rect ?? { x: 0, y: 0, w: W, h: H };
    const dpr = Math.max(1, Math.min(W, H) / 700);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    if (opt.background !== false) this.drawBackground(ctx, r, opt, view.time);

    const a = opt.appearance;
    const post = opt.post;
    // cinematic camera: slow zoom + drift
    let zoom = a.scale;
    let rot = (a.rotation * Math.PI) / 180;
    let dx = 0;
    let dy = 0;
    if (post && post.cameraMotion && !opt.reducedMotion) {
      const t = view.time * post.cameraSpeed;
      zoom *= post.zoom + 0.015 * Math.sin(t * 0.7);
      dx = Math.sin(t * 0.31) * r.w * 0.01;
      dy = Math.cos(t * 0.23) * r.h * 0.01;
      rot += Math.sin(t * 0.17) * 0.01;
    } else if (post) zoom *= post.zoom;

    const pad = Math.min(r.w, r.h) * 0.04;
    const gw = (r.w - 2 * pad) * zoom;
    const gh = (r.h - 2 * pad) * zoom;
    const geo: Geo = {
      x: r.x + (r.w - gw) / 2 + dx,
      y: r.y + (r.h - gh) / 2 + dy,
      w: gw,
      h: gh,
      cx: r.x + r.w / 2 + dx,
      cy: r.y + r.h / 2 + dy,
      R: (Math.min(gw, gh) / 2) * 0.98,
      dpr,
    };

    const glow = Math.min(1, a.glow * (post ? 0.6 + post.glowBoost : 1)) * (opt.quality >= 0.5 ? 1 : 0);
    const target = glow > 0.02 || a.blur > 0 ? this.ensureLayer(W, H) : ctx;
    if (target !== ctx) {
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(r.x, r.y, r.w, r.h);
    }
    target.save();
    if (rot !== 0) {
      target.translate(geo.cx, geo.cy);
      target.rotate(rot);
      target.translate(-geo.cx, -geo.cy);
    }
    target.globalAlpha = a.opacity;
    this.drawRange(target, view, geo, opt);
    this.drawElements(target, view, geo, opt);
    target.globalAlpha = 1;
    this.drawHighlights(target, view, geo, opt);
    if (view.completion >= 0) this.drawCompletionElements(target, view, geo, opt);
    target.restore();

    if (target !== ctx && this.layer) {
      if (glow > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = glow * 0.9;
        ctx.filter = `blur(${Math.round(10 * dpr)}px)`;
        ctx.drawImage(this.layer as CanvasImageSource, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        ctx.restore();
      }
      ctx.save();
      if (a.blur > 0) ctx.filter = `blur(${(a.blur * dpr).toFixed(1)}px)`;
      ctx.drawImage(this.layer as CanvasImageSource, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      ctx.restore();
    }
    if (view.completion >= 0) this.drawCompletionOverlay(ctx, view, geo, opt);
    if (post) this.drawPost(ctx, r, post, view.time, opt);
    ctx.restore();
  }

  // ------------------------------------------------------------------ background
  private drawBackground(ctx: Ctx, r: { x: number; y: number; w: number; h: number }, opt: RenderOptions, time: number) {
    const a = opt.appearance;
    const type: BackgroundType = a.background;
    const animate = !opt.reducedMotion && (!opt.post || opt.post.backgroundAnimation);
    const t = animate ? time : 0;
    ctx.fillStyle = a.bgColor1;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const s = Math.min(r.w, r.h);
    switch (type) {
      case 'solid':
        break;
      case 'gradient': {
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w * 0.3, r.y + r.h);
        g.addColorStop(0, a.bgColor1);
        g.addColorStop(1, a.bgColor2);
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        break;
      }
      case 'starfield': {
        if (!this.stars) {
          this.stars = new Float32Array(900);
          for (let i = 0; i < 300; i++) {
            this.stars[i * 3] = hash01(i * 3 + 1);
            this.stars[i * 3 + 1] = hash01(i * 3 + 2);
            this.stars[i * 3 + 2] = hash01(i * 3 + 3);
          }
        }
        const count = Math.floor(300 * Math.min(1, 0.4 + opt.quality));
        for (let i = 0; i < count; i++) {
          const sx = this.stars[i * 3];
          const sy = this.stars[i * 3 + 1];
          const sz = this.stars[i * 3 + 2];
          const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + sz * 2) + i);
          ctx.fillStyle = `rgba(220,230,255,${(0.15 + 0.6 * sz * tw).toFixed(3)})`;
          const px = r.x + ((sx * r.w + t * 4 * sz) % r.w);
          const size = (0.6 + sz * 1.8) * (s / 900);
          ctx.fillRect(px, r.y + sy * r.h, size, size);
        }
        break;
      }
      case 'grid':
      case 'math-grid': {
        const step = s / 18;
        ctx.lineWidth = Math.max(1, s / 1400);
        ctx.strokeStyle = type === 'grid' ? 'rgba(255,255,255,0.045)' : 'rgba(56,223,255,0.05)';
        ctx.beginPath();
        const ox = (r.x + r.w / 2) % step;
        const oy = (r.y + r.h / 2) % step;
        for (let x = r.x + ox; x < r.x + r.w; x += step) {
          ctx.moveTo(x, r.y);
          ctx.lineTo(x, r.y + r.h);
        }
        for (let y = r.y + oy; y < r.y + r.h; y += step) {
          ctx.moveTo(r.x, y);
          ctx.lineTo(r.x + r.w, y);
        }
        ctx.stroke();
        if (type === 'math-grid') {
          ctx.strokeStyle = 'rgba(168,85,247,0.07)';
          ctx.beginPath();
          const cx = r.x + r.w / 2;
          const cy = r.y + r.h / 2;
          for (let k = 1; k <= 4; k++) {
            ctx.moveTo(cx + (k * s) / 8, cy);
            ctx.arc(cx, cy, (k * s) / 8, 0, Math.PI * 2);
          }
          ctx.moveTo(cx, r.y);
          ctx.lineTo(cx, r.y + r.h);
          ctx.moveTo(r.x, cy);
          ctx.lineTo(r.x + r.w, cy);
          ctx.stroke();
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r.w, r.h) * 0.7);
          g.addColorStop(0, 'rgba(56,40,120,0.18)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        break;
      }
      case 'particles': {
        const count = Math.floor(120 * Math.max(0.3, opt.quality));
        for (let i = 0; i < count; i++) {
          const hx = hash01(i * 7 + 3);
          const hy = hash01(i * 7 + 5);
          const hs = hash01(i * 7 + 11);
          const px = r.x + ((hx * r.w + Math.sin(t * 0.2 + i) * 30 + t * 8 * (hs - 0.5)) % r.w + r.w) % r.w;
          const py = r.y + ((hy * r.h - t * 10 * (0.3 + hs)) % r.h + r.h) % r.h;
          ctx.fillStyle = `rgba(168,85,247,${(0.06 + hs * 0.18).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, (1 + hs * 3) * (s / 900), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'geometric': {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        ctx.lineWidth = Math.max(1, s / 900);
        for (let k = 0; k < 6; k++) {
          const rad = s * (0.2 + k * 0.13);
          const sides = 3 + (k % 4);
          const ang = t * 0.03 * (k % 2 ? 1 : -1) + k;
          ctx.strokeStyle = `rgba(${k % 2 ? '56,223,255' : '244,63,189'},${0.05 - k * 0.005})`;
          ctx.beginPath();
          for (let i = 0; i <= sides; i++) {
            const th = ang + (i / sides) * Math.PI * 2;
            const px = cx + Math.cos(th) * rad;
            const py = cy + Math.sin(th) * rad;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        break;
      }
      case 'image': {
        if (a.bgImage && a.bgImage !== this.bgImageSrc && typeof Image !== 'undefined') {
          this.bgImageSrc = a.bgImage;
          const img = new Image();
          img.src = a.bgImage;
          this.bgImage = img;
        }
        const img = this.bgImage;
        if (img && img.complete && img.naturalWidth > 0) {
          const sc = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight);
          const iw = img.naturalWidth * sc;
          const ih = img.naturalHeight * sc;
          ctx.drawImage(img, r.x + (r.w - iw) / 2, r.y + (r.h - ih) / 2, iw, ih);
          ctx.fillStyle = 'rgba(5,5,9,0.55)';
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        break;
      }
    }
    if (opt.post && opt.post.backgroundBlur > 0 && opt.quality >= 0.5) {
      // soft haze instead of a true blur of the background (cheaper, same feel)
      ctx.fillStyle = `rgba(10,10,20,${Math.min(0.5, opt.post.backgroundBlur / 40).toFixed(3)})`;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }

  // ------------------------------------------------------------------ colour per element
  private computeBuckets(view: RenderView, opt: RenderOptions) {
    const n = view.n;
    if (this.buckets.length < n) {
      this.buckets = new Uint8Array(n);
      this.order = new Int32Array(n);
    }
    const a = opt.appearance;
    const span = Math.max(1, view.maxKey - view.minKey);
    const keys = view.keys;
    const ids = view.ids;
    const b = this.buckets;
    const inv = n > 1 ? 1 / (n - 1) : 0;
    const mode = a.colorMode;
    const rot = opt.reducedMotion ? 0 : view.time * 0.08;
    if (opt.viz === 'heatmap') {
      const denom = Math.max(1, n / 2);
      for (let i = 0; i < n; i++) b[i] = Math.min(255, Math.round((Math.abs(view.finalPos[ids[i]] - i) / denom) * 255));
    } else {
      for (let i = 0; i < n; i++) {
        let t: number;
        switch (mode) {
          case 'index':
            t = i * inv;
            break;
          case 'identity':
            t = ids[i] * inv;
            break;
          case 'rainbow-rotation':
            t = ((keys[ids[i]] - view.minKey) / span + rot) % 1;
            break;
          case 'fixed':
            t = 0;
            break;
          default:
            t = (keys[ids[i]] - view.minKey) / span;
        }
        b[i] = Math.round(t * 255);
      }
    }
    // counting sort indices by bucket
    const counts = this.counts;
    counts.fill(0);
    for (let i = 0; i < n; i++) counts[b[i] + 1]++;
    for (let k = 1; k <= 256; k++) counts[k] += counts[k - 1];
    const starts = counts.slice(0, 256);
    for (let i = 0; i < n; i++) this.order[starts[b[i]]++] = i;
  }

  private colorOf(bucket: number, opt: RenderOptions, lut: ColorLUT): string {
    if (opt.viz === 'heatmap') return this.heat.css[bucket];
    if (opt.appearance.colorMode === 'fixed') return opt.appearance.fixedColor;
    return lut.css[bucket];
  }

  private value(view: RenderView, i: number): number {
    const span = view.maxKey - view.minKey;
    if (span <= 0) return 1;
    return (view.keys[view.ids[i]] - view.minKey) / span;
  }

  // ------------------------------------------------------------------ main element pass
  private drawElements(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions) {
    const n = view.n;
    if (n === 0) {
      ctx.fillStyle = 'rgba(153,153,178,0.6)';
      ctx.font = `${Math.round(16 * g.dpr)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Empty array — nothing to sort', g.cx, g.cy);
      return;
    }
    const lut = this.getLUT(opt.appearance);
    this.computeBuckets(view, opt);
    const viz = opt.viz;

    // raster fast-path for dense linear modes
    if ((viz === 'bars' || viz === 'strips' || viz === 'spectrum') && n > g.w * 1.5) {
      this.rasterLinear(ctx, view, g, opt, lut);
      return;
    }

    if (viz === 'wave') return this.drawWave(ctx, view, g, opt, lut);
    if (viz === 'waterfall') return this.drawWaterfall(ctx, view, g, opt, lut);
    if (viz === 'matrix') return this.drawMatrix(ctx, view, g, opt, lut);
    if (viz === 'ring' || viz === 'spikes') this.drawConnector(ctx, view, g, opt);

    const stroke = viz === 'circular-bars' || viz === 'spikes';
    const shape = this.shapeFn(viz, view, g, opt);
    if (stroke) {
      ctx.lineWidth = this.strokeWidth(viz, n, g, opt);
      ctx.lineCap = 'round';
    }
    const counts = this.counts;
    // counts[k] is now the END of bucket k-1 after the prefix pass; recompute ranges
    const order = this.order;
    let start = 0;
    for (let bucket = 0; bucket < 256; bucket++) {
      // find end of this bucket
      let end = start;
      while (end < n && this.buckets[order[end]] === bucket) end++;
      if (end === start) continue;
      const color = this.colorOf(bucket, opt, lut);
      ctx.beginPath();
      for (let k = start; k < end; k++) shape(ctx, order[k]);
      if (stroke) {
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
      start = end;
    }
    void counts;
    if (opt.appearance.outline > 0 && n <= 2000 && !stroke) {
      ctx.lineWidth = opt.appearance.outline * g.dpr * 0.6;
      ctx.strokeStyle = 'rgba(5,5,9,0.65)';
      ctx.beginPath();
      for (let i = 0; i < n; i++) shape(ctx, i);
      ctx.stroke();
    }
    if (viz === 'skyline') this.drawSkylineWindows(ctx, view, g, opt);
  }

  private strokeWidth(viz: Viz2D, n: number, g: Geo, opt: RenderOptions): number {
    const a = opt.appearance;
    const r0 = viz === 'circular-bars' ? g.R * 0.28 : g.R * 0.1;
    const circ = 2 * Math.PI * (viz === 'circular-bars' ? g.R * 0.6 : r0 + g.R * 0.3);
    return Math.max(0.6 * g.dpr, (circ / n) * (1 - a.spacing) * a.size * 0.9);
  }

  /** Returns a function adding element i's subpath. */
  private shapeFn(viz: Viz2D, view: RenderView, g: Geo, opt: RenderOptions): (ctx: Ctx, i: number) => void {
    const a = opt.appearance;
    const n = view.n;
    const val = (i: number) => this.value(view, i);
    const TAU = Math.PI * 2;
    const minH = 0.012;
    switch (viz) {
      case 'bars': {
        const bw = g.w / n;
        const gap = bw > 3 ? bw * a.spacing : 0;
        const width = Math.max(0.5, (bw - gap) * Math.min(1, a.size));
        const off = (bw - width) / 2;
        return (ctx, i) => {
          const h = (minH + (1 - minH) * val(i)) * g.h;
          ctx.rect(g.x + i * bw + off, g.y + g.h - h, width, h);
        };
      }
      case 'skyline': {
        const bw = g.w / n;
        const gap = bw > 3 ? bw * Math.max(0.06, a.spacing * 0.5) : 0;
        const width = Math.max(0.5, bw - gap);
        const base = g.y + g.h * 0.86;
        return (ctx, i) => {
          const h = (0.04 + 0.96 * val(i)) * g.h * 0.82;
          ctx.rect(g.x + i * bw + gap / 2, base - h, width, h);
          // reflection
          ctx.rect(g.x + i * bw + gap / 2, base + 2, width, Math.min(h * 0.12, g.h * 0.12));
        };
      }
      case 'hbars': {
        const bh = g.h / n;
        const gap = bh > 3 ? bh * a.spacing : 0;
        const height = Math.max(0.5, (bh - gap) * Math.min(1, a.size));
        const off = (bh - height) / 2;
        return (ctx, i) => {
          const w = (minH + (1 - minH) * val(i)) * g.w;
          ctx.rect(g.x, g.y + i * bh + off, w, height);
        };
      }
      case 'strips': {
        const bh = g.h / n;
        return (ctx, i) => ctx.rect(g.x, g.y + i * bh, g.w, Math.max(bh, 0.6) + 0.4);
      }
      case 'spectrum': {
        const bw = g.w / n;
        const gap = bw > 3 ? bw * Math.max(a.spacing, 0.2) : 0;
        const width = Math.max(0.5, bw - gap);
        return (ctx, i) => {
          const h = (0.02 + 0.98 * val(i)) * g.h * 0.48;
          ctx.rect(g.x + i * bw + gap / 2, g.cy - h, width, h * 2);
        };
      }
      case 'wheel': {
        const r0 = g.R * 0.16;
        const eps = n > 600 ? 0.004 : 0.0015;
        return (ctx, i) => {
          const a0 = (i / n) * TAU - Math.PI / 2;
          const a1 = ((i + 1) / n) * TAU - Math.PI / 2 + eps;
          ctx.moveTo(g.cx + Math.cos(a0) * r0, g.cy + Math.sin(a0) * r0);
          ctx.arc(g.cx, g.cy, g.R, a0, a1);
          ctx.arc(g.cx, g.cy, r0, a1, a0, true);
        };
      }
      case 'sunburst': {
        const r0 = g.R * 0.22;
        const eps = 0.002;
        return (ctx, i) => {
          const a0 = (i / n) * TAU - Math.PI / 2;
          const a1 = ((i + 1) / n) * TAU - Math.PI / 2 + eps;
          const rr = r0 + (g.R - r0) * (0.05 + 0.95 * val(i));
          ctx.moveTo(g.cx + Math.cos(a0) * r0, g.cy + Math.sin(a0) * r0);
          ctx.arc(g.cx, g.cy, rr, a0, a1);
          ctx.arc(g.cx, g.cy, r0, a1, a0, true);
        };
      }
      case 'spiral': {
        const turns = Math.max(2, Math.min(8, Math.round(Math.log2(n + 2))));
        const pr = Math.max(0.8 * g.dpr, Math.min(g.R * 0.03, (g.R * 2.6) / Math.sqrt(n + 1)) * a.pointSize * 0.5);
        return (ctx, i) => {
          const th = (i / n) * turns * TAU - Math.PI / 2;
          const rr = g.R * (0.06 + 0.94 * val(i));
          const px = g.cx + Math.cos(th) * rr;
          const py = g.cy + Math.sin(th) * rr;
          ctx.moveTo(px + pr, py);
          ctx.arc(px, py, pr, 0, TAU);
        };
      }
      case 'ring': {
        const pr = Math.max(0.8 * g.dpr, Math.min(g.R * 0.035, (g.R * 4) / (n + 1)) * a.pointSize);
        return (ctx, i) => {
          const th = (i / n) * TAU - Math.PI / 2;
          const rr = g.R * (0.42 + 0.58 * val(i));
          const px = g.cx + Math.cos(th) * rr;
          const py = g.cy + Math.sin(th) * rr;
          ctx.moveTo(px + pr, py);
          ctx.arc(px, py, pr, 0, TAU);
        };
      }
      case 'particles': {
        const pr = Math.max(0.7 * g.dpr, Math.min(g.R * 0.025, (g.R * 3) / Math.sqrt(n + 1)) * a.pointSize * 0.45);
        const t = opt.reducedMotion ? 0 : view.time;
        return (ctx, i) => {
          const id = view.ids[i];
          const h1 = hash01(id * 2 + 1);
          const h2 = hash01(id * 2 + 7);
          const th = (i / n) * TAU - Math.PI / 2 + (h1 - 0.5) * 0.04 + Math.sin(t * 0.6 + h2 * 6) * 0.01;
          const rr = g.R * (0.1 + 0.85 * val(i)) + Math.sin(t * (0.5 + h1) + h2 * 9) * g.R * 0.012;
          const px = g.cx + Math.cos(th) * rr;
          const py = g.cy + Math.sin(th) * rr;
          if (pr < 1.6) ctx.rect(px - pr, py - pr, pr * 2, pr * 2);
          else {
            ctx.moveTo(px + pr, py);
            ctx.arc(px, py, pr, 0, TAU);
          }
        };
      }
      case 'scatter': {
        const pr = Math.max(1 * g.dpr, Math.min(g.w / 60, (g.w / n) * 0.9) * a.pointSize * 0.5);
        return (ctx, i) => {
          const px = g.x + (n > 1 ? (i / (n - 1)) * g.w : g.w / 2);
          const py = g.y + g.h - val(i) * g.h;
          ctx.rect(px - pr, py - pr, pr * 2, pr * 2);
        };
      }
      case 'tiles':
      case 'heatmap':
      case 'dots': {
        const aspect = g.w / g.h;
        const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
        const rows = Math.max(1, Math.ceil(n / cols));
        const cw = g.w / cols;
        const ch = g.h / rows;
        const cell = Math.min(cw, ch);
        const ox = g.x + (g.w - cols * cell) / 2;
        const oy = g.y + (g.h - rows * cell) / 2;
        const gap = cell > 4 ? cell * a.spacing * 0.6 : 0;
        if (viz === 'dots') {
          return (ctx, i) => {
            const c = i % cols;
            const rr = Math.floor(i / cols);
            const rad = Math.max(0.6, (cell / 2 - gap / 2) * (0.35 + 0.65 * val(i)) * Math.min(1.4, a.pointSize));
            const px = ox + c * cell + cell / 2;
            const py = oy + rr * cell + cell / 2;
            ctx.moveTo(px + rad, py);
            ctx.arc(px, py, rad, 0, TAU);
          };
        }
        return (ctx, i) => {
          const c = i % cols;
          const rr = Math.floor(i / cols);
          ctx.rect(ox + c * cell + gap / 2, oy + rr * cell + gap / 2, Math.max(0.5, cell - gap), Math.max(0.5, cell - gap));
        };
      }
      case 'circular-bars': {
        const r0 = g.R * 0.28;
        return (ctx, i) => {
          const th = ((i + 0.5) / n) * TAU - Math.PI / 2;
          const rr = r0 + (g.R - r0) * (0.04 + 0.96 * val(i));
          const c = Math.cos(th);
          const s = Math.sin(th);
          ctx.moveTo(g.cx + c * r0, g.cy + s * r0);
          ctx.lineTo(g.cx + c * rr, g.cy + s * rr);
        };
      }
      case 'spikes': {
        const r0 = g.R * 0.1;
        return (ctx, i) => {
          const th = ((i + 0.5) / n) * TAU - Math.PI / 2;
          const rr = r0 + (g.R - r0) * (0.05 + 0.95 * val(i));
          ctx.moveTo(g.cx + Math.cos(th) * r0, g.cy + Math.sin(th) * r0);
          ctx.lineTo(g.cx + Math.cos(th) * rr, g.cy + Math.sin(th) * rr);
        };
      }
      case 'ribbon': {
        const bw = g.w / n;
        const t = opt.reducedMotion ? 0 : view.time * 0.5;
        return (ctx, i) => {
          const u = i / Math.max(1, n - 1);
          const yc = g.cy + Math.sin(u * Math.PI * 3 + t) * g.h * 0.14;
          const twist = Math.cos(u * Math.PI * 4 + t * 0.7);
          const half = (0.08 + 0.92 * val(i)) * g.h * 0.3;
          const top = yc - half;
          const bot = yc + half * twist;
          const y0 = Math.min(top, bot);
          const hh = Math.max(1, Math.abs(bot - top));
          ctx.rect(g.x + i * bw, y0, bw + 0.6, hh);
        };
      }
      default:
        return () => {};
    }
  }

  private drawConnector(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions) {
    const n = view.n;
    if (n < 3) return;
    ctx.save();
    ctx.globalAlpha *= 0.25;
    ctx.lineWidth = Math.max(1, g.dpr);
    ctx.strokeStyle = 'rgba(200,210,255,0.6)';
    ctx.beginPath();
    const step = Math.max(1, Math.floor(n / 2000));
    const r0 = opt.viz === 'spikes' ? 0.1 : 0.42;
    for (let i = 0; i <= n; i += step) {
      const k = i % n;
      const th = ((k + (opt.viz === 'spikes' ? 0.5 : 0)) / n) * Math.PI * 2 - Math.PI / 2;
      const rr = g.R * (r0 + (1 - r0) * (0.05 + 0.95 * this.value(view, k)));
      const px = g.cx + Math.cos(th) * rr;
      const py = g.cy + Math.sin(th) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (opt.viz === 'spikes') {
      const grad = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.R);
      grad.addColorStop(0, 'rgba(168,85,247,0.5)');
      grad.addColorStop(1, 'rgba(56,223,255,0.15)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.35 * opt.appearance.opacity;
      ctx.fill();
    }
    ctx.stroke();
    ctx.restore();
  }

  private rasterLinear(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions, lut: ColorLUT) {
    // One column (or row) per device pixel, showing the element at that position (sampled).
    const n = view.n;
    const viz = opt.viz;
    const cols = Math.max(1, Math.floor(viz === 'strips' ? g.h : g.w));
    const fixed = opt.appearance.colorMode === 'fixed';
    const byColor = new Map<string, number[]>();
    for (let c = 0; c < cols; c++) {
      const i = Math.min(n - 1, Math.floor((c / cols) * n));
      const color = fixed ? opt.appearance.fixedColor : lut.css[this.buckets[i]];
      let list = byColor.get(color);
      if (!list) byColor.set(color, (list = []));
      list.push(c, i);
    }
    for (const [color, list] of byColor) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let k = 0; k < list.length; k += 2) {
        const c = list[k];
        const i = list[k + 1];
        const v = 0.012 + 0.988 * this.value(view, i);
        if (viz === 'bars') ctx.rect(g.x + (c / cols) * g.w, g.y + g.h - v * g.h, g.w / cols + 0.5, v * g.h);
        else if (viz === 'spectrum') ctx.rect(g.x + (c / cols) * g.w, g.cy - v * g.h * 0.48, g.w / cols + 0.5, v * g.h * 0.96);
        else ctx.rect(g.x, g.y + (c / cols) * g.h, g.w, g.h / cols + 0.5);
      }
      ctx.fill();
    }
  }

  private drawWave(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions, lut: ColorLUT) {
    const n = view.n;
    const step = Math.max(1, Math.floor(n / Math.max(200, g.w)));
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i += step) {
      const px = g.x + (n > 1 ? (i / (n - 1)) * g.w : g.w / 2);
      const py = g.y + g.h * 0.92 - this.value(view, i) * g.h * 0.84;
      pts.push([px, py]);
    }
    if (pts.length < 2) return;
    const grad = ctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
    const stops = Math.min(64, n);
    for (let s = 0; s < stops; s++) {
      const i = Math.min(n - 1, Math.floor((s / Math.max(1, stops - 1)) * (n - 1)));
      grad.addColorStop(stops === 1 ? 0 : s / (stops - 1), this.colorOf(this.buckets[i], opt, lut));
    }
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      const smooth = opt.appearance.smoothing;
      for (let k = 1; k < pts.length; k++) {
        const [x0, y0] = pts[k - 1];
        const [x1, y1] = pts[k];
        if (smooth > 0.05) {
          const mx = (x0 + x1) / 2;
          ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
        } else ctx.lineTo(x1, y1);
      }
    };
    path();
    ctx.lineTo(pts[pts.length - 1][0], g.y + g.h);
    ctx.lineTo(pts[0][0], g.y + g.h);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
    path();
    ctx.lineWidth = Math.max(1.5, 2.5 * g.dpr * opt.appearance.size);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = grad;
    ctx.stroke();
  }

  private drawWaterfall(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions, lut: ColorLUT) {
    const n = view.n;
    const layers = 4;
    const bw = g.w / n;
    for (let L = layers - 1; L >= 0; L--) {
      const scale = 1 - L * 0.17;
      const yOff = L * g.h * 0.055;
      ctx.save();
      ctx.globalAlpha *= L === 0 ? 1 : 0.18 + (layers - L) * 0.08;
      let start = 0;
      for (let bucket = 0; bucket < 256; bucket++) {
        let end = start;
        while (end < n && this.buckets[this.order[end]] === bucket) end++;
        if (end === start) continue;
        ctx.fillStyle = this.colorOf(bucket, opt, lut);
        ctx.beginPath();
        for (let k = start; k < end; k++) {
          const i = this.order[k];
          const h = (0.03 + 0.97 * this.value(view, i)) * g.h * 0.78 * scale;
          ctx.rect(g.x + i * bw, g.y + g.h - h - yOff, bw + 0.5, L === 0 ? h * 0.08 + 2 * g.dpr : h);
        }
        ctx.fill();
        start = end;
      }
      ctx.restore();
    }
    // top edge
    ctx.strokeStyle = 'rgba(245,245,250,0.55)';
    ctx.lineWidth = Math.max(1, g.dpr);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const h = (0.03 + 0.97 * this.value(view, i)) * g.h * 0.78;
      const y = g.y + g.h - h;
      if (i === 0) ctx.moveTo(g.x, y);
      else ctx.lineTo(g.x + i * bw, y);
      ctx.lineTo(g.x + (i + 1) * bw, y);
    }
    ctx.stroke();
  }

  private drawMatrix(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions, lut: ColorLUT) {
    const n = view.n;
    const cols = Math.min(n, Math.floor(g.w / Math.max(3, 4 * g.dpr)));
    const cw = g.w / cols;
    const rows = Math.max(4, Math.min(64, Math.floor(g.h / Math.max(cw, 4 * g.dpr))));
    const chh = g.h / rows;
    const gap = Math.max(0.5, Math.min(cw, chh) * 0.18);
    // unlit cells
    ctx.fillStyle = 'rgba(120,120,170,0.08)';
    ctx.beginPath();
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) ctx.rect(g.x + c * cw + gap / 2, g.y + r * chh + gap / 2, cw - gap, chh - gap);
    ctx.fill();
    const byColor = new Map<string, number[]>();
    for (let c = 0; c < cols; c++) {
      const i = Math.min(n - 1, Math.floor((c / cols) * n));
      const color = this.colorOf(this.buckets[i], opt, lut);
      let list = byColor.get(color);
      if (!list) byColor.set(color, (list = []));
      list.push(c, Math.max(1, Math.round(this.value(view, i) * rows)));
    }
    for (const [color, list] of byColor) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let k = 0; k < list.length; k += 2) {
        const c = list[k];
        const lit = list[k + 1];
        for (let r = rows - lit; r < rows; r++) ctx.rect(g.x + c * cw + gap / 2, g.y + r * chh + gap / 2, cw - gap, chh - gap);
      }
      ctx.fill();
    }
  }

  private drawSkylineWindows(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions) {
    const n = view.n;
    const bw = g.w / n;
    const base = g.y + g.h * 0.86;
    ctx.fillStyle = 'rgba(5,5,9,0.55)';
    ctx.fillRect(g.x, base + 2, g.w, g.h * 0.14);
    ctx.strokeStyle = 'rgba(56,223,255,0.35)';
    ctx.lineWidth = Math.max(1, g.dpr);
    ctx.beginPath();
    ctx.moveTo(g.x, base + 1);
    ctx.lineTo(g.x + g.w, base + 1);
    ctx.stroke();
    if (bw < 7 * g.dpr || opt.quality < 0.5) return;
    ctx.fillStyle = 'rgba(255,240,200,0.55)';
    ctx.beginPath();
    const ws = Math.max(1.5, bw * 0.16);
    for (let i = 0; i < n; i++) {
      const h = (0.04 + 0.96 * this.value(view, i)) * g.h * 0.82;
      const id = view.ids[i];
      for (let y = base - h + ws * 2; y < base - ws * 2; y += ws * 3) {
        for (let x = 0; x < 2; x++) {
          if (hash01(id * 131 + Math.floor(y) * 7 + x) < 0.55) ctx.rect(g.x + i * bw + bw * (0.25 + x * 0.35), y, ws, ws);
        }
      }
    }
    ctx.fill();
  }

  // ------------------------------------------------------------------ overlays
  /** Draw a single element's shape with a given style (used for highlights). */
  private overlay(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions, indices: number[], color: string, alpha: number) {
    // (indices may be thinned below for very large overlays)
    if (!indices.length || alpha <= 0) return;
    const viz = opt.viz;
    const n = view.n;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (viz === 'wave' || viz === 'waterfall' || viz === 'matrix' || ((viz === 'bars' || viz === 'strips' || viz === 'spectrum') && n > g.w * 1.5)) {
      // markers for path-based / sampled modes
      ctx.fillStyle = color;
      ctx.beginPath();
      // one marker per device-pixel column (never one per element): O(min(k, width))
      const span = viz === 'strips' ? g.h : g.w;
      const cols = Math.max(1, Math.floor(span));
      const seenCol = new Uint8Array(cols + 1);
      const mw = Math.max(2 * g.dpr, span / n);
      for (const i of indices) {
        const c = Math.min(cols, Math.floor((i / n) * cols));
        if (seenCol[c]) continue;
        seenCol[c] = 1;
        const p = ((i + 0.5) / n) * span;
        if (viz === 'strips') ctx.rect(g.x, g.y + p - mw / 2, g.w, mw);
        else ctx.rect(g.x + p - mw / 2, g.y, mw, g.h);
      }
      ctx.globalAlpha = alpha * 0.45;
      ctx.fill();
      ctx.restore();
      return;
    }
    const stroke = viz === 'circular-bars' || viz === 'spikes';
    const shape = this.shapeFn(viz, view, g, opt);
    if (indices.length > 6000) indices = indices.filter((_, k) => k % Math.ceil(indices.length / 6000) === 0);
    ctx.beginPath();
    const seen = new Set<number>();
    for (const i of indices) {
      if (i < 0 || i >= n || seen.has(i)) continue;
      seen.add(i);
      shape(ctx, i);
    }
    if (stroke) {
      ctx.lineWidth = this.strokeWidth(viz, n, g, opt) * 1.6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHighlights(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions) {
    if (view.done && view.completion < 0) return;
    const k = opt.appearance.highlightIntensity;
    const s = opt.sorting;
    if (s.highlightSorted && !view.done) {
      const idx: number[] = [];
      for (let i = 0; i < view.n; i++) if (view.sorted[i]) idx.push(i);
      if (idx.length < view.n) this.overlay(ctx, view, g, opt, idx, '#ffffff', 0.1 * k);
    }
    if (s.highlightCompare) this.overlay(ctx, view, g, opt, view.compare, HL_COMPARE, 0.9 * k);
    if (s.highlightSwap) this.overlay(ctx, view, g, opt, view.write, HL_WRITE, 0.95 * k);
    if (s.highlightPivot && view.pivot >= 0 && view.pivot < view.n && !view.done) this.overlay(ctx, view, g, opt, [view.pivot], HL_PIVOT, 0.95 * k);
  }

  private drawRange(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions) {
    const rg = view.range;
    if (!rg || view.done || view.n === 0) return;
    const [lo, hi] = rg;
    if (lo < 0 || hi >= view.n || hi < lo) return;
    const n = view.n;
    ctx.save();
    ctx.fillStyle = 'rgba(56,223,255,0.06)';
    const radial = ['wheel', 'spiral', 'ring', 'sunburst', 'circular-bars', 'particles', 'spikes'].includes(opt.viz);
    if (radial) {
      const turns = opt.viz === 'spiral' ? Math.max(2, Math.min(8, Math.round(Math.log2(n + 2)))) : 1;
      if (turns === 1) {
        ctx.beginPath();
        ctx.moveTo(g.cx, g.cy);
        ctx.arc(g.cx, g.cy, g.R * 1.02, (lo / n) * Math.PI * 2 - Math.PI / 2, ((hi + 1) / n) * Math.PI * 2 - Math.PI / 2);
        ctx.closePath();
        ctx.fill();
      }
    } else if (opt.viz === 'hbars' || opt.viz === 'strips') {
      ctx.fillRect(g.x, g.y + (lo / n) * g.h, g.w, ((hi - lo + 1) / n) * g.h);
    } else if (!['tiles', 'heatmap', 'dots'].includes(opt.viz)) {
      ctx.fillRect(g.x + (lo / n) * g.w, g.y, ((hi - lo + 1) / n) * g.w, g.h);
      ctx.fillStyle = 'rgba(56,223,255,0.35)';
      ctx.fillRect(g.x + (lo / n) * g.w, g.y + g.h + 3 * g.dpr, ((hi - lo + 1) / n) * g.w, 2 * g.dpr);
    }
    ctx.restore();
  }

  private drawCompletionElements(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions) {
    const p = view.completion;
    const eff = opt.completionEffect;
    const n = view.n;
    if (n === 0 || eff === 'none') return;
    const maxA = opt.reducedFlashing ? 0.35 : 0.85;
    if (eff === 'rainbow-sweep' || eff === 'completion-wave' || eff === 'cascade') {
      const front = p * 1.15;
      const idx: number[] = [];
      const band: number[] = [];
      for (let i = 0; i < n; i++) {
        const u = i / Math.max(1, n - 1);
        if (u <= front) idx.push(i);
        if (Math.abs(u - front) < 0.05) band.push(i);
      }
      if (eff === 'completion-wave') this.overlay(ctx, view, g, opt, idx, '#34d399', 0.22 * (1 - p * 0.8));
      if (eff === 'cascade') this.overlay(ctx, view, g, opt, idx, '#ffffff', 0.12 * (1 - p));
      this.overlay(ctx, view, g, opt, band, '#ffffff', maxA * (1 - p * 0.5));
    }
  }

  private drawCompletionOverlay(ctx: Ctx, view: RenderView, g: Geo, opt: RenderOptions) {
    const p = view.completion;
    const eff = opt.completionEffect;
    const maxA = opt.reducedFlashing ? 0.3 : 0.7;
    const TAU = Math.PI * 2;
    if (eff === 'radial-pulse') {
      for (let k = 0; k < 3; k++) {
        const q = p * 1.4 - k * 0.18;
        if (q <= 0 || q >= 1) continue;
        ctx.strokeStyle = `rgba(56,223,255,${(maxA * (1 - q)).toFixed(3)})`;
        ctx.lineWidth = (3 + 6 * (1 - q)) * g.dpr;
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.R * (0.1 + 1.3 * q), 0, TAU);
        ctx.stroke();
      }
    } else if (eff === 'particle-burst') {
      const count = Math.floor(160 * Math.max(0.3, opt.quality));
      for (let i = 0; i < count; i++) {
        const a = hash01(i * 3 + 1) * TAU;
        const sp = 0.3 + hash01(i * 3 + 2) * 0.9;
        const d = g.R * sp * (1 - Math.pow(1 - p, 3)) * 1.3;
        const alpha = maxA * (1 - p) * (0.4 + 0.6 * hash01(i * 3 + 3));
        const hue = Math.floor(hash01(i + 99) * 360);
        ctx.fillStyle = `hsla(${hue},90%,65%,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(g.cx + Math.cos(a) * d, g.cy + Math.sin(a) * d, (1.5 + 2.5 * hash01(i * 5)) * g.dpr, 0, TAU);
        ctx.fill();
      }
    } else if (eff === 'geometric') {
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU + hash01(i) * 0.3;
        const d = g.R * (0.2 + p * 1.1) * (0.6 + 0.4 * hash01(i * 7));
        const size = g.R * 0.035 * (1 - p * 0.6);
        const px = g.cx + Math.cos(a) * d;
        const py = g.cy + Math.sin(a) * d;
        const rot = p * 3 + i;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rot);
        ctx.strokeStyle = `rgba(${i % 2 ? '168,85,247' : '56,223,255'},${(maxA * (1 - p)).toFixed(3)})`;
        ctx.lineWidth = 1.5 * g.dpr;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.87, size * 0.5);
        ctx.lineTo(-size * 0.87, size * 0.5);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    } else if (eff === 'fade') {
      ctx.fillStyle = `rgba(5,5,9,${(0.55 * (1 - p)).toFixed(3)})`;
      ctx.fillRect(g.x - g.w, g.y - g.h, g.w * 3, g.h * 3);
    }
  }

  private drawPost(ctx: Ctx, r: { x: number; y: number; w: number; h: number }, post: NonNullable<RenderOptions['post']>, time: number, opt: RenderOptions) {
    if (post.grading !== 'none') {
      const tint: Record<string, string> = {
        'teal-orange': 'rgba(0,140,160,0.07)',
        cool: 'rgba(40,90,255,0.08)',
        warm: 'rgba(255,140,40,0.07)',
        noir: 'rgba(0,0,0,0.0)',
        vivid: 'rgba(255,0,140,0.04)',
      };
      ctx.save();
      ctx.globalCompositeOperation = post.grading === 'noir' ? 'saturation' : 'soft-light';
      ctx.fillStyle = post.grading === 'noir' ? 'rgba(128,128,128,0.9)' : tint[post.grading];
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.restore();
      if (post.grading === 'teal-orange') {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
        g.addColorStop(0, 'rgba(0,150,170,0.10)');
        g.addColorStop(1, 'rgba(255,140,50,0.08)');
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.restore();
      }
    }
    if (post.vignette > 0) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const g = ctx.createRadialGradient(cx, cy, Math.min(r.w, r.h) * 0.35, cx, cy, Math.hypot(r.w, r.h) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${(post.vignette * 0.85).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (post.grain > 0 && opt.quality >= 0.5) {
      if (!this.noise) {
        const size = 192;
        const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
        const nctx = c.getContext('2d') as Ctx;
        const img = nctx.createImageData(size, size);
        for (let i = 0; i < size * size; i++) {
          const v = Math.floor(hash01(i * 13 + 5) * 255);
          img.data[i * 4] = v;
          img.data[i * 4 + 1] = v;
          img.data[i * 4 + 2] = v;
          img.data[i * 4 + 3] = 255;
        }
        nctx.putImageData(img, 0, 0);
        this.noise = c;
      }
      ctx.save();
      ctx.globalAlpha = post.grain * 0.12;
      ctx.globalCompositeOperation = 'overlay';
      const pat = ctx.createPattern(this.noise as CanvasImageSource, 'repeat');
      if (pat) {
        const ox = opt.reducedMotion ? 0 : Math.floor(hash01(Math.floor(time * 24)) * 192);
        const oy = opt.reducedMotion ? 0 : Math.floor(hash01(Math.floor(time * 24) + 7) * 192);
        ctx.translate(ox, oy);
        ctx.fillStyle = pat;
        ctx.fillRect(r.x - ox, r.y - oy, r.w, r.h);
      }
      ctx.restore();
    }
  }
}

/** Convert a hex color + alpha to rgba() */
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
